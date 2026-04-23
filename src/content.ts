import type { ContentResult, PRRef } from "./types.ts";
import { readLocalBlob } from "./git.ts";

export type RemoteFetch = (
  ref: PRRef,
  sha: string,
  path: string,
  blobSha?: string | null,
) => Promise<ContentResult>;

/**
 * Build a content resolver that tries the local git object store first
 * (via `git show <sha>:<path>`) and falls through to the GitHub API on
 * any local failure. Returns the remote failure reason on total miss —
 * local "blob not present" is expected and not informative on its own.
 */
export function createContentResolver(opts: {
  ref: PRRef;
  headSha: string;
  cwd: string;
  blobShaByPath: Map<string, string | null>;
  remoteFetch: RemoteFetch;
}): (path: string) => Promise<ContentResult> {
  return async (path) => {
    const local = await readLocalBlob(opts.cwd, opts.headSha, path);
    if (local.ok) return local;
    return opts.remoteFetch(
      opts.ref,
      opts.headSha,
      path,
      opts.blobShaByPath.get(path) ?? null,
    );
  };
}
