import type { DiffHunk, DiffLine } from "../types.ts";

export type HunkOverlay = {
  addedLines: Set<number>;
  delsBefore: Map<number, DiffLine[]>;
  delsAfter: Map<number, DiffLine[]>;
  trailingDels: DiffLine[];
};

/**
 * Project the diff hunks onto the full-file coordinate space so the
 * content view can render the diff inline: which new-side line numbers
 * were added, and where the deleted lines belong (they have no new-side
 * number, so we anchor each run to the next new line inside the same
 * hunk, or to the previous new line if the hunk ends with deletions).
 */
export function buildHunkOverlay(hunks: DiffHunk[]): HunkOverlay {
  const addedLines = new Set<number>();
  const delsBefore = new Map<number, DiffLine[]>();
  const delsAfter = new Map<number, DiffLine[]>();
  const trailingDels: DiffLine[] = [];

  for (const hunk of hunks) {
    let pending: DiffLine[] = [];
    let lastNewNumber: number | null = null;
    for (const line of hunk.lines) {
      if (line.type === "del") {
        pending.push(line);
        continue;
      }
      if (line.newNumber === null) continue;
      if (pending.length > 0) {
        const prev = delsBefore.get(line.newNumber) ?? [];
        delsBefore.set(line.newNumber, prev.concat(pending));
        pending = [];
      }
      if (line.type === "add") addedLines.add(line.newNumber);
      lastNewNumber = line.newNumber;
    }
    if (pending.length > 0) {
      if (lastNewNumber !== null) {
        const prev = delsAfter.get(lastNewNumber) ?? [];
        delsAfter.set(lastNewNumber, prev.concat(pending));
      } else {
        trailingDels.push(...pending);
      }
    }
  }

  return { addedLines, delsBefore, delsAfter, trailingDels };
}
