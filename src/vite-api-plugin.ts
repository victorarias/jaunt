import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { createApiHandlers, type ApiDeps } from "./api-handlers.ts";
import type { Tour } from "./tour.ts";
import type { Draft, PRRef, SubmitTarget } from "./types.ts";

export function apiPlugin(opts: {
  ref: PRRef;
  tour: Tour | null;
  deps: ApiDeps;
}): Plugin {
  const handlers = createApiHandlers(opts);

  return {
    name: "pr-tour-api",
    configureServer(server) {
      server.middlewares.use("/api/pr", async (_req, res) => {
        await respondJSON(res, () => handlers.getPR());
      });

      server.middlewares.use("/api/draft", async (req, res) => {
        if (req.method === "GET") {
          await respondJSON(res, () => handlers.getDraft());
          return;
        }
        if (req.method === "PUT" || req.method === "POST") {
          await respondJSON(res, async () => {
            const body = await readBody(req);
            const draft = JSON.parse(body) as Draft;
            return handlers.putDraft(draft);
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
        await respondJSON(res, async () => {
          const body = await readBody(req);
          const { body: reviewBody, target } = JSON.parse(body) as {
            body: string;
            target?: SubmitTarget;
          };
          return handlers.submit(reviewBody, target ?? "github");
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
    res.end(
      JSON.stringify({
        error: err instanceof Error ? err.message : String(err),
      })
    );
  }
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf-8");
}
