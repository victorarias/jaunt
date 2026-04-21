/**
 * Unit tests for `pr-tour validate` — schema checks, path existence against
 * a (fake) PR payload, anchor resolution (found / missing / ambiguous), and
 * line/range bounds. Writes guides to a temp dir; no real gh.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateTour, type ValidateDeps } from "../src/validate.ts";
import type { PRPayload, PRRef } from "../src/types.ts";
import { makeFile, makePayload, sampleRef } from "./fixtures.ts";

const tempDirs: string[] = [];

afterEach(async () => {
  while (tempDirs.length) {
    await rm(tempDirs.pop()!, { recursive: true, force: true });
  }
});

async function guideWith(yaml: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "pr-tour-validate-"));
  tempDirs.push(dir);
  const path = join(dir, ".pr-tour-guide.yml");
  await writeFile(path, yaml);
  return path;
}

function stubDeps(
  payload: PRPayload,
  contents: Record<string, string | null>,
): ValidateDeps {
  return {
    fetchPR: async (_ref: PRRef) => payload,
    fetchFileContent: async (_ref, _sha, path) =>
      path in contents ? contents[path]! : null,
  };
}

describe("validateTour — schema-only (offline)", () => {
  test("reports YAML schema errors via the thrown message", async () => {
    const guidePath = await guideWith(
      `version: 1\nfiles:\n  - path: src/a.ts\n    annotations:\n      - line: 1\n        note: hi\n        thread:\n          - "also hi"\n`,
    );
    const report = await validateTour({ guidePath, ref: null, deps: null });
    expect(report.errors.length).toBeGreaterThan(0);
    expect(report.errors[0]!).toContain(`cannot have both "note" and "thread"`);
  });

  test("flags same path in both files and skip as an error", async () => {
    const guidePath = await guideWith(
      `version: 1\nfiles:\n  - path: src/a.ts\n    note: hi\nskip:\n  - src/a.ts\n`,
    );
    const report = await validateTour({ guidePath, ref: null, deps: null });
    expect(report.errors.some((e) => e.includes("both files and skip"))).toBe(
      true,
    );
  });

  test("flags duplicate files entries", async () => {
    const guidePath = await guideWith(
      `version: 1\nfiles:\n  - path: src/a.ts\n    note: first\n  - path: src/a.ts\n    note: second\n`,
    );
    const report = await validateTour({ guidePath, ref: null, deps: null });
    expect(report.errors.some((e) => e.includes(`duplicate "files" entry`))).toBe(
      true,
    );
  });

  test("warns on suspiciously short anchors", async () => {
    const guidePath = await guideWith(
      `version: 1\nfiles:\n  - path: src/a.ts\n    annotations:\n      - anchor: "a"\n        note: pin\n`,
    );
    const report = await validateTour({ guidePath, ref: null, deps: null });
    expect(report.warnings.some((w) => w.includes("very short"))).toBe(true);
  });

  test("clean guide: no errors, no warnings", async () => {
    const guidePath = await guideWith(
      `version: 1\nsummary: |\n  hello\nfiles:\n  - path: src/a.ts\n    note: the thing\n`,
    );
    const report = await validateTour({ guidePath, ref: null, deps: null });
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([]);
  });
});

describe("validateTour — against a PR", () => {
  test("error: path in files not in PR", async () => {
    const guidePath = await guideWith(
      `version: 1\nfiles:\n  - path: src/missing.ts\n    note: x\n  - path: src/present.ts\n    note: y\n`,
    );
    const payload = makePayload({
      files: [makeFile({ path: "src/present.ts" })],
    });
    const report = await validateTour({
      guidePath,
      ref: sampleRef,
      deps: stubDeps(payload, {}),
    });
    expect(
      report.errors.some((e) => e.includes("src/missing.ts") && e.includes("not in PR")),
    ).toBe(true);
  });

  test("warn: path in skip not in PR", async () => {
    const guidePath = await guideWith(
      `version: 1\nfiles:\n  - path: src/a.ts\n    note: x\nskip:\n  - src/gone.ts\n`,
    );
    const payload = makePayload({ files: [makeFile({ path: "src/a.ts" })] });
    const report = await validateTour({
      guidePath,
      ref: sampleRef,
      deps: stubDeps(payload, {}),
    });
    expect(
      report.warnings.some((w) => w.includes("src/gone.ts") && w.includes("skip")),
    ).toBe(true);
  });

  test("error: anchor not found in file", async () => {
    const guidePath = await guideWith(
      `version: 1\nfiles:\n  - path: src/a.ts\n    annotations:\n      - anchor: "nowhere"\n        note: pin\n`,
    );
    const payload = makePayload({ files: [makeFile({ path: "src/a.ts" })] });
    const report = await validateTour({
      guidePath,
      ref: sampleRef,
      deps: stubDeps(payload, { "src/a.ts": "first line\nsecond line\n" }),
    });
    expect(
      report.errors.some((e) => e.includes(`"nowhere"`) && e.includes("not found")),
    ).toBe(true);
  });

  test("warn: ambiguous anchor matches multiple lines", async () => {
    const guidePath = await guideWith(
      `version: 1\nfiles:\n  - path: src/a.ts\n    annotations:\n      - anchor: "func Resolve"\n        note: pin the right one\n`,
    );
    const payload = makePayload({ files: [makeFile({ path: "src/a.ts" })] });
    const content = [
      "package x",
      "",
      "func Resolve() {}",
      "",
      "func ResolveAsync() {}",
      "",
    ].join("\n");
    const report = await validateTour({
      guidePath,
      ref: sampleRef,
      deps: stubDeps(payload, { "src/a.ts": content }),
    });
    expect(
      report.warnings.some(
        (w) => w.includes("ambiguous") && w.includes("func Resolve"),
      ),
    ).toBe(true);
    expect(report.errors).toEqual([]);
  });

  test("error: line past end of file", async () => {
    const guidePath = await guideWith(
      `version: 1\nfiles:\n  - path: src/a.ts\n    annotations:\n      - line: 99\n        note: off the end\n`,
    );
    const payload = makePayload({ files: [makeFile({ path: "src/a.ts" })] });
    const report = await validateTour({
      guidePath,
      ref: sampleRef,
      deps: stubDeps(payload, { "src/a.ts": "one\ntwo\n" }),
    });
    expect(
      report.errors.some((e) => e.includes("line 99") && e.includes("past end")),
    ).toBe(true);
  });

  test("error: range end past end of file", async () => {
    const guidePath = await guideWith(
      `version: 1\nfiles:\n  - path: src/a.ts\n    annotations:\n      - start: 1\n        end: 99\n        note: oversized\n`,
    );
    const payload = makePayload({ files: [makeFile({ path: "src/a.ts" })] });
    const report = await validateTour({
      guidePath,
      ref: sampleRef,
      deps: stubDeps(payload, { "src/a.ts": "one\ntwo\n" }),
    });
    expect(
      report.errors.some((e) => e.includes("end 99") && e.includes("past end")),
    ).toBe(true);
  });

  test("warn: view=content on unfetchable file", async () => {
    const guidePath = await guideWith(
      `version: 1\nfiles:\n  - path: docs/p.md\n    view: content\n    note: plan\n`,
    );
    const payload = makePayload({ files: [makeFile({ path: "docs/p.md" })] });
    const report = await validateTour({
      guidePath,
      ref: sampleRef,
      deps: stubDeps(payload, { "docs/p.md": null }),
    });
    expect(
      report.warnings.some(
        (w) => w.includes("docs/p.md") && w.includes("content unavailable"),
      ),
    ).toBe(true);
  });

  test("clean guide against valid PR reports nothing", async () => {
    const guidePath = await guideWith(
      `version: 1\nsummary: ok\nfiles:\n  - path: src/a.ts\n    annotations:\n      - anchor: "func Distinct"\n        note: only one match\n`,
    );
    const payload = makePayload({ files: [makeFile({ path: "src/a.ts" })] });
    const report = await validateTour({
      guidePath,
      ref: sampleRef,
      deps: stubDeps(payload, {
        "src/a.ts": "line one\nfunc Distinct() {}\nline three\n",
      }),
    });
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([]);
  });
});
