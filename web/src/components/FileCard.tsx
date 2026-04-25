import { memo } from "react";
import type { Draft, PRFile } from "../types.ts";
import { fileStateOf } from "../hooks/useDraft.ts";
import { DiffView } from "./DiffView.tsx";
import { ContentView } from "./ContentView.tsx";
import { Markdown } from "./Markdown.tsx";
import type { Highlighter } from "../hooks/useHighlighter.ts";

type Props = {
  file: PRFile;
  fileIndex: number;
  stopNum: number;
  draft: Draft;
  highlighter: Highlighter | null;
  isActive: boolean;
  collapsed: boolean;
  onToggleCollapsed: (path: string) => void;
  onToggleReviewed: (path: string) => void;
  onNoteChange: (path: string, note: string) => void;
  onSetReply: (path: string, annotationIdx: number, text: string) => void;
  onSetLineComment: (path: string, line: number, text: string) => void;
};

function FileCardImpl({
  file,
  fileIndex,
  stopNum,
  draft,
  highlighter,
  isActive,
  collapsed,
  onToggleCollapsed,
  onToggleReviewed,
  onNoteChange,
  onSetReply,
  onSetLineComment,
}: Props) {
  const { reviewed, note, replies, lineComments } = fileStateOf(
    draft,
    file.path,
  );
  const deemph = file.tourGroup === "skip";
  const handleSetReply = (idx: number, text: string) =>
    onSetReply(file.path, idx, text);
  const handleSetLineComment = (line: number, text: string) =>
    onSetLineComment(file.path, line, text);

  return (
    <div
      id={`stop-${stopNum}`}
      className={`file-card ${isActive ? "active" : ""} ${deemph ? "deemph" : ""} ${collapsed ? "collapsed" : ""}`}
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
            {collapsed && (
              <span className="chip collapsed-hint" title="Press → to expand">
                collapsed
              </span>
            )}
          </div>
        </div>
        <div className="actions">
          <button
            type="button"
            className="btn sm ghost"
            onClick={() => onToggleCollapsed(file.path)}
            title={collapsed ? "Expand (→)" : "Collapse (←)"}
            aria-label={collapsed ? "Expand file" : "Collapse file"}
          >
            {collapsed ? "▸" : "▾"}
          </button>
          <button
            type="button"
            className={`btn sm ${reviewed ? "reviewed" : ""}`}
            onClick={() => onToggleReviewed(file.path)}
          >
            {reviewed ? "✓ reviewed" : "mark reviewed"}
          </button>
        </div>
      </div>

      {!collapsed && file.tourNote && (
        <div className="file-summary">
          <div className="attrib">
            <span className="dot" />
            <span>tour · what to look for</span>
          </div>
          <Markdown source={file.tourNote} className="lead" />
        </div>
      )}

      {!collapsed &&
        (file.view === "content" ? (
          <ContentView
            file={file}
            fileIndex={fileIndex}
            highlighter={highlighter}
            replies={replies}
            onSetReply={handleSetReply}
            lineComments={lineComments}
            onSetLineComment={handleSetLineComment}
          />
        ) : (
          <DiffView
            file={file}
            fileIndex={fileIndex}
            highlighter={highlighter}
            replies={replies}
            onSetReply={handleSetReply}
            lineComments={lineComments}
            onSetLineComment={handleSetLineComment}
          />
        ))}

      {!collapsed && (
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
      )}
    </div>
  );
}

// Typing in file X's comment mutates draft.fileStates[X] but leaves every
// other file's slice unchanged. A custom comparator lets the other 37
// FileCards skip re-rendering on each keystroke — otherwise the whole
// file map churns and typing feels laggy on remote dev machines.
export const FileCard = memo(FileCardImpl, (prev, next) => {
  return (
    prev.file === next.file &&
    prev.fileIndex === next.fileIndex &&
    prev.stopNum === next.stopNum &&
    prev.highlighter === next.highlighter &&
    prev.isActive === next.isActive &&
    prev.collapsed === next.collapsed &&
    prev.onToggleCollapsed === next.onToggleCollapsed &&
    prev.onToggleReviewed === next.onToggleReviewed &&
    prev.onNoteChange === next.onNoteChange &&
    prev.onSetReply === next.onSetReply &&
    prev.onSetLineComment === next.onSetLineComment &&
    prev.draft.fileStates[prev.file.path] ===
      next.draft.fileStates[next.file.path]
  );
});
