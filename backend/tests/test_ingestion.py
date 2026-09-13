import hashlib
import json
import shutil
import sqlite3
from dataclasses import replace

import pytest

from app import database
from app.config import PLATFORMS
from app.ingestion import build_snapshot


def sql_contents(settings):
    with database.connection(settings.database_path) as con:
        return {
            table: [tuple(row) for row in con.execute(f"SELECT * FROM {table} ORDER BY 1, 2")]
            for table in ("deliveries", "metric_records", "check_results")
        }


def test_real_inputs_reproduce_independent_expectations(settings):
    snapshot = build_snapshot(settings)
    summary = snapshot.summary()
    assert summary["files_seen"] == 15
    assert len(snapshot.deliveries) == 16
    assert summary["rows_accepted"] == 368
    assert summary["rows_rejected"] == 1
    assert summary["rows_duplicate"] == 8
    assert summary["rows_corrected"] == 35
    assert summary["health"] == {"pass": 8, "warn": 4, "fail": 4}
    rows = [row for delivery in snapshot.deliveries for row in delivery.records]
    assert sum(row.spend_usd_micros or 0 for row in rows) == 54_277_299_999
    assert sum(row.impressions for row in rows) == 16_385_560
    assert sum(row.clicks or 0 for row in rows) == 346_988
    assert sum(row.clicks is None for row in rows) == 8
    assert sum(row.spend_usd_micros is None for row in rows) == 1
    expected = {"google": 27_954_499_999, "meta": 20_036_390_000, "linkedin": 6_286_410_000}
    for platform in PLATFORMS:
        assert (
            sum(
                row.spend_usd_micros or 0
                for d in snapshot.deliveries
                if d.platform == platform
                for row in d.records
            )
            == expected[platform]
        )


def test_repeat_ingestion_preserves_records_reports_and_raw_bytes(settings):
    database.initialize(settings.database_path)
    first = build_snapshot(settings)
    database.replace_snapshot(settings.database_path, first)
    before = sql_contents(settings)
    second = build_snapshot(settings)
    database.replace_snapshot(settings.database_path, second)
    assert first.summary() == second.summary()
    assert sql_contents(settings) == before
    with database.connection(settings.database_path) as con:
        original = con.execute(
            "SELECT raw_content FROM deliveries WHERE file_name = ?", ("meta_ads_2026-06-08.csv",)
        ).fetchone()[0]
        assert original == (settings.data_dir / "meta_ads_2026-06-08.csv").read_bytes()


def test_failed_publication_rolls_back_deletes_and_partial_inserts(settings):
    database.initialize(settings.database_path)
    database.replace_snapshot(settings.database_path, build_snapshot(settings))
    before = sql_contents(settings)
    invalid = build_snapshot(settings)
    invalid.deliveries[0].records[0].spend_usd_micros = -1
    with pytest.raises(sqlite3.IntegrityError):
        database.replace_snapshot(settings.database_path, invalid)
    assert sql_contents(settings) == before


def test_bad_rows_and_file_are_isolated(tiny_settings, write_meta):
    write_meta(
        tiny_settings,
        [
            ["Example", "06/01/2026", "100", 1000, 10],
            ["wrong number of columns"],
            ["Example", "06/31/2026", "100", 1000, 10],
            ["Example", "06/02/2026", "150", 1000, 10],
        ],
    )
    (tiny_settings.data_dir / "linkedin_ads_2026-06-01.json").write_text('{"broken": ]')
    snapshot = build_snapshot(tiny_settings)
    meta = next(d for d in snapshot.deliveries if d.file_name and d.platform == "meta")
    assert [row.date for row in meta.records] == ["2026-06-01", "2026-06-02"]
    assert meta.rows_rejected == 2
    assert meta.health == "fail"
    linkedin = next(d for d in snapshot.deliveries if d.file_name and d.platform == "linkedin")
    assert linkedin.status == "rejected"
    assert linkedin.raw_content == b'{"broken": ]'
    assert not any(d.id == "missing:linkedin:2026-06-01" for d in snapshot.deliveries)
    database.initialize(tiny_settings.database_path)
    database.replace_snapshot(tiny_settings.database_path, snapshot)


