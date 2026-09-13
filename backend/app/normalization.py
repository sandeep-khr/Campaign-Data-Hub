"""Explicit conversions. Unknown fields stay unknown; an unknown identity rejects the row."""

import re
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal, DecimalException, localcontext

from app.config import json_text
from app.domain import Delivery, MetricRow, SourceRow
from app.quality import add_finding

MICROS = 1_000_000
MAX_INTEGER = 2**63 - 1


def missing(value: object) -> bool:
    return value is None or (isinstance(value, str) and not value.strip())


def decimal_value(value: object) -> Decimal:
    if isinstance(value, bool) or not isinstance(value, (str, int, Decimal)):
        raise ValueError("Expected a number, not a boolean or nested value.")
    amount = Decimal(str(value).strip())
    if not amount.is_finite():
        raise ValueError("A numeric value must be finite.")
    return amount


def count_value(value: object) -> int:
    amount = decimal_value(value)
    if amount < 0 or amount > MAX_INTEGER or amount != amount.to_integral_value():
        raise ValueError("Counts must be nonnegative integers within the storage range.")
    return int(amount)


def date_value(value: object, platform: str) -> tuple[date, str]:
    if platform == "linkedin":
        if isinstance(value, bool) or not isinstance(value, int):
            raise ValueError("Expected an integer UTC timestamp in milliseconds.")
        return (
            datetime(1970, 1, 1, tzinfo=UTC) + timedelta(milliseconds=value)
        ).date(), "epoch_ms_utc"
    if not isinstance(value, str):
        raise ValueError("Expected a calendar date string.")
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        return date.fromisoformat(value), "iso_date"
    if platform == "meta" and re.fullmatch(r"\d{2}/\d{2}/\d{4}", value):
        return datetime.strptime(value, "%m/%d/%Y").date(), "mmddyyyy"
    raise ValueError("Date does not match an accepted platform format.")


def money_value(value: object, unit: str, rate: Decimal, divisor: Decimal) -> int:
    amount = decimal_value(value)
    if amount < 0:
        raise ValueError("Spend cannot be negative under the daily-performance policy.")
    with localcontext() as context:
        context.prec = 50
        converted = amount / divisor * rate
        if unit != "micros":
            converted *= MICROS
        if converted > MAX_INTEGER:
            raise ValueError("Converted spend exceeds the storage range.")
        if converted != converted.to_integral_value():
            raise ArithmeticError("Converted spend cannot be represented exactly in micro-USD.")
        return int(converted)


def metric_signature(values: dict) -> str:
    result = {}
    for key in ("spend", "impressions", "clicks"):
        value = values.get(key)
        try:
            result[key] = {"number": str(decimal_value(value).normalize())}
        except (ValueError, DecimalException):
            result[key] = {"original": value}
    result["currency"] = values.get("currency")
    result["unit"] = values.get("unit")
    return json_text(result)


