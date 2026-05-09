import type { AgentTranscript } from "../types.ts";
import { TranscriptList } from "./TranscriptList.tsx";

type Props = {
  transcript: AgentTranscript | null;
  waiting: boolean;
};

export function AgentTranscriptPanel({ transcript, waiting }: Props) {
  const entries = transcript?.entries ?? [];
  if (entries.length === 0 && !waiting) return null;

  return (
    <section
      className={`agent-transcript-panel ${entries.length > 0 ? "has-body" : "waiting"}`}
    >
      <div className="agent-transcript-head">
        <div>
          <span className="eyebrow">agent channel</span>
          <h2>{entries.length > 0 ? "Transcript" : "Sent to agent"}</h2>
        </div>
        {transcript?.updatedAt && (
          <time dateTime={transcript.updatedAt}>
            {new Date(transcript.updatedAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </time>
        )}
      </div>
      {entries.length > 0 ? (
        <TranscriptList entries={entries} waiting={waiting} />
      ) : (
        <p className="agent-transcript-empty">
          Your notes were written to the feedback file. The app is watching for
          the agent's answer here.
        </p>
      )}
    </section>
  );
}
