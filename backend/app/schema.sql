PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS deliveries (
    id TEXT PRIMARY KEY NOT NULL,
    file_name TEXT UNIQUE,
    platform TEXT CHECK (platform IN ('meta', 'google', 'linkedin')),
    period_start TEXT,
    period_end TEXT,
    content_sha256 TEXT,
    raw_content BLOB,
    status TEXT NOT NULL CHECK (
        status IN ('processed', 'duplicate', 'rejected', 'conflict', 'missing')
    ),
    health TEXT NOT NULL CHECK (health IN ('pass', 'warn', 'fail')),
    duplicate_of_id TEXT REFERENCES deliveries(id),
    rows_read INTEGER CHECK (rows_read >= 0),
    rows_accepted INTEGER NOT NULL DEFAULT 0 CHECK (rows_accepted >= 0),
    rows_rejected INTEGER NOT NULL DEFAULT 0 CHECK (rows_rejected >= 0),
    rows_duplicate INTEGER NOT NULL DEFAULT 0 CHECK (rows_duplicate >= 0),
    rows_corrected INTEGER NOT NULL DEFAULT 0 CHECK (
        rows_corrected >= 0 AND rows_corrected <= rows_accepted
    ),
    processing_context_json TEXT NOT NULL,
    CHECK (content_sha256 IS NULL OR length(content_sha256) = 64),
    CHECK (
        (status = 'missing' AND file_name IS NULL AND raw_content IS NULL
            AND content_sha256 IS NULL AND platform IS NOT NULL
            AND period_start IS NOT NULL AND period_end IS NOT NULL)
        OR (status <> 'missing' AND file_name IS NOT NULL)
    ),
    CHECK (
        (status = 'duplicate' AND duplicate_of_id IS NOT NULL)
        OR (status <> 'duplicate' AND duplicate_of_id IS NULL)
    ),
    CHECK (duplicate_of_id IS NULL OR duplicate_of_id <> id),
    CHECK (
        status NOT IN ('processed', 'duplicate', 'conflict')
        OR (platform IS NOT NULL AND period_start IS NOT NULL
            AND period_end IS NOT NULL)
    ),
    CHECK (status = 'processed' OR rows_accepted = 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS one_processed_delivery_per_slot
    ON deliveries(platform, period_start) WHERE status = 'processed';
CREATE UNIQUE INDEX IF NOT EXISTS one_missing_delivery_per_slot
    ON deliveries(platform, period_start) WHERE status = 'missing';
CREATE INDEX IF NOT EXISTS deliveries_platform_period ON deliveries(platform, period_start);

CREATE TABLE IF NOT EXISTS metric_records (
    delivery_id TEXT NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
    source_locator TEXT NOT NULL,
    campaign_key TEXT NOT NULL,
    campaign TEXT NOT NULL,
    date TEXT NOT NULL,
    spend_usd_micros INTEGER CHECK (spend_usd_micros >= 0),
    impressions INTEGER CHECK (impressions >= 0),
    clicks INTEGER CHECK (clicks >= 0),
    raw_row_json TEXT NOT NULL,
    applied_rules_json TEXT NOT NULL,
    PRIMARY KEY (delivery_id, source_locator),
    UNIQUE (delivery_id, campaign_key, date),
    CHECK (clicks IS NULL OR impressions IS NULL OR clicks <= impressions)
);
CREATE INDEX IF NOT EXISTS metric_records_date ON metric_records(date);

CREATE TABLE IF NOT EXISTS check_results (
    delivery_id TEXT NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
    check_id TEXT NOT NULL,
    scope TEXT NOT NULL CHECK (scope IN ('row', 'file', 'delivery')),
    outcome TEXT NOT NULL CHECK (
        outcome IN ('pass', 'warn', 'fail', 'skipped', 'error')
    ),
    count_unit TEXT NOT NULL CHECK (
        count_unit IN ('row', 'file', 'cell', 'delivery')
    ),
    checked_count INTEGER CHECK (checked_count >= 0),
    affected_count INTEGER CHECK (affected_count >= 0),
    summary TEXT NOT NULL,
    findings_json TEXT NOT NULL,
    PRIMARY KEY (delivery_id, check_id),
    CHECK (affected_count <= checked_count)
);
