import { useMemo } from "react";
import type { BundledLanguage, ThemedToken } from "shiki";
import type { Annotation, DiffLine, PRFile } from "../types.ts";
import {
  HIGHLIGHT_THEME,
  resolveLang,
  type Highlighter,
} from "../hooks/useHighlighter.ts";
import { useLineCommentForm } from "../hooks/useLineCommentForm.ts";
import { buildHunkOverlay } from "../lib/hunkOverlay.ts";
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

type LineAnnotation = { index: number; annotation: Annotation };

export function ContentView({
  file,
  fileIndex,
  highlighter,
  replies,
  onSetReply,
  lineComments,
  onSetLineComment,
}: Props) {
  const lang = resolveLang(file.language);

  const lines = useMemo(
    () => (file.content ?? "").split("\n"),
    [file.content],
  );

  // Render each annotation below its start line.
  const annotationsByStart = useMemo(() => {
    const m = new Map<number, LineAnnotation[]>();
    file.annotations.forEach((a, i) => {
      const list = m.get(a.lineStart) ?? [];
      list.push({ index: i, annotation: a });
      m.set(a.lineStart, list);
    });
    return m;
  }, [file.annotations]);

  const annotatedLines = useMemo(() => {
    const set = new Set<number>();
    for (const a of file.annotations) {
      for (let n = a.lineStart; n <= a.lineEnd; n++) set.add(n);
    }
    return set;
  }, [file.annotations]);

  const overlay = useMemo(() => buildHunkOverlay(file.hunks), [file.hunks]);

  const { openLines, openLine, closeLine } =
    useLineCommentForm(onSetLineComment);

  if (file.content === null) {
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
        No content available for this file.
      </div>
    );
  }

  return (
    <div className="code full">
      {overlay.trailingDels.length > 0 && (
        <DelBlock
          lines={overlay.trailingDels}
          lang={lang}
          highlighter={highlighter}
        />
      )}
      {lines.map((content, i) => {
        const lineNum = i + 1;
        const hits = annotationsByStart.get(lineNum);
        const annotated = annotatedLines.has(lineNum);
        const hasComment = String(lineNum) in lineComments;
        const formOpen = openLines.has(lineNum) || hasComment;
        const isAdded = overlay.addedLines.has(lineNum);
        const dBefore = overlay.delsBefore.get(lineNum);
        const dAfter = overlay.delsAfter.get(lineNum);
        return (
          <div key={i}>
            {dBefore && (
              <DelBlock
                lines={dBefore}
                lang={lang}
                highlighter={highlighter}
              />
            )}
            <ContentLine
              lineNum={lineNum}
              content={content}
              lang={lang}
              highlighter={highlighter}
              annotated={annotated}
              added={isAdded}
              onAddComment={!formOpen ? () => openLine(lineNum) : null}
            />
            {dAfter && (
              <DelBlock
                lines={dAfter}
                lang={lang}
                highlighter={highlighter}
              />
            )}
            {hits?.map(({ index, annotation }) => (
              <Thread
                key={`${lineNum}-${index}`}
                id={`ann-${fileIndex}-${index}`}
                annotation={annotation}
                index={index}
                reply={replies[String(index)] ?? ""}
                onReplyChange={onSetReply}
              />
            ))}
            {formOpen && (
              <UserLineComment
                line={lineNum}
                text={lineComments[String(lineNum)] ?? ""}
                onChange={(t) => onSetLineComment(lineNum, t)}
                onClose={() => closeLine(lineNum)}
                autoFocus={openLines.has(lineNum) && !hasComment}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function ContentLine({
  lineNum,
  content,
  lang,
  highlighter,
  annotated,
  added,
  onAddComment,
}: {
  lineNum: number;
  content: string;
  lang: BundledLanguage | "plaintext";
  highlighter: Highlighter | null;
  annotated: boolean;
  added: boolean;
  onAddComment: (() => void) | null;
}) {
  const tokens = useMemo(
    () => tokenize(content, lang, highlighter),
    [content, lang, highlighter],
  );

  const typeClass = added ? "add" : "ctx";
  const marker = added ? "+" : annotated ? "▸" : " ";

  return (
    <div
      id={`line-${lineNum}`}
      className={`row ${typeClass} ${annotated ? "annotated" : ""}`}
    >
      <span className="num" />
      <span className="num">{lineNum}</span>
      <span className="marker">{marker}</span>
      <pre className="line">
        {tokens ? (
          tokens.map((t, i) => (
            <span key={i} style={{ color: t.color }}>
              {t.content}
            </span>
          ))
        ) : (
          <span>{content}</span>
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

function DelBlock({
  lines,
  lang,
  highlighter,
}: {
  lines: DiffLine[];
  lang: BundledLanguage | "plaintext";
  highlighter: Highlighter | null;
}) {
  return (
    <>
      {lines.map((line, i) => (
        <DelRow
          key={i}
          content={line.content}
          oldNumber={line.oldNumber}
          lang={lang}
          highlighter={highlighter}
        />
      ))}
    </>
  );
}

function DelRow({
  content,
  oldNumber,
  lang,
  highlighter,
}: {
  content: string;
  oldNumber: number | null;
  lang: BundledLanguage | "plaintext";
  highlighter: Highlighter | null;
}) {
  const tokens = useMemo(
    () => tokenize(content, lang, highlighter),
    [content, lang, highlighter],
  );
  return (
    <div className="row del" aria-label="deleted line">
      <span className="num">{oldNumber ?? ""}</span>
      <span className="num" />
      <span className="marker">−</span>
      <pre className="line">
        {tokens ? (
          tokens.map((t, i) => (
            <span key={i} style={{ color: t.color }}>
              {t.content}
            </span>
          ))
        ) : (
          <span>{content}</span>
        )}
      </pre>
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