def normalize_row(source: SourceRow, delivery: Delivery, rates: dict, override: dict | None):
    checks = delivery.checks
    checks["row.schema"].checked_count += 1
    if source.shape_error:
        add_finding(
            delivery,
            "row.schema",
            "error",
            source.shape_error,
            locator=source.locator,
            observed=source.raw,
        )
        return None
    values = source.values
    rules = []
    campaign = values.get("campaign")
    checks["row.campaign"].checked_count += 1
    valid_campaign = isinstance(campaign, str) and bool(campaign.strip())
    if not valid_campaign:
        add_finding(
            delivery,
            "row.campaign",
            "error",
            "Campaign identity is missing or invalid.",
            locator=source.locator,
            field="campaign",
            observed=campaign,
        )
    else:
        if campaign != campaign.strip():
            add_finding(
                delivery,
                "row.campaign",
                "info",
                "Removed surrounding campaign whitespace.",
                locator=source.locator,
                field="campaign",
                observed=campaign,
                expected=campaign.strip(),
            )
        campaign = campaign.strip()
        rules.append({"id": "campaign.trim_casefold", "key": campaign.casefold()})

    checks["row.date"].checked_count += 1
    parsed_date = None
    try:
        parsed_date, date_rule = date_value(values.get("date"), delivery.platform)
        rules.append({"id": f"{delivery.platform}.{date_rule}"})
        if delivery.platform == "meta":
            checks["row.date_format"].checked_count += 1
            if date_rule == "iso_date":
                add_finding(
                    delivery,
                    "row.date_format",
                    "warning",
                    "Accepted an ISO date in a Meta export.",
                    locator=source.locator,
                    field="date",
                    observed=values["date"],
                    expected="MM/DD/YYYY (primary format)",
                )
        if delivery.platform == "linkedin":
            checks["row.timestamp_utc"].checked_count += 1
            if values["date"] % 86_400_000:
                add_finding(
                    delivery,
                    "row.timestamp_utc",
                    "warning",
                    "Timestamp is not midnight UTC.",
                    locator=source.locator,
                    field="date",
                    observed=values["date"],
                )
        if not delivery.period_start <= parsed_date <= delivery.period_end:
            raise ValueError("Date falls outside the delivery's reporting window.")
    except (ValueError, OverflowError, OSError) as error:
        add_finding(
            delivery,
            "row.date",
            "error",
            str(error),
            locator=source.locator,
            field="date",
            observed=values.get("date"),
            expected=f"{delivery.period_start} through {delivery.period_end}",
            metadata={"raw_row": source.raw},
        )
        parsed_date = None

    checks["row.required_metrics"].checked_count += 1
    checks["row.metric_range"].checked_count += 1
    metrics = {}
    for field in ("impressions", "clicks"):
        value = values.get(field)
        metrics[field] = None
        if missing(value):
            add_finding(
                delivery,
                "row.required_metrics",
                "warning",
                f"{field.title()} are unknown.",
                locator=source.locator,
                field=field,
                observed=value,
                expected="A reported count",
            )
        else:
            try:
                metrics[field] = count_value(value)
            except (ValueError, DecimalException) as error:
                add_finding(
                    delivery,
                    "row.metric_range",
                    "error",
                    str(error),
                    locator=source.locator,
                    field=field,
                    observed=value,
                )
    if (
        metrics["clicks"] is not None
        and metrics["impressions"] is not None
        and metrics["clicks"] > metrics["impressions"]
    ):
        add_finding(
            delivery,
            "row.metric_range",
            "error",
            "Clicks exceed impressions; clicks set to null.",
            locator=source.locator,
            field="clicks",
            observed=metrics["clicks"],
            expected=f"At most {metrics['impressions']}",
        )
        metrics["clicks"] = None

    spend = normalize_spend(source, delivery, rates, override, rules)
    if not valid_campaign or parsed_date is None:
        return None
    return MetricRow(
        delivery.id,
        source.locator,
        campaign.casefold(),
        campaign,
        parsed_date.isoformat(),
        spend,
        metrics["impressions"],
        metrics["clicks"],
        source.raw,
        rules,
        metric_signature(values),
    )


def normalize_spend(source, delivery, rates, override, rules):
    value = source.values.get("spend")
    if missing(value):
        add_finding(
            delivery,
            "row.required_metrics",
            "warning",
            "Spend is unknown.",
            locator=source.locator,
            field="spend",
            observed=value,
        )
        return None
    if source.values.get("invalid_spend_shape"):
        add_finding(
            delivery,
            "row.metric_range",
            "error",
            "Spend must contain amount and currency.",
            locator=source.locator,
            field="spend",
            observed=value,
        )
        return None
    currency = source.values.get("currency")
    delivery.checks["row.currency"].checked_count += 1
    if not isinstance(currency, str) or currency not in rates:
        add_finding(
            delivery,
            "row.currency",
            "error",
            "No conversion rate for this currency.",
            locator=source.locator,
            field="currency",
            observed=currency,
            expected=sorted(rates),
        )
        return None
    divisor = Decimal(override["spend_divisor"]) if override else Decimal(1)
    delivery.checks["row.spend_precision"].checked_count += 1
    try:
        spend = money_value(value, source.values["unit"], rates[currency], divisor)
    except (ValueError, DecimalException) as error:
        add_finding(
            delivery,
            "row.metric_range",
            "error",
            str(error),
            locator=source.locator,
            field="spend",
            observed=value,
        )
        return None
    except ArithmeticError as error:
        add_finding(
            delivery,
            "row.spend_precision",
            "error",
            str(error),
            locator=source.locator,
            field="spend",
            observed=value,
        )
        return None
    rules.append(
        {
            "id": f"{delivery.platform}.{source.values['unit']}_to_usd",
            "source_unit": source.values["unit"],
        }
    )
    rules.append({"id": "currency.to_usd", "currency": currency, "rate": str(rates[currency])})
    if override:
        rules.append(
            {
                "id": override["rule_id"],
                "divisor": str(divisor),
                "before": str(value),
                "after_usd": str(Decimal(spend) / MICROS),
                "reason": override["reason"],
            }
        )
    if spend % 10_000:
        add_finding(
            delivery,
            "row.spend_precision",
            "info",
            "Sub-cent spend preserved exactly.",
            locator=source.locator,
            field="spend",
            observed=str(Decimal(spend) / MICROS),
        )
    return spend
