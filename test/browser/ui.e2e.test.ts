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
    fetchFileContent: async () => ({ ok: false, reason: "test stub" }),
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

async function hasClass(locator: Locator, cls: string): Promise<boolean> {
  const classes = (await locator.getAttribute("class")) ?? "";
  return classes.split(/\s+/).includes(cls);
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

        // "back to agent" is the default target — click it anyway to verify
        // the button is wired and the click is a no-op.
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
    "GitHub path: toggle off default agent, pick Comment verdict, Post → submitReviewComment called, no feedback file",
    async () => {
      const fx = await bootstrap();
      try {
        // Advance once so we have non-trivial state.
        await fx.page.locator(".drive .next").click();
        await fx.page
          .locator("#stop-1")
          .waitFor({ state: "visible", timeout: 5_000 });

        // Open submit — default target is now "back to agent", so we have to
        // actively flip to GitHub.
        await fx.page.locator(".submit-review").click();
        const modal = fx.page.locator(".modal");
        await modal.waitFor({ state: "visible" });

        // Click the GitHub button explicitly.
        await modal.locator(".seg.wide button").nth(0).click();

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

  test(
    "keyboard-only: T + digit verdict + Meta+Enter honors the keyboard-selected state",
    async () => {
      // Regression guard for a stale-closure bug: the submit dialog's window
      // keydown listener used to capture handleSubmit once and reuse it
      // forever, so keyboard-driven T / digit changes updated the UI but the
      // eventual Meta+Enter still submitted with the *original* defaults.
      // Exercise the bug path end-to-end: default (agent + approve) →
      // keyboard-flip to (github + request_changes) → submit → assert
      // GitHub got the Request-changes body, not the agent feedback file.
      const fx = await bootstrap();
      try {
        // Focus somewhere non-input so the 's' shortcut fires.
        await fx.page.locator("main").click();

        // Open submit via keyboard.
        await fx.page.keyboard.press("s");
        const modal = fx.page.locator(".modal");
        await modal.waitFor({ state: "visible", timeout: 5_000 });

        // Sanity-check defaults: agent target active, approve verdict active.
        const segButtons = modal.locator(".seg.wide button");
        const verdictButtons = modal.locator(".verdict-btn");
        expect(await hasClass(segButtons.nth(1), "active")).toBe(true);
        expect(await hasClass(verdictButtons.nth(0), "active")).toBe(true);

        // Keyboard: T flips target → github.
        await fx.page.keyboard.press("t");
        expect(await hasClass(segButtons.nth(0), "active")).toBe(true);
        expect(await hasClass(segButtons.nth(1), "active")).toBe(false);

        // Keyboard: 3 picks request_changes.
        await fx.page.keyboard.press("3");
        expect(await hasClass(verdictButtons.nth(2), "active")).toBe(true);

        // Submit via Meta+Enter — this is where the stale closure used to
        // silently revert to (agent, approve).
        await fx.page.keyboard.press("Meta+Enter");

        const success = fx.page.locator(".modal.success");
        await success.waitFor({ state: "visible", timeout: 10_000 });
        expect(await textOf(success.locator(".modal-head"))).toContain(
          "Review submitted",
        );

        // GitHub mock got exactly one call with Request-changes body.
        expect(fx.github.submitCalls).toHaveLength(1);
        expect(
          fx.github.submitCalls[0]!.body.startsWith("**Request changes**"),
        ).toBe(true);

        // No feedback file — the keyboard-selected target (github) was
        // actually honored.
        const fbPath = feedbackPath(sampleRef, fx.dir);
        await expect(access(fbPath)).rejects.toThrow();

        expect(fx.pageErrors).toEqual([]);
        expect(fx.consoleErrors).toEqual([]);
      } finally {
        await fx.cleanup();
      }
    },
    90_000,
  );

  test(
    "j collapses the leaving file; arrows toggle collapse; n/p are scoped to current file",
    async () => {
      // A fresh payload where file A has 3 annotations and file B has 1, so
      // we can prove n/p stay inside A instead of bleeding into B.
      const payload = makePayload({
        meta: makeMeta({ title: "per-file annotation nav" }),
        files: [
          makeFile({
            path: "src/a.ts",
            view: "content",
            content: "l1\nl2\nl3\nl4\nl5\nl6\n",
            hunks: [
              {
                oldStart: 1,
                oldLines: 5,
                newStart: 1,
                newLines: 6,
                header: "",
                lines: [
                  { type: "context", oldNumber: 1, newNumber: 1, content: "l1" },
                  { type: "add", oldNumber: null, newNumber: 2, content: "l2" },
                  { type: "del", oldNumber: 2, newNumber: null, content: "old-2" },
                  { type: "context", oldNumber: 3, newNumber: 3, content: "l3" },
                ],
              },
            ],
            annotations: [
              makeAnnotation(2, [{ author: "bot", body: "A1" }]),
              makeAnnotation(4, [{ author: "bot", body: "A2" }]),
              makeAnnotation(6, [{ author: "bot", body: "A3" }]),
            ],
            tourGroup: "tour",
            additions: 6,
            deletions: 0,
          }),
          makeFile({
            path: "src/b.ts",
            view: "content",
            content: "only\n",
            annotations: [makeAnnotation(1, [{ author: "bot", body: "B1" }])],
            tourGroup: "tour",
            additions: 1,
            deletions: 0,
          }),
        ],
        tour: makeTour({ summary: "." }),
      });

      const fx = await bootstrap(payload);
      try {
        // Advance from summary to file A via the drive-bar Next click (stop 1).
        await fx.page.locator(".drive .next").click();
        await fx.page
          .locator("#stop-1")
          .waitFor({ state: "visible", timeout: 5_000 });

        // Focus something outside input so 'n'/'p'/arrows hit the app handler.
        await fx.page.locator(".file-card").first().click();

        // Full-file view must still show the diff: added row + deleted row.
        expect(
          await fx.page.locator("#stop-1 .code.full .row.add").count(),
        ).toBeGreaterThan(0);
        expect(
          await fx.page.locator("#stop-1 .code.full .row.del").count(),
        ).toBeGreaterThan(0);

        // Three 'n' presses walk to the third annotation, still on file A.
        await fx.page.keyboard.press("n");
        await fx.page.keyboard.press("n");
        await fx.page.keyboard.press("n");
        expect(
          await hasClass(fx.page.locator("#stop-1"), "active"),
        ).toBe(true);

        // A fourth 'n' must be a no-op — next-ann button is disabled at the
        // boundary. (If it weren't scoped, we'd cross into file B and stop-2
        // would become active.)
        const nextAnn = fx.page.locator(".drive .ann-nav").nth(1);
        expect(await nextAnn.isDisabled()).toBe(true);
        await fx.page.keyboard.press("n");
        expect(
          await hasClass(fx.page.locator("#stop-1"), "active"),
        ).toBe(true);
        expect(
          await hasClass(fx.page.locator("#stop-2"), "active"),
        ).toBe(false);

        // Press 'j' → advances to file B and collapses file A.
        await fx.page.keyboard.press("j");
        await fx.page
          .locator("#stop-2.active")
          .waitFor({ state: "visible", timeout: 5_000 });
        expect(
          await hasClass(fx.page.locator("#stop-1"), "collapsed"),
        ).toBe(true);
        // Collapsed ⇒ the content body is no longer rendered.
        expect(
          await fx.page.locator("#stop-1 .code.full").count(),
        ).toBe(0);

        // Back to A with 'k' — still collapsed.
        await fx.page.keyboard.press("k");
        await fx.page
          .locator("#stop-1.active")
          .waitFor({ state: "visible", timeout: 5_000 });
        expect(
          await hasClass(fx.page.locator("#stop-1"), "collapsed"),
        ).toBe(true);

        // ArrowRight expands.
        await fx.page.keyboard.press("ArrowRight");
        expect(
          await hasClass(fx.page.locator("#stop-1"), "collapsed"),
        ).toBe(false);
        await fx.page
          .locator("#stop-1 .code.full")
          .waitFor({ state: "visible", timeout: 2_000 });

        // ArrowLeft collapses again.
        await fx.page.keyboard.press("ArrowLeft");
        expect(
          await hasClass(fx.page.locator("#stop-1"), "collapsed"),
        ).toBe(true);
        expect(
          await fx.page.locator("#stop-1 .code.full").count(),
        ).toBe(0);

        expect(fx.pageErrors).toEqual([]);
        expect(fx.consoleErrors).toEqual([]);
      } finally {
        await fx.cleanup();
      }
    },
    90_000,
  );

  test(
    "Meta+Enter from inside a textarea opens the submit dialog",
    async () => {
      const fx = await bootstrap();
      try {
        // Advance to stop 1 so a reply textarea exists.
        await fx.page.locator(".drive .next").click();
        await fx.page
          .locator("#stop-1")
          .waitFor({ state: "visible", timeout: 5_000 });

        // Focus a textarea and type into it.
        const reply = fx.page.locator("#stop-1 .thread-reply textarea");
        await reply.click();
        await reply.type("hi");
        expect(
          await fx.page.evaluate(() => document.activeElement?.tagName),
        ).toBe("TEXTAREA");

        // Meta+Enter from inside the textarea opens submit.
        await fx.page.keyboard.press("Meta+Enter");
        await fx.page
          .locator(".modal")
          .waitFor({ state: "visible", timeout: 5_000 });

        // Focus should move onto the modal — otherwise the textarea still
        // owns it and digit / T shortcuts get typed into the reply instead
        // of reaching the dialog's keydown handler.
        await fx.page.waitForFunction(
          () => document.activeElement?.classList.contains("modal") ?? false,
          { timeout: 2_000 },
        );
        // Prove it end-to-end: pressing "3" should actually select
        // "Request changes" now that focus is on the modal.
        await fx.page.keyboard.press("3");
        const requestChangesBtn = fx.page.locator(
          ".verdict-btn.risk.active",
        );
        await requestChangesBtn.waitFor({ state: "visible", timeout: 2_000 });

        expect(fx.pageErrors).toEqual([]);
        expect(fx.consoleErrors).toEqual([]);
      } finally {
        await fx.cleanup();
      }
    },
    90_000,
  );

  test(
    "annotations outside the diff render inline next to their target line with surrounding context",
    async () => {
      // A ten-line file; diff hunk only touches line 2, but the annotation
      // targets line 7 — which under the old behaviour got banished to a
      // top-of-file notice with no code context.
      const content =
        "l1\nl2\nl3\nl4\nl5\nl6\nl7\nl8\nl9\nl10\n";
      const payload = makePayload({
        meta: makeMeta({ title: "outside-diff annotation" }),
        files: [
          makeFile({
            path: "src/out.ts",
            view: "diff",
            content,
            hunks: [
              {
                oldStart: 1,
                oldLines: 2,
                newStart: 1,
                newLines: 2,
                header: "",
                lines: [
                  { type: "context", oldNumber: 1, newNumber: 1, content: "l1" },
                  { type: "add", oldNumber: null, newNumber: 2, content: "l2" },
                ],
              },
            ],
            annotations: [
              makeAnnotation(7, [
                { author: "bot", body: "Out-of-diff note on line 7." },
              ]),
            ],
            tourGroup: "tour",
            additions: 1,
            deletions: 0,
          }),
        ],
        tour: makeTour({ summary: "." }),
      });

      const fx = await bootstrap(payload);
      try {
        await fx.page.locator(".drive .next").click();
        await fx.page
          .locator("#stop-1")
          .waitFor({ state: "visible", timeout: 5_000 });

        // The old "outside notice" must not appear — we render inline instead.
        expect(
          await fx.page.locator("#stop-1 .outside-notice").count(),
        ).toBe(0);

        // The context-only header is present and distinct from real @@ headers.
        const ctxHeader = fx.page.locator("#stop-1 .hunk-header.outside");
        await ctxHeader.waitFor({ state: "visible", timeout: 5_000 });

        // The annotated line (7) and its ±3 context must be rendered.
        const rows = fx.page.locator("#stop-1 .code .row");
        const rowNums = await rows.evaluateAll((els) =>
          els
            .map((el) => el.querySelectorAll(".num")[1]?.textContent?.trim())
            .filter((v): v is string => !!v),
        );
        for (const want of ["4", "5", "6", "7", "8", "9", "10"]) {
          expect(rowNums).toContain(want);
        }

        // The annotation thread is anchored inside the block — it must sit
        // after line 7's row and before line 8's row, not at the top of the
        // file card.
        const threadBody = await fx.page
          .locator("#stop-1 .thread")
          .first()
          .textContent();
        expect(threadBody ?? "").toContain("Out-of-diff note on line 7.");

        expect(fx.pageErrors).toEqual([]);
        expect(fx.consoleErrors).toEqual([]);
      } finally {
        await fx.cleanup();
      }
    },
    90_000,
  );
});
