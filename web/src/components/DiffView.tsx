import { useMemo } from "react";
import type { BundledLanguage, ThemedToken } from "shiki";
import type { Annotation, DiffHunk, DiffLine, PRFile } from "../types.ts";
import {
  HIGHLIGHT_THEME,
  resolveLang,
  type Highlighter,
} from "../hooks/useHighlighter.ts";
import { useLineCommentForm } from "../hooks/useLineCommentForm.ts";
import { Thread } from "./Thread.tsx";
import { UserLineComment } from "./UserLineComment.tsx";

type Props = {
  file: PRFile;
  fileIndex: number;
  highlighter: Highlighter | null;
  replies: Record<string, string>;
  onSetReply: (annotationIdx: number, text: string) => void;
  lineComments: Record<string, string>;
  onSetLineComment: (line: number, text: string) => void;
};

type IndexedAnnotation = { index: number; annotation: Annotation };

// Anchor each annotation to the first diff line whose new-side number falls in
// its range. Annotations that don't resolve into the diff are listed above.
function assignAnnotationsToLines(file: PRFile): {
  byDiffKey: Map<string, IndexedAnnotation[]>;
  outsideDiff: IndexedAnnotation[];
} {
  const byDiffKey = new Map<string, IndexedAnnotation[]>();
  const outsideDiff: IndexedAnnotation[] = [];

  outer: for (let i = 0; i < file.annotations.length; i++) {
    const a = file.annotations[i]!;
    for (let h = 0; h < file.hunks.length; h++) {
      const hunk = file.hunks[h]!;
      for (let l = 0; l < hunk.lines.length; l++) {
        const line = hunk.lines[l]!;
        const n = line.newNumber;
        if (n !== null && n >= a.lineStart && n <= a.lineEnd) {
          const key = `${h}:${l}`;
          const list = byDiffKey.get(key) ?? [];
          list.push({ index: i, annotation: a });
          byDiffKey.set(key, list);
          continue outer;
        }
      }
    }
    outsideDiff.push({ index: i, annotation: a });
  }

  return { byDiffKey, outsideDiff };
}

export function DiffView({
  file,
  fileIndex,
  highlighter,
  replies,
  onSetReply,
  lineComments,
  onSetLineComment,
}: Props) {
  const lang = resolveLang(file.language);
  const { byDiffKey, outsideDiff } = useMemo(
    () => assignAnnotationsToLines(file),
    [file],
  );
  const { openLines, openLine, closeLine } =
    useLineCommentForm(onSetLineComment);

  if (file.hunks.length === 0) {
    return (
      <div
        style={{
          padding: "32px 24px",
          color: "var(--fg-dimmer)",
          fontSize: 13,
          fontStyle: "italic",
          fontFamily: "var(--sans)",
        }}
      >
        No textual diff available for this file.
      </div>
    );
  }

  return (
    <div className="code">
      {outsideDiff.length > 0 && (
        <div className="outside-notice">
          <div className="ot-title">Annotations outside the diff</div>
          {outsideDiff.map(({ index, annotation }) => (
            <Thread
              key={index}
              id={`ann-${fileIndex}-${index}`}
              annotation={annotation}
              index={index}
              reply={replies[String(index)] ?? ""}
              onReplyChange={onSetReply}
            />
          ))}
        </div>
      )}
      {file.hunks.map((hunk, hIdx) => (
        <HunkView
          key={hIdx}
          hunkIndex={hIdx}
          hunk={hunk}
          fileIndex={fileIndex}
          lang={lang}
          highlighter={highlighter}
          byDiffKey={byDiffKey}
          replies={replies}
          onSetReply={onSetReply}
          openLines={openLines}
          onOpenLine={openLine}
          onCloseLine={closeLine}
          lineComments={lineComments}
          onSetLineComment={onSetLineComment}
        />
      ))}
    </div>
  );
}