def test_unknown_input_is_reported_and_hidden_files_ignored(tiny_settings):
    (tiny_settings.data_dir / "unexpected.csv").write_text("invalid")
    (tiny_settings.data_dir / ".hidden").write_text("ignore")
    snapshot = build_snapshot(tiny_settings)
    assert snapshot.summary()["files_seen"] == 1
    assert next(d for d in snapshot.deliveries if d.file_name).status == "rejected"


def test_different_content_claiming_same_week_is_not_selected_by_filename(
    tiny_settings, write_meta
):
    path = write_meta(tiny_settings, [["Example", "06/01/2026", "100", 1000, 10]])
    shutil.copyfile(path, path.with_name("meta_ads_2026-06-01_resend.csv"))
    write_meta(
        tiny_settings,
        [["Example", "06/01/2026", "200", 1000, 10]],
        "meta_ads_2026-06-01_changed.csv",
    )
    snapshot = build_snapshot(tiny_settings)
    entries = [d for d in snapshot.deliveries if d.file_name]
    assert len(entries) == 3
    assert all(d.status == "conflict" and d.health == "fail" and not d.records for d in entries)


@pytest.mark.parametrize(
    "spends,accepted,duplicates,rejected",
    [
        (["100.00", "100"], 1, 1, 0),
        (["bad-a", "bad-b"], 0, 0, 2),
    ],
)
def test_equivalent_rows_and_lossy_null_conflicts(
    tiny_settings, write_meta, spends, accepted, duplicates, rejected
):
    write_meta(
        tiny_settings,
        [
            ["Example", "06/01/2026", spends[0], 1000, 10],
            ["example ", "2026-06-01", spends[1], 1000, 10],
        ],
    )
    delivery = next(d for d in build_snapshot(tiny_settings).deliveries if d.file_name)
    assert len(delivery.records) == accepted
    assert delivery.rows_duplicate == duplicates
    assert delivery.rows_rejected == rejected


def test_unit_suspicion_does_not_authorize_a_repair(tiny_settings, write_meta, tmp_path):
    def rows(start, spend):
        return [
            [campaign, f"06/{day:02d}/2026", spend, 1000, 10]
            for campaign in ("A", "B")
            for day in range(start, start + 7)
        ]

    write_meta(tiny_settings, rows(1, "100"))
    suspect = write_meta(tiny_settings, rows(8, "10000"), "meta_ads_2026-06-08.csv")
    snapshot = build_snapshot(tiny_settings)
    normal, anomalous = [d for d in snapshot.deliveries if d.file_name]
    assert all(row.spend_usd_micros == 100_000_000 for row in normal.records)
    assert all(row.spend_usd_micros is None for row in anomalous.records)
    assert anomalous.health == "fail" and anomalous.rows_corrected == 0
    fingerprint = hashlib.sha256(suspect.read_bytes()).hexdigest()
    overrides = tmp_path / "overrides.json"
    overrides.write_text(
        json.dumps(
            {
                fingerprint: {
                    "platform": "meta",
                    "spend_divisor": "100",
                    "rule_id": "meta.cents_to_usd",
                    "reason": "Explicit reviewed test correction",
                }
            }
        )
    )
    configured = replace(tiny_settings, overrides_path=overrides)
    corrected = next(
        d for d in build_snapshot(configured).deliveries if d.file_name == suspect.name
    )
    assert all(row.spend_usd_micros == 100_000_000 for row in corrected.records)
    assert corrected.rows_corrected == 14 and corrected.health == "fail"
    # A filename alone must never carry a correction to changed content.
    write_meta(tiny_settings, rows(8, "11000"), suspect.name)
    changed = next(d for d in build_snapshot(configured).deliveries if d.file_name == suspect.name)
    assert changed.rows_corrected == 0
    assert all(row.spend_usd_micros is None for row in changed.records)


def test_late_delivery_removes_missing_and_final_week_is_two_days(tiny_settings, write_meta):
    before = build_snapshot(tiny_settings)
    assert any(d.id == "missing:meta:2026-06-29" for d in before.deliveries)
    write_meta(
        tiny_settings,
        [["Example", "06/29/2026", "100", 1000, 10], ["Example", "06/30/2026", "100", 1000, 10]],
        "meta_ads_2026-06-29.csv",
    )
    after = build_snapshot(tiny_settings)
    assert not any(d.id == "missing:meta:2026-06-29" for d in after.deliveries)
    actual = next(d for d in after.deliveries if d.file_name)
    assert actual.health == "pass"
    assert actual.checks["delivery.completeness"].checked_count == 2
