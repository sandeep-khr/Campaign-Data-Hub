import { apiUrl } from "../api";
import { useApi } from "../hooks/useApi";
import { convertUsd, count, money, platformNames } from "../format";
import type { RecordsResponse, SourceSelection } from "../types";
import { DetailDialog } from "./DetailDialog";
import { RequestState } from "./RequestState";

export function SourceDetails({
  selection,
  onClose,
  onRefresh,
}: {
  selection: SourceSelection;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const result = useApi<RecordsResponse>(
    apiUrl("records", {
      ...selection.filters,
      expected_fingerprint: selection.fingerprint,
    }),
  );
  return (
    <DetailDialog
      title={selection.title}
      subtitle="Accepted source rows and the rules behind the reported values."
      onClose={onClose}
    >
      <RequestState {...result} onRetry={onRefresh} />
      {selection.totals && (
        <div className="basis-box">
          <strong>How the ratios were calculated</strong>
          <p>
            CTR: {count(selection.totals.ratio_basis.ctr.clicks)} clicks ÷{" "}
            {count(selection.totals.ratio_basis.ctr.impressions)} impressions
            from {count(selection.totals.ratio_basis.ctr.records)} rows.
          </p>
          <p>
            CPC:{" "}
            {convertUsd(
              selection.totals.ratio_basis.cpc.spend_usd_micros / 1_000_000,
              selection.rateToUsd,
            ).toFixed(6)}{" "}
            {selection.currency} ÷{" "}
            {count(selection.totals.ratio_basis.cpc.clicks)} clicks from{" "}
            {count(selection.totals.ratio_basis.cpc.records)} rows.
          </p>
          <small>
            Each ratio uses only rows with both required fields present. Zero
            denominators produce no ratio. Canonical money remains in USD.
          </small>
        </div>
      )}
      {result.data && (
        <>
          <div className="section-heading">
            <h3>Contributing records</h3>
            <span className="count-label">
              {result.data.items.length} records
            </span>
          </div>
          {result.data.items.length === 0 && (
            <p className="muted">No accepted rows match this selection.</p>
          )}
          <div className="source-list">
            {result.data.items.map((row) => (
              <details
                key={`${row.delivery_id}:${row.source_locator}`}
                className="source-record"
              >
                <summary>
                  <span>
                    <strong>{row.date}</strong>
                    <span className="source-campaign">{row.campaign}</span>
                  </span>
                  <span className="source-amount">
                    {money(
                      row.spend_usd,
                      selection.currency,
                      selection.rateToUsd,
                    )}{" "}
                    <span aria-hidden="true">↗</span>
                  </span>
                </summary>
                <div className="source-content">
                  <p className="source-location">
                    {platformNames[row.platform]} · {row.file_name} ·{" "}
                    {row.source_locator}
                  </p>
                  <div className="mini-stats">
                    <span>
                      Canonical USD{" "}
                      <strong>{row.spend_usd ?? "Unknown"}</strong>
                    </span>
                    <span>
                      Impressions <strong>{count(row.impressions)}</strong>
                    </span>
                    <span>
                      Clicks <strong>{count(row.clicks)}</strong>
                    </span>
                  </div>
                  <div className="code-columns">
                    <section>
                      <h4>Original fields</h4>
                      <pre>{JSON.stringify(row.raw, null, 2)}</pre>
                    </section>
                    <section>
                      <h4>Applied rules</h4>
                      <pre>{JSON.stringify(row.applied_rules, null, 2)}</pre>
                    </section>
                  </div>
                  <p className="hash-label">
                    SHA-256 <code>{row.content_sha256}</code>
                  </p>
                </div>
              </details>
            ))}
          </div>
        </>
      )}
    </DetailDialog>
  );
}
