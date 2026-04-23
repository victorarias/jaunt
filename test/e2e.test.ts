/**
 * End-to-end integration test — drives the api-handlers with real draft
 * persistence (against a temp dir) and the real feedback writer, stubbing
 * only the GitHub calls. Asserts a full round-trip:
 *
 *   1. GET /api/pr returns the tour-aware payload
 *   2. PUT /api/draft persists a file note + a thread reply
 *   3. POST /api/submit (target=agent) writes the feedback file containing
 *      the composed body, then clears the on-disk draft
 */
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApiHandlers, type ApiDeps } from "../src/api-handlers.ts";
import { composeReviewBody } from "../src/compose.ts";
import { clearDraft, loadDraft, saveDraft } from "../src/drafts.ts";
import { feedbackPath, writeFeedback } from "../src/feedback.ts";
import { makeAnnotation, makeFile, makePayload, sampleRef } from "./fixtures.ts";

const tempDirs: string[] = [];

async function tempHome(): Promise<{ dir: string }> {
  const dir = await mkdtemp(join(tmpdir(), "pr-tour-e2e-"));
  tempDirs.push(dir);
  return { dir };
}

afterEach(async () => {
  while (tempDirs.length) {
    await rm(tempDirs.pop()!, { recursive: true, force: true });
  }
});

function makeDeps(
  opts: {
    dir: string;
    payload: ReturnType<typeof makePayload>;
    onSubmit?: (body: string) => Promise<string>;
  },
): ApiDeps {
  return {
    fetchPR: async () => opts.payload,
    fetchFileContent: async () => ({ ok: false, reason: "test stub" }),
    submitReviewComment: async (_ref, body) => {
      if (!opts.onSubmit) {
        throw new Error("submitReviewComment not expected in this test");
      }
      return opts.onSubmit(body);
    },
    writeFeedback: (ref, body) => writeFeedback(ref, body, { dir: opts.dir }),
    loadDraft: (ref) => loadDraft(ref, { dir: opts.dir }),
    saveDraft: (d) => saveDraft(d, { dir: opts.dir }),
    clearDraft: (ref) => clearDraft(ref, { dir: opts.dir }),
  };
}

describe("e2e — thread reply round-trip to agent feedback file", () => {
  test("saves draft, submits to agent, feedback file contains composed body", async () => {
    const { dir } = await tempHome();
    const file = makeFile({
      path: "src/a.ts",
      annotations: [
        makeAnnotation(12, [{ author: "agent", body: "Watch the race." }]),
      ],
    });
    const payload = makePayload({ files: [file] });

    const h = createApiHandlers({
      ref: sampleRef,
      tour: null,
      deps: makeDeps({ dir, payload }),
    });

    // Step 1: getPR (plumbed)
    const pr = await h.getPR();
    expect(pr.files).toHaveLength(1);
    expect(pr.files[0]!.annotations[0]!.comments[0]!.body).toContain("race");

    // Step 2: save a draft with a file note + a reply to annotation 0
    const initial = await h.getDraft();
    const updated = {
      ...initial,
      overallBody: "Solid refactor overall.",
      fileStates: {
        "src/a.ts": {
          reviewed: true,
          note: "left one thought below",
          replies: {
            "0": "noted — confirmed the INCR+PEXPIRE runs atomically",
          },
          lineComments: {},
        },
      },
    };
    await h.putDraft(updated);
    const reread = await h.getDraft();
    expect(reread.fileStates["src/a.ts"]!.replies["0"]).toContain("atomically");

    // Step 3: submit to agent
    const composed = composeReviewBody("approve", "", reread, pr.files);
    const result = await h.submit(composed, "agent");

    expect(result.ok).toBe(true);
    if (!result.ok || result.target !== "agent") {
      throw new Error(
        `expected ok:true target:agent, got ${JSON.stringify(result)}`,
      );
    }
    expect(result.path).toBe(feedbackPath(sampleRef, dir));

    // Feedback file contains the composed body + header.
    const s = await stat(result.path);
    expect(s.isFile()).toBe(true);
    const fileContent = await readFile(result.path, "utf-8");
    expect(fileContent).toStartWith(
      `# pr-tour feedback · ${sampleRef.owner}/${sampleRef.repo}#${sampleRef.number}\n`,
    );
    expect(fileContent).toContain("**Approve**");
    expect(fileContent).toContain("Solid refactor overall.");
    expect(fileContent).toContain("**src/a.ts**");
    expect(fileContent).toContain("left one thought below");
    expect(fileContent).toContain("_on line 12:_");
    expect(fileContent).toContain("confirmed the INCR+PEXPIRE");

    // On-disk draft is cleared.
    const afterSubmit = await h.getDraft();
    expect(afterSubmit.fileStates).toEqual({});
    expect(afterSubmit.overallBody).toBe("");
  });

  test("github path goes through submitReviewComment and never writes feedback", async () => {
    const { dir } = await tempHome();
    const submitCalls: Array<{ body: string }> = [];
    const payload = makePayload();

    const h = createApiHandlers({
      ref: sampleRef,
      tour: null,
      deps: makeDeps({
        dir,
        payload,
        onSubmit: async (body) => {
          submitCalls.push({ body });
          return "https://github.com/acme/edge-api/pull/4821#pullrequestreview-1";
        },
      }),
    });

    await h.putDraft({
      ref: sampleRef,
      overallBody: "pushing up",
      fileStates: {},
      updatedAt: new Date().toISOString(),
    });

    const result = await h.submit("body content", "github");
    expect(result.ok).toBe(true);
    expect(submitCalls).toHaveLength(1);
    expect(submitCalls[0]!.body).toBe("body content");
    // No feedback file should exist.
    await expect(readFile(feedbackPath(sampleRef, dir), "utf-8")).rejects.toThrow();
  });
});
