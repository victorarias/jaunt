import { $ } from "bun";
import type { ContentResult } from "./types.ts";

/**
 * Read `<sha>:<path>` from the local git object store via `git show`.
 *
 * This is the primary content source when pr-tour runs inside the repo
 * where the PR branch has been pushed or fetched — which is the common
 * case for same-session authors. Because we match by SHA, not worktree
 * path, there's no risk of reading a rebased, dirty, or wrong-branch
 * copy: either the exact post-PR blob is in git, or it isn't.
 *
 * Returns `ok: false` when cwd isn't a git repo, the SHA isn't in the
 * object store, or the path doesn't exist at that revision. Callers
 * should fall through to the GitHub API on `ok: false`.
 */
export async function readLocalBlob(
  cwd: string,
  sha: string,
  path: string,
): Promise<ContentResult> {
  try {
    const result = await $`git -C ${cwd} show ${`${sha}:${path}`}`.quiet();
    return { ok: true, content: result.stdout.toString("utf-8") };
  } catch (err) {
    return { ok: false, reason: describeGitError(err) };
  }
}

function describeGitError(err: unknown): string {
  if (typeof err === "object" && err !== null) {
    const e = err as { stderr?: unknown; exitCode?: number; message?: string };
    const stderrBuf = e.stderr;
    let stderrText = "";
    if (typeof stderrBuf === "string") stderrText = stderrBuf;
    else if (stderrBuf && typeof (stderrBuf as Buffer).toString === "function") {
      stderrText = (stderrBuf as Buffer).toString("utf-8");
    }
    const trimmed = stderrText.trim().replace(/\s+/g, " ");
    if (trimmed) return `git exit ${e.exitCode ?? "?"}: ${trimmed}`;
    if (e.message) return e.message;
  }
  return err instanceof Error ? err.message : String(err);
}
