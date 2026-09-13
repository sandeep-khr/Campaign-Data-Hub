"""Three tables, parameterized queries, and one transaction per published snapshot."""

import json
import sqlite3
from contextlib import contextmanager
from pathlib import Path

from app.config import json_text
from app.domain import Snapshot

DELIVERY_COLUMNS = (
    "id",
    "file_name",
    "platform",
    "period_start",
    "period_end",
    "content_sha256",
    "status",
    "health",
    "duplicate_of_id",
    "rows_read",
    "rows_accepted",
    "rows_rejected",
    "rows_duplicate",
    "rows_corrected",
    "processing_context_json",
)


def initialize(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    schema = Path(__file__).with_name("schema.sql").read_text()
    with sqlite3.connect(path, autocommit=True) as con:
        con.executescript(schema)
    con.close()


@contextmanager
def connection(path: Path):
    con = sqlite3.connect(path, autocommit=True)
    con.row_factory = sqlite3.Row
    # This pragma must be enabled before starting the transaction.
    con.execute("PRAGMA foreign_keys = ON")
    con.autocommit = False
    try:
        with con:
            yield con
    finally:
        con.close()


def replace_snapshot(path: Path, snapshot: Snapshot) -> None:
    context_json = json_text(snapshot.context)
    with connection(path) as con:
        con.execute("DELETE FROM metric_records")
        con.execute("DELETE FROM check_results")
        con.execute("DELETE FROM deliveries")
        # Duplicate pointers refer to a parent inserted earlier in this transaction.
        ordered = sorted(
            snapshot.deliveries, key=lambda item: (item.status == "duplicate", item.id)
        )
        for delivery in ordered:
            if delivery.status != "processed" and delivery.records:
                raise ValueError("Only processed deliveries may contribute metric records.")
            values = (
                delivery.id,
                delivery.file_name,
                delivery.platform,
                str(delivery.period_start) if delivery.period_start else None,
                str(delivery.period_end) if delivery.period_end else None,
                delivery.content_sha256,
                delivery.status,
                delivery.health,
                delivery.duplicate_of_id,
                delivery.rows_read,
                len(delivery.records),
                delivery.rows_rejected,
                delivery.rows_duplicate,
                delivery.rows_corrected,
                context_json,
                delivery.raw_content,
            )
            columns = ", ".join((*DELIVERY_COLUMNS, "raw_content"))
            placeholders = ", ".join("?" for _ in values)
            con.execute(f"INSERT INTO deliveries ({columns}) VALUES ({placeholders})", values)
        for delivery in ordered:
            con.executemany(
                "INSERT INTO metric_records VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                [
                    (
                        row.delivery_id,
                        row.source_locator,
                        row.campaign_key,
                        row.campaign,
                        row.date,
                        row.spend_usd_micros,
                        row.impressions,
                        row.clicks,
                        json_text(row.raw),
                        json_text(row.applied_rules),
                    )
                    for row in delivery.records
                ],
            )
            con.executemany(
                "INSERT INTO check_results VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                [
                    (
                        delivery.id,
                        check.check_id,
                        check.scope,
                        check.outcome,
                        check.count_unit,
                        check.checked_count,
                        check.affected_count,
                        check.summary,
                        json_text(check.to_dict()["findings"]),
                    )
                    for check in delivery.checks.values()
                ],
            )


def current_context(con) -> dict | None:
    row = con.execute("SELECT processing_context_json FROM deliveries LIMIT 1").fetchone()
    return json.loads(row[0]) if row else None


def read_deliveries(con) -> list[dict]:
    columns = ", ".join(f"d.{column}" for column in DELIVERY_COLUMNS)
    rows = con.execute(
        f"""SELECT {columns}, COALESCE((
            SELECT SUM(c.affected_count)
            FROM check_results c
            WHERE c.delivery_id = d.id
              AND c.outcome IN ('warn', 'fail', 'error')
        ), 0) AS issues
        FROM deliveries d
        ORDER BY d.platform, d.period_start, d.id"""
    )
    result = []
    for row in rows:
        item = dict(row)
        item["processing_context"] = json.loads(item.pop("processing_context_json"))
        result.append(item)
    return result


def read_checks(con, delivery_id: str) -> list[dict]:
    rows = con.execute(
        "SELECT * FROM check_results WHERE delivery_id = ? ORDER BY rowid", (delivery_id,)
    )
    result = []
    for row in rows:
        item = dict(row)
        item.pop("delivery_id")
        item["findings"] = json.loads(item.pop("findings_json"))
        result.append(item)
    return result


def read_records(
    con, platform=None, start_date=None, end_date=None, campaign_key=None, delivery_id=None
):
    clauses = ["d.status = 'processed'"]
    params = []
    for column, operator, value in (
        ("d.platform", "=", platform),
        ("m.date", ">=", start_date),
        ("m.date", "<=", end_date),
        ("m.campaign_key", "=", campaign_key),
        ("m.delivery_id", "=", delivery_id),
    ):
        if value is not None:
            clauses.append(f"{column} {operator} ?")
            params.append(str(value))
    query = (
        "SELECT m.*, d.platform, d.file_name, d.content_sha256, d.health "
        "FROM metric_records m JOIN deliveries d ON m.delivery_id = d.id WHERE "
        + " AND ".join(clauses)
        + " ORDER BY d.platform, m.campaign_key, m.date, m.source_locator"
    )
    result = []
    for row in con.execute(query, params):
        item = dict(row)
        item["raw"] = json.loads(item.pop("raw_row_json"))
        item["applied_rules"] = json.loads(item.pop("applied_rules_json"))
        result.append(item)
    return result
