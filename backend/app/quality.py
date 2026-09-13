"""Shared check vocabulary; outcomes come from evidence, not record inclusion."""

from app.domain import CheckResult, Delivery, Finding

CATALOG = {
    "file.filename": ("Filename and reporting week", "file", "file"),
    "file.parse": ("File schema and serialization", "file", "file"),
    "file.duplicate_delivery": ("Duplicate delivery content", "file", "file"),
    "file.conflict": ("Conflicting deliveries for one week", "delivery", "file"),
    "row.schema": ("Individual record structure", "row", "row"),
    "row.campaign": ("Campaign identity and spelling", "row", "row"),
    "row.date": ("Valid dates within the delivery week", "row", "row"),
    "row.date_format": ("Meta date-format consistency", "row", "row"),
    "row.timestamp_utc": ("LinkedIn UTC timestamp convention", "row", "row"),
    "row.required_metrics": ("Missing metric values", "row", "row"),
    "row.metric_range": ("Numeric types and valid metric ranges", "row", "row"),
    "row.currency": ("Supported spend currency", "row", "row"),
    "row.spend_precision": ("Exact micro-USD representation", "row", "row"),
    "row.duplicates": ("Exact or equivalent duplicate rows", "file", "row"),
    "row.key_conflict": ("Conflicting campaign/day metrics", "file", "row"),
    "delivery.completeness": ("Expected campaign/day coverage", "delivery", "cell"),
    "delivery.spend_units": ("Spend-unit suspicion and reviewed correction", "delivery", "row"),
    "delivery.volume": ("Impressions per day versus other weeks", "delivery", "file"),
    "delivery.cadence": ("Expected weekly delivery received", "delivery", "delivery"),
    "delivery.period": ("Reporting-period boundaries", "delivery", "file"),
}


def new_check(check_id: str, checked_count: int = 0) -> CheckResult:
    title, scope, unit = CATALOG.get(check_id, (check_id, "delivery", "row"))
    return CheckResult(check_id, title, scope, unit, checked_count)


def prepare_checks(delivery: Delivery) -> None:
    delivery.checks = {key: new_check(key) for key in CATALOG}


def add_finding(delivery: Delivery, check_id: str, severity: str, message: str, **evidence):
    delivery.checks[check_id].add(Finding(severity, message, **evidence))


def finish_checks(delivery: Delivery) -> None:
    for check in delivery.checks.values():
        if check.outcome == "pass" and check.checked_count == 0 and not check.findings:
            check.outcome = "skipped"
            check.summary += " — not applicable or no eligible input."
