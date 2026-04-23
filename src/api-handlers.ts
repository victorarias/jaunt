import { applyTour, type Tour } from "./tour.ts";
import { createContentResolver, type RemoteFetch } from "./content.ts";
import type {
  ContentResult,
  Draft,
  FileError,
  PRPayload,
  PRRef,
  SubmitResult,
  SubmitTarget,
} from "./types.ts";

export type ApiDeps = {
  fetchPR: (ref: PRRef) => Promise<PRPayload>;
  fetchFileContent: RemoteFetch;
  submitReviewComment: (ref: PRRef, body: string) => Promise<string>;
  writeFeedback: (ref: PRRef, body: string) => Promise<string>;
  loadDraft: (ref: PRRef) => Promise<Draft>;
  saveDraft: (draft: Draft) => Promise<Draft>;
  clearDraft: (ref: PRRef) => Promise<void>;
};

export type ApiHandlers = {
  getPR(): Promise<PRPayload>;
  refetchContent(paths: string[]): Promise<PRPayload>;
  getDraft(): Promise<Draft>;
  putDraft(draft: Draft): Promise<Draft>;
  submit(body: string, target: SubmitTarget): Promise<SubmitResult>;
};

export function createApiHandlers(opts: {
  ref: PRRef;
  tour: Tour | null;
  deps: ApiDeps;
  cwd?: string;
}): ApiHandlers {
  const cwd = opts.cwd ?? process.cwd();

  // PR metadata comes from gh's PR-files API — it's expensive to re-fetch
  // and doesn't change within a session, so we cache it once. Content fetches
  // (the stuff that rate-limits and fails) are cached separately so refetch
  // can invalidate and retry individual paths without re-paying metadata.
  let fetched: PRPayload | null = null;
  let applied: PRPayload | null = null;
  const contentCache = new Map<string, ContentResult>();

  async function ensureFetched(): Promise<PRPayload> {
    if (!fetched) fetched = await opts.deps.fetchPR(opts.ref);
    return fetched;
  }

  async function recompute(): Promise<PRPayload> {
    const base = await ensureFetched();
    if (!opts.tour) {
      applied = base;
      return applied;
    }

    const blobShaByPath = new Map<string, string | null>(
      base.files.map((f) => [f.path, f.blobSha]),
    );
    const resolve = createContentResolver({
      ref: opts.ref,
      headSha: base.meta.headSha,
      cwd,
      blobShaByPath,
      remoteFetch: opts.deps.fetchFileContent,
    });

    const fileErrors: FileError[] = [];
    const loadContent = async (path: string): Promise<string | null> => {
      let result = contentCache.get(path);
      if (!result) {
        result = await resolve(path);
        contentCache.set(path, result);
      }
      if (result.ok) return result.content;
      fileErrors.push({ path, reason: result.reason });
      return null;
    };

    const out = await applyTour(base, opts.tour, loadContent);
    applied = {
      ...out,
      tour: out.tour ? { ...out.tour, fileErrors } : null,
    };
    return applied;
  }

  async function getPR(): Promise<PRPayload> {
    if (applied) return applied;
    return recompute();
  }

  async function refetchContent(paths: string[]): Promise<PRPayload> {
    for (const p of paths) contentCache.delete(p);
    return recompute();
  }

  return {
    getPR,
    refetchContent,
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
