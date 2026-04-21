import { readFile, stat } from "node:fs/promises";
import { join, isAbsolute, resolve } from "node:path";
import { parse as parseYAML } from "yaml";
import type { PRFile, PRPayload, TourMeta } from "./types.ts";

export type Tour = {
  version: 1;
  summary: string;
  files: Array<{ path: string; note: string }>;
  skip: string[];
};

const CANDIDATE_NAMES = [".pr-tour-guide.yml", ".pr-tour-guide.yaml"];

export async function resolveTourPath(
  explicit: string | undefined,
  cwd: string
): Promise<string | null> {
  if (explicit) {
    return isAbsolute(explicit) ? explicit : resolve(cwd, explicit);
  }
  for (const name of CANDIDATE_NAMES) {
    const p = join(cwd, name);
    if (await exists(p)) return p;
  }
  return null;
}

export async function loadTour(path: string): Promise<Tour> {
  const raw = await readFile(path, "utf-8");
  const parsed = parseYAML(raw);
  return normalizeTour(parsed, path);
}

function normalizeTour(input: unknown, sourcePath: string): Tour {
  if (!isRecord(input)) {
    throw new Error(
      `tour file ${sourcePath} must be a YAML mapping at the top level`
    );
  }
  const version = input.version;
  if (version !== undefined && version !== 1) {
    throw new Error(
      `tour file ${sourcePath}: unsupported version "${String(version)}" (expected 1)`
    );
  }

  const summary = typeof input.summary === "string" ? input.summary.trim() : "";

  const filesRaw = input.files;
  const files: Tour["files"] = [];
  if (Array.isArray(filesRaw)) {
    for (const entry of filesRaw) {
      if (!isRecord(entry) || typeof entry.path !== "string") {
        throw new Error(
          `tour file ${sourcePath}: every entry under "files" must be { path: string, note?: string }`
        );
      }
      files.push({
        path: entry.path,
        note: typeof entry.note === "string" ? entry.note.trim() : "",
      });
    }
  }

  const skipRaw = input.skip;
  const skip: string[] = [];
  if (Array.isArray(skipRaw)) {
    for (const entry of skipRaw) {
      if (typeof entry !== "string") {
        throw new Error(
          `tour file ${sourcePath}: "skip" must be a list of string paths`
        );
      }
      skip.push(entry);
    }
  }

  return { version: 1, summary, files, skip };
}

export function applyTour(payload: PRPayload, tour: Tour): PRPayload {
  const byPath = new Map<string, PRFile>();
  for (const f of payload.files) byPath.set(f.path, f);

  const tourOrdered: PRFile[] = [];
  const seen = new Set<string>();
  const warnings: string[] = [];

  for (const entry of tour.files) {
    const file = byPath.get(entry.path);
    if (!file) {
      warnings.push(
        `tour references "${entry.path}" but the PR does not include that file`
      );
      continue;
    }
    tourOrdered.push({
      ...file,
      tourNote: entry.note || null,
      tourGroup: "tour",
    });
    seen.add(entry.path);
  }

  const skipSet = new Set(tour.skip);
  const skipped: PRFile[] = [];
  for (const path of tour.skip) {
    const file = byPath.get(path);
    if (!file) {
      warnings.push(
        `tour skip references "${path}" but the PR does not include that file`
      );
      continue;
    }
    if (seen.has(path)) continue;
    skipped.push({ ...file, tourGroup: "skip" });
    seen.add(path);
  }

  const others: PRFile[] = [];
  for (const f of payload.files) {
    if (seen.has(f.path)) continue;
    if (skipSet.has(f.path)) continue;
    others.push({ ...f, tourGroup: "other" });
  }

  const meta: TourMeta = { summary: tour.summary, warnings };

  return {
    ...payload,
    files: [...tourOrdered, ...others, ...skipped],
    tour: meta,
  };
}

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
