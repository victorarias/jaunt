/**
 * Live preview harness for jaunt's UI — boots the real server with a fake PR
 * payload that exercises every markdown + mermaid surface in one screen.
 * Useful for eyeballing the renderer without spinning up a real PR + agent
 * loop. Run with `bun run demo`.
 *
 * Drafts and feedback persist in tmp/jaunt-demo/ so reviewer marks survive
 * across reloads — wipe that folder to start fresh.
 */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { ApiDeps } from "../src/api-handlers.ts";
import { clearDraft, loadDraft, saveDraft } from "../src/drafts.ts";
import { feedbackPath, writeFeedback } from "../src/feedback.ts";
import { startServer } from "../src/server.ts";
import type {
  Annotation,
  Comment,
  DiffHunk,
  DiffLine,
  PRFile,
  PRPayload,
  PRRef,
} from "../src/types.ts";

const ref: PRRef = { owner: "demo", repo: "jaunt", number: 42 };

const PR_BODY = `# Extract rate-limiter into its own middleware

Pulls the inline token-bucket out of \`auth.ts\` and gives it its own
middleware. The behaviour is the same — same per-IP limits, same headers —
but **service-layer code stops carrying the limiter as a dependency**.

## What's in this PR

- New middleware at \`src/middleware/rateLimit.ts\`
- \`auth.ts\` shrinks; the limiter call moves to wiring
- One new integration test

## Architecture

\`\`\`mermaid
flowchart LR
  Client --> RateLimit[rateLimit middleware]
  RateLimit -->|allowed| Auth[auth middleware]
  RateLimit -->|429| Client
  Auth --> Handler[route handler]
\`\`\`

## Limits (unchanged)

| route          | per-IP rps | burst |
| -------------- | ---------- | ----- |
| \`/login\`       | 5          | 10    |
| \`/api/*\`       | 50         | 100   |
| \`/healthz\`     | unlimited  | —     |

## Open questions

> Should we drop the \`Retry-After\` header on \`/healthz\`? It's noise but
> some load-balancers expect it. Leaning *no*; happy to be talked out of it.

See [the original plan](https://example.invalid/plan) for context.

- [x] Middleware extracted
- [x] Wiring updated
- [ ] Update operator runbook (separate PR)
`;

const TOUR_SUMMARY = `Three stops. Plan first, then the new middleware, then the wiring change in \`auth.ts\`.

The new shape, at a glance:

\`\`\`mermaid
flowchart TD
  M[rateLimit middleware] -->|reads| Cfg[(rate-limit config)]
  M -->|writes| Hdr[response headers]
  Auth[auth middleware] --> H[handler]
  M --> Auth
\`\`\`

Read the plan doc to ground the *why*; the middleware to see the *how*; the auth diff to see what fell out.`;

const PLAN_DOC = `# Rate-limit middleware extraction

**Status:** accepted · **Owner:** @demo

## Context

The rate-limiter was inlined inside \`auth.ts\` for historical reasons — it
was added the same week as auth and the two felt connected. They aren't.

\`\`\`mermaid
sequenceDiagram
  participant C as Client
  participant RL as rateLimit
  participant A as auth
  C->>RL: request
  alt allowed
    RL->>A: forward
    A->>C: 200
  else over limit
    RL-->>C: 429
  end
\`\`\`

## Decisions

- **DT-1**: rate-limit runs *before* auth — anonymous floods don't get to spend a CPU cycle on JWT verification.
- **DT-2**: the limiter is **per-IP**, not per-user. Pre-auth we don't have a user.
- **INV-1**: \`Retry-After\` is set whenever we return 429.

## Out of scope

1. Sliding-window algorithm — we keep token-bucket
2. Per-route override config — handled by the existing config layer
3. Distributed limits — single-node only for now
`;

const SERVICE_FILE_CONTENT = [
  `import type { Request, Response, NextFunction } from "express";`,
  `import { TokenBucket } from "../lib/tokenBucket.ts";`,
  ``,
  `// Per-IP buckets. Created lazily; evicted by the LRU.`,
  `const buckets = new Map<string, TokenBucket>();`,
  ``,
  `export function rateLimit(opts: { rps: number; burst: number }) {`,
  `  return (req: Request, res: Response, next: NextFunction) => {`,
  `    const ip = req.ip ?? "unknown";`,
  `    let bucket = buckets.get(ip);`,
  `    if (!bucket) {`,
  `      bucket = new TokenBucket(opts.rps, opts.burst);`,
  `      buckets.set(ip, bucket);`,
  `    }`,
  `    if (!bucket.tryTake()) {`,
  `      res.set("Retry-After", String(bucket.retryAfter()));`,
  `      res.status(429).json({ error: "rate_limited" });`,
  `      return;`,
  `    }`,
  `    next();`,
  `  };`,
  `}`,
  ``,
].join("\n");

