import { useCallback, useState } from "react";
import { RefreshCw } from "lucide-react";
import { ApiError, apiUrl, request } from "./api";
import type {
  DeliveriesResponse,
  Filters,
  IngestionResponse,
  SourceSelection,
} from "./types";
import { MetricsView } from "./views/MetricsView";
import { HealthView } from "./views/HealthView";
import { SourceDetails } from "./components/SourceDetails";
import { HealthNotifications } from "./components/HealthNotifications";
import { useApi } from "./hooks/useApi";

type View = "metrics" | "health";

export default function App() {
  const [view, setView] = useState<View>("metrics");
  const [filters, setFilters] = useState<Filters>({
    platform: "",
    start_date: "",
    end_date: "",
    campaign: "",
  });
  const [currency, setCurrency] = useState("USD");
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
  const healthResult = useApi<DeliveriesResponse>(
    apiUrl("deliveries"),
    refresh,
  );
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
          <img
            className="company-logo"
            src="/digitalzone-logo.svg"
            alt="Digitalzone"
          />
          <span className="brand-divider" aria-hidden="true" />
          <span className="product-name">Campaign Data Hub</span>
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
        <div className="header-actions">
          <HealthNotifications
            data={healthResult.data}
            loading={healthResult.loading}
            onOpen={openHealth}
          />
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
                <RefreshCw size={15} aria-hidden="true" /> Run ingestion
              </>
            )}
          </button>
        </div>
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
          <p className="eyebrow">
            {view === "metrics"
              ? "Unified campaign reporting"
              : "Data operations"}
          </p>
          <h1>{view === "metrics" ? "Campaign performance" : "Data health"}</h1>
        </div>
        {view === "metrics" ? (
          <MetricsView
            filters={filters}
            onFiltersChange={setFilters}
            refresh={refresh}
            onRefresh={refreshReport}
            onSources={setSourceSelection}
            currency={currency}
            onCurrencyChange={setCurrency}
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
        <span>Digitalzone · Campaign Data Hub</span>
        <span>
          Monetary totals are shown in {currency}. Canonical USD precision is
          retained.
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
