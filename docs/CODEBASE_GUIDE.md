# Codebase walkthrough

This guide is a reading path through the application. Follow the order below before reading files alphabetically.

## Start here

1. `docs/ASSESSMENT.md` — the original requirements and evaluation criteria.
2. `README.md` — the implemented architecture, decisions, findings, and commands.
3. `backend/app/config.py` — the inputs and explicit policy: directories, reporting period, platforms, exchange rates, and reviewed overrides.
4. `backend/app/domain.py` — the small Python objects passed through the pipeline.
5. `backend/app/ingestion.py` — the main orchestration. Its `build_snapshot()` function is the best single function for understanding the backend.
6. `backend/app/main.py` — the HTTP boundary and the route from the browser into ingestion and reporting.
7. `frontend/src/App.tsx` — the frontend shell and top-level state.
8. `frontend/src/views/MetricsView.tsx` and `frontend/src/views/HealthView.tsx` — the two user workflows.

After this first pass, return to the adapters, normalization, checks, persistence, and tests for the details.

## The four important flows

### Ingestion

`POST /api/ingestion` or `python -m app.cli` → `build_snapshot()` → discover and hash files → resolve file duplicates/conflicts → platform adapter → normalize each row → run quality checks → add missing weekly slots → calculate health → `replace_snapshot()` in one SQLite transaction.

The complete snapshot is built in memory before the write transaction. Expected data defects become structured findings and do not abort other files. An unexpected configuration or persistence error prevents publication and preserves the previous snapshot.

### Campaign metrics

`MetricsView.tsx` builds filter query parameters → `GET /api/metrics` validates them with `MetricsQuery` → `database.read_records()` selects accepted records → `metrics.py` groups and aggregates them → the UI renders cards and campaign rows.

CTR and CPC are calculated by the backend. The browser only formats returned values and applies the selected display currency.

### Source trace

Click a campaign → `SourceDetails.tsx` requests `/api/records` with the campaign filters and expected dataset fingerprint → SQLite returns the contributing source rows → the dialog shows filename, content hash, source line/index, raw values, and applied transformation rules.

The fingerprint prevents a number from an old snapshot being explained with records from a newer snapshot.

### Delivery health

`HealthView.tsx` requests `/api/deliveries` → the user can search and filter deliveries → clicking a delivery requests `/api/deliveries/{id}` → every persisted check and finding is displayed with its outcome, count, locator, observed value, and expected condition.

## Backend files

| File | Responsibility |
|---|---|
| `backend/app/__init__.py` | Marks `app` as a Python package. |
| `backend/app/config.py` | Loads paths and policy, validates exchange rates and normalization overrides, and produces the processing context used in the dataset fingerprint. |
| `backend/app/domain.py` | Dataclasses for `SourceRow`, normalized `MetricRow`, `Finding`, `CheckResult`, `Delivery`, and the complete `Snapshot`. These objects have no API or database dependency. |
| `backend/app/adapters/common.py` | Strict CSV and JSON helpers. It preserves raw input and produces a common `SourceRow` shape with a line or array-index locator. |
| `backend/app/adapters/meta.py` | Maps Meta CSV column names into canonical input names. |
| `backend/app/adapters/google.py` | Maps Google CSV columns and marks spend as micro-units. |
| `backend/app/adapters/linkedin.py` | Maps LinkedIn JSON, including epoch timestamps and nested amount/currency objects. |
| `backend/app/adapters/__init__.py` | Registry that maps a platform to its adapter and expected extension. |
| `backend/app/normalization.py` | Validates and converts campaign names, dates, counts, currencies, units, and exact micro-USD money. It records every applied rule and leaves invalid individual metrics as unknown. |
| `backend/app/quality.py` | Defines the check catalog and common helpers for creating checks, adding findings, and finalizing skipped checks. |
| `backend/app/checks.py` | Cross-row and cross-delivery checks: completeness, duplicate campaign/day keys, spend-unit suspicion, volume, and reporting-period boundaries. New delivery checks are added to `DELIVERY_CHECKS`. |
| `backend/app/ingestion.py` | Deterministic orchestration, content hashing, file duplicate/conflict resolution, error isolation, missing-delivery creation, and final health calculation. |
| `backend/app/schema.sql` | Three constrained tables: deliveries, normalized metric records, and structured check results. |
| `backend/app/database.py` | Initializes SQLite, atomically replaces a snapshot, and contains parameterized read queries. Raw file bytes, raw rows, and transformation rules are persisted here. |
| `backend/app/metrics.py` | One aggregation path for campaign groups, platform groups, totals, CTR, CPC, missing counts, and relevant caveats. |
| `backend/app/schemas.py` | Pydantic request validation and public response shapes. Unknown query parameters and invalid ranges are rejected. |
| `backend/app/main.py` | FastAPI application, ingestion lock, API routes, error responses, and serving the compiled frontend. |
| `backend/app/cli.py` | Command-line entry point that calls the same pipeline and persistence functions as the ingestion API. |

## Frontend files

