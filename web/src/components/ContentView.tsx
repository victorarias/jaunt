import { useMemo } from "react";
import type { BundledLanguage, ThemedToken } from "shiki";
import type { Annotation, PRFile } from "../types.ts";
import {
  HIGHLIGHT_THEME,
  resolveLang,
  type Highlighter,
} from "../hooks/useHighlighter.ts";

type Props = {
  file: PRFile;
  highlighter: Highlighter | null;
};

type LineAnnotation = {
  index: number;
  annotation: Annotation;
};

export function ContentView({ file, highlighter }: Props) {
  const lang = resolveLang(file.language);

  const lines = useMemo(
    () => (file.content ?? "").split("\n"),
    [file.content]
  );

  // Rendered below the start line so the reader sees the note in-context.
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
      <div className="p-8 text-sm text-neutral-500 italic">
        No content available for this file.
      </div>
    );
  }

  return (
    <div className="font-mono text-[12.5px] leading-5">
      {lines.map((content, i) => {
        const lineNum = i + 1;
        const hits = annotationsByStart.get(lineNum);
        return (
          <div key={i}>
            <ContentLine
              lineNum={lineNum}
              content={content}
              lang={lang}
              highlighter={highlighter}
              annotated={annotatedLines.has(lineNum)}
            />
            {hits &&
              hits.map(({ index, annotation }) => (
                <AnnotationBlock
                  key={`${lineNum}-${index}`}
                  index={index}
                  annotation={annotation}
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
    [content, lang, highlighter]
  );

  return (
    <div
      id={`line-${lineNum}`}
      className={`flex ${annotated ? "bg-amber-500/5" : ""}`}
    >
      <span className="w-12 text-right pr-2 text-neutral-600 tabular-nums select-none flex-none">
        {lineNum}
      </span>
      <span
        className={`w-4 select-none text-center flex-none ${
          annotated ? "text-amber-400" : "text-neutral-700"
        }`}
      >
        {annotated ? "▸" : ""}
      </span>
      <pre className="flex-1 pl-1 pr-4 whitespace-pre overflow-x-auto">
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

function AnnotationBlock({
  index,
  annotation,
}: {
  index: number;
  annotation: Annotation;
}) {
  const range =
    annotation.lineStart === annotation.lineEnd
      ? `line ${annotation.lineStart}`
      : `lines ${annotation.lineStart}–${annotation.lineEnd}`;
  return (
    <div className="ml-16 my-1.5 mr-4 bg-amber-500/10 border-l-2 border-amber-500/60 rounded-r px-3 py-2 text-[13px] text-amber-100/90 whitespace-pre-wrap leading-relaxed font-sans">
      <div className="text-[10px] uppercase tracking-wide text-amber-400/80 mb-0.5">
        Annotation {index + 1} · {range}
      </div>
      {annotation.note}
    </div>
  );
}

function tokenize(
  content: string,
  lang: BundledLanguage | "plaintext",
  highlighter: Highlighter | null
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
