import { useCallback, useState } from "react";
import { ApiError, apiUrl, request } from "./api";
import type { Filters, IngestionResponse, SourceSelection } from "./types";
import { MetricsView } from "./views/MetricsView";
import { HealthView } from "./views/HealthView";
import { SourceDetails } from "./components/SourceDetails";

type View = "metrics" | "health";

export default function App() {
  const [view, setView] = useState<View>("metrics");
  const [filters, setFilters] = useState<Filters>({
    platform: "",
    start_date: "",
    end_date: "",
  });
  const [refresh, setRefresh] = useState(0);
  const [ingesting, setIngesting] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [sourceSelection, setSourceSelection] =
    useState<SourceSelection | null>(null);
  const [deliverySelection, setDeliverySelection] = useState<
    string | undefined
  >();
  const refreshReport = useCallback(() => {
    setSourceSelection(null);
    setDeliverySelection(undefined);
    setRefresh((value) => value + 1);
  }, []);
  async function ingest() {
    setIngesting(true);
    setMessage(null);
    try {
      const result = await request<IngestionResponse>(apiUrl("ingestion"), {
        method: "POST",
      });
      setMessage({
        type: "success",
        text: `Report rebuilt: ${result.rows_accepted} accepted rows, ${result.rows_rejected} rejected, ${result.rows_duplicate} duplicate copies removed.`,
      });
      refreshReport();
    } catch (error) {
      setMessage({
        type: "error",
        text:
          error instanceof ApiError
            ? error.message
            : "Unable to start ingestion.",
      });
    } finally {
      setIngesting(false);
    }
  }
  function openHealth(id?: string) {
    setSourceSelection(null);
    setDeliverySelection(id);
    setView("health");
  }
  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span>
            <strong>Campaign Hub</strong>
            <small>Performance with provenance</small>
          </span>
        </div>
        <nav aria-label="Primary navigation">
          <button
            aria-current={view === "metrics" ? "page" : undefined}
            onClick={() => setView("metrics")}
          >
            Campaign metrics
          </button>
          <button
            aria-current={view === "health" ? "page" : undefined}
            onClick={() => setView("health")}
          >
            Data health
          </button>
        </nav>
        <button
          className="primary-button"
          onClick={ingest}
          disabled={ingesting}
        >
          {ingesting ? (
            <>
              <span className="spinner light" aria-hidden="true" />
              Processing…
            </>
          ) : (
            <>
              <span aria-hidden="true">↻</span> Run ingestion
            </>
          )}
        </button>
      </header>
      {message && (
        <div className={`app-message message-${message.type}`} role="status">
          <span>{message.type === "success" ? "✓" : "!"}</span>
          {message.text}
          <button
            onClick={() => setMessage(null)}
            aria-label="Dismiss notification"
          >
            ×
          </button>
        </div>
      )}
      <main>
        <div className="page-heading">
          <p className="eyebrow">June 2026 · Paid media</p>
          <h1>{view === "metrics" ? "Campaign metrics" : "Data health"}</h1>
          <p>
            {view === "metrics"
              ? "Normalized performance, with the source quality kept in view."
              : "Understand what arrived, what was changed, and what needs attention."}
          </p>
        </div>
        {view === "metrics" ? (
          <MetricsView
            filters={filters}
            onFiltersChange={setFilters}
            refresh={refresh}
            onRefresh={refreshReport}
            onHealth={openHealth}
            onSources={setSourceSelection}
          />
        ) : (
          <HealthView
            refresh={refresh}
            onRefresh={refreshReport}
            selectedId={deliverySelection}
            onSelected={setDeliverySelection}
          />
        )}
      </main>
      <footer>
        <span>Campaign Hub</span>
        <span>
          All monetary totals are shown in USD. Source precision is retained.
        </span>
      </footer>
      {sourceSelection && (
        <SourceDetails
          selection={sourceSelection}
          onClose={() => setSourceSelection(null)}
          onRefresh={refreshReport}
        />
      )}
    </div>
  );
}
