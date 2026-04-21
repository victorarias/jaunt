import { readFile, stat } from "node:fs/promises";
import { join, isAbsolute, resolve } from "node:path";
import { parse as parseYAML } from "yaml";
import type {
  Annotation,
  Comment,
  FileView,
  PRFile,
  PRPayload,
  TourMeta,
} from "./types.ts";

export type TourAnnotation =
  | { kind: "anchor"; anchor: string; comments: Comment[] }
  | { kind: "line"; line: number; comments: Comment[] }
  | { kind: "range"; start: number; end: number; comments: Comment[] };

export type TourFileEntry = {
  path: string;
  note: string;
  view: FileView;
  annotations: TourAnnotation[];
};

export type Tour = {
  version: 1;
  summary: string;
  files: TourFileEntry[];
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
      const view = parseView(entry.view, entry.path, sourcePath);
      const annotations = parseAnnotations(entry.annotations, entry.path, sourcePath);
      files.push({
        path: entry.path,
        note: typeof entry.note === "string" ? entry.note.trim() : "",
        view,
        annotations,
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

function parseView(raw: unknown, path: string, sourcePath: string): FileView {
  if (raw === undefined || raw === null) return "diff";
  if (raw === "diff" || raw === "content") return raw;
  throw new Error(
    `tour file ${sourcePath}: "${path}".view must be "diff" or "content" (got ${JSON.stringify(raw)})`
  );
}

function parseAnnotations(
  raw: unknown,
  path: string,
  sourcePath: string
): TourAnnotation[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    throw new Error(
      `tour file ${sourcePath}: "${path}".annotations must be a list`
    );
  }
  const out: TourAnnotation[] = [];
  for (const entry of raw) {
    if (!isRecord(entry)) {
      throw new Error(
        `tour file ${sourcePath}: each annotation on "${path}" must be a mapping`
      );
    }
    const comments = parseComments(entry, path, sourcePath);
    const hasAnchor = typeof entry.anchor === "string";
    const hasLine = typeof entry.line === "number";
    const hasRange = typeof entry.start === "number" && typeof entry.end === "number";
    const specified = [hasAnchor, hasLine, hasRange].filter(Boolean).length;
    if (specified !== 1) {
      throw new Error(
        `tour file ${sourcePath}: annotation on "${path}" must have exactly one of anchor, line, or start+end`
      );
    }
    if (hasAnchor) {
      out.push({ kind: "anchor", anchor: (entry.anchor as string), comments });
    } else if (hasLine) {
      const line = entry.line as number;
      if (!Number.isInteger(line) || line < 1) {
        throw new Error(
          `tour file ${sourcePath}: annotation on "${path}" has invalid line ${line}`
        );
      }
      out.push({ kind: "line", line, comments });
    } else {
      const start = entry.start as number;
      const end = entry.end as number;
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) {
        throw new Error(
          `tour file ${sourcePath}: annotation on "${path}" has invalid start/end (${start}..${end})`
        );
      }
      out.push({ kind: "range", start, end, comments });
    }
  }
  return out;
}

function parseComments(
  entry: Record<string, unknown>,
  path: string,
  sourcePath: string
): Comment[] {
  const hasNote = typeof entry.note === "string";
  const hasThread = Array.isArray(entry.thread);
  if (hasNote && hasThread) {
    throw new Error(
      `tour file ${sourcePath}: annotation on "${path}" cannot have both "note" and "thread"`
    );
  }
  if (!hasNote && !hasThread) {
    throw new Error(
      `tour file ${sourcePath}: annotation on "${path}" must have a "note" or a "thread"`
    );
  }

  if (hasNote) {
    const body = (entry.note as string).trim();
    if (!body) {
      throw new Error(
        `tour file ${sourcePath}: annotation on "${path}" has an empty "note"`
      );
    }
    return [{ author: "agent", body }];
  }

  const thread = entry.thread as unknown[];
  if (thread.length === 0) {
    throw new Error(
      `tour file ${sourcePath}: annotation on "${path}" has an empty "thread"`
    );
  }

  const comments: Comment[] = [];
  for (let i = 0; i < thread.length; i++) {
    const c = thread[i];
    if (typeof c === "string") {
      const body = c.trim();
      if (!body) {
        throw new Error(
          `tour file ${sourcePath}: thread entry ${i} on "${path}" is empty`
        );
      }
      comments.push({ author: "agent", body });
      continue;
    }
    if (!isRecord(c)) {
      throw new Error(
        `tour file ${sourcePath}: thread entry ${i} on "${path}" must be a string or { author, body } mapping`
      );
    }
    const body = typeof c.body === "string" ? c.body.trim() : "";
    if (!body) {
      throw new Error(
        `tour file ${sourcePath}: thread entry ${i} on "${path}" is missing "body"`
      );
    }
    const author =
      typeof c.author === "string" && c.author.trim()
        ? c.author.trim()
        : "agent";
    comments.push({ author, body });
  }
  return comments;
}

export type ContentLoader = (path: string) => Promise<string | null>;

export async function applyTour(
  payload: PRPayload,
  tour: Tour,
  loadContent: ContentLoader
): Promise<PRPayload> {
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

    const needsContent = entry.view === "content" || entry.annotations.length > 0;
    let content: string | null = null;
    if (needsContent) {
      try {
        content = await loadContent(entry.path);
      } catch (err) {
        warnings.push(
          `tour: failed to fetch content for "${entry.path}": ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    const resolved = resolveAnnotations(
      entry.annotations,
      entry.path,
      content,
      warnings
    );

    let view: FileView = entry.view;
    if (view === "content" && content === null) {
      warnings.push(
        `tour: "${entry.path}" requested view=content but content is unavailable; falling back to diff`
      );
      view = "diff";
    }

    tourOrdered.push({
      ...file,
      tourNote: entry.note || null,
      tourGroup: "tour",
      view,
      content,
      annotations: resolved,
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

function resolveAnnotations(
  annotations: TourAnnotation[],
  path: string,
  content: string | null,
  warnings: string[]
): Annotation[] {
  if (annotations.length === 0) return [];
  const lines = content === null ? null : content.split("\n");
  const out: Annotation[] = [];
  for (const a of annotations) {
    if (a.kind === "anchor") {
      if (!lines) {
        warnings.push(
          `tour: "${path}" has anchor "${a.anchor}" but file content is unavailable`
        );
        continue;
      }
      const idx = lines.findIndex((l) => l.includes(a.anchor));
      if (idx < 0) {
        warnings.push(
          `tour: "${path}" anchor "${a.anchor}" not found in file`
        );
        continue;
      }
      out.push({ lineStart: idx + 1, lineEnd: idx + 1, comments: a.comments });
    } else if (a.kind === "line") {
      if (lines && a.line > lines.length) {
        warnings.push(
          `tour: "${path}" annotation line ${a.line} is past end of file (${lines.length} lines)`
        );
        continue;
      }
      out.push({ lineStart: a.line, lineEnd: a.line, comments: a.comments });
    } else {
      if (lines && a.end > lines.length) {
        warnings.push(
          `tour: "${path}" annotation end ${a.end} is past end of file (${lines.length} lines)`
        );
        continue;
      }
      out.push({ lineStart: a.start, lineEnd: a.end, comments: a.comments });
    }
  }
  return out;
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
