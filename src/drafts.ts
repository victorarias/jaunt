import { homedir } from "node:os";
import { join } from "node:path";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import type { Draft, PRRef } from "./types.ts";

export type DraftStoreOptions = {
  /** Override the directory. Defaults to ~/.jaunt. */
  dir?: string;
};

function resolveDir(opts?: DraftStoreOptions): string {
  return opts?.dir ?? join(homedir(), ".jaunt");
}

export function draftPath(ref: PRRef, opts?: DraftStoreOptions): string {
  return join(
    resolveDir(opts),
    `${ref.owner}_${ref.repo}_${ref.number}.json`,
  );
}

export async function loadDraft(
  ref: PRRef,
  opts?: DraftStoreOptions,
): Promise<Draft> {
  try {
    const raw = await readFile(draftPath(ref, opts), "utf-8");
    return JSON.parse(raw) as Draft;
  } catch (err) {
    if (isNotFound(err)) return emptyDraft(ref);
    throw err;
  }
}

export async function saveDraft(
  draft: Draft,
  opts?: DraftStoreOptions,
): Promise<Draft> {
  const dir = resolveDir(opts);
  await mkdir(dir, { recursive: true });
  const next = { ...draft, updatedAt: new Date().toISOString() };
  await writeFile(draftPath(next.ref, opts), JSON.stringify(next, null, 2));
  return next;
}

export async function clearDraft(
  ref: PRRef,
  opts?: DraftStoreOptions,
): Promise<void> {
  try {
    await unlink(draftPath(ref, opts));
  } catch (err) {
    if (!isNotFound(err)) throw err;
  }
}

function emptyDraft(ref: PRRef): Draft {
  return {
    ref,
    overallBody: "",
    fileStates: {},
    updatedAt: new Date().toISOString(),
  };
}

function isNotFound(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: unknown }).code === "ENOENT"
  );
}
