export type Platform = "meta" | "google" | "linkedin";
export type Health = "pass" | "warn" | "fail";
export type DeliveryStatus =
  "processed" | "duplicate" | "rejected" | "conflict" | "missing";

export interface Filters {
  platform: Platform | "";
  start_date: string;
  end_date: string;
}

export interface Money {
  spend_usd_micros: number | null;
  spend_usd: string | null;
  spend_usd_display: string | null;
}

export interface Totals extends Money {
  impressions: number | null;
  clicks: number | null;
  ctr: number | null;
  cpc: number | null;
  records: number;
  missing_clicks: number;
  missing_impressions: number;
  missing_spend: number;
  corrected_rows: number;
  delivery_ids: string[];
  ratio_basis: {
    ctr: { clicks: number; impressions: number; records: number };
    cpc: { spend_usd_micros: number; clicks: number; records: number };
  };
}

export interface MetricItem extends Totals {
  platform: Platform;
  campaign: string | null;
  campaign_key: string | null;
}

export interface Caveat {
  delivery_id: string;
  file_name: string | null;
  platform: Platform | null;
  period_start: string | null;
  health: Health;
  status: DeliveryStatus;
  message: string;
}

export interface MetricsResponse {
  dataset_fingerprint: string | null;
  items: MetricItem[];
  totals: Totals;
  caveats: Caveat[];
  ratio_policy: "paired";
}

export interface Delivery {
  id: string;
  file_name: string | null;
  platform: Platform | null;
  period_start: string | null;
  period_end: string | null;
  content_sha256: string | null;
  status: DeliveryStatus;
  health: Health;
  duplicate_of_id: string | null;
  rows_read: number | null;
  rows_accepted: number;
  rows_rejected: number;
  rows_duplicate: number;
  rows_corrected: number;
  issues: number;
  processing_context: Record<string, unknown>;
}

export interface DeliveriesResponse {
  dataset_fingerprint: string | null;
  items: Delivery[];
  health: Record<Health, number>;
  report_start: string;
  report_end: string;
  weeks: string[];
}

export interface Finding {
  severity: "info" | "warning" | "error";
  message: string;
  locator: string | null;
  field: string | null;
  observed: unknown;
  expected: unknown;
  metadata: Record<string, unknown>;
}

export interface Check {
  check_id: string;
  summary: string;
  scope: string;
  outcome: Health | "skipped" | "error";
  count_unit: string;
  checked_count: number | null;
  affected_count: number | null;
  findings: Finding[];
}

export interface DeliveryDetail {
  dataset_fingerprint: string | null;
  delivery: Delivery;
  checks: Check[];
}

export interface SourceRecord extends Money {
  delivery_id: string;
  source_locator: string;
  platform: Platform;
  file_name: string;
  content_sha256: string;
  health: Health;
  campaign: string;
  campaign_key: string;
  date: string;
  impressions: number | null;
  clicks: number | null;
  raw: unknown;
  applied_rules: Record<string, unknown>[];
}

export interface RecordsResponse {
  dataset_fingerprint: string | null;
  items: SourceRecord[];
}

export interface SourceSelection {
  title: string;
  filters: Record<string, string>;
  fingerprint: string;
  totals?: Totals;
}

export interface IngestionResponse {
  dataset_fingerprint: string;
  files_seen: number;
  deliveries: Record<DeliveryStatus, number>;
  health: Record<Health, number>;
  rows_accepted: number;
  rows_rejected: number;
  rows_duplicate: number;
  rows_corrected: number;
}
