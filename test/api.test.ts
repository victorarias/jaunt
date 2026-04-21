import { describe, expect, test } from "bun:test";
import type { ApiDeps } from "../src/api-handlers.ts";
import { createApiHandlers } from "../src/api-handlers.ts";
import type { Draft, PRRef } from "../src/types.ts";
import { makeDraft, makeFile, makePayload, sampleRef } from "./fixtures.ts";

type FakeDeps = {
  deps: ApiDeps;
  calls: {
    fetchPR: number;
    fetchFileContent: Array<{ sha: string; path: string }>;
    submitReviewComment: Array<{ ref: PRRef; body: string }>;
    writeFeedback: Array<{ ref: PRRef; body: string }>;
    loadDraft: number;
    saveDraft: number;
    clearDraft: number;
  };
  store: { draft: Draft | null };
};

function makeFakeDeps(overrides: Partial<ApiDeps> = {}): FakeDeps {
  const calls = {
    fetchPR: 0,
    fetchFileContent: [] as FakeDeps["calls"]["fetchFileContent"],
    submitReviewComment: [] as FakeDeps["calls"]["submitReviewComment"],
    writeFeedback: [] as FakeDeps["calls"]["writeFeedback"],
    loadDraft: 0,
    saveDraft: 0,
    clearDraft: 0,
  };
  const store: { draft: Draft | null } = { draft: null };

  const deps: ApiDeps = {
    fetchPR: async () => {
      calls.fetchPR += 1;
      return makePayload();
    },
    fetchFileContent: async (_ref, sha, path) => {
      calls.fetchFileContent.push({ sha, path });
      return null;
    },
    submitReviewComment: async (ref, body) => {
      calls.submitReviewComment.push({ ref, body });
      return `https://github.com/${ref.owner}/${ref.repo}/pull/${ref.number}#review-1`;
    },
    writeFeedback: async (ref, body) => {
      calls.writeFeedback.push({ ref, body });
      return `/tmp/fake-feedback/${ref.owner}_${ref.repo}_${ref.number}.feedback.md`;
    },
    loadDraft: async () => {
      calls.loadDraft += 1;
      return store.draft ?? makeDraft();
    },
    saveDraft: async (d) => {
      calls.saveDraft += 1;
      store.draft = { ...d, updatedAt: new Date().toISOString() };
      return store.draft;
    },
    clearDraft: async () => {
      calls.clearDraft += 1;
      store.draft = null;
    },
    ...overrides,
  };

  return { deps, calls, store };
}

describe("createApiHandlers.getPR", () => {
  test("caches after first call", async () => {
    const { deps, calls } = makeFakeDeps();
    const h = createApiHandlers({ ref: sampleRef, tour: null, deps });
    await h.getPR();
    await h.getPR();
    await h.getPR();
    expect(calls.fetchPR).toBe(1);
  });

  test("returns the raw payload when no tour is supplied", async () => {
    const { deps } = makeFakeDeps();
    const h = createApiHandlers({ ref: sampleRef, tour: null, deps });
    const pr = await h.getPR();
    expect(pr.tour).toBeNull();
    expect(pr.files[0]!.tourGroup).toBe("other");
  });

  test("applies a tour when supplied", async () => {
    const baseFiles = [
      makeFile({ path: "src/a.ts" }),
      makeFile({ path: "src/b.ts" }),
      makeFile({ path: "src/c.ts" }),
    ];
    const { deps, calls } = makeFakeDeps({
      fetchPR: async () => makePayload({ files: baseFiles }),
      fetchFileContent: async () => "line1\nline2\n",
    });
    const h = createApiHandlers({
      ref: sampleRef,
      tour: {
        version: 1,
        summary: "summary",
        files: [
          {
            path: "src/b.ts",
            note: "read first",
            view: "diff",
            annotations: [],
          },
        ],
        skip: ["src/c.ts"],
      },
      deps,
    });
    const pr = await h.getPR();
    expect(pr.tour!.summary).toBe("summary");
    // b (tour) comes first, a (other) next, c (skip) last.
    expect(pr.files.map((f) => f.path)).toEqual([
      "src/b.ts",
      "src/a.ts",
      "src/c.ts",
    ]);
    expect(pr.files[0]!.tourGroup).toBe("tour");
    expect(pr.files[0]!.tourNote).toBe("read first");
    expect(pr.files[2]!.tourGroup).toBe("skip");
    // Caching: fetchFileContent called at most once per path.
    expect(calls.fetchFileContent.length).toBeLessThanOrEqual(baseFiles.length);
  });
});

describe("createApiHandlers.putDraft", () => {
  test("persists replies + notes through the deps", async () => {
    const { deps, store } = makeFakeDeps();
    const h = createApiHandlers({ ref: sampleRef, tour: null, deps });
    const d = makeDraft({
      fileStates: {
        "src/a.ts": {
          reviewed: true,
          note: "note",
          replies: { "0": "reply body" },
        },
      },
    });
    const saved = await h.putDraft(d);
    expect(store.draft).not.toBeNull();
    expect(store.draft!.fileStates["src/a.ts"]!.replies).toEqual({
      "0": "reply body",
    });
    expect(saved.updatedAt).toBeDefined();
  });
});

describe("createApiHandlers.submit", () => {
  test("target=github calls submitReviewComment, clears draft, returns url", async () => {
    const { deps, calls } = makeFakeDeps();
    const h = createApiHandlers({ ref: sampleRef, tour: null, deps });

    const result = await h.submit("the body", "github");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.target).toBe("github");
    if (result.target !== "github") throw new Error("unreachable");
    expect(result.url).toContain("github.com");

    expect(calls.submitReviewComment).toHaveLength(1);
    expect(calls.submitReviewComment[0]!.body).toBe("the body");
    expect(calls.writeFeedback).toHaveLength(0);
    expect(calls.clearDraft).toBe(1);
  });

  test("target=agent writes feedback, clears draft, returns path", async () => {
    const { deps, calls } = makeFakeDeps();
    const h = createApiHandlers({ ref: sampleRef, tour: null, deps });

    const result = await h.submit("agent body", "agent");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.target).toBe("agent");
    if (result.target !== "agent") throw new Error("unreachable");
    expect(result.path).toContain(".feedback.md");

    expect(calls.writeFeedback).toHaveLength(1);
    expect(calls.writeFeedback[0]!.body).toBe("agent body");
    expect(calls.submitReviewComment).toHaveLength(0);
    expect(calls.clearDraft).toBe(1);
  });

  test("returns ok:false when the dep throws, and does NOT clear the draft", async () => {
    const { deps, calls } = makeFakeDeps({
      submitReviewComment: async () => {
        throw new Error("gh exploded");
      },
    });
    const h = createApiHandlers({ ref: sampleRef, tour: null, deps });

    const result = await h.submit("body", "github");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error).toBe("gh exploded");
    expect(calls.clearDraft).toBe(0);
  });
});
