import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyTour, loadTour } from "../src/tour.ts";
import { makeFile, makePayload } from "./fixtures.ts";

const tempDirs: string[] = [];

async function tempTour(yaml: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "jaunt-test-"));
  tempDirs.push(dir);
  const path = join(dir, ".jaunt-guide.yml");
  await writeFile(path, yaml, "utf-8");
  return path;
}

afterEach(async () => {
  while (tempDirs.length) {
    await rm(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe("loadTour", () => {
  test("parses the legacy note: form into a single agent comment", async () => {
    const path = await tempTour(`
files:
  - path: src/a.ts
    annotations:
      - line: 5
        note: "The bug lives here."
`);
    const tour = await loadTour(path);
    expect(tour.files).toHaveLength(1);
    const ann = tour.files[0]!.annotations[0]!;
    expect(ann.kind).toBe("line");
    expect(ann.comments).toEqual([
      { author: "agent", body: "The bug lives here." },
    ]);
  });

  test("parses the thread: form with strings and {author, body} mappings", async () => {
    const path = await tempTour(`
files:
  - path: src/a.ts
    annotations:
      - line: 12
        thread:
          - "first"
          - author: claude[bot]
            body: "second"
          - body: "third (default author)"
`);
    const tour = await loadTour(path);
    const ann = tour.files[0]!.annotations[0]!;
    expect(ann.comments).toEqual([
      { author: "agent", body: "first" },
      { author: "claude[bot]", body: "second" },
      { author: "agent", body: "third (default author)" },
    ]);
  });

  test("rejects annotations with both note and thread", async () => {
    const path = await tempTour(`
files:
  - path: src/a.ts
    annotations:
      - line: 1
        note: "one"
        thread: ["two"]
`);
    await expect(loadTour(path)).rejects.toThrow(/cannot have both/i);
  });

  test("rejects annotations with neither note nor thread", async () => {
    const path = await tempTour(`
files:
  - path: src/a.ts
    annotations:
      - line: 1
`);
    await expect(loadTour(path)).rejects.toThrow(/must have a "note" or a "thread"/i);
  });

  test("rejects empty thread lists", async () => {
    const path = await tempTour(`
files:
  - path: src/a.ts
    annotations:
      - line: 1
        thread: []
`);
    await expect(loadTour(path)).rejects.toThrow(/empty "thread"/i);
  });

  test("rejects thread entries missing a body", async () => {
    const path = await tempTour(`
files:
  - path: src/a.ts
    annotations:
      - line: 1
        thread:
          - author: who
`);
    await expect(loadTour(path)).rejects.toThrow(/missing "body"/i);
  });
});

describe("applyTour", () => {
  test("attaches comments to resolved annotations", async () => {
    const tourPath = await tempTour(`
summary: "do it"
files:
  - path: src/a.ts
    note: "the main file"
    annotations:
      - line: 3
        thread:
          - "first"
          - author: you
            body: "second"
`);
    const tour = await loadTour(tourPath);

    const file = makeFile({ path: "src/a.ts" });
    const payload = makePayload({ files: [file] });
    const loadContent = async () => "line1\nline2\nline3\nline4\n";

    const resolved = await applyTour(payload, tour, loadContent);
    const resolvedFile = resolved.files[0]!;
    expect(resolvedFile.tourNote).toBe("the main file");
    expect(resolvedFile.tourGroup).toBe("tour");
    expect(resolvedFile.annotations).toHaveLength(1);
    expect(resolvedFile.annotations[0]!.comments).toEqual([
      { author: "agent", body: "first" },
      { author: "you", body: "second" },
    ]);
  });

  test("applyTour warns on missing anchors but still returns the tour", async () => {
    const tourPath = await tempTour(`
files:
  - path: src/a.ts
    annotations:
      - anchor: "NOT FOUND"
        note: "floating"
`);
    const tour = await loadTour(tourPath);
    const payload = makePayload({ files: [makeFile({ path: "src/a.ts" })] });
    const resolved = await applyTour(
      payload,
      tour,
      async () => "nothing to see here",
    );
    expect(resolved.tour!.warnings.join("\n")).toMatch(/anchor "NOT FOUND" not found/);
    expect(resolved.files[0]!.annotations).toHaveLength(0);
  });
});
