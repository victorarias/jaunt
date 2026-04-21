import { applyTour, type Tour } from "./tour.ts";
import type {
  Draft,
  PRPayload,
  PRRef,
  SubmitResult,
  SubmitTarget,
} from "./types.ts";

export type ApiDeps = {
  fetchPR: (ref: PRRef) => Promise<PRPayload>;
  fetchFileContent: (
    ref: PRRef,
    sha: string,
    path: string,
  ) => Promise<string | null>;
  submitReviewComment: (ref: PRRef, body: string) => Promise<string>;
  writeFeedback: (ref: PRRef, body: string) => Promise<string>;
  loadDraft: (ref: PRRef) => Promise<Draft>;
  saveDraft: (draft: Draft) => Promise<Draft>;
  clearDraft: (ref: PRRef) => Promise<void>;
};

export type ApiHandlers = {
  getPR(): Promise<PRPayload>;
  getDraft(): Promise<Draft>;
  putDraft(draft: Draft): Promise<Draft>;
  submit(body: string, target: SubmitTarget): Promise<SubmitResult>;
};

export function createApiHandlers(opts: {
  ref: PRRef;
  tour: Tour | null;
  deps: ApiDeps;
}): ApiHandlers {
  let cached: PRPayload | null = null;

  async function getPR(): Promise<PRPayload> {
    if (cached) return cached;
    const fetched = await opts.deps.fetchPR(opts.ref);
    if (!opts.tour) {
      cached = fetched;
      return cached;
    }
    const contentCache = new Map<string, Promise<string | null>>();
    const loadContent = (path: string): Promise<string | null> => {
      let p = contentCache.get(path);
      if (!p) {
        p = opts.deps.fetchFileContent(opts.ref, fetched.meta.headSha, path);
        contentCache.set(path, p);
      }
      return p;
    };
    cached = await applyTour(fetched, opts.tour, loadContent);
    return cached;
  }

  return {
    getPR,
    getDraft: () => opts.deps.loadDraft(opts.ref),
    putDraft: (draft) => opts.deps.saveDraft(draft),
    async submit(body, target) {
      try {
        if (target === "github") {
          const url = await opts.deps.submitReviewComment(opts.ref, body);
          await opts.deps.clearDraft(opts.ref);
          return { ok: true, target: "github", url };
        }
        const path = await opts.deps.writeFeedback(opts.ref, body);
        await opts.deps.clearDraft(opts.ref);
        return { ok: true, target: "agent", path };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  };
}
