from app.adapters.common import json_array
from app.domain import SourceRow


def parse(content: bytes):
    rows = []
    for index, raw in enumerate(json_array(content)):
        locator = f"index:{index}"
        if not isinstance(raw, dict):
            rows.append(SourceRow(locator, raw, {}, "A campaign record must be an object."))
            continue
        spend = raw.get("spend")
        # Invalid nested spend must not discard valid impressions or clicks.
        valid_spend = isinstance(spend, dict)
        rows.append(
            SourceRow(
                locator,
                raw,
                {
                    "campaign": raw.get("campaign"),
                    "date": raw.get("date_ts"),
                    "spend": spend.get("amount") if valid_spend else spend,
                    "currency": spend.get("currency") if valid_spend else None,
                    "impressions": raw.get("impressions"),
                    "clicks": raw.get("clicks"),
                    "unit": "currency",
                    "invalid_spend_shape": spend is not None and not valid_spend,
                },
            )
        )
    return rows
