import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { feedbackPath, writeFeedback } from "../src/feedback.ts";
import { sampleRef } from "./fixtures.ts";

const tempDirs: string[] = [];

async function fresh(): Promise<string> {
  const d = await mkdtemp(join(tmpdir(), "pr-tour-fb-"));
  tempDirs.push(d);
  return d;
}

afterEach(async () => {
  while (tempDirs.length) {
    await rm(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe("writeFeedback", () => {
  test("writes a file at ~/.pr-tour/<owner>_<repo>_<num>.feedback.md (under the overridden dir)", async () => {
    const dir = await fresh();
    const written = await writeFeedback(sampleRef, "**Approve**\n\nLGTM", {
      dir,
      now: new Date("2026-04-21T14:32:00Z"),
    });
    expect(written).toBe(feedbackPath(sampleRef, dir));

    const content = await readFile(written, "utf-8");
    expect(content).toStartWith(
      "# pr-tour feedback · acme/edge-api#4821\n_submitted 2026-04-21T14:32:00.000Z_\n\n",
    );
    expect(content).toContain("**Approve**\n\nLGTM");
  });

  test("creates the directory if it doesn't exist", async () => {
    const base = await fresh();
    const dir = join(base, "deep", "nested", "path");
    await writeFeedback(sampleRef, "body", { dir });
    const s = await stat(dir);
    expect(s.isDirectory()).toBe(true);
  });

  test("overwrites previous feedback", async () => {
    const dir = await fresh();
    await writeFeedback(sampleRef, "first", { dir });
    await writeFeedback(sampleRef, "second", { dir });
    const content = await readFile(feedbackPath(sampleRef, dir), "utf-8");
    expect(content).toContain("second");
    expect(content).not.toContain("first");
  });
});
