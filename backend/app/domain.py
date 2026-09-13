"""The plain Python objects passed between parsing, checks, and storage."""

from dataclasses import asdict, dataclass
from dataclasses import field as default_field
from datetime import date
from decimal import Decimal
from typing import Any


@dataclass
class Finding:
    severity: str
    message: str
    locator: str | None = None
    field: str | None = None
    observed: Any = None
    expected: Any = None
    metadata: dict = default_field(default_factory=dict)


@dataclass
class CheckResult:
    check_id: str
    summary: str
    scope: str = "row"
    count_unit: str = "row"
    checked_count: int | None = 0
    outcome: str = "pass"
    findings: list[Finding] = default_field(default_factory=list)

    def add(self, finding: Finding) -> None:
        self.findings.append(finding)
        if finding.severity == "error":
            self.outcome = "fail"
        elif finding.severity == "warning" and self.outcome != "fail":
            self.outcome = "warn"

    @property
    def affected_count(self) -> int:
        # Several bad fields on one row still affect only one row.
        return len({item.locator for item in self.findings})

    def to_dict(self) -> dict:
        return {**asdict(self), "affected_count": self.affected_count}


@dataclass
class SourceRow:
    locator: str
    raw: Any
    values: dict
    shape_error: str | None = None


@dataclass
class MetricRow:
    delivery_id: str
    source_locator: str
    campaign_key: str
    campaign: str
    date: str
    spend_usd_micros: int | None
    impressions: int | None
    clicks: int | None
    raw: Any
    applied_rules: list[dict]
    # Retain the original metric values until duplicate conflicts are resolved.
    metric_signature: str


@dataclass
class Delivery:
    id: str
    file_name: str | None
    platform: str | None = None
    period_start: date | None = None
    period_end: date | None = None
    content_sha256: str | None = None
    raw_content: bytes | None = None
    suffix: str | None = None
    status: str = "processed"
    duplicate_of_id: str | None = None
    rows_read: int | None = None
    rows_rejected: int = 0
    rows_duplicate: int = 0
    source_rows: list[SourceRow] = default_field(default_factory=list)
    records: list[MetricRow] = default_field(default_factory=list)
    checks: dict[str, CheckResult] = default_field(default_factory=dict)
    raw_spends: list[Decimal] = default_field(default_factory=list)

    @property
    def health(self) -> str:
        outcomes = {check.outcome for check in self.checks.values()}
        if outcomes & {"fail", "error"}:
            return "fail"
        return "warn" if "warn" in outcomes else "pass"

    @property
    def rows_corrected(self) -> int:
        return sum(
            any(rule["id"] == "meta.cents_to_usd" for rule in row.applied_rules)
            for row in self.records
        )


@dataclass
class Snapshot:
    deliveries: list[Delivery]
    context: dict

    def summary(self) -> dict:
        return {
            "dataset_fingerprint": self.context["dataset_fingerprint"],
            "files_seen": sum(d.file_name is not None for d in self.deliveries),
            "deliveries": {
                status: sum(d.status == status for d in self.deliveries)
                for status in ("processed", "duplicate", "rejected", "conflict", "missing")
            },
            "health": {
                health: sum(d.health == health for d in self.deliveries)
                for health in ("pass", "warn", "fail")
            },
            "rows_accepted": sum(len(d.records) for d in self.deliveries),
            "rows_rejected": sum(d.rows_rejected for d in self.deliveries),
            "rows_duplicate": sum(d.rows_duplicate for d in self.deliveries),
            "rows_corrected": sum(d.rows_corrected for d in self.deliveries),
        }
