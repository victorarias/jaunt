import { useMemo } from "react";
import type { BundledLanguage, ThemedToken } from "shiki";
import type { Annotation, PRFile } from "../types.ts";
import {
  HIGHLIGHT_THEME,
  resolveLang,
  type Highlighter,
} from "../hooks/useHighlighter.ts";
import { Thread } from "./Thread.tsx";

type Props = {
  file: PRFile;
  highlighter: Highlighter | null;
  replies: Record<string, string>;
  onSetReply: (annotationIdx: number, text: string) => void;
};

type LineAnnotation = { index: number; annotation: Annotation };

export function ContentView({
  file,
  highlighter,
  replies,
  onSetReply,
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
      {lines.map((content, i) => {
        const lineNum = i + 1;
        const hits = annotationsByStart.get(lineNum);
        const annotated = annotatedLines.has(lineNum);
        return (
          <div key={i}>
            <ContentLine
              lineNum={lineNum}
              content={content}
              lang={lang}
              highlighter={highlighter}
              annotated={annotated}
            />
            {hits?.map(({ index, annotation }) => (
              <Thread
                key={`${lineNum}-${index}`}
                annotation={annotation}
                index={index}
                reply={replies[String(index)] ?? ""}
                onReplyChange={onSetReply}
              />
            ))}
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
}: {
  lineNum: number;
  content: string;
  lang: BundledLanguage | "plaintext";
  highlighter: Highlighter | null;
  annotated: boolean;
}) {
  const tokens = useMemo(
    () => tokenize(content, lang, highlighter),
    [content, lang, highlighter],
  );

  return (
    <div
      id={`line-${lineNum}`}
      className={`row ctx ${annotated ? "annotated" : ""}`}
    >
      <span className="num" />
      <span className="num">{lineNum}</span>
      <span className="marker">{annotated ? "▸" : " "}</span>
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
