import { useState } from "react";
import type { Annotation, Comment } from "../types.ts";
import { Markdown } from "./Markdown.tsx";

type Props = {
  annotation: Annotation;
  index: number;
  reply: string;
  onReplyChange: (index: number, text: string) => void;
  onAskAgent?: (index: number, text: string) => Promise<void>;
  id?: string;
};

export function Thread({
  annotation,
  index,
  reply,
  onReplyChange,
  onAskAgent,
  id,
}: Props) {
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const range =
    annotation.lineStart === annotation.lineEnd
      ? `line ${annotation.lineStart}`
      : `lines ${annotation.lineStart}–${annotation.lineEnd}`;

  async function askAgent() {
    const body = reply.trim();
    if (!body || !onAskAgent || asking) return;
    setAsking(true);
    setError(null);
    try {
      await onAskAgent(index, body);
      onReplyChange(index, "");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAsking(false);
    }
  }

  return (
    <div className="thread" id={id}>
      <div className="thread-head">
        <span className="dot" />
        <span className="range">{range}</span>
        <span className="spacer" />
        <span className="count">
          #{index + 1}
          {annotation.comments.length > 1 && ` · ${annotation.comments.length}`}
        </span>
      </div>
      <div className="thread-body">
        {annotation.comments.map((c, i) => (
          <CommentBubble
            key={i}
            comment={c}
            showAuthor={i === 0 || annotation.comments[i - 1]!.author !== c.author}
          />
        ))}
      </div>
      <div className="thread-reply">
        {reply.trim() && <span className="reply-hint">draft reply</span>}
        <textarea
          value={reply}
          onChange={(e) => onReplyChange(index, e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && onAskAgent) {
              e.preventDefault();
              e.stopPropagation();
              void askAgent();
            }
          }}
          placeholder="Reply, or ask the agent to clarify…"
          rows={reply.split("\n").length > 2 ? 4 : 2}
        />
        <div className="thread-reply-actions">
          {error && <span className="reply-error">{error}</span>}
          <span className="spacer" />
          {onAskAgent && (
            <button
              type="button"
              className="btn sm ask-inline"
              disabled={!reply.trim() || asking}
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

function CommentBubble({
  comment,
  showAuthor,
}: {
  comment: Comment;
  showAuthor: boolean;
}) {
  return (
    <div className="comment">
      {showAuthor && (
        <div className="comment-head">
          <span className="comment-author">{comment.author}</span>
        </div>
      )}
      <Markdown source={comment.body} className="comment-body" />
    </div>
  );
}
