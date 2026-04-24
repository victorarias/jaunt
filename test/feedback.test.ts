import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { feedbackPath, writeFeedback } from "../src/feedback.ts";
import { sampleRef } from "./fixtures.ts";

const tempDirs: string[] = [];

async function fresh(): Promise<string> {
  const d = await mkdtemp(join(tmpdir(), "jaunt-fb-"));
  tempDirs.push(d);
  return d;
}

afterEach(async () => {
  while (tempDirs.length) {
    await rm(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe("writeFeedback", () => {
  test("first write creates file with owner/repo header and a timestamped submission section", async () => {
    const dir = await fresh();
    const written = await writeFeedback(sampleRef, "**Approve**\n\nLGTM", {
      dir,
      now: new Date("2026-04-21T14:32:00Z"),
    });
    expect(written).toBe(feedbackPath(sampleRef, dir));

    const content = await readFile(written, "utf-8");
    expect(content).toStartWith(
      "# jaunt feedback · acme/edge-api#4821\n\n## submission · 2026-04-21T14:32:00.000Z\n\n",
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

  test("subsequent writes append timestamped sections — earlier rounds are preserved", async () => {
    const dir = await fresh();
    await writeFeedback(sampleRef, "first round", {
      dir,
      now: new Date("2026-04-21T14:32:00Z"),
    });
    await writeFeedback(sampleRef, "second round", {
      dir,
      now: new Date("2026-04-21T14:45:00Z"),
      finish: true,
    });
    const content = await readFile(feedbackPath(sampleRef, dir), "utf-8");
    expect(content).toContain("first round");
    expect(content).toContain("second round");
    expect(content).toContain("## submission · 2026-04-21T14:32:00.000Z");
    expect(content).toContain(
      "## final submission · 2026-04-21T14:45:00.000Z",
    );
    // File-level header appears exactly once.
    expect(
      content.match(/^# jaunt feedback/gm)?.length ?? 0,
    ).toBe(1);
  });
});
