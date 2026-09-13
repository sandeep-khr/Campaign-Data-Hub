import { useState } from "react";
import { apiUrl } from "../api";
import { useApi } from "../hooks/useApi";
import {
  count,
  cpc,
  money,
  percent,
  platformNames,
  shortDate,
} from "../format";
import type {
  Filters,
  MetricItem,
  MetricsResponse,
  SourceSelection,
  Totals,
} from "../types";
import { FilterBar } from "../components/FilterBar";
import { RequestState } from "../components/RequestState";

type SortField = "spend_usd_micros" | "ctr";

export function MetricsView({
  filters,
  onFiltersChange,
  refresh,
  onRefresh,
  onHealth,
  onSources,
}: {
  filters: Filters;
  onFiltersChange: (filters: Filters) => void;
  refresh: number;
  onRefresh: () => void;
  onHealth: (id?: string) => void;
  onSources: (selection: SourceSelection) => void;
}) {
  const [sort, setSort] = useState<{ field: SortField; descending: boolean }>({
    field: "spend_usd_micros",
    descending: true,
  });
  const invalid = Boolean(
    filters.start_date &&
    filters.end_date &&
    filters.start_date > filters.end_date,
  );
  const result = useApi<MetricsResponse>(
    invalid ? null : apiUrl("metrics", { ...filters }),
    refresh,
  );
  const data = result.data;
  const sorted = [...(data?.items ?? [])].sort((a, b) => {
    const left = a[sort.field],
      right = b[sort.field];
    if (left === null && right === null) return 0;
    if (left === null) return 1;
    if (right === null) return -1;
    return (
      (left - right) * (sort.descending ? -1 : 1) ||
      `${a.platform}${a.campaign}`.localeCompare(`${b.platform}${b.campaign}`)
    );
  });
  function changeSort(field: SortField) {
    setSort((previous) => ({
      field,
      descending: previous.field === field ? !previous.descending : true,
    }));
  }
  function inspect(totals: Totals, row?: MetricItem) {
    if (!data?.dataset_fingerprint) return;
    onSources({
      title: row?.campaign ?? "Filtered totals",
      fingerprint: data.dataset_fingerprint,
      totals,
      filters: {
        ...filters,
        ...(row
          ? { platform: row.platform, campaign_key: row.campaign_key! }
          : {}),
      },
    });
  }
  return (
    <>
      <FilterBar filters={filters} onChange={onFiltersChange} />
      {invalid && (
        <div className="notice notice-error" role="alert">
          Start date must be on or before end date.
        </div>
      )}
      <RequestState {...result} onRetry={onRefresh} />
      {data && !data.dataset_fingerprint && (
        <div className="empty-state">
          <span className="empty-symbol">↥</span>
          <h2>Your report starts with the source files.</h2>
          <p>
            Run ingestion to normalize the supplied deliveries and reveal their
            quality checks.
          </p>
        </div>
      )}
      {data?.dataset_fingerprint && (
        <>
          <div className="stats-grid">
            <div className="stat-card featured">
              <span>
                Total spend <small>USD</small>
              </span>
              <strong>{money(data.totals.spend_usd_display)}</strong>
              <p>{count(data.totals.records)} accepted records</p>
            </div>
            <div className="stat-card">
              <span>Impressions</span>
              <strong>{count(data.totals.impressions)}</strong>
              <p>
                {data.totals.missing_impressions
                  ? `${data.totals.missing_impressions} rows unknown`
                  : "Reported impressions"}
              </p>
            </div>
            <div className="stat-card">
              <span>Known clicks</span>
              <strong>{count(data.totals.clicks)}</strong>
              <p>
                {data.totals.missing_clicks
                  ? `${data.totals.missing_clicks} rows with unknown clicks`
                  : "No missing click values"}
              </p>
            </div>
            <div className="stat-card">
              <span>Click-through rate</span>
              <strong>{percent(data.totals.ctr)}</strong>
              <p>Rows with clicks + impressions</p>
            </div>
            <div className="stat-card">
              <span>Cost per click</span>
              <strong>{cpc(data.totals.cpc)}</strong>
              <p>Rows with spend + clicks</p>
            </div>
          </div>
          {data.caveats.length > 0 && (
            <div className="notice quality-notice">
              <span className="notice-symbol" aria-hidden="true">
                !
              </span>
              <div>
                <strong>Read the numbers with their source context.</strong>
                <p>
                  {data.totals.missing_clicks > 0 &&
                    `${data.totals.missing_clicks} rows have unknown clicks. `}
                  {data.totals.missing_spend > 0 &&
                    `${data.totals.missing_spend} row has unknown spend. `}
                  {data.totals.corrected_rows > 0 &&
                    `${data.totals.corrected_rows} spend values use a documented correction. `}
                  {data.caveats
                    .filter((item) => item.status === "missing")
                    .map(
                      (item) =>
                        `${platformNames[item.platform!]} is missing for ${shortDate(item.period_start)}. `,
                    )}
                  {data.caveats.some(
                    (item) =>
                      item.status === "conflict" || item.status === "rejected",
                  ) && "Some source files were excluded. "}
                  {data.caveats.some((item) => item.status === "duplicate") &&
                    "An identical resend is excluded. "}
                  {!data.totals.missing_clicks &&
                    !data.totals.missing_spend &&
                    !data.totals.corrected_rows &&
                    !data.caveats.some((item) =>
                      ["missing", "duplicate", "conflict", "rejected"].includes(
                        item.status,
                      ),
                    ) &&
                    "Source warnings are available in delivery health."}
                </p>
              </div>
              <button className="text-button" onClick={() => onHealth()}>
                Review health <span aria-hidden="true">↗</span>
              </button>
            </div>
          )}
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>
                  Campaign performance{" "}
                  <span className="count-label">{data.items.length}</span>
                </h2>
                <p>One consistent view across your advertising platforms.</p>
              </div>
              <button
                className="secondary-button"
                onClick={() => inspect(data.totals)}
                disabled={!data.totals.records}
              >
                Inspect totals <span aria-hidden="true">↗</span>
              </button>
            </div>
            <div className="table-scroll">
              <table className="metrics-table">
                <thead>
                  <tr>
                    <th>Campaign</th>
                    <th>Platform</th>
                    <th
                      className="numeric"
                      aria-sort={
                        sort.field === "spend_usd_micros"
                          ? sort.descending
                            ? "descending"
                            : "ascending"
                          : "none"
                      }
                    >
                      <button onClick={() => changeSort("spend_usd_micros")}>
                        Spend (USD){" "}
                        {sort.field === "spend_usd_micros"
                          ? sort.descending
                            ? "↓"
                            : "↑"
                          : "↕"}
                      </button>
                    </th>
                    <th className="numeric">Impressions</th>
                    <th className="numeric">Clicks</th>
                    <th
                      className="numeric"
                      aria-sort={
                        sort.field === "ctr"
                          ? sort.descending
                            ? "descending"
                            : "ascending"
                          : "none"
                      }
                    >
                      <button onClick={() => changeSort("ctr")}>
                        CTR{" "}
                        {sort.field === "ctr"
                          ? sort.descending
                            ? "↓"
                            : "↑"
                          : "↕"}
                      </button>
                    </th>
                    <th className="numeric">CPC</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((row) => (
                    <tr key={`${row.platform}:${row.campaign_key}`}>
                      <td>
                        <button
                          className="campaign-link"
                          onClick={() => inspect(row, row)}
                          aria-label={`View sources for ${row.campaign}`}
                        >
                          {row.campaign}
                          <span aria-hidden="true">↗</span>
                        </button>
                      </td>
                      <td>
                        <span
                          className={`platform-label platform-${row.platform}`}
                        >
                          <span aria-hidden="true">
                            {platformNames[row.platform][0]}
                          </span>
                          {platformNames[row.platform]}
                        </span>
                      </td>
                      <td className="numeric money-cell">
                        {money(row.spend_usd_display)}
                      </td>
                      <td className="numeric">{count(row.impressions)}</td>
                      <td className="numeric">
                        {count(row.clicks)}
                        {row.missing_clicks > 0 && (
                          <span
                            className="metric-note"
                            title={`${row.missing_clicks} rows have unknown clicks`}
                            aria-label={`${row.missing_clicks} rows have unknown clicks`}
                          >
                            *
                          </span>
                        )}
                      </td>
                      <td className="numeric">{percent(row.ctr)}</td>
                      <td className="numeric">{cpc(row.cpc)}</td>
                    </tr>
                  ))}
                  {sorted.length === 0 && (
                    <tr>
                      <td colSpan={7} className="table-empty">
                        No campaign records match these filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="panel-footer">
              <span>
                CTR and CPC use rows with both required fields present.{" "}
                <strong>—</strong> means unavailable.
              </span>
              <span>Click a campaign to trace its sources.</span>
            </div>
          </section>
        </>
      )}
    </>
  );
}
