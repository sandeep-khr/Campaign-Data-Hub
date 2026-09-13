"""Build a deterministic report from the current directory, then publish it atomically."""

import hashlib
import logging
import re
from collections import Counter, defaultdict
from datetime import date, timedelta
from decimal import DecimalException

from app.adapters import ADAPTERS, EXTENSIONS
from app.checks import DELIVERY_CHECKS, check_spend_units, resolve_row_keys
from app.config import PLATFORMS, Settings, json_text
from app.domain import Delivery, Snapshot
from app.normalization import decimal_value, normalize_row
from app.quality import add_finding, finish_checks, new_check, prepare_checks

logger = logging.getLogger(__name__)
FILENAME = re.compile(
    r"(?P<platform>meta|google|linkedin)_ads_(?P<week>\d{4}-\d{2}-\d{2})"
    r"(?:_(?P<suffix>\w+))?\.(?P<extension>\w+)$"
)


def discover(settings: Settings) -> list[Delivery]:
    deliveries = []
    for path in sorted(settings.data_dir.iterdir()):
        if path.name.startswith(".") or not path.is_file():
            continue
        delivery = Delivery(f"file:{path.name}", path.name)
        prepare_checks(delivery)
        delivery.checks["file.filename"].checked_count = 1
        match = FILENAME.fullmatch(path.name)
        try:
            if not match:
                raise ValueError("Filename does not match a known platform and week.")
            delivery.platform = match["platform"]
            delivery.period_start = date.fromisoformat(match["week"])
            delivery.period_end = min(
                delivery.period_start + timedelta(days=6), settings.report_end
            )
            delivery.suffix = match["suffix"]
            if delivery.period_start not in settings.weeks():
                raise ValueError("Week start is outside the configured Monday delivery schedule.")
            if match["extension"] != EXTENSIONS[delivery.platform]:
                raise ValueError("File extension does not match the platform's expected format.")
        except ValueError as error:
            delivery.status = "rejected"
            add_finding(delivery, "file.filename", "error", str(error), observed=path.name)
        try:
            delivery.raw_content = path.read_bytes()
            delivery.content_sha256 = hashlib.sha256(delivery.raw_content).hexdigest()
        except OSError as error:
            delivery.status = "rejected"
            delivery.checks["file.parse"].checked_count = 1
            add_finding(
                delivery,
                "file.parse",
                "error",
                "Unable to read this input file.",
                observed=path.name,
                metadata={"error": type(error).__name__},
            )
        deliveries.append(delivery)
    return deliveries


def resolve_deliveries(deliveries: list[Delivery]) -> None:
    slots = defaultdict(list)
    for delivery in deliveries:
        if delivery.checks["file.filename"].outcome == "pass":
            slots[(delivery.platform, delivery.period_start)].append(delivery)
    for group in slots.values():
        for delivery in group:
            delivery.checks["file.conflict"].checked_count = 1
            if delivery.content_sha256 is not None:
                delivery.checks["file.duplicate_delivery"].checked_count = 1
        if len({delivery.content_sha256 for delivery in group}) > 1:
            for delivery in group:
                delivery.status = "conflict"
                add_finding(
                    delivery,
                    "file.conflict",
                    "error",
                    "Different or unreadable contents claim the same platform/week; slot excluded.",
                    observed=[item.file_name for item in group],
                    expected="One authoritative content",
                )
            continue
        canonical = min(group, key=lambda item: (bool(item.suffix), item.file_name))
        for delivery in group:
            if delivery is canonical or delivery.content_sha256 is None:
                continue
            delivery.status = "duplicate"
            delivery.duplicate_of_id = canonical.id
            add_finding(
                delivery,
                "file.duplicate_delivery",
                "warning",
                "Identical file content is already represented; no metrics loaded.",
                observed=delivery.content_sha256,
                metadata={"original_file": canonical.file_name, "original_id": canonical.id},
            )


