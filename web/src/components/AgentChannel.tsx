import { useEffect, useRef, useState } from "react";
import type { AgentTranscript } from "../types.ts";
import { TranscriptList } from "./TranscriptList.tsx";

type Props = {
  contextLabel: string;
  transcript: AgentTranscript | null;
  waiting: boolean;
  onClose: () => void;
  onSend: (body: string) => Promise<void>;
};

const SIZE_KEY = "jaunt:agent-channel-size";
type Size = "large" | "compact";

function readInitialSize(): Size {
  if (typeof window === "undefined") return "large";
  try {
    const v = window.localStorage.getItem(SIZE_KEY);
    return v === "compact" ? "compact" : "large";
  } catch {
    return "large";
  }
}

export function AgentChannel({
  contextLabel,
  transcript,
  waiting,
  onClose,
  onSend,
}: Props) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [size, setSize] = useState<Size>(readInitialSize);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const entries = transcript?.entries ?? [];

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(SIZE_KEY, size);
    } catch {
      // localStorage isn't load-bearing here — the toggle still works in-memory.
    }
  }, [size]);

  async function send() {
    const text = body.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSend(text);
      setBody("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={`agent-channel size-${size}`}
      role="dialog"
      aria-label="Ask agent"
    >
      <div className="agent-channel-head">
        <div>
          <span className="eyebrow">agent channel</span>
          <b>
            {entries.length === 0
              ? waiting
                ? "waiting for reply"
                : "quick question"
              : waiting
                ? "agent is replying…"
                : `transcript · ${entries.length}`}
          </b>
        </div>
        <div className="agent-channel-controls">
          <button
            type="button"
            className="size-toggle"
            onClick={() => setSize(size === "large" ? "compact" : "large")}
            title={size === "large" ? "Shrink" : "Expand"}
            aria-label={size === "large" ? "Shrink panel" : "Expand panel"}
          >
            {size === "large" ? "–" : "+"}
          </button>
          <button
            type="button"
            className="close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>
      </div>

      <div className="agent-channel-body">
        {entries.length > 0 ? (
          <TranscriptList entries={entries} waiting={waiting} />
        ) : (
          <p className="agent-channel-empty">
            Ask a quick question without ending the review. The agent answers
            into a local file and the reply lands right here.
          </p>
        )}
      </div>

      <div className="agent-channel-compose">
        <div className="agent-channel-context" title={contextLabel}>
          {contextLabel}
        </div>
        <textarea
          ref={textareaRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              onClose();
            } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder="Ask for clarification without submitting the review..."
          rows={size === "large" ? 4 : 3}
        />
        {error && <div className="agent-channel-error">{error}</div>}
        <div className="agent-channel-actions">
          <button
            type="button"
            className="btn primary"
            disabled={busy || !body.trim()}
            onClick={() => void send()}
          >
            {busy ? "Sending..." : "Send"}
            {!busy && <span className="kbd">⌘↵</span>}
          </button>
        </div>
      </div>
    </div>
  );
}
