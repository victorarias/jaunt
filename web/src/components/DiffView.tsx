import { useMemo } from "react";
import type { BundledLanguage, ThemedToken } from "shiki";
import type { DiffHunk, DiffLine, PRFile } from "../types.ts";
import {
  HIGHLIGHT_THEME,
  resolveLang,
  type Highlighter,
} from "../hooks/useHighlighter.ts";

type Props = {
  file: PRFile;
  highlighter: Highlighter | null;
};

export function DiffView({ file, highlighter }: Props) {
  const lang = resolveLang(file.language);

  if (file.hunks.length === 0) {
    return (
      <div className="p-8 text-sm text-neutral-500 italic">
        No textual diff available for this file.
      </div>
    );
  }

  return (
    <div className="font-mono text-[12.5px] leading-5">
      {file.hunks.map((hunk, i) => (
        <HunkView
          key={i}
          hunk={hunk}
          lang={lang}
          highlighter={highlighter}
        />
      ))}
    </div>
  );
}

function HunkView({
  hunk,
  lang,
  highlighter,
}: {
  hunk: DiffHunk;
  lang: BundledLanguage | "plaintext";
  highlighter: Highlighter | null;
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
        {hunk.lines.map((line, i) => (
          <LineRow
            key={i}
            line={line}
            lang={lang}
            highlighter={highlighter}
          />
        ))}
      </div>
    </div>
  );
}

function LineRow({
  line,
  lang,
  highlighter,
}: {
  line: DiffLine;
  lang: BundledLanguage | "plaintext";
  highlighter: Highlighter | null;
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

  return (
    <div className={`flex ${rowBg}`}>
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
