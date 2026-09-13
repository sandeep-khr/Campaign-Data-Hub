from app.adapters.common import csv_rows


def parse(content: bytes):
    return csv_rows(
        content,
        {
            "campaign": "Campaign",
            "date": "Day",
            "spend": "Cost (micros)",
            "currency": "Currency",
            "impressions": "Impr.",
            "clicks": "Clicks",
        },
        unit="micros",
    )
