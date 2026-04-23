import type { Annotation, DiffLine } from "../types.ts";

export type IndexedAnnotation = { index: number; annotation: Annotation };

export type OutsideBlock = {
  /** First new-side line number in the block — used to interleave with real hunks. */
  newStart: number;
  /** Context-only diff lines spanning the block (consecutive new-side numbers). */
  lines: DiffLine[];
  /** Annotations anchored inside the block, keyed by the new-side line they start on. */
  annotations: IndexedAnnotation[];
};

/**
 * For annotations that don't land inside any hunk, build merged context blocks
 * from the full-file content so the reader sees surrounding code around the
 * annotated line. Overlapping spans collapse into a single block.
 */
export function buildOutsideBlocks(
  content: string,
  outside: IndexedAnnotation[],
  contextLines = 3,
): OutsideBlock[] {
  if (outside.length === 0) return [];
  const fileLines = content.split("\n");
  const total = fileLines.length;

  const spans = outside
    .map((ia) => {
      const start = Math.max(1, ia.annotation.lineStart - contextLines);
      const end = Math.min(total, ia.annotation.lineEnd + contextLines);
      return { start, end, ia };
    })
    .filter((s) => s.start <= s.end)
    .sort((a, b) => a.start - b.start);

  const blocks: OutsideBlock[] = [];
  for (const s of spans) {
    const last = blocks[blocks.length - 1];
    const lastEnd = last ? last.newStart + last.lines.length - 1 : -1;
    if (last && s.start <= lastEnd + 1) {
      for (let n = lastEnd + 1; n <= s.end; n++) {
        last.lines.push({
          type: "context",
          oldNumber: null,
          newNumber: n,
          content: fileLines[n - 1] ?? "",
        });
      }
      last.annotations.push(s.ia);
    } else {
      const lines: DiffLine[] = [];
      for (let n = s.start; n <= s.end; n++) {
        lines.push({
          type: "context",
          oldNumber: null,
          newNumber: n,
          content: fileLines[n - 1] ?? "",
        });
      }
      blocks.push({ newStart: s.start, lines, annotations: [s.ia] });
    }
  }
  return blocks;
}