function buildHunks(): DiffHunk[] {
  // A minimal but realistic diff for auth.ts: removes the inline limiter call,
  // leaves the rest untouched.
  const lines: DiffLine[] = [
    {
      type: "context",
      oldNumber: 8,
      newNumber: 8,
      content: "export function auth(req, res, next) {",
    },
    {
      type: "context",
      oldNumber: 9,
      newNumber: 9,
      content: "  const token = req.get(\"authorization\");",
    },
    {
      type: "del",
      oldNumber: 10,
      newNumber: null,
      content: "  if (!tokenBucket.tryTake(req.ip)) {",
    },
    {
      type: "del",
      oldNumber: 11,
      newNumber: null,
      content: "    return res.status(429).end();",
    },
    {
      type: "del",
      oldNumber: 12,
      newNumber: null,
      content: "  }",
    },
    {
      type: "context",
      oldNumber: 13,
      newNumber: 10,
      content: "  if (!token) return res.status(401).end();",
    },
    {
      type: "add",
      oldNumber: null,
      newNumber: 11,
      content: "  // rate-limiting handled by the rateLimit middleware (see wiring)",
    },
    {
      type: "context",
      oldNumber: 14,
      newNumber: 12,
      content: "  next();",
    },
    {
      type: "context",
      oldNumber: 15,
      newNumber: 13,
      content: "}",
    },
  ];
  return [
    {
      oldStart: 8,
      oldLines: 8,
      newStart: 8,
      newLines: 6,
      header: "@@ -8,8 +8,6 @@ auth flow",
      lines,
    },
  ];
}

function ann(
  lineStart: number,
  lineEnd: number,
  comments: Comment[],
): Annotation {
  return { lineStart, lineEnd, comments };
}

function file(overrides: Partial<PRFile> & { path: string }): PRFile {
  return {
    oldPath: null,
    blobSha: "deadbeef",
    status: "added",
    additions: 0,
    deletions: 0,
    hunks: [],
    binary: false,
    language: null,
    tourNote: null,
    tourGroup: "tour",
    view: "diff",
    content: null,
    annotations: [],
    ...overrides,
  };
}