def parse_and_normalize(delivery: Delivery, rates: dict, overrides: dict) -> None:
    delivery.checks["file.parse"].checked_count = 1
    try:
        sources = ADAPTERS[delivery.platform](delivery.raw_content)
    except Exception as error:
        # Malformed serialization has no reliable row boundary; isolate the whole file.
        delivery.status = "rejected"
        add_finding(delivery, "file.parse", "error", f"Cannot parse this file: {error}")
        return
    delivery.rows_read = len(sources)
    delivery.checks["row.duplicates"].checked_count = len(sources)
    original_rows = {}
    for source in sources:
        signature = json_text(source.raw)
        if signature in original_rows:
            delivery.rows_duplicate += 1
            add_finding(
                delivery,
                "row.duplicates",
                "warning",
                "Exact duplicate row excluded.",
                locator=source.locator,
                observed=source.raw,
                metadata={"original_locator": original_rows[signature]},
            )
            continue
        original_rows[signature] = source.locator
        delivery.source_rows.append(source)
        try:
            raw_spend = decimal_value(source.values.get("spend"))
            if raw_spend >= 0:
                delivery.raw_spends.append(raw_spend)
        except (ValueError, DecimalException):
            pass
        try:
            row = normalize_row(source, delivery, rates, overrides.get(delivery.content_sha256))
        except Exception:
            logger.exception(
                "Unexpected row processing error in %s at %s", delivery.file_name, source.locator
            )
            row = None
            add_finding(
                delivery,
                "row.schema",
                "error",
                "Unexpected row processing failure; row excluded.",
                locator=source.locator,
                observed=source.raw,
            )
        if row is None:
            delivery.rows_rejected += 1
        else:
            delivery.records.append(row)
    resolve_row_keys(delivery)


def normalize_display_names(deliveries):
    variants = defaultdict(Counter)
    for delivery in deliveries:
        for row in delivery.records:
            variants[(delivery.platform, row.campaign_key)][row.campaign] += 1
    names = {
        key: min(counts, key=lambda name: (-counts[name], name)) for key, counts in variants.items()
    }
    for delivery in deliveries:
        for row in delivery.records:
            display = names[(delivery.platform, row.campaign_key)]
            if display != row.campaign:
                add_finding(
                    delivery,
                    "row.campaign",
                    "info",
                    "Unified campaign spelling.",
                    locator=row.source_locator,
                    field="campaign",
                    observed=row.campaign,
                    expected=display,
                )
                row.campaign = display


def run_delivery_checks(deliveries, settings, overrides):
    for delivery in deliveries:
        if delivery.status != "processed":
            continue
        try:
            units = check_spend_units(delivery, deliveries, settings, overrides)
            delivery.checks[units.check_id] = units
            if units.outcome == "fail" and delivery.content_sha256 not in overrides:
                for row in delivery.records:
                    row.spend_usd_micros = None
                    row.applied_rules.append({"id": "spend.quarantine_unit_anomaly"})
        except Exception:
            logger.exception("Spend validation failed for %s", delivery.file_name)
            result = new_check("delivery.spend_units", len(delivery.records))
            result.outcome = "error"
            result.summary += " — validation failed; file quarantined."
            delivery.checks[result.check_id] = result
            delivery.rows_rejected += len(delivery.records)
            delivery.records.clear()
            delivery.status = "rejected"
            continue
        for check in DELIVERY_CHECKS:
            try:
                result = check(delivery, deliveries, settings)
            except Exception:
                logger.exception("Check %s failed for %s", check.__name__, delivery.file_name)
                result = new_check(f"delivery.{check.__name__.removeprefix('check_')}")
                result.outcome = "error"
                result.summary += " — check could not complete."
            delivery.checks[result.check_id] = result


def add_cadence(deliveries, settings):
    # A received but broken file is different from an absent file.
    present = {
        (d.platform, d.period_start)
        for d in deliveries
        if d.checks["file.filename"].outcome == "pass"
    }
    for delivery in deliveries:
        if (delivery.platform, delivery.period_start) in present:
            delivery.checks["delivery.cadence"].checked_count = 1
    for platform in PLATFORMS:
        for week in settings.weeks():
            if (platform, week) in present:
                continue
            delivery = Delivery(
                f"missing:{platform}:{week}",
                None,
                platform,
                week,
                min(week + timedelta(days=6), settings.report_end),
                status="missing",
            )
            prepare_checks(delivery)
            delivery.checks["delivery.cadence"].checked_count = 1
            add_finding(
                delivery,
                "delivery.cadence",
                "error",
                "Expected weekly delivery was not received.",
                expected=f"{platform}_ads_{week}.{EXTENSIONS[platform]}",
            )
            deliveries.append(delivery)


def build_snapshot(settings: Settings) -> Snapshot:
    rates, overrides, context = settings.load_processing_config()
    deliveries = discover(settings)
    manifest = [{"file": d.file_name, "sha256": d.content_sha256} for d in deliveries]
    fingerprint_input = {"files": manifest, "processing": context}
    context["dataset_fingerprint"] = hashlib.sha256(
        json_text(fingerprint_input).encode()
    ).hexdigest()
    resolve_deliveries(deliveries)
    for delivery in deliveries:
        if delivery.status == "processed":
            parse_and_normalize(delivery, rates, overrides)
    normalize_display_names(deliveries)
    run_delivery_checks(deliveries, settings, overrides)
    add_cadence(deliveries, settings)
    for delivery in deliveries:
        finish_checks(delivery)
    return Snapshot(deliveries, context)
