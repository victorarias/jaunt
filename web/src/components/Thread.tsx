import type { Annotation, Comment } from "../types.ts";

type Props = {
  annotation: Annotation;
  index: number;
  reply: string;
  onReplyChange: (index: number, text: string) => void;
};

export function Thread({ annotation, index, reply, onReplyChange }: Props) {
  const range =
    annotation.lineStart === annotation.lineEnd
      ? `line ${annotation.lineStart}`
      : `lines ${annotation.lineStart}–${annotation.lineEnd}`;

  return (
    <div className="thread">
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
          <CommentBubble key={i} comment={c} />
        ))}
      </div>
      <div className="thread-reply">
        {reply.trim() && <span className="reply-hint">draft reply</span>}
        <textarea
          value={reply}
          onChange={(e) => onReplyChange(index, e.target.value)}
          placeholder="Reply, or ask the agent to clarify…"
          rows={reply.split("\n").length > 2 ? 4 : 2}
        />
      </div>
    </div>
  );
}

function CommentBubble({ comment }: { comment: Comment }) {
  return (
    <div className="comment">
      <div className="comment-head">
        <span className="comment-author">{comment.author}</span>
      </div>
      <div className="comment-body">{comment.body}</div>
    </div>
  );
}
