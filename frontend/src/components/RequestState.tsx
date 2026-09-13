import type { ApiError } from "../api";

export function RequestState({
  loading,
  error,
  onRetry,
}: {
  loading?: boolean;
  error?: ApiError | null;
  onRetry: () => void;
}) {
  if (error)
    return (
      <div className="request-state error-state" role="alert">
        <strong>
          {error.status === 409
            ? "The report has changed"
            : "Unable to load this view"}
        </strong>
        <p>{error.message}</p>
        <button className="secondary-button" onClick={onRetry}>
          Refresh report
        </button>
      </div>
    );
  if (loading)
    return (
      <div className="request-state" role="status">
        <span className="spinner" aria-hidden="true" />
        Loading report…
      </div>
    );
  return null;
}
