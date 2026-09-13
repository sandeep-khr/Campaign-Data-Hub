from app import ingestion
from app.domain import CheckResult, Finding


def test_a_new_check_runs_without_changing_orchestration(tiny_settings, write_meta, monkeypatch):
    write_meta(tiny_settings, [["Example", "06/01/2026", "100", 1000, 10]])

    def check_example(delivery, batch, settings):
        check = CheckResult(
            "delivery.example", "Example check", checked_count=len(delivery.records)
        )
        check.add(Finding("warning", "Example finding", locator=delivery.records[0].source_locator))
        return check

    monkeypatch.setattr(ingestion, "DELIVERY_CHECKS", [*ingestion.DELIVERY_CHECKS, check_example])
    actual = next(d for d in ingestion.build_snapshot(tiny_settings).deliveries if d.file_name)
    assert actual.checks["delivery.example"].outcome == "warn"
    assert actual.health == "warn"


def test_a_crashed_check_cannot_produce_pass_health(tiny_settings, write_meta, monkeypatch):
    write_meta(tiny_settings, [["Example", "06/01/2026", "100", 1000, 10]])

    def check_example(delivery, batch, settings):
        raise RuntimeError("Injected check failure")

    monkeypatch.setattr(ingestion, "DELIVERY_CHECKS", [check_example])
    actual = next(d for d in ingestion.build_snapshot(tiny_settings).deliveries if d.file_name)
    assert actual.checks["delivery.example"].outcome == "error"
    assert actual.health == "fail"
    assert len(actual.records) == 1
