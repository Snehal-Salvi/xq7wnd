import { ApiError } from "../api/client";

export function LoadingBlock({ label, height = 320 }: { label: string; height?: number }) {
  return (
    <div className="loading" style={{ height }} role="status">
      {label}
    </div>
  );
}

export function ErrorBlock({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message =
    error instanceof ApiError ? error.message : "The app couldn’t reach its server. Check your connection.";
  return (
    <div className="error" role="alert">
      <p>{message}</p>
      {onRetry && (
        <button type="button" className="button" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}
