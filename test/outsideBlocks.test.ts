import { describe, expect, test } from "bun:test";
import type { Annotation } from "../web/src/types.ts";
import { buildOutsideBlocks } from "../web/src/lib/outsideBlocks.ts";

function ann(lineStart: number, lineEnd: number = lineStart): Annotation {
  return { lineStart, lineEnd, comments: [{ author: "x", body: "x" }] };
}

function ia(index: number, a: Annotation) {
  return { index, annotation: a };
}

const FILE = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join("\n");

describe("buildOutsideBlocks", () => {
  test("no outside annotations → no blocks", () => {
    expect(buildOutsideBlocks(FILE, [])).toEqual([]);
  });

  test("single annotation gets ±3 lines of context", () => {
    const [block] = buildOutsideBlocks(FILE, [ia(0, ann(10))]);
    expect(block).toBeDefined();
    expect(block!.newStart).toBe(7);
    expect(block!.lines.map((l) => l.newNumber)).toEqual([
      7, 8, 9, 10, 11, 12, 13,
    ]);
    expect(block!.lines.every((l) => l.type === "context")).toBe(true);
    expect(block!.annotations).toHaveLength(1);
  });

  test("block is clamped at file boundaries", () => {
    const [top] = buildOutsideBlocks(FILE, [ia(0, ann(2))]);
    expect(top!.newStart).toBe(1);
    expect(top!.lines.map((l) => l.newNumber)).toEqual([1, 2, 3, 4, 5]);

    const [bottom] = buildOutsideBlocks(FILE, [ia(0, ann(19))]);
    expect(bottom!.lines.map((l) => l.newNumber)).toEqual([
      16, 17, 18, 19, 20,
    ]);
  });

  test("overlapping annotations merge into one block with both anchors", () => {
    const blocks = buildOutsideBlocks(FILE, [
      ia(0, ann(8)),
      ia(1, ann(10)),
    ]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.lines.map((l) => l.newNumber)).toEqual([
      5, 6, 7, 8, 9, 10, 11, 12, 13,
    ]);
    expect(blocks[0]!.annotations.map((a) => a.index)).toEqual([0, 1]);
  });

  test("far-apart annotations produce separate blocks in order", () => {
    const blocks = buildOutsideBlocks(FILE, [
      ia(1, ann(18)),
      ia(0, ann(3)),
    ]);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]!.newStart).toBe(1);
    expect(blocks[1]!.newStart).toBe(15);
    expect(blocks[0]!.annotations[0]!.index).toBe(0);
    expect(blocks[1]!.annotations[0]!.index).toBe(1);
  });

  test("multi-line annotation covers its full range plus context", () => {
    const [block] = buildOutsideBlocks(FILE, [ia(0, ann(10, 12))]);
    expect(block!.lines.map((l) => l.newNumber)).toEqual([
      7, 8, 9, 10, 11, 12, 13, 14, 15,
    ]);
  });
});
