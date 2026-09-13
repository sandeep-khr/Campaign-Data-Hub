"""Checks receive ordinary Python data and return structured evidence."""

from collections import defaultdict
from datetime import timedelta
from decimal import Decimal
from statistics import median

from app.domain import Finding
from app.quality import new_check


def check_completeness(delivery, batch, settings):
    result = new_check("delivery.completeness")
    campaigns = {row.campaign_key: row.campaign for row in delivery.records}
    days = [
        delivery.period_start + timedelta(days=i)
        for i in range((delivery.period_end - delivery.period_start).days + 1)
    ]
    present = {(row.campaign_key, row.date) for row in delivery.records}
    result.checked_count = len(campaigns) * len(days)
    for key, name in sorted(campaigns.items()):
        for day in days:
            if (key, str(day)) not in present:
                result.add(
                    Finding(
                        "warning",
                        f"No accepted record for {name} on {day}.",
                        locator=f"{key}/{day}",
                        field="campaign/date",
                        expected="One record per observed campaign and expected day",
                        metadata={"campaign": name, "date": str(day)},
                    )
                )
    return result


def check_spend_units(delivery, batch, settings, overrides):
    result = new_check("delivery.spend_units")
    if delivery.platform != "meta":
        return result
    result.checked_count = len(delivery.records)
    override = overrides.get(delivery.content_sha256)
    baseline = [
        value
        for other in batch
        if other.platform == "meta"
        and other.id != delivery.id
        and other.status == "processed"
        and other.records
        for value in other.raw_spends
        if value > 0
    ]
    ratio = None
    if baseline and delivery.raw_spends:
        ratio = median(delivery.raw_spends) / median(baseline)
    suspicious = (
        len(delivery.raw_spends) >= 10
        and len(delivery.raw_spends) == len(delivery.source_rows)
        and all(value == value.to_integral_value() for value in delivery.raw_spends)
        and ratio is not None
        and settings.unit_ratio_min <= ratio <= settings.unit_ratio_max
    )
    if override or suspicious:
        message = (
            "Reviewed cents-to-USD correction applied; the source remains untrusted."
            if override
            else "Possible cents mislabeled as dollars; spend excluded pending review."
        )
        for row in delivery.records:
            result.add(
                Finding(
                    "error",
                    message,
                    locator=row.source_locator,
                    field="spend",
                    observed=row.raw.get("spend_usd"),
                    expected="USD",
                    metadata={
                        "median_ratio": str(ratio) if ratio is not None else None,
                        "correction_applied": bool(override),
                    },
                )
            )
    elif not baseline:
        result.outcome = "skipped"
        result.summary += " — no positive same-platform baseline is available."
    return result


def check_volume(delivery, batch, settings):
    result = new_check("delivery.volume", 1)

    def daily_impressions(item):
        counts = [row.impressions for row in item.records if row.impressions is not None]
        if not counts:
            return None
        days = (item.period_end - item.period_start).days + 1
        return Decimal(sum(counts)) / days

    baseline = [
        daily_impressions(other)
        for other in batch
        if other.platform == delivery.platform
        and other.id != delivery.id
        and other.status == "processed"
    ]
    baseline = [value for value in baseline if value is not None and value > 0]
    current = daily_impressions(delivery)
    if current is None or len(baseline) < 2:
        result.outcome = "skipped"
        result.summary += " — fewer than two usable comparison weeks."
        return result
    ratio = current / median(baseline)
    if not settings.volume_ratio_min <= ratio <= settings.volume_ratio_max:
        result.add(
            Finding(
                "warning",
                "Impressions per expected day differ substantially from other weeks.",
                field="impressions",
                observed=str(ratio),
                expected=f"{settings.volume_ratio_min}–{settings.volume_ratio_max} times baseline",
            )
        )
    return result


def check_period(delivery, batch, settings):
    result = new_check("delivery.period", 1)
    days = (delivery.period_end - delivery.period_start).days + 1
    if days < 7:
        result.add(
            Finding(
                "info",
                f"Expected {days}-day final period, clipped to the report end.",
                field="period_end",
                observed=str(delivery.period_end),
            )
        )
    return result


# Add a function here to extend validation without changing ingestion or database code.
DELIVERY_CHECKS = [check_completeness, check_volume, check_period]


def resolve_row_keys(delivery):
    """Never resolve a conflict by comparing fields after invalid values became null."""
    groups = defaultdict(list)
    for row in delivery.records:
        groups[(row.campaign_key, row.date)].append(row)
    check = delivery.checks["row.key_conflict"]
    check.checked_count = len(delivery.records)
    accepted = []
    for rows in groups.values():
        if len(rows) == 1:
            accepted.extend(rows)
        elif len({row.metric_signature for row in rows}) == 1:
            accepted.append(rows[0])
            for row in rows[1:]:
                delivery.rows_duplicate += 1
                delivery.checks["row.duplicates"].add(
                    Finding(
                        "warning",
                        "Equivalent campaign/day row excluded.",
                        locator=row.source_locator,
                        metadata={"original_locator": rows[0].source_locator, "raw_row": row.raw},
                    )
                )
        else:
            delivery.rows_rejected += len(rows)
            for row in rows:
                check.add(
                    Finding(
                        "error",
                        "Conflicting metrics for the same campaign and date.",
                        locator=row.source_locator,
                        field="campaign/date",
                        observed=row.raw,
                        metadata={"conflicting_locators": [r.source_locator for r in rows]},
                    )
                )
    delivery.records = accepted
