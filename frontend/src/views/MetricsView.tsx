import { useState } from "react";
import {
  CircleDollarSign,
  DollarSign,
  Eye,
  MousePointerClick,
  Percent,
} from "lucide-react";
import { apiUrl } from "../api";
import { useApi } from "../hooks/useApi";
import { count, cpc, money, percent } from "../format";
import type {
  Filters,
  MetricItem,
  MetricsResponse,
  SourceSelection,
  Totals,
} from "../types";
import { FilterBar } from "../components/FilterBar";
import { PlatformLabel } from "../components/PlatformLabel";
import { RequestState } from "../components/RequestState";

type SortField = "spend_usd_micros" | "ctr";

export function MetricsView({
  filters,
  onFiltersChange,
  refresh,
  onRefresh,
  onSources,
  currency,
  onCurrencyChange,
}: {
  filters: Filters;
  onFiltersChange: (filters: Filters) => void;
  refresh: number;
  onRefresh: () => void;
  onSources: (selection: SourceSelection) => void;
  currency: string;
  onCurrencyChange: (currency: string) => void;
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
  const currencies = Object.keys(
    data?.exchange_rates_to_usd ?? { USD: "1" },
  ).sort((left, right) => {
    if (left === "USD") return -1;
    if (right === "USD") return 1;
    return left.localeCompare(right);
  });
  const rateToUsd = Number(data?.exchange_rates_to_usd[currency] ?? 1);
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
      currency,
      rateToUsd,
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
      <FilterBar
        filters={filters}
        onChange={onFiltersChange}
        currency={currency}
        currencies={currencies}
        onCurrencyChange={onCurrencyChange}
      />
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
              <div className="stat-card-heading">
                <span>
                  Total spend <small>{currency}</small>
                </span>
                <DollarSign size={18} aria-hidden="true" />
              </div>
              <strong>
                {money(data.totals.spend_usd, currency, rateToUsd)}
              </strong>
              <p>{count(data.totals.records)} accepted records</p>
            </div>
            <div className="stat-card">
              <div className="stat-card-heading">
                <span>Impressions</span>
                <Eye size={18} aria-hidden="true" />
              </div>
              <strong>{count(data.totals.impressions)}</strong>
              <p>Across the selected reporting scope</p>
            </div>
            <div className="stat-card">
              <div className="stat-card-heading">
                <span>Clicks</span>
                <MousePointerClick size={18} aria-hidden="true" />
              </div>
              <strong>{count(data.totals.clicks)}</strong>
              <p>Across records with reported values</p>
            </div>
            <div className="stat-card">
              <div className="stat-card-heading">
                <span>Click-through rate</span>
                <Percent size={18} aria-hidden="true" />
              </div>
              <strong>{percent(data.totals.ctr)}</strong>
              <p>Based on comparable source records</p>
            </div>
            <div className="stat-card">
              <div className="stat-card-heading">
                <span>Cost per click</span>
                <CircleDollarSign size={18} aria-hidden="true" />
              </div>
              <strong>{cpc(data.totals.cpc, currency, rateToUsd)}</strong>
              <p>Based on comparable source records</p>
            </div>
          </div>
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
                        Spend ({currency}){" "}
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
                        <PlatformLabel platform={row.platform} />
                      </td>
                      <td className="numeric money-cell">
                        {money(row.spend_usd, currency, rateToUsd)}
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
                      <td className="numeric">
                        {cpc(row.cpc, currency, rateToUsd)}
                      </td>
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
                Spend and CPC are displayed in {currency}. CTR and CPC use rows
                with both required fields present. Canonical money stays in USD.{" "}
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
