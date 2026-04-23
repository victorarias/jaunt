import type { Annotation, Comment } from "../types.ts";

type Props = {
  annotation: Annotation;
  index: number;
  reply: string;
  onReplyChange: (index: number, text: string) => void;
  id?: string;
};

export function Thread({
  annotation,
  index,
  reply,
  onReplyChange,
  id,
}: Props) {
  const range =
    annotation.lineStart === annotation.lineEnd
      ? `line ${annotation.lineStart}`
      : `lines ${annotation.lineStart}–${annotation.lineEnd}`;

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
          placeholder="Reply, or ask the agent to clarify…"
          rows={reply.split("\n").length > 2 ? 4 : 2}
        />
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
      <div className="comment-body">{comment.body}</div>
    </div>
  );
}
