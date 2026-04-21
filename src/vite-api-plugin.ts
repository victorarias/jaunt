import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { fetchPR, submitReviewComment } from "./gh.ts";
import { clearDraft, loadDraft, saveDraft } from "./drafts.ts";
import { applyTour, type Tour } from "./tour.ts";
import type { Draft, PRPayload, PRRef, SubmitResult } from "./types.ts";

export function apiPlugin(opts: { ref: PRRef; tour: Tour | null }): Plugin {
  let cachedPR: PRPayload | null = null;

  return {
    name: "pr-tour-api",
    configureServer(server) {
      server.middlewares.use("/api/pr", async (_req, res) => {
        await respondJSON(res, async () => {
          if (!cachedPR) {
            const fetched = await fetchPR(opts.ref);
            cachedPR = opts.tour ? applyTour(fetched, opts.tour) : fetched;
          }
          return cachedPR;
        });
      });

      server.middlewares.use("/api/draft", async (req, res) => {
        if (req.method === "GET") {
          await respondJSON(res, () => loadDraft(opts.ref));
          return;
        }
        if (req.method === "PUT" || req.method === "POST") {
          await respondJSON(res, async () => {
            const body = await readBody(req);
            const draft = JSON.parse(body) as Draft;
            return saveDraft(draft);
          });
          return;
        }
        res.statusCode = 405;
        res.end();
      });

      server.middlewares.use("/api/submit", async (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end();
          return;
        }
        await respondJSON<SubmitResult>(res, async () => {
          const body = await readBody(req);
          const { body: reviewBody } = JSON.parse(body) as { body: string };
          try {
            const url = await submitReviewComment(opts.ref, reviewBody);
            await clearDraft(opts.ref);
            return { ok: true, url };
          } catch (err) {
            return { ok: false, error: messageOf(err) };
          }
        });
      });
    },
  };
}

async function respondJSON<T>(
  res: ServerResponse,
  fn: () => Promise<T> | T
): Promise<void> {
  try {
    const value = await fn();
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(value));
  } catch (err) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: messageOf(err) }));
  }
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf-8");
}

function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
