import type { Draft, PRFile } from "../types.ts";
import { fileStateOf } from "../hooks/useDraft.ts";
import { DiffView } from "./DiffView.tsx";
import { ContentView } from "./ContentView.tsx";
import type { Highlighter } from "../hooks/useHighlighter.ts";

type Props = {
  file: PRFile;
  stopNum: number;
  draft: Draft;
  highlighter: Highlighter | null;
  isActive: boolean;
  onToggleReviewed: (path: string) => void;
  onNoteChange: (path: string, note: string) => void;
  onSetReply: (path: string, annotationIdx: number, text: string) => void;
};

export function FileCard({
  file,
  stopNum,
  draft,
  highlighter,
  isActive,
  onToggleReviewed,
  onNoteChange,
  onSetReply,
}: Props) {
  const { reviewed, note, replies } = fileStateOf(draft, file.path);
  const deemph = file.tourGroup === "skip";
  const handleSetReply = (idx: number, text: string) =>
    onSetReply(file.path, idx, text);

  return (
    <div
      id={`stop-${stopNum}`}
      className={`file-card ${isActive ? "active" : ""} ${deemph ? "deemph" : ""}`}
    >
      <div className="file-head">
        <span className="stop">#{String(stopNum).padStart(2, "0")}</span>
        <div style={{ minWidth: 0 }}>
          <div className="path">
            {file.path}
            {file.oldPath && (
              <span className="renamed">renamed from {file.oldPath}</span>
            )}
          </div>
          <div className="counts">
            <span className={`chip ${file.status}`}>{file.status}</span>
            <span className="adds">+{file.additions}</span>
            <span className="dels">−{file.deletions}</span>
            {file.view === "content" && (
              <span
                className="chip view-full"
                title="Rendered whole — annotations may land on any line"
              >
                shown whole · see annotations
              </span>
            )}
            {file.binary && <span className="chip">binary</span>}
          </div>
        </div>
        <div className="actions">
          <button
            type="button"
            className={`btn sm ${reviewed ? "reviewed" : ""}`}
            onClick={() => onToggleReviewed(file.path)}
          >
            {reviewed ? "✓ reviewed" : "mark reviewed"}
          </button>
        </div>
      </div>

      {file.tourNote && (
        <div className="file-summary">
          <div className="attrib">
            <span className="dot" />
            <span>tour · what to look for</span>
          </div>
          <div className="lead">{file.tourNote}</div>
        </div>
      )}

      {file.view === "content" ? (
        <ContentView
          file={file}
          highlighter={highlighter}
          replies={replies}
          onSetReply={handleSetReply}
        />
      ) : (
        <DiffView
          file={file}
          highlighter={highlighter}
          replies={replies}
          onSetReply={handleSetReply}
        />
      )}

      <div className="file-note">
        <label htmlFor={`note-${file.path}`}>Note on this file</label>
        <textarea
          id={`note-${file.path}`}
          value={note}
          onChange={(e) => onNoteChange(file.path, e.target.value)}
          rows={3}
          placeholder="Thoughts on this file… (included in the GitHub review body)"
        />
      </div>
    </div>
  );
}
