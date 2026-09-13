"""One aggregation path serves campaign rows, platform rows, and filtered totals."""

from collections import defaultdict
from decimal import ROUND_HALF_UP, Decimal

MICROS = 1_000_000


def money_fields(micros: int | None) -> dict:
    if micros is None:
        return {"spend_usd_micros": None, "spend_usd": None, "spend_usd_display": None}
    amount = Decimal(micros) / MICROS
    return {
        "spend_usd_micros": micros,
        "spend_usd": format(amount, "f"),
        "spend_usd_display": str(amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)),
    }


def sum_known(rows: list[dict], field: str) -> int | None:
    values = [row[field] for row in rows if row[field] is not None]
    # Zero rows is an empty sum; existing rows with no observations is unknown.
    return sum(values) if values or not rows else None


def aggregate(rows: list[dict]) -> dict:
    ctr_rows = [row for row in rows if row["clicks"] is not None and row["impressions"] is not None]
    cpc_rows = [
        row for row in rows if row["clicks"] is not None and row["spend_usd_micros"] is not None
    ]
    ctr_clicks = sum(row["clicks"] for row in ctr_rows)
    ctr_impressions = sum(row["impressions"] for row in ctr_rows)
    cpc_clicks = sum(row["clicks"] for row in cpc_rows)
    cpc_spend = sum(row["spend_usd_micros"] for row in cpc_rows)
    return {
        **money_fields(sum_known(rows, "spend_usd_micros")),
        "impressions": sum_known(rows, "impressions"),
        "clicks": sum_known(rows, "clicks"),
        "ctr": ctr_clicks / ctr_impressions if ctr_impressions else None,
        "cpc": float(Decimal(cpc_spend) / MICROS / cpc_clicks) if cpc_clicks else None,
        "records": len(rows),
        "missing_clicks": sum(row["clicks"] is None for row in rows),
        "missing_impressions": sum(row["impressions"] is None for row in rows),
        "missing_spend": sum(row["spend_usd_micros"] is None for row in rows),
        "corrected_rows": sum(
            any(rule["id"] == "meta.cents_to_usd" for rule in row["applied_rules"]) for row in rows
        ),
        "delivery_ids": sorted({row["delivery_id"] for row in rows}),
        "ratio_basis": {
            "ctr": {"clicks": ctr_clicks, "impressions": ctr_impressions, "records": len(ctr_rows)},
            "cpc": {"spend_usd_micros": cpc_spend, "clicks": cpc_clicks, "records": len(cpc_rows)},
        },
    }


def grouped_metrics(rows: list[dict], group_by: str) -> list[dict]:
    groups = defaultdict(list)
    for row in rows:
        key = (row["platform"], row["campaign_key"] if group_by == "campaign" else None)
        groups[key].append(row)
    return [
        {
            "platform": key[0],
            "campaign_key": key[1],
            "campaign": items[0]["campaign"] if key[1] is not None else None,
            **aggregate(items),
        }
        for key, items in sorted(groups.items())
    ]


def caveats(deliveries, platform=None, start_date=None, end_date=None):
    messages = {
        "missing": "Expected weekly delivery not received.",
        "duplicate": "Identical resend excluded from metrics.",
        "conflict": "Conflicting source files excluded from metrics.",
        "rejected": "File could not be used; no metrics contributed.",
        "processed": "Valid rows and fields retained; inspect the reported source issues.",
    }
    result = []
    for delivery in deliveries:
        if delivery["health"] == "pass" or (platform and delivery["platform"] != platform):
            continue
        if start_date and delivery["period_end"] and delivery["period_end"] < str(start_date):
            continue
        if end_date and delivery["period_start"] and delivery["period_start"] > str(end_date):
            continue
        result.append(
            {
                "delivery_id": delivery["id"],
                "file_name": delivery["file_name"],
                "platform": delivery["platform"],
                "period_start": delivery["period_start"],
                "health": delivery["health"],
                "status": delivery["status"],
                "message": messages[delivery["status"]],
            }
        )
    return result
