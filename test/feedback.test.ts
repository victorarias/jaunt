import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  agentRepliesPath,
  clearAgentReplies,
  feedbackPath,
  readAgentReplies,
  writeAgentReply,
  writeFeedback,
} from "../src/feedback.ts";
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

describe("agent replies", () => {
  test("missing reply file returns an empty exchange with the expected path", async () => {
    const dir = await fresh();
    const replies = await readAgentReplies(sampleRef, dir);

    expect(replies.path).toBe(agentRepliesPath(sampleRef, dir));
    expect(replies.body).toBe("");
    expect(replies.updatedAt).toBeNull();
  });

  test("agent replies append timestamped markdown sections", async () => {
    const dir = await fresh();
    await writeAgentReply(sampleRef, "First answer.", {
      dir,
      now: new Date("2026-04-21T15:00:00Z"),
    });
    await writeAgentReply(sampleRef, "Second answer.", {
      dir,
      now: new Date("2026-04-21T15:05:00Z"),
    });

    const replies = await readAgentReplies(sampleRef, dir);
    expect(replies.body).toContain("# jaunt agent replies");
    expect(replies.body).toContain(
      "## agent reply · 2026-04-21T15:00:00.000Z",
    );
    expect(replies.body).toContain("First answer.");
    expect(replies.body).toContain("Second answer.");
    expect(replies.updatedAt).not.toBeNull();
  });

  test("clearAgentReplies removes stale replies", async () => {
    const dir = await fresh();
    await writeAgentReply(sampleRef, "old answer", { dir });
    await clearAgentReplies(sampleRef, dir);

    const replies = await readAgentReplies(sampleRef, dir);
    expect(replies.body).toBe("");
    expect(replies.updatedAt).toBeNull();
  });
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

  test("question intent gets its own section label", async () => {
    const dir = await fresh();
    await writeFeedback(sampleRef, "Can you clarify line 12?", {
      dir,
      now: new Date("2026-04-21T15:00:00Z"),
      intent: "question",
    });

    const content = await readFile(feedbackPath(sampleRef, dir), "utf-8");
    expect(content).toContain("## question · 2026-04-21T15:00:00.000Z");
    expect(content).toContain("Can you clarify line 12?");
  });
});
