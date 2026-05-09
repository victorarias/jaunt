import type { AgentReplies } from "../types.ts";
import { Markdown } from "./Markdown.tsx";

type Props = {
  replies: AgentReplies | null;
  waiting: boolean;
};

export function AgentRepliesPanel({ replies, waiting }: Props) {
  const body = replies?.body.trim() ?? "";
  if (!body && !waiting) return null;

  return (
    <section className={`agent-replies ${body ? "has-body" : "waiting"}`}>
      <div className="agent-replies-head">
        <div>
          <span className="eyebrow">agent channel</span>
          <h2>{body ? "Replies from the agent" : "Sent to agent"}</h2>
        </div>
        {replies?.updatedAt && (
          <time dateTime={replies.updatedAt}>
            {new Date(replies.updatedAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </time>
        )}
      </div>
      {body ? (
        <Markdown source={body} />
      ) : (
        <p>
          Your notes were written to the feedback file. The app is watching for
          the agent's answer here.
        </p>
      )}
    </section>
  );
}
