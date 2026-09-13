import json

import pytest
from fastapi.testclient import TestClient

from app.main import create_app


def test_initial_state_and_repeated_api_ingestion(client):
    initial = client.get("/api/metrics").json()
    assert initial["dataset_fingerprint"] is None
    assert initial["items"] == [] and initial["totals"]["cpc"] is None
    first = client.post("/api/ingestion")
    assert first.status_code == 200, first.text
    metrics = client.get("/api/metrics").json()
    assert len(metrics["items"]) == 13
    assert metrics["totals"]["spend_usd_micros"] == 54_277_299_999
    assert metrics["totals"]["ctr"] == pytest.approx(346_988 / 16_177_923)
    assert metrics["totals"]["cpc"] == pytest.approx(53_509.722799 / 346_563)
    summer = next(row for row in metrics["items"] if row["campaign"] == "Summer Sale")
    assert summer["cpc"] == pytest.approx(5057.01 / 35490)
    second = client.post("/api/ingestion")
    assert second.json() == first.json()
    assert client.get("/api/metrics").json() == metrics


def test_filters_groupings_and_source_trace(client):
    client.post("/api/ingestion")
    response = client.get(
        "/api/metrics?group_by=platform&start_date=2026-06-29&end_date=2026-06-30"
    )
    assert response.status_code == 200
    data = response.json()
    assert len(data["items"]) == 3
    assert data["totals"]["records"] == 26
    assert (
        sum(row["spend_usd_micros"] for row in data["items"]) == data["totals"]["spend_usd_micros"]
    )
    filtered = client.get(
        "/api/metrics?platform=google&start_date=2026-06-16&end_date=2026-06-16"
    ).json()
    assert filtered["totals"]["records"] == 5
    records = client.get(
        "/api/records",
        params={
            "platform": "google",
            "campaign_key": "display remarketing",
            "start_date": "2026-06-16",
            "end_date": "2026-06-16",
            "expected_fingerprint": filtered["dataset_fingerprint"],
        },
    ).json()["items"]
    assert len(records) == 1
    assert records[0]["spend_usd"] == "64.629999"
    assert records[0]["raw"]["Cost (micros)"] == "64629999"
    assert records[0]["source_locator"] == "line:17"
    assert any(rule["id"] == "google.micros_to_usd" for rule in records[0]["applied_rules"])


def test_delivery_details_include_successes_failures_and_correction(client):
    client.post("/api/ingestion")
    response = client.get("/api/deliveries").json()
    assert len(response["items"]) == 16
    assert response["health"] == {"pass": 8, "warn": 4, "fail": 4}
    by_id = {item["id"]: item for item in response["items"]}
    assert by_id["file:linkedin_ads_2026-06-08.json"]["issues"] == 5
    assert by_id["file:google_ads_2026-06-15_resend.csv"]["issues"] == 1
    assert by_id["missing:linkedin:2026-06-22"]["issues"] == 1
    detail = client.get("/api/deliveries/file:meta_ads_2026-06-08.csv").json()
    assert detail["delivery"]["rows_corrected"] == 35
    assert "raw_content" not in detail["delivery"]
    assert any(check["outcome"] == "pass" for check in detail["checks"])
    units = next(check for check in detail["checks"] if check["check_id"] == "delivery.spend_units")
    assert units["outcome"] == "fail" and len(units["findings"]) == 35
    assert client.get("/api/deliveries/absent").status_code == 404


@pytest.mark.parametrize(
    "query",
    [
        "platform=unknown",
        "start_date=2026-06-31",
        "start_date=06/01/2026",
        "start_date=2026-06-10&end_date=2026-06-01",
        "group_by=unknown",
        "unexpected=true",
    ],
)
def test_invalid_filters_return_422(client, query):
    response = client.get(f"/api/metrics?{query}")
    assert response.status_code == 422, response.text


def test_no_matching_dates_returns_empty_totals_without_infinity(client):
    client.post("/api/ingestion")
    data = client.get("/api/metrics?start_date=2027-01-01&end_date=2027-01-02").json()
    assert data["items"] == [] and data["caveats"] == []
    assert data["totals"]["spend_usd_micros"] == 0
    assert data["totals"]["ctr"] is None and data["totals"]["cpc"] is None


def test_zero_clicks_remain_eligible_for_cpc(tiny_settings, write_meta):
    write_meta(
        tiny_settings,
        [["Example", "06/01/2026", "100", 1000, 0], ["Example", "06/02/2026", "100", 1000, 10]],
    )
    with TestClient(create_app(tiny_settings)) as client:
        assert client.post("/api/ingestion").status_code == 200
        totals = client.get("/api/metrics").json()["totals"]
        assert totals["cpc"] == 20
        zero = client.get("/api/metrics?end_date=2026-06-01").json()["totals"]
        assert zero["ctr"] == 0 and zero["cpc"] is None


def test_all_unknown_metrics_are_null_not_zero(tiny_settings):
    (tiny_settings.data_dir / "linkedin_ads_2026-06-01.json").write_text(
        json.dumps(
            [
                {"campaign": "Example", "date_ts": 1780272000000},
            ]
        )
    )
    with TestClient(create_app(tiny_settings)) as client:
        assert client.post("/api/ingestion").status_code == 200
        totals = client.get("/api/metrics").json()["totals"]
        assert totals["records"] == 1
        assert all(
            totals[key] is None
            for key in ("spend_usd_micros", "impressions", "clicks", "ctr", "cpc")
        )


def test_stale_source_requests_and_failed_configuration_preserve_snapshot(
    tiny_settings, write_meta
):
    write_meta(tiny_settings, [["Example", "06/01/2026", "100", 1000, 10]])
    with TestClient(create_app(tiny_settings)) as client:
        version = client.post("/api/ingestion").json()["dataset_fingerprint"]
        write_meta(tiny_settings, [["Example", "06/01/2026", "200", 1000, 10]])
        client.post("/api/ingestion")
        assert (
            client.get("/api/records", params={"expected_fingerprint": version}).status_code == 409
        )
        assert (
            client.get(
                "/api/deliveries/file:meta_ads_2026-06-01.csv",
                params={"expected_fingerprint": version},
            ).status_code
            == 409
        )
        before = client.get("/api/metrics").json()
        tiny_settings.data_dir.rename(tiny_settings.data_dir.with_name("temporarily-moved"))
        assert client.post("/api/ingestion").status_code == 500
        assert client.get("/api/metrics").json() == before


def test_concurrent_ingestion_receives_conflict(client):
    client.app.state.ingestion_lock.acquire()
    try:
        assert client.post("/api/ingestion").status_code == 409
    finally:
        client.app.state.ingestion_lock.release()
