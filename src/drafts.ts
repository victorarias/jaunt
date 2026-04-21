import { homedir } from "node:os";
import { join } from "node:path";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import type { Draft, PRRef } from "./types.ts";

const DRAFT_DIR = join(homedir(), ".pr-tour");

function draftPath(ref: PRRef): string {
  return join(DRAFT_DIR, `${ref.owner}_${ref.repo}_${ref.number}.json`);
}

export async function loadDraft(ref: PRRef): Promise<Draft> {
  try {
    const raw = await readFile(draftPath(ref), "utf-8");
    const parsed = JSON.parse(raw) as Draft;
    return parsed;
  } catch (err) {
    if (isNotFound(err)) return emptyDraft(ref);
    throw err;
  }
}

export async function saveDraft(draft: Draft): Promise<Draft> {
  await mkdir(DRAFT_DIR, { recursive: true });
  const next = { ...draft, updatedAt: new Date().toISOString() };
  await writeFile(draftPath(next.ref), JSON.stringify(next, null, 2));
  return next;
}

export async function clearDraft(ref: PRRef): Promise<void> {
  try {
    await unlink(draftPath(ref));
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
