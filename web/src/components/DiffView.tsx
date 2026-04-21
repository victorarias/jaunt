import { useMemo } from "react";
import type { BundledLanguage, ThemedToken } from "shiki";
import type { Annotation, DiffHunk, DiffLine, PRFile } from "../types.ts";
import {
  HIGHLIGHT_THEME,
  resolveLang,
  type Highlighter,
} from "../hooks/useHighlighter.ts";

type Props = {
  file: PRFile;
  highlighter: Highlighter | null;
};

type IndexedAnnotation = { index: number; annotation: Annotation };

// For each annotation, pick the first diff line (new-side number in range) as
// its anchor; if none, the annotation is "outside diff" and rendered above.
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

export function DiffView({ file, highlighter }: Props) {
  const lang = resolveLang(file.language);
  const { byDiffKey, outsideDiff } = useMemo(
    () => assignAnnotationsToLines(file),
    [file]
  );

  if (file.hunks.length === 0) {
    return (
      <div className="p-8 text-sm text-neutral-500 italic">
        No textual diff available for this file.
      </div>
    );
  }

  return (
    <div className="font-mono text-[12.5px] leading-5">
      {outsideDiff.length > 0 && (
        <div className="bg-amber-500/5 border-b border-amber-500/20 px-4 py-2 font-sans text-[12px]">
          <div className="text-[10px] uppercase tracking-wide text-amber-400/80 mb-1">
            Annotations outside the diff
          </div>
          <ul className="space-y-1.5">
            {outsideDiff.map(({ index, annotation }) => (
              <li key={index} className="text-amber-100/90 whitespace-pre-wrap leading-relaxed">
                <span className="text-amber-400/80 mr-2">
                  {index + 1} ·{" "}
                  {annotation.lineStart === annotation.lineEnd
                    ? `line ${annotation.lineStart}`
                    : `lines ${annotation.lineStart}–${annotation.lineEnd}`}
                </span>
                {annotation.note}
              </li>
            ))}
          </ul>
        </div>
      )}
      {file.hunks.map((hunk, hIdx) => (
        <HunkView
          key={hIdx}
          hunkIndex={hIdx}
          hunk={hunk}
          lang={lang}
          highlighter={highlighter}
          byDiffKey={byDiffKey}
        />
      ))}
    </div>
  );
}

function HunkView({
  hunkIndex,
  hunk,
  lang,
  highlighter,
  byDiffKey,
}: {
  hunkIndex: number;
  hunk: DiffHunk;
  lang: BundledLanguage | "plaintext";
  highlighter: Highlighter | null;
  byDiffKey: Map<string, IndexedAnnotation[]>;
}) {
  return (
    <div className="border-b border-neutral-800/60">
      <div className="px-4 py-1.5 bg-neutral-900/60 text-neutral-400 text-[11px]">
        @@ −{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
        {hunk.header ? (
          <span className="ml-3 text-neutral-500">{hunk.header}</span>
        ) : null}
      </div>
      <div>
        {hunk.lines.map((line, i) => {
          const hits = byDiffKey.get(`${hunkIndex}:${i}`);
          return (
            <div key={i}>
              <LineRow
                line={line}
                lang={lang}
                highlighter={highlighter}
                annotated={!!hits?.length}
              />
              {hits?.map(({ index, annotation }) => (
                <AnnotationBlock
                  key={index}
                  index={index}
                  annotation={annotation}
                />
              ))}
            </div>
          );
        })}
      </div>
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

function LineRow({
  line,
  lang,
  highlighter,
  annotated,
}: {
  line: DiffLine;
  lang: BundledLanguage | "plaintext";
  highlighter: Highlighter | null;
  annotated: boolean;
}) {
  const tokens = useMemo(
    () => tokenize(line.content, lang, highlighter),
    [line.content, lang, highlighter]
  );

  const rowBg =
    line.type === "add"
      ? "bg-emerald-950/40"
      : line.type === "del"
        ? "bg-red-950/40"
        : "";
  const marker =
    line.type === "add" ? "+" : line.type === "del" ? "−" : " ";
  const markerColor =
    line.type === "add"
      ? "text-emerald-400"
      : line.type === "del"
        ? "text-red-400"
        : "text-neutral-600";

  const annotatedBg = annotated ? "ring-1 ring-inset ring-amber-500/30" : "";
  return (
    <div className={`flex ${rowBg} ${annotatedBg}`}>
      <LineNum n={line.oldNumber} />
      <LineNum n={line.newNumber} />
      <span className={`w-4 select-none text-center flex-none ${markerColor}`}>
        {marker}
      </span>
      <pre className="flex-1 pl-1 pr-4 whitespace-pre overflow-x-auto">
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
    </div>
  );
}

function LineNum({ n }: { n: number | null }) {
  return (
    <span className="w-12 text-right pr-2 text-neutral-600 tabular-nums select-none flex-none">
      {n ?? ""}
    </span>
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
