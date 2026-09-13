import { useEffect, useMemo, useState } from "react";
import {
  Braces,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleX,
  Database,
  FileCheck2,
  Files,
  Search,
} from "lucide-react";
import { apiUrl } from "../api";
import { count, platformNames, platforms, shortDate } from "../format";
import { useApi } from "../hooks/useApi";
import type {
  DeliveriesResponse,
  Delivery,
  DeliveryDetail,
  Health,
  Platform,
} from "../types";
import { DetailDialog } from "../components/DetailDialog";
import { DateRangePicker } from "../components/DateRangePicker";
import { PlatformLabel } from "../components/PlatformLabel";
import { PlatformSelect } from "../components/PlatformSelect";
import { RequestState } from "../components/RequestState";
import { StatusBadge } from "../components/StatusBadge";

function cellDelivery(items: Delivery[], platform: Platform, week: string) {
  return items.find(
    (item) =>
      item.platform === platform &&
      item.period_start === week &&
      item.status !== "duplicate",
  );
}

function EvidenceValue({ value }: { value: unknown }) {
  if (value == null) return <span>—</span>;
  if (typeof value === "string" || typeof value === "number")
    return <code>{String(value)}</code>;
  return <pre>{JSON.stringify(value, null, 2)}</pre>;
}

function DeliveryDetails({
  deliveryId,
  fingerprint,
  onClose,
  onRefresh,
}: {
  deliveryId: string;
  fingerprint: string;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const result = useApi<DeliveryDetail>(
    apiUrl(`deliveries/${encodeURIComponent(deliveryId)}`, {
      expected_fingerprint: fingerprint,
    }),
  );
  const delivery = result.data?.delivery;
  return (
    <DetailDialog
      title={delivery?.file_name ?? delivery?.id ?? "Delivery details"}
      subtitle={
        delivery
          ? `${delivery.platform ? platformNames[delivery.platform] : "Unknown platform"} · ${delivery.period_start ?? "Unknown week"}`
          : undefined
      }
      onClose={onClose}
    >
      <RequestState {...result} onRetry={onRefresh} />
      {delivery && (
        <>
          <div className="delivery-overview">
            <div>
              <span>Health</span>
              <StatusBadge value={delivery.health} />
            </div>
            <div>
              <span>Status</span>
              <StatusBadge value={delivery.status} />
            </div>
            <div>
              <span>Accepted</span>
              <strong>{count(delivery.rows_accepted)}</strong>
            </div>
            <div>
              <span>Rejected</span>
              <strong>{count(delivery.rows_rejected)}</strong>
            </div>
            <div>
              <span>Duplicate rows</span>
              <strong>{count(delivery.rows_duplicate)}</strong>
            </div>
            <div>
              <span>Corrected</span>
              <strong>{count(delivery.rows_corrected)}</strong>
            </div>
          </div>
          {delivery.content_sha256 && (
            <p className="hash-label">
              SHA-256 <code>{delivery.content_sha256}</code>
            </p>
          )}
          {delivery.duplicate_of_id && (
            <p className="notice compact-notice">
              This file is identical to{" "}
              <strong>{delivery.duplicate_of_id.replace("file:", "")}</strong>{" "}
              and contributes no records.
            </p>
          )}
          <div className="section-heading">
            <h3>Checks performed</h3>
            <span className="count-label">{result.data!.checks.length}</span>
          </div>
          <div className="checks-list">
            {result.data!.checks.map((check) => (
              <details
                key={check.check_id}
                className={`check-card check-${check.outcome}`}
                open={check.outcome === "fail" || check.outcome === "error"}
              >
                <summary>
                  <span className="check-title">
                    <StatusBadge value={check.outcome} />
                    <span>
                      <strong>{check.summary.split(" — ")[0]}</strong>
                      <code>{check.check_id}</code>
                    </span>
                  </span>
                  <span className="check-count">
                    {check.affected_count ?? 0} affected
                  </span>
                </summary>
                <div className="check-body">
                  <p>{check.summary}</p>
                  <p className="muted">
                    Checked {check.checked_count ?? "—"} {check.count_unit}
                    {check.checked_count === 1 ? "" : "s"}.
                  </p>
                  {check.findings.map((finding, index) => (
                    <div
                      className="finding"
                      key={`${finding.locator}:${index}`}
                    >
                      <div className="finding-heading">
                        <StatusBadge value={finding.severity} />
                        <strong>{finding.message}</strong>
                        {finding.locator && <code>{finding.locator}</code>}
                      </div>
                      {(finding.field ||
                        finding.observed != null ||
                        finding.expected != null) && (
                        <div className="evidence-grid">
                          <span>
                            Field<strong>{finding.field ?? "—"}</strong>
                          </span>
                          <span>
                            Observed
                            <EvidenceValue value={finding.observed} />
                          </span>
                          <span>
                            Expected
                            <EvidenceValue value={finding.expected} />
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </div>
        </>
      )}
    </DetailDialog>
  );
}

export function HealthView({
  refresh,
  onRefresh,
  selectedId,
  onSelected,
}: {
  refresh: number;
  onRefresh: () => void;
  selectedId?: string;
  onSelected: (id?: string) => void;
}) {
  const result = useApi<DeliveriesResponse>(apiUrl("deliveries"), refresh);
  const [platform, setPlatform] = useState<Platform | "">("");
  const [health, setHealth] = useState<Health | "">("");
  const [query, setQuery] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [weekOffset, setWeekOffset] = useState(0);
  const data = result.data;
  const visible = useMemo(
    () =>
      (data?.items ?? []).filter((item) => {
        const searchText = query.trim().toLocaleLowerCase();
        const matchesQuery =
          !searchText ||
          [
            item.file_name,
            item.id,
            item.status,
            item.platform ? platformNames[item.platform] : "",
          ].some((value) =>
            (value ?? "").toLocaleLowerCase().includes(searchText),
          );
        const matchesDate =
          (!startDate || (item.period_start ?? "") >= startDate) &&
          (!endDate || (item.period_start ?? "") <= endDate);
        return (
          (!platform || item.platform === platform) &&
          (!health || item.health === health) &&
          matchesQuery &&
          matchesDate
        );
      }),
    [data, endDate, health, platform, query, startDate],
  );
  const healthTotals = useMemo(
    () => ({
      pass: visible.filter((item) => item.health === "pass").length,
      warn: visible.filter((item) => item.health === "warn").length,
      fail: visible.filter((item) => item.health === "fail").length,
    }),
    [visible],
  );
  const matchingWeeks = useMemo(
    () =>
      (data?.weeks ?? []).filter(
        (week) =>
          (!startDate || week >= startDate) && (!endDate || week <= endDate),
      ),
    [data, endDate, startDate],
  );
  const maxWeekOffset = Math.max(0, matchingWeeks.length - 8);
  const currentWeekOffset = Math.min(weekOffset, maxWeekOffset);
  const weekEnd = matchingWeeks.length - currentWeekOffset;
  const weekStart = Math.max(0, weekEnd - 8);
  const visibleWeeks = matchingWeeks.slice(weekStart, weekEnd);
  const sourceFiles = data?.items.filter((item) => item.file_name).length ?? 0;
  const storedRecords =
    data?.items.reduce((total, item) => total + item.rows_accepted, 0) ?? 0;
  const attentionCount =
    data?.items.filter((item) => item.health !== "pass").length ?? 0;
  useEffect(() => {
    if (
      selectedId &&
      data &&
      !data.items.some((item) => item.id === selectedId)
    )
      onSelected();
  }, [data, onSelected, selectedId]);

  return (
    <>
      <div className="health-heading">
        <div>
          <h2>Delivery monitoring</h2>
          <p>
            Inspect each source delivery and trace validation results to the
            original file.
          </p>
        </div>
        {data?.dataset_fingerprint && (
          <span className="operational-status">
            <span aria-hidden="true" /> Dataset available
          </span>
        )}
      </div>
      <RequestState {...result} onRetry={onRefresh} />
      {data && !data.dataset_fingerprint && (
        <div className="empty-state">
          <span className="empty-symbol">◇</span>
          <h2>No delivery report yet.</h2>
          <p>
            Run ingestion to inspect the supplied files and expected schedule.
          </p>
        </div>
      )}
      {data?.dataset_fingerprint && (
        <>
          <section className="pipeline-panel" aria-label="Ingestion pipeline">
            <div className="pipeline-heading">
              <div>
                <h2>Ingestion pipeline</h2>
                <p>
                  Current dataset from source delivery through the reporting
                  API.
                </p>
              </div>
              <code>{data.dataset_fingerprint.slice(0, 8)}</code>
            </div>
            <div className="pipeline-steps">
              <div className="pipeline-step">
                <Files size={18} aria-hidden="true" />
                <span>
                  <strong>Files received</strong>
                  <small>{sourceFiles} source files</small>
                </span>
              </div>
              <ChevronRight
                className="pipeline-arrow"
                size={17}
                aria-hidden="true"
              />
              <div className="pipeline-step">
                <FileCheck2 size={18} aria-hidden="true" />
                <span>
                  <strong>Parse &amp; validate</strong>
                  <small>{attentionCount} need attention</small>
                </span>
              </div>
              <ChevronRight
                className="pipeline-arrow"
                size={17}
                aria-hidden="true"
              />
              <div className="pipeline-step">
                <Braces size={18} aria-hidden="true" />
                <span>
                  <strong>Normalize</strong>
                  <small>{count(storedRecords)} accepted rows</small>
                </span>
              </div>
              <ChevronRight
                className="pipeline-arrow"
                size={17}
                aria-hidden="true"
              />
              <div className="pipeline-step">
                <Database size={18} aria-hidden="true" />
                <span>
                  <strong>Store &amp; serve</strong>
                  <small>Reporting API ready</small>
                </span>
              </div>
            </div>
          </section>

          <div className="health-filter-bar">
            <label className="delivery-search">
              Delivery search
              <span className="input-with-icon">
                <Search size={16} aria-hidden="true" />
                <input
                  type="search"
                  value={query}
                  placeholder="Search file or delivery ID (optional)"
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setWeekOffset(0);
                  }}
                />
              </span>
            </label>
            <div className="filter-field health-platform-filter">
              <span className="filter-label">Platform</span>
              <PlatformSelect
                value={platform}
                onChange={(value) => {
                  setPlatform(value);
                  setWeekOffset(0);
                }}
              />
            </div>
            <label className="health-status-filter">
              Data health
              <select
                value={health}
                onChange={(event) => {
                  setHealth(event.target.value as Health | "");
                  setWeekOffset(0);
                }}
              >
                <option value="">All health statuses</option>
                <option value="pass">Healthy</option>
                <option value="warn">Warning</option>
                <option value="fail">Failed</option>
              </select>
            </label>
            <div className="filter-field health-date-filter">
              <span className="filter-label">Delivery date</span>
              <DateRangePicker
                start={startDate}
                end={endDate}
                onChange={(start, end) => {
                  setStartDate(start);
                  setEndDate(end);
                  setWeekOffset(0);
                }}
              />
            </div>
          </div>

          <div className="health-summary">
            <div className="health-total health-pass">
              <span className="health-total-icon">
                <CheckCircle2 size={18} aria-hidden="true" />
              </span>
              <div>
                <span>Healthy</span>
                <strong>{healthTotals.pass}</strong>
                <small>deliveries</small>
              </div>
            </div>
            <div className="health-total health-warn">
              <span className="health-total-icon">
                <CircleAlert size={18} aria-hidden="true" />
              </span>
              <div>
                <span>Warnings</span>
                <strong>{healthTotals.warn}</strong>
                <small>deliveries</small>
              </div>
            </div>
            <div className="health-total health-fail">
              <span className="health-total-icon">
                <CircleX size={18} aria-hidden="true" />
              </span>
              <div>
                <span>Failed</span>
                <strong>{healthTotals.fail}</strong>
                <small>deliveries</small>
              </div>
            </div>
            <div className="health-total health-all">
              <span className="health-total-icon">
                <Files size={18} aria-hidden="true" />
              </span>
              <div>
                <span>Total</span>
                <strong>{visible.length}</strong>
                <small>matching entries</small>
              </div>
            </div>
          </div>
          <section className="panel matrix-panel">
            <div className="panel-heading">
              <div>
                <h2>Delivery coverage</h2>
                <p>Weekly source availability across connected platforms.</p>
              </div>
              <div className="week-pagination" aria-label="Coverage pagination">
                <span>
                  {visibleWeeks.length
                    ? `${weekStart + 1}–${weekEnd} of ${matchingWeeks.length} weeks`
                    : "No matching weeks"}
                </span>
                <button
                  aria-label="Show older weeks"
                  disabled={weekStart === 0}
                  onClick={() => setWeekOffset(currentWeekOffset + 8)}
                >
                  <ChevronLeft size={16} aria-hidden="true" />
                </button>
                <button
                  aria-label="Show newer weeks"
                  disabled={currentWeekOffset === 0}
                  onClick={() =>
                    setWeekOffset(Math.max(0, currentWeekOffset - 8))
                  }
                >
                  <ChevronRight size={16} aria-hidden="true" />
                </button>
              </div>
            </div>
            <div className="table-scroll">
              <table className="health-matrix">
                <thead>
                  <tr>
                    <th>Platform</th>
                    {visibleWeeks.map((week) => (
                      <th key={week}>{shortDate(week)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {platforms
                    .filter((item) => !platform || item === platform)
                    .map((item) => (
                      <tr key={item}>
                        <th>
                          <PlatformLabel platform={item} />
                        </th>
                        {visibleWeeks.map((week) => {
                          const delivery = cellDelivery(visible, item, week);
                          return (
                            <td key={week}>
                              {delivery ? (
                                <button
                                  className={`matrix-cell matrix-${delivery.health}`}
                                  onClick={() => onSelected(delivery.id)}
                                >
                                  <StatusBadge value={delivery.health} />
                                  <span>
                                    {delivery.status === "missing"
                                      ? "Not received"
                                      : `${delivery.rows_accepted} rows`}
                                  </span>
                                </button>
                              ) : (
                                <span className="matrix-cell matrix-empty">
                                  —
                                </span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                </tbody>
              </table>
              {visibleWeeks.length === 0 && (
                <div className="table-empty standalone-empty">
                  No delivery weeks match these filters.
                </div>
              )}
            </div>
          </section>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>
                  File and slot details{" "}
                  <span className="count-label">{visible.length}</span>
                </h2>
                <p>
                  Search, filter, and open a delivery to inspect its validation
                  evidence.
                </p>
              </div>
            </div>
            <div className="table-scroll">
              <table className="delivery-table">
                <thead>
                  <tr>
                    <th>Source</th>
                    <th>Week</th>
                    <th>Platform</th>
                    <th>Status</th>
                    <th>Health</th>
                    <th className="numeric">Accepted</th>
                    <th className="numeric">Issues</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((delivery) => (
                    <tr key={delivery.id}>
                      <td>
                        <button
                          className="campaign-link"
                          onClick={() => onSelected(delivery.id)}
                        >
                          {delivery.file_name ?? "Expected delivery"}
                          <span aria-hidden="true">↗</span>
                        </button>
                      </td>
                      <td>{shortDate(delivery.period_start)}</td>
                      <td>
                        {delivery.platform ? (
                          <PlatformLabel platform={delivery.platform} />
                        ) : (
                          "Unknown"
                        )}
                      </td>
                      <td>
                        <StatusBadge value={delivery.status} />
                      </td>
                      <td>
                        <StatusBadge value={delivery.health} />
                      </td>
                      <td className="numeric">
                        {count(delivery.rows_accepted)}
                      </td>
                      <td className="numeric">{count(delivery.issues)}</td>
                    </tr>
                  ))}
                  {visible.length === 0 && (
                    <tr>
                      <td colSpan={7} className="table-empty">
                        No deliveries match these filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
          {selectedId && (
            <DeliveryDetails
              deliveryId={selectedId}
              fingerprint={data.dataset_fingerprint}
              onClose={() => onSelected()}
              onRefresh={onRefresh}
            />
          )}
        </>
      )}
    </>
  );
}
