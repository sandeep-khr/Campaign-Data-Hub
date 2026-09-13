import csv
from dataclasses import replace

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


@pytest.fixture
def settings(tmp_path):
    return replace(Settings(), database_path=tmp_path / "hub.sqlite")


@pytest.fixture
def tiny_settings(settings, tmp_path):
    source = tmp_path / "deliveries"
    source.mkdir()
    return replace(settings, data_dir=source)


@pytest.fixture
def client(settings):
    with TestClient(create_app(settings)) as api:
        yield api


@pytest.fixture
def write_meta():
    def write(settings, rows, filename="meta_ads_2026-06-01.csv"):
        path = settings.data_dir / filename
        with path.open("w", newline="") as handle:
            writer = csv.writer(handle)
            writer.writerow(["campaign_name", "date", "spend_usd", "impressions", "clicks"])
            writer.writerows(rows)
        return path

    return write
