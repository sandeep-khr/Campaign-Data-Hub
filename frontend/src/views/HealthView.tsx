import { useEffect, useMemo, useState } from "react";
import { apiUrl } from "../api";
import { count, platformNames, platforms, shortDate } from "../format";
import { useApi } from "../hooks/useApi";
import type {
  DeliveriesResponse,
  Delivery,
  DeliveryDetail,
  Platform,
} from "../types";
import { DetailDialog } from "../components/DetailDialog";
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
  const data = result.data;
  const visible = useMemo(
    () =>
      (data?.items ?? []).filter(
        (item) => !platform || item.platform === platform,
      ),
    [data, platform],
  );
  const healthTotals = useMemo(
    () => ({
      pass: visible.filter((item) => item.health === "pass").length,
      warn: visible.filter((item) => item.health === "warn").length,
      fail: visible.filter((item) => item.health === "fail").length,
    }),
    [visible],
  );
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
          <h2>Delivery health</h2>
          <p>
            Every received file and expected weekly slot, including data that
            did not enter the report.
          </p>
        </div>
        <label>
          Platform
          <select
            value={platform}
            onChange={(event) =>
              setPlatform(event.target.value as Platform | "")
            }
          >
            <option value="">All platforms</option>
            {platforms.map((item) => (
              <option key={item} value={item}>
                {platformNames[item]}
              </option>
            ))}
          </select>
        </label>
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
          <div className="health-summary">
            {(["pass", "warn", "fail"] as const).map((value) => (
              <div className={`health-total health-${value}`} key={value}>
                <StatusBadge value={value} />
                <strong>{healthTotals[value]}</strong>
                <span>deliveries</span>
              </div>
            ))}
            <div className="health-total">
              <span className="status-badge status-all">
                <span aria-hidden="true" />
                All
              </span>
              <strong>{visible.length}</strong>
              <span>report entries</span>
            </div>
          </div>
          <section className="panel matrix-panel">
            <div className="panel-heading">
              <div>
                <h2>Weekly cadence</h2>
                <p>
                  Primary delivery status by platform and week. The June 29 week
                  covers two days.
                </p>
              </div>
            </div>
            <div className="table-scroll">
              <table className="health-matrix">
                <thead>
                  <tr>
                    <th>Platform</th>
                    {data.weeks.map((week) => (
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
                          <span className={`platform-label platform-${item}`}>
                            <span aria-hidden="true">
                              {platformNames[item][0]}
                            </span>
                            {platformNames[item]}
                          </span>
                        </th>
                        {data.weeks.map((week) => {
                          const delivery = cellDelivery(data.items, item, week);
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
                  The resend remains visible even though it contributes no
                  metric records.
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
                        {delivery.platform
                          ? platformNames[delivery.platform]
                          : "Unknown"}
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
