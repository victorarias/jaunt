import { describe, expect, test } from "bun:test";
import type { DiffHunk, DiffLine } from "../web/src/types.ts";
import { buildHunkOverlay } from "../web/src/lib/hunkOverlay.ts";

function ln(
  type: DiffLine["type"],
  oldNumber: number | null,
  newNumber: number | null,
  content = "",
): DiffLine {
  return { type, oldNumber, newNumber, content };
}

function hunk(lines: DiffLine[]): DiffHunk {
  return {
    oldStart: 0,
    oldLines: 0,
    newStart: 0,
    newLines: 0,
    header: "",
    lines,
  };
}

describe("buildHunkOverlay", () => {
  test("empty hunks → empty overlay", () => {
    const o = buildHunkOverlay([]);
    expect(o.addedLines.size).toBe(0);
    expect(o.delsBefore.size).toBe(0);
    expect(o.delsAfter.size).toBe(0);
    expect(o.trailingDels).toEqual([]);
  });

  test("del sandwiched between context anchors before the following new line", () => {
    // @@ old lines 4-6 → new lines 4-5 @@  (context, del "x", context)
    const h = hunk([
      ln("context", 4, 4, "a"),
      ln("del", 5, null, "x"),
      ln("context", 6, 5, "b"),
    ]);
    const o = buildHunkOverlay([h]);
    expect([...o.addedLines]).toEqual([]);
    expect(o.delsBefore.get(5)?.[0]?.content).toBe("x");
    expect(o.delsAfter.size).toBe(0);
  });

  test("additions captured; deletions at end of hunk attach to last new line", () => {
    const h = hunk([
      ln("context", 2, 2, "a"),
      ln("add", null, 3, "b+"),
      ln("add", null, 4, "c+"),
      ln("del", 4, null, "gone"),
    ]);
    const o = buildHunkOverlay([h]);
    expect([...o.addedLines].sort()).toEqual([3, 4]);
    expect(o.delsAfter.get(4)?.[0]?.content).toBe("gone");
    expect(o.delsBefore.size).toBe(0);
    expect(o.trailingDels).toEqual([]);
  });

  test("pending dels do not leak between hunks (each hunk isolates its own)", () => {
    // Hunk A ends with a deletion; hunk B starts far later with an add.
    // A's trailing del must anchor at A's last new line (3), not B's first (100).
    const a = hunk([
      ln("context", 3, 3, "a"),
      ln("del", 4, null, "dead"),
    ]);
    const b = hunk([
      ln("add", null, 100, "new"),
    ]);
    const o = buildHunkOverlay([a, b]);
    expect(o.delsAfter.get(3)?.[0]?.content).toBe("dead");
    expect(o.delsBefore.get(100)).toBeUndefined();
    expect([...o.addedLines]).toEqual([100]);
  });

  test("hunk with only deletions falls through to trailingDels", () => {
    // Edge case: pathological hunk that has no new-side anchor at all.
    const h = hunk([
      ln("del", 1, null, "gone1"),
      ln("del", 2, null, "gone2"),
    ]);
    const o = buildHunkOverlay([h]);
    expect(o.trailingDels.map((l) => l.content)).toEqual(["gone1", "gone2"]);
    expect(o.addedLines.size).toBe(0);
    expect(o.delsBefore.size).toBe(0);
    expect(o.delsAfter.size).toBe(0);
  });
});
