import { useEffect, useRef } from "react";
import type { TranscriptEntry } from "../types.ts";
import { Markdown } from "./Markdown.tsx";

type Props = {
  entries: TranscriptEntry[];
  waiting: boolean;
};

export function TranscriptList({ entries, waiting }: Props) {
  const endRef = useRef<HTMLDivElement>(null);

  // Auto-scroll the list to the latest bubble whenever a new entry lands —
  // a chat that doesn't follow the conversation is annoying to read while
  // typing. Smooth on subsequent updates, instant on first paint.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [entries.length, waiting]);

  return (
    <div className="transcript">
      {entries.map((entry, i) => (
        <div key={`${entry.role}-${entry.at}-${i}`} className={`bubble ${entry.role}`}>
          <div className="bubble-meta">
            <span className="who">{entry.role === "user" ? "you" : "agent"}</span>
            <time dateTime={entry.at}>
              {new Date(entry.at).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </time>
          </div>
          <div className="bubble-body">
            <Markdown source={entry.body} />
          </div>
        </div>
      ))}
      {waiting && (
        <div className="bubble agent typing">
          <div className="bubble-meta">
            <span className="who">agent</span>
            <span className="dots" aria-hidden="true">
              <span /> <span /> <span />
            </span>
          </div>
          <div className="bubble-body waiting-text">…composing a reply</div>
        </div>
      )}
      <div ref={endRef} />
    </div>
  );
}
