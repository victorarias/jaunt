import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  agentRepliesPath,
  clearAgentReplies,
  feedbackPath,
  readAgentTranscript,
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

describe("agent transcript", () => {
  test("with neither file present, returns an empty transcript pinned to the expected path", async () => {
    const dir = await fresh();
    const t = await readAgentTranscript(sampleRef, dir);

    expect(t.path).toBe(agentRepliesPath(sampleRef, dir));
    expect(t.entries).toEqual([]);
    expect(t.updatedAt).toBeNull();
  });

  test("merges question sections from feedback with agent reply sections, oldest first", async () => {
    const dir = await fresh();
    await writeFeedback(sampleRef, "Can you clarify line 12?", {
      dir,
      now: new Date("2026-04-21T14:30:00Z"),
      intent: "question",
    });
    await writeAgentReply(sampleRef, "First answer.", {
      dir,
      now: new Date("2026-04-21T14:32:00Z"),
    });
    // Out-of-order writes should still surface in chronological order.
    await writeFeedback(sampleRef, "Reviewer follow-up.", {
      dir,
      now: new Date("2026-04-21T14:34:00Z"),
      intent: "question",
    });
    await writeAgentReply(sampleRef, "Second answer.", {
      dir,
      now: new Date("2026-04-21T14:36:00Z"),
    });

    const t = await readAgentTranscript(sampleRef, dir);
    expect(t.entries.map((e) => e.role)).toEqual([
      "user",
      "agent",
      "user",
      "agent",
    ]);
    expect(t.entries[0]?.body).toBe("Can you clarify line 12?");
    expect(t.entries[1]?.body).toBe("First answer.");
    expect(t.entries[2]?.body).toBe("Reviewer follow-up.");
    expect(t.entries[3]?.body).toBe("Second answer.");
    expect(t.updatedAt).toBe("2026-04-21T14:36:00.000Z");
  });

  test("submission and final submission sections are not part of the transcript", async () => {
    const dir = await fresh();
    await writeFeedback(sampleRef, "first round", {
      dir,
      now: new Date("2026-04-21T14:30:00Z"),
    });
    await writeFeedback(sampleRef, "wrap-up", {
      dir,
      now: new Date("2026-04-21T14:45:00Z"),
      finish: true,
    });
    await writeFeedback(sampleRef, "Quick clarification?", {
      dir,
      now: new Date("2026-04-21T14:50:00Z"),
      intent: "question",
    });

    const t = await readAgentTranscript(sampleRef, dir);
    expect(t.entries).toHaveLength(1);
    expect(t.entries[0]?.role).toBe("user");
    expect(t.entries[0]?.body).toBe("Quick clarification?");
  });

  test("clearAgentReplies wipes the agent file but keeps user questions visible", async () => {
    const dir = await fresh();
    await writeFeedback(sampleRef, "still pending", {
      dir,
      now: new Date("2026-04-21T15:00:00Z"),
      intent: "question",
    });
    await writeAgentReply(sampleRef, "old answer", {
      dir,
      now: new Date("2026-04-21T15:01:00Z"),
    });
    await clearAgentReplies(sampleRef, dir);

    const t = await readAgentTranscript(sampleRef, dir);
    expect(t.entries.map((e) => e.role)).toEqual(["user"]);
    expect(t.entries[0]?.body).toBe("still pending");
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
