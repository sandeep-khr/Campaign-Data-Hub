"""Public API shapes; business calculations remain in metrics.py."""

import re
from datetime import date
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

Platform = Literal["meta", "google", "linkedin"]
Health = Literal["pass", "warn", "fail"]
Status = Literal["processed", "duplicate", "rejected", "conflict", "missing"]


class Filters(BaseModel):
    model_config = ConfigDict(extra="forbid")
    platform: Platform | None = None
    start_date: date | None = None
    end_date: date | None = None

    @field_validator("start_date", "end_date", mode="before")
    @classmethod
    def iso_dates(cls, value):
        if value is not None and not isinstance(value, date):
            if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
                raise ValueError("Use an ISO calendar date: YYYY-MM-DD.")
        return value

    @model_validator(mode="after")
    def ordered_dates(self):
        if self.start_date and self.end_date and self.start_date > self.end_date:
            raise ValueError("start_date must be on or before end_date.")
        return self

    def filters(self):
        return {name: getattr(self, name) for name in ("platform", "start_date", "end_date")}


class MetricsQuery(Filters):
    group_by: Literal["campaign", "platform"] = "campaign"


class RecordsQuery(Filters):
    campaign_key: str | None = None
    delivery_id: str | None = None
    expected_fingerprint: str | None = None


class Money(BaseModel):
    spend_usd_micros: int | None
    spend_usd: str | None
    spend_usd_display: str | None


class CTRBasis(BaseModel):
    clicks: int
    impressions: int
    records: int


class CPCBasis(BaseModel):
    clicks: int
    spend_usd_micros: int
    records: int


class RatioBasis(BaseModel):
    ctr: CTRBasis
    cpc: CPCBasis


class Totals(Money):
    impressions: int | None
    clicks: int | None
    ctr: float | None
    cpc: float | None
    records: int
    missing_clicks: int
    missing_impressions: int
    missing_spend: int
    corrected_rows: int
    delivery_ids: list[str]
    ratio_basis: RatioBasis


class MetricItem(Totals):
    platform: Platform
    campaign_key: str | None
    campaign: str | None


class Caveat(BaseModel):
    delivery_id: str
    file_name: str | None
    platform: Platform | None
    period_start: str | None
    health: Health
    status: Status
    message: str


class DatasetResponse(BaseModel):
    dataset_fingerprint: str | None


class MetricsResponse(DatasetResponse):
    items: list[MetricItem]
    totals: Totals
    caveats: list[Caveat]
    ratio_policy: Literal["paired"] = "paired"


class Record(Money):
    delivery_id: str
    source_locator: str
    platform: Platform
    file_name: str
    content_sha256: str
    health: Health
    campaign_key: str
    campaign: str
    date: str
    impressions: int | None
    clicks: int | None
    raw: Any
    applied_rules: list[dict[str, Any]]


class RecordsResponse(DatasetResponse):
    items: list[Record]


class FindingResponse(BaseModel):
    severity: Literal["info", "warning", "error"]
    message: str
    locator: str | None = None
    field: str | None = None
    observed: Any = None
    expected: Any = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class CheckResponse(BaseModel):
    check_id: str
    summary: str
    scope: str
    outcome: Literal["pass", "warn", "fail", "skipped", "error"]
    count_unit: str
    checked_count: int | None
    affected_count: int | None
    findings: list[FindingResponse]


class DeliveryResponse(BaseModel):
    id: str
    file_name: str | None
    platform: Platform | None
    period_start: str | None
    period_end: str | None
    content_sha256: str | None
    status: Status
    health: Health
    duplicate_of_id: str | None
    rows_read: int | None
    rows_accepted: int
    rows_rejected: int
    rows_duplicate: int
    rows_corrected: int
    issues: int
    processing_context: dict[str, Any]


class DeliveriesResponse(DatasetResponse):
    items: list[DeliveryResponse]
    health: dict[Health, int]
    report_start: str
    report_end: str
    weeks: list[str]


class DeliveryDetail(DatasetResponse):
    delivery: DeliveryResponse
    checks: list[CheckResponse]


class IngestionResponse(DatasetResponse):
    files_seen: int
    deliveries: dict[Status, int]
    health: dict[Health, int]
    rows_accepted: int
    rows_rejected: int
    rows_duplicate: int
    rows_corrected: int