| File | Responsibility |
|---|---|
| `frontend/src/main.tsx` | React entry point and global stylesheet imports. |
| `frontend/src/App.tsx` | Application shell, navigation, shared filters, ingestion action, notification data, refresh state, and selected detail state. |
| `frontend/src/types.ts` | TypeScript versions of API response and UI state shapes. |
| `frontend/src/api.ts` | URL construction, `fetch`, and consistent API error handling. |
| `frontend/src/hooks/useApi.ts` | Small GET hook with loading/error state, request cancellation, and protection from stale filter responses. |
| `frontend/src/format.ts` | Platform labels and number, money, percentage, CPC, and date formatting. |
| `frontend/src/views/MetricsView.tsx` | Filtered totals, spend/CTR sorting, campaign table, and opening source trace details. |
| `frontend/src/views/HealthView.tsx` | Pipeline status, delivery filters, health summary, paginated weekly coverage, delivery table, and detailed check report. |
| `frontend/src/components/FilterBar.tsx` | Platform, optional campaign search, date range, and display-currency controls. |
| `frontend/src/components/PlatformSelect.tsx` | Accessible Radix platform selector with the three platform logos. |
| `frontend/src/components/DateRangePicker.tsx` | Radix popover containing a DayPicker range calendar. |
| `frontend/src/components/HealthNotifications.tsx` | Header bell, capped issue preview, and navigation into delivery health. |
| `frontend/src/components/SourceDetails.tsx` | Metric lineage dialog showing contributing records and transformations. |
| `frontend/src/components/DetailDialog.tsx` | Shared native dialog wrapper and close behavior. |
| `frontend/src/components/PlatformLabel.tsx` | Consistent platform logo and name. |
| `frontend/src/components/StatusBadge.tsx` | Consistent status/health label. |
| `frontend/src/components/RequestState.tsx` | Loading, API error, and retry presentation. |
| `frontend/src/styles.css` | Digitalzone tokens, component layout, table/dialog styles, and responsive behavior. |
| `frontend/index.html` | Vite HTML entry document and browser metadata. |
| `frontend/vite.config.ts` | React build plugin and the development-only `/api` proxy. Production uses FastAPI's same-origin static mount. |
| `frontend/eslint.config.js` / `frontend/tsconfig.json` | JavaScript/React lint rules and strict TypeScript build configuration. |
| `frontend/package.json` | Frontend commands and direct runtime/development dependencies. |
| `frontend/public/*` | Favicon, official company mark, and supplied platform artwork copied unchanged into the production build. |

## Tests and supporting files

| File | Responsibility |
|---|---|
| `backend/tests/test_normalization.py` | Exact date, count, money, and missing-value behavior. |
| `backend/tests/test_checks.py` | Quality check behavior and outcome/count semantics. |
| `backend/tests/test_ingestion.py` | Idempotency, duplicate files/rows, error isolation, cadence, unit quarantine, exact-hash correction, and rollback-related behavior. |
| `backend/tests/test_api.py` | Filters, totals, grouping, errors, health detail, trace fingerprints, and ingestion concurrency. |
| `backend/tests/conftest.py` | Small isolated input directories and application/database fixtures. |
| `config/normalization_overrides.json` | Explicit content-hash policy for an externally reviewed or assessment-local correction. Detection alone cannot authorize a monetary rewrite. |
| `data/exchange_rates.json` | Fixed finance-provided conversion rates used by ingestion and display conversion. |
| `data/deliveries/*` | The 15 supplied source exports. They are application input, not generated fixtures. |
| `docs/DATA_QUALITY.md` | Reproducible findings from the supplied dataset. |
| `docs/IMPLEMENTATION_PLAN.md` | Detailed design, schema, policies, test plan, and requirement mapping. |
| `Dockerfile` | Multi-stage production image: builds React, installs the locked Python runtime, then packages one FastAPI-served application. |
| `compose.yaml` | Local one-command container startup with source/config mounts and a persistent SQLite volume. |
| `docker/entrypoint.sh` | Ingests the configured source directory and starts Uvicorn. |
| `Makefile` | Short local development, verification, and Docker commands. |
| `backend/pyproject.toml` | Python version, runtime/dev dependencies, pytest settings, and Ruff rules. |
| `backend/uv.lock` / `frontend/package-lock.json` | Reproducible Python and JavaScript dependency versions. |

Generated directories such as `.venv`, `node_modules`, `dist`, caches, and `var` are ignored and should not be reviewed or committed.

## Why the Meta override exists

`meta_ads_2026-06-08.csv` contains 35 non-negative spend values. Every value is an integer, its median is `13,263`, and the median of the other usable Meta rows is `127.385`. The ratio is approximately `104.12×`, while neighboring weeks contain ordinary decimal dollar amounts. This is strong evidence of cents stored in a field labelled `spend_usd`, but it is not proof.

The general check in `checks.py` only detects that pattern. Without an exact content-hash entry, the pipeline sets that file's spend to unknown and adds `spend.quarantine_unit_anomaly`; impressions and clicks remain usable. The entry in `normalization_overrides.json` records an explicit interpretation for the exact bytes, divides spend by 100, attaches before/after evidence to every corrected row, and keeps the delivery health at **fail**. Changing even one byte changes the SHA-256, so the correction stops applying.

In production, an analyst or finance owner should approve this entry. For the assessment, describe it as an explicit, assessment-local interpretation made to produce a likely normalized total while keeping the uncertainty visible. Do not claim that the source platform or finance team confirmed it.
