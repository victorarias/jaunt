/**
 * True end-to-end — starts the real Vite server with the real React app and
 * drives it through Chromium. The only mock is GitHub: submitReviewComment
 * is captured in-memory. Drafts and feedback go to a temp directory.
 *
 * Covers:
 *   - Tour navigation (stop 0 → stop 1 → stop 2) via the Next button
 *   - "Mark reviewed on advance" behaviour
 *   - Inline thread rendering from the PR payload (ContentView)
 *   - Thread reply textarea + debounced autosave through /api/draft
 *   - Per-file note textarea + autosave
 *   - Submit modal: target toggle (GitHub / back to agent)
 *   - Agent path: feedback file written to disk with the composed body
 *   - GitHub path: submitReviewComment mock called, no feedback file written
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Browser, type Locator, type Page } from "playwright";
import type { ApiDeps } from "../../src/api-handlers.ts";
import { clearDraft, loadDraft, saveDraft } from "../../src/drafts.ts";
import { feedbackPath, writeFeedback } from "../../src/feedback.ts";
import { startServer, type ServerHandle } from "../../src/server.ts";
import type { PRPayload } from "../../src/types.ts";
import {
  makeAnnotation,
  makeFile,
  makeMeta,
  makePayload,
  makeTour,
  sampleRef,
} from "../fixtures.ts";

let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch();
}, 60_000);

afterAll(async () => {
  if (browser) await browser.close();
});

type Harness = {
  dir: string;
  github: { submitCalls: Array<{ body: string }> };
  server: ServerHandle;
  page: Page;
  pageErrors: string[];
  consoleErrors: string[];
  cleanup(): Promise<void>;
};

function defaultPayload(): PRPayload {
  return makePayload({
    meta: makeMeta({
      title: "refactor: extract rate-limiter",
      body: "Pulls the inline rate-limiter out of auth.ts.",
    }),
    files: [
      makeFile({
        path: "src/a.ts",
        view: "content",
        content: "first line\nsecond line\nthird line\n",
        annotations: [
          makeAnnotation(2, [
            { author: "claude[bot]", body: "Race window lives here." },
          ]),
        ],
        tourNote: "A — the interesting one. Focus here.",
        tourGroup: "tour",
        additions: 12,
        deletions: 3,
      }),
      makeFile({
        path: "src/b.ts",
        view: "content",
        content: "only line\n",
        annotations: [],
        tourNote: "B — trivial follow-on.",
        tourGroup: "tour",
        additions: 4,
        deletions: 0,
      }),
    ],
    tour: makeTour({ summary: "Read A then B." }),
  });
}

async function bootstrap(
  payload: PRPayload = defaultPayload(),
): Promise<Harness> {
  const dir = await mkdtemp(join(tmpdir(), "pr-tour-ui-e2e-"));

  const github = { submitCalls: [] as Array<{ body: string }> };

  const deps: ApiDeps = {
    fetchPR: async () => payload,
    fetchFileContent: async () => null,
    submitReviewComment: async (_ref, body) => {
      github.submitCalls.push({ body });
      return `https://github.com/${sampleRef.owner}/${sampleRef.repo}/pull/${sampleRef.number}#pullrequestreview-1`;
    },
    writeFeedback: (ref, body) => writeFeedback(ref, body, { dir }),
    loadDraft: (ref) => loadDraft(ref, { dir }),
    saveDraft: (d) => saveDraft(d, { dir }),
    clearDraft: (ref) => clearDraft(ref, { dir }),
  };

  const server = await startServer({
    ref: sampleRef,
    tour: null,
    deps,
    open: false,
  });

  const page = await browser.newPage();
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  await page.goto(server.url, { waitUntil: "domcontentloaded" });
  // The app renders stop 0 (summary card) on boot.
  await page
    .locator(".summary-card")
    .waitFor({ state: "visible", timeout: 15_000 });

  return {
    dir,
    github,
    server,
    page,
    pageErrors,
    consoleErrors,
    async cleanup() {
      await page.close().catch(() => {});
      await server.close().catch(() => {});
      await rm(dir, { recursive: true, force: true });
    },
  };
}

async function textOf(locator: Locator): Promise<string> {
  return (await locator.textContent()) ?? "";
}

describe("ui e2e — real browser round-trip", () => {
  test(
    "tour → thread reply → file note → submit to agent writes feedback file",
    async () => {
      const fx = await bootstrap();
      try {
        // Stop 0 — summary is visible and contains the tour summary.
        expect(await textOf(fx.page.locator(".summary-card"))).toContain(
          "Read A then B.",
        );

        // Sidebar lists stop-0 + both files in order.
        const fileItems = fx.page.locator(".file-item");
        expect(await textOf(fileItems.nth(0))).toContain("PR summary");
        expect(await textOf(fileItems.nth(1))).toContain("src/a.ts");
        expect(await textOf(fileItems.nth(2))).toContain("src/b.ts");

        // Click Start tour → stop 1 (file A).
        await fx.page.locator(".drive .next").click();
        await fx.page
          .locator("#stop-1")
          .waitFor({ state: "visible", timeout: 5_000 });
        expect(await textOf(fx.page.locator("#stop-1 .path"))).toContain(
          "src/a.ts",
        );

        // Thread on file A is visible with the agent comment.
        const threadA = fx.page.locator("#stop-1 .thread").first();
        await threadA.waitFor({ state: "visible" });
        expect(await textOf(threadA)).toContain("Race window lives here.");

        // Type a reply.
        const reply = fx.page.locator("#stop-1 .thread-reply textarea");
        await reply.click();
        await reply.fill("Confirmed atomic via Lua.");

        // Click Next → marks A reviewed, advances to stop 2.
        await fx.page.locator(".drive .next").click();
        await fx.page
          .locator("#stop-2")
          .waitFor({ state: "visible", timeout: 5_000 });
        expect(await textOf(fx.page.locator("#stop-2 .path"))).toContain(
          "src/b.ts",
        );

        // Counter reflects "1/2 reviewed" on the Submit button.
        const count = fx.page.locator(".submit-review .review-count");
        expect((await textOf(count)).trim()).toBe("1/2");

        // Type a note on file B.
        const noteB = fx.page.locator('#stop-2 textarea[id^="note-"]');
        await noteB.click();
        await noteB.fill("Trivial — skim only.");

        // Wait for the debounced autosave (400ms in useDraft) plus a buffer.
        await fx.page.waitForTimeout(800);

        // Open the submit modal.
        await fx.page.locator(".submit-review").click();
        const modal = fx.page.locator(".modal");
        await modal.waitFor({ state: "visible" });

        // Toggle target to "back to agent".
        await modal.locator(".seg.wide button").nth(1).click();

        // Submit (button label is "Send to agent →").
        await modal
          .locator(".modal-actions .btn.primary")
          .click();

        // Success modal.
        const success = fx.page.locator(".modal.success");
        await success.waitFor({ state: "visible", timeout: 10_000 });
        expect(await textOf(success.locator(".modal-head"))).toContain(
          "Feedback saved for agent",
        );

        // The composed feedback file is on disk with everything we expect.
        const path = feedbackPath(sampleRef, fx.dir);
        const content = await readFile(path, "utf-8");
        expect(content.startsWith(
          `# pr-tour feedback · ${sampleRef.owner}/${sampleRef.repo}#${sampleRef.number}\n`,
        )).toBe(true);
        expect(content).toContain("**Approve**");
        expect(content).toContain("**src/a.ts**");
        expect(content).toContain("_on line 2:_");
        expect(content).toContain("Confirmed atomic via Lua.");
        expect(content).toContain("**src/b.ts**");
        expect(content).toContain("Trivial — skim only.");

        // GitHub mock never called.
        expect(fx.github.submitCalls).toHaveLength(0);

        expect(fx.pageErrors).toEqual([]);
        expect(fx.consoleErrors).toEqual([]);
      } finally {
        await fx.cleanup();
      }
    },
    90_000,
  );

  test(
    "GitHub path: default target + Post calls submitReviewComment with composed body, no feedback file",
    async () => {
      const fx = await bootstrap();
      try {
        // Advance once so we have non-trivial state.
        await fx.page.locator(".drive .next").click();
        await fx.page
          .locator("#stop-1")
          .waitFor({ state: "visible", timeout: 5_000 });

        // Open submit with GitHub as the default target.
        await fx.page.locator(".submit-review").click();
        const modal = fx.page.locator(".modal");
        await modal.waitFor({ state: "visible" });

        // Pick the "Comment" verdict (second verdict button).
        await modal.locator(".verdict-btn").nth(1).click();

        // Post.
        await modal
          .locator(".modal-actions .btn.primary")
          .click();

        // Success state.
        const success = fx.page.locator(".modal.success");
        await success.waitFor({ state: "visible", timeout: 10_000 });
        expect(await textOf(success.locator(".modal-head"))).toContain(
          "Review submitted",
        );

        // Mock captured exactly one submission with the right verdict header.
        expect(fx.github.submitCalls).toHaveLength(1);
        const body = fx.github.submitCalls[0]!.body;
        expect(body.startsWith("**Comment**")).toBe(true);

        // No feedback file on disk.
        const path = feedbackPath(sampleRef, fx.dir);
        await expect(access(path)).rejects.toThrow();

        expect(fx.pageErrors).toEqual([]);
        expect(fx.consoleErrors).toEqual([]);
      } finally {
        await fx.cleanup();
      }
    },
    90_000,
  );
});
