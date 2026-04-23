import { useState } from "react";
import type { FileError } from "../types.ts";

type Props = {
  fileErrors: FileError[];
  onRetry: (paths: string[]) => Promise<void>;
};

export function ErrorBanner({ fileErrors, onRetry }: Props) {
  const [busy, setBusy] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  if (fileErrors.length === 0) return null;

  async function handleRetry() {
    setBusy(true);
    setRetryError(null);
    try {
      await onRetry(fileErrors.map((e) => e.path));
    } catch (err) {
      setRetryError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="error-banner" role="alert">
      <div className="error-banner-head">
        <span className="error-banner-glyph">⚠</span>
        <span>
          <b>
            Couldn't fetch content for {fileErrors.length} file
            {fileErrors.length === 1 ? "" : "s"}.
          </b>{" "}
          Annotations on these files won't resolve until the fetch succeeds.
        </span>
        <button
          type="button"
          className="btn sm"
          onClick={handleRetry}
          disabled={busy}
          aria-label="Retry failed content fetches"
        >
          {busy ? "Retrying…" : "Retry"}
        </button>
      </div>
      <ul className="error-banner-list">
        {fileErrors.map((e) => (
          <li key={e.path}>
            <code>{e.path}</code>
            <span className="error-banner-reason">{e.reason}</span>
          </li>
        ))}
      </ul>
      {retryError && (
        <div className="error-banner-retry-error">
          Retry failed: {retryError}
        </div>
      )}
    </div>
  );
}
