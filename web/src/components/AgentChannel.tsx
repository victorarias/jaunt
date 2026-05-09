import { useEffect, useRef, useState } from "react";
import type { AgentReplies } from "../types.ts";
import { Markdown } from "./Markdown.tsx";

type Props = {
  contextLabel: string;
  replies: AgentReplies | null;
  waiting: boolean;
  onClose: () => void;
  onSend: (body: string) => Promise<void>;
};

export function AgentChannel({
  contextLabel,
  replies,
  waiting,
  onClose,
  onSend,
}: Props) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const replyBody = replies?.body.trim() ?? "";

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

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
    <div className="agent-channel" role="dialog" aria-label="Ask agent">
      <div className="agent-channel-head">
        <div>
          <span className="eyebrow">agent channel</span>
          <b>{waiting ? "waiting for reply" : "quick question"}</b>
        </div>
        <button type="button" className="close" onClick={onClose}>
          ×
        </button>
      </div>

      {replyBody && (
        <div className="agent-channel-replies">
          <Markdown source={replyBody} />
        </div>
      )}

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
          rows={3}
        />
        {error && <div className="agent-channel-error">{error}</div>}
        <div className="agent-channel-actions">
          {waiting && <span>watching for agent reply</span>}
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
