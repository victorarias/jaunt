import { useEffect, useRef, useState } from "react";

type Props = {
  line: number;
  text: string;
  onChange: (text: string) => void;
  onClose: () => void;
  onAskAgent?: (text: string) => Promise<void>;
  autoFocus?: boolean;
};

export function UserLineComment({
  line,
  text,
  onChange,
  onClose,
  onAskAgent,
  autoFocus,
}: Props) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (autoFocus && taRef.current) taRef.current.focus();
  }, [autoFocus]);

  async function askAgent() {
    const body = text.trim();
    if (!body || !onAskAgent || asking) return;
    setAsking(true);
    setError(null);
    try {
      await onAskAgent(body);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setAsking(false);
    }
  }

  return (
    <div className="thread user-thread">
      <div className="thread-head">
        <span className="dot user" />
        <span className="range">your comment · line {line}</span>
        <span className="spacer" />
        <button
          type="button"
          className="user-close"
          onClick={onClose}
          title="Discard comment"
          aria-label="Discard comment"
        >
          ×
        </button>
      </div>
      <div className="thread-reply">
        <textarea
          ref={taRef}
          value={text}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && onAskAgent) {
              e.preventDefault();
              e.stopPropagation();
              void askAgent();
            }
          }}
          placeholder="Comment on this line…"
          rows={text.split("\n").length > 2 ? 4 : 2}
        />
        <div className="thread-reply-actions">
          {error && <span className="reply-error">{error}</span>}
          <span className="spacer" />
          {onAskAgent && (
            <button
              type="button"
              className="btn sm ask-inline"
              disabled={!text.trim() || asking}
              onClick={() => void askAgent()}
            >
              {asking ? "Sending..." : "Ask agent"}
              {!asking && <span className="kbd">⌘↵</span>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