function HunkView({
  hunkIndex,
  hunk,
  fileIndex,
  lang,
  highlighter,
  byDiffKey,
  replies,
  onSetReply,
  openLines,
  onOpenLine,
  onCloseLine,
  lineComments,
  onSetLineComment,
}: {
  hunkIndex: number;
  hunk: DiffHunk;
  fileIndex: number;
  lang: BundledLanguage | "plaintext";
  highlighter: Highlighter | null;
  byDiffKey: Map<string, IndexedAnnotation[]>;
  replies: Record<string, string>;
  onSetReply: (annotationIdx: number, text: string) => void;
  openLines: Set<number>;
  onOpenLine: (line: number) => void;
  onCloseLine: (line: number) => void;
  lineComments: Record<string, string>;
  onSetLineComment: (line: number, text: string) => void;
}) {
  return (
    <>
      <div className="hunk-header">
        @@ −{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
        {hunk.header ? (
          <span style={{ marginLeft: 10, color: "var(--fg-dimmer)" }}>
            {hunk.header}
          </span>
        ) : null}
      </div>
      {hunk.lines.map((line, i) => {
        const hits = byDiffKey.get(`${hunkIndex}:${i}`);
        const n = line.newNumber;
        const hasComment = n !== null && String(n) in lineComments;
        const formOpen = n !== null && (openLines.has(n) || hasComment);
        return (
          <div key={i}>
            <LineRow
              line={line}
              lang={lang}
              highlighter={highlighter}
              annotated={!!hits?.length}
              onAddComment={
                n !== null && !formOpen ? () => onOpenLine(n) : null
              }
            />
            {hits?.map(({ index, annotation }) => (
              <Thread
                key={index}
                id={`ann-${fileIndex}-${index}`}
                annotation={annotation}
                index={index}
                reply={replies[String(index)] ?? ""}
                onReplyChange={onSetReply}
              />
            ))}
            {formOpen && n !== null && (
              <UserLineComment
                line={n}
                text={lineComments[String(n)] ?? ""}
                onChange={(t) => onSetLineComment(n, t)}
                onClose={() => onCloseLine(n)}
                autoFocus={openLines.has(n) && !hasComment}
              />
            )}
          </div>
        );
      })}
    </>
  );
}

function LineRow({
  line,
  lang,
  highlighter,
  annotated,
  onAddComment,
}: {
  line: DiffLine;
  lang: BundledLanguage | "plaintext";
  highlighter: Highlighter | null;
  annotated: boolean;
  onAddComment: (() => void) | null;
}) {
  const tokens = useMemo(
    () => tokenize(line.content, lang, highlighter),
    [line.content, lang, highlighter],
  );
  const marker = line.type === "add" ? "+" : line.type === "del" ? "−" : " ";
  return (
    <div className={`row ${line.type === "context" ? "ctx" : line.type} ${annotated ? "annotated" : ""}`}>
      <span className="num">{line.oldNumber ?? ""}</span>
      <span className="num">{line.newNumber ?? ""}</span>
      <span className="marker">{marker}</span>
      <pre className="line">
        {tokens ? (
          tokens.map((t, i) => (
            <span key={i} style={{ color: t.color }}>
              {t.content}
            </span>
          ))
        ) : (
          <span>{line.content}</span>
        )}
      </pre>
      {onAddComment && (
        <button
          type="button"
          className="add-comment-btn"
          onClick={onAddComment}
          title="Comment on this line"
          aria-label="Comment on this line"
        >
          +
        </button>
      )}
    </div>
  );
}

function tokenize(
  content: string,
  lang: BundledLanguage | "plaintext",
  highlighter: Highlighter | null,
): ThemedToken[] | null {
  if (!highlighter) return null;
  if (!content) return [];
  try {
    const result = highlighter.codeToTokens(content, {
      lang,
      theme: HIGHLIGHT_THEME,
    });
    return result.tokens[0] ?? [];
  } catch {
    return null;
  }
}
