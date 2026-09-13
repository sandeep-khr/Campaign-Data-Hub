from app.adapters.common import csv_rows


def parse(content: bytes):
    return csv_rows(
        content,
        {
            "campaign": "campaign_name",
            "date": "date",
            "spend": "spend_usd",
            "impressions": "impressions",
            "clicks": "clicks",
        },
    )