const payload: PRPayload = {
  meta: {
    ref,
    title: "refactor: extract rate-limiter into its own middleware",
    body: PR_BODY,
    headRef: "demo/rate-limit-middleware",
    baseRef: "main",
    headSha: "f00dface",
    url: `https://github.com/${ref.owner}/${ref.repo}/pull/${ref.number}`,
    author: "demo[bot]",
  },
  files: [
    file({
      path: "docs/plans/2026-04-25-rate-limit-extraction.md",
      status: "added",
      additions: 28,
      deletions: 0,
      language: "markdown",
      view: "content",
      content: PLAN_DOC,
      tourGroup: "tour",
      tourNote: `**Start here.** \`DT-*\` are the decision tables, \`INV-1\` is the invariant the middleware enforces. The diagram on this page is the contract — the implementation should read like an obvious encoding of it.

If you're skimming, the two things that matter:

- limiter runs *before* auth (DT-1)
- per-IP, not per-user (DT-2)`,
      annotations: [
        ann(13, 13, [
          {
            author: "demo[bot]",
            body: `Worth re-reading: this is the **only** invariant the middleware enforces directly. Everything else is policy.`,
          },
        ]),
      ],
    }),
    file({
      path: "src/middleware/rateLimit.ts",
      status: "added",
      additions: 22,
      deletions: 0,
      language: "typescript",
      view: "content",
      content: SERVICE_FILE_CONTENT,
      tourGroup: "tour",
      tourNote: `The aggregate. Read the \`buckets\` map first — it's the **state**; the rest is just the **rule** that decides when a token is available.

A picture of the per-request flow:

\`\`\`mermaid
flowchart LR
  Req[request] --> Get[get bucket]
  Get -->|hit| Try[tryTake]
  Get -->|miss| New[new TokenBucket] --> Try
  Try -->|ok| Next[next]
  Try -->|drop| R[429 + Retry-After]
\`\`\``,
      annotations: [
        ann(5, 5, [
          {
            author: "demo[bot]",
            body: "Lazy-init keyed by IP. The map is unbounded here — operator runbook flags this; bound it once we see real traffic.",
          },
        ]),
        ann(15, 18, [
          {
            author: "demo[bot]",
            body: `**INV-1 lives here.** \`Retry-After\` is set on **every** 429.

A short sequence of what the client sees when they hit the limit:

\`\`\`mermaid
sequenceDiagram
  Client->>+Mw: GET /api/foo
  Mw-->>-Client: 429 + Retry-After: 3
  Note right of Client: waits 3s
  Client->>+Mw: GET /api/foo (retry)
  Mw-->>-Client: 200 OK
\`\`\``,
          },
          {
            author: "demo[bot]",
            body: `Went back and forth on returning a JSON body vs an empty body — *kept* the body because some clients log it.`,
          },
        ]),
        ann(7, 7, [
          {
            author: "demo[bot]",
            body: `(Demo of the error fallback — this block is intentionally broken so you can see the inline error.)

\`\`\`mermaid
flowhart LR
  A --> B
\`\`\``,
          },
        ]),
      ],
    }),
    file({
      path: "src/auth.ts",
      status: "modified",
      additions: 1,
      deletions: 3,
      language: "typescript",
      hunks: buildHunks(),
      view: "diff",
      tourGroup: "tour",
      tourNote: `What fell out. Three lines deleted, one comment added — the rest of \`auth.ts\` is untouched. The interesting line is the comment, because it's the only signpost left explaining *why* the limiter call isn't here anymore.`,
      annotations: [
        ann(11, 11, [
          {
            author: "demo[bot]",
            body: `Tiny but load-bearing comment. Without it the next person to touch this file will reinvent the inline limiter — see git history of \`auth.ts\` for how this happened **the last time**.`,
          },
        ]),
      ],
    }),
    file({
      path: "src/wiring/server.ts",
      status: "modified",
      additions: 4,
      deletions: 1,
      language: "typescript",
      hunks: [
        {
          oldStart: 12,
          oldLines: 3,
          newStart: 12,
          newLines: 6,
          header: "@@ -12,3 +12,6 @@ wiring",
          lines: [
            { type: "context", oldNumber: 12, newNumber: 12, content: "import { auth } from \"../auth.ts\";" },
            { type: "add", oldNumber: null, newNumber: 13, content: "import { rateLimit } from \"../middleware/rateLimit.ts\";" },
            { type: "context", oldNumber: 13, newNumber: 14, content: "" },
            { type: "del", oldNumber: 14, newNumber: null, content: "app.use(auth);" },
            { type: "add", oldNumber: null, newNumber: 15, content: "app.use(rateLimit({ rps: 50, burst: 100 }));" },
            { type: "add", oldNumber: null, newNumber: 16, content: "app.use(auth);" },
          ],
        },
      ],
      tourGroup: "other",
      tourNote: null,
    }),
    file({
      path: "package-lock.json",
      status: "modified",
      additions: 4,
      deletions: 4,
      language: "json",
      hunks: [],
      tourGroup: "skip",
      tourNote: null,
    }),
  ],
  tour: {
    summary: TOUR_SUMMARY,
    warnings: [
      `Anchor "tryTake" matched 2 lines — pinned to the first. Lengthen the anchor if that's wrong.`,
    ],
    fileErrors: [],
  },
};

async function main() {
  const dir = join(process.cwd(), "tmp", "jaunt-demo");
  await mkdir(dir, { recursive: true });

  const deps: ApiDeps = {
    fetchPR: async () => payload,
    fetchFileContent: async () => ({ ok: false, reason: "demo: no remote" }),
    submitReviewComment: async (_ref, body) => {
      console.log("\n--- submitReviewComment (demo, not actually posted) ---");
      console.log(body);
      console.log("--- /submit ---\n");
      return `https://github.com/${ref.owner}/${ref.repo}/pull/${ref.number}#pullrequestreview-demo`;
    },
    writeFeedback: async (r, body, opts) => {
      const path = await writeFeedback(r, body, { dir, finish: opts?.finish });
      console.log(`\n[demo] wrote feedback → ${path}\n`);
      return path;
    },
    loadDraft: (r) => loadDraft(r, { dir }),
    saveDraft: (d) => saveDraft(d, { dir }),
    clearDraft: (r) => clearDraft(r, { dir }),
  };

  const server = await startServer({
    ref,
    tour: null, // payload already carries tourNote/annotations/tour fields directly
    deps,
    open: true,
  });

  console.log(`\n  jaunt demo · ${server.url}`);
  console.log(`  drafts/feedback: ${dir}`);
  console.log(`  feedback path on submit-to-agent: ${feedbackPath(ref, dir)}`);
  console.log(`  Ctrl-C to stop.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
