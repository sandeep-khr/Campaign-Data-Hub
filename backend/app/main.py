import logging
import threading
from contextlib import asynccontextmanager
from datetime import date, timedelta
from typing import Annotated

from fastapi import FastAPI, HTTPException, Query
from fastapi.staticfiles import StaticFiles

from app import database, metrics, schemas
from app.config import PROJECT_ROOT, Settings
from app.ingestion import build_snapshot

logger = logging.getLogger(__name__)


def fingerprint(con, expected: str | None = None) -> str | None:
    context = database.current_context(con)
    current = context["dataset_fingerprint"] if context else None
    if expected is not None and expected != current:
        raise HTTPException(409, "The dataset changed. Refresh before inspecting source details.")
    return current


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings.from_environment()

    @asynccontextmanager
    async def lifespan(app):
        database.initialize(settings.database_path)
        yield

    app = FastAPI(title="Campaign Data Hub", version="0.1.0", lifespan=lifespan)
    app.state.ingestion_lock = threading.Lock()

    @app.get("/api/health")
    def health():
        with database.connection(settings.database_path) as con:
            con.execute("SELECT 1")
        return {"status": "ok"}

    @app.post("/api/ingestion", response_model=schemas.IngestionResponse)
    def ingest():
        if not app.state.ingestion_lock.acquire(blocking=False):
            raise HTTPException(409, "Ingestion is already running. Try again when it completes.")
        try:
            snapshot = build_snapshot(settings)
            database.replace_snapshot(settings.database_path, snapshot)
            return snapshot.summary()
        except Exception as error:
            logger.exception("Ingestion failed before publication completed")
            raise HTTPException(
                500, "Ingestion failed; previously committed results were preserved."
            ) from error
        finally:
            app.state.ingestion_lock.release()

    @app.get("/api/metrics", response_model=schemas.MetricsResponse)
    def campaign_metrics(query: Annotated[schemas.MetricsQuery, Query()]):
        with database.connection(settings.database_path) as con:
            version = fingerprint(con)
            rows = database.read_records(con, **query.filters())
            deliveries = database.read_deliveries(con)
        return {
            "dataset_fingerprint": version,
            "items": metrics.grouped_metrics(rows, query.group_by),
            "totals": metrics.aggregate(rows),
            "caveats": metrics.caveats(deliveries, **query.filters()),
        }

    @app.get("/api/records", response_model=schemas.RecordsResponse)
    def source_records(query: Annotated[schemas.RecordsQuery, Query()]):
        with database.connection(settings.database_path) as con:
            version = fingerprint(con, query.expected_fingerprint)
            rows = database.read_records(
                con,
                **query.filters(),
                campaign_key=query.campaign_key,
                delivery_id=query.delivery_id,
            )
        return {
            "dataset_fingerprint": version,
            "items": [{**row, **metrics.money_fields(row["spend_usd_micros"])} for row in rows],
        }

    @app.get("/api/deliveries", response_model=schemas.DeliveriesResponse)
    def deliveries(platform: schemas.Platform | None = None, health: schemas.Health | None = None):
        with database.connection(settings.database_path) as con:
            context = database.current_context(con)
            rows = database.read_deliveries(con)
        rows = [
            row
            for row in rows
            if (not platform or row["platform"] == platform)
            and (not health or row["health"] == health)
        ]
        start = context["report_start"] if context else str(settings.report_start)
        end = context["report_end"] if context else str(settings.report_end)
        weeks = [
            str(date.fromisoformat(start) + timedelta(days=i))
            for i in range(0, (date.fromisoformat(end) - date.fromisoformat(start)).days + 1, 7)
        ]
        return {
            "items": rows,
            "dataset_fingerprint": context["dataset_fingerprint"] if context else None,
            "report_start": start,
            "report_end": end,
            "weeks": weeks,
            "health": {
                value: sum(row["health"] == value for row in rows)
                for value in ("pass", "warn", "fail")
            },
        }

    @app.get("/api/deliveries/{delivery_id}", response_model=schemas.DeliveryDetail)
    def delivery_detail(delivery_id: str, expected_fingerprint: str | None = None):
        with database.connection(settings.database_path) as con:
            version = fingerprint(con, expected_fingerprint)
            row = next(
                (item for item in database.read_deliveries(con) if item["id"] == delivery_id), None
            )
            if row is None:
                raise HTTPException(404, "Delivery not found.")
            checks = database.read_checks(con, delivery_id)
        return {"dataset_fingerprint": version, "delivery": row, "checks": checks}

    frontend = PROJECT_ROOT / "frontend/dist"
    if frontend.is_dir():
        app.mount("/", StaticFiles(directory=frontend, html=True), name="frontend")
    return app


app = create_app()
