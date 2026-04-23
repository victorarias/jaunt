import type { PRPayload, PRRef } from "./types.ts";
import type { Tour, TourAnnotation, TourFileEntry } from "./tour.ts";
import { loadTour, resolveTourPath } from "./tour.ts";
import { createContentResolver, type RemoteFetch } from "./content.ts";

export type ValidateReport = {
  guidePath: string;
  errors: string[];
  warnings: string[];
};

export type ValidateDeps = {
  fetchPR: (ref: PRRef) => Promise<PRPayload>;
  fetchFileContent: RemoteFetch;
};

/**
 * Validate a `.pr-tour-guide.yml` against either just its schema (offline)
 * or against the live PR (paths + anchors + line ranges).
 *
 * Schema errors propagate as thrown exceptions from `loadTour`. This function
 * catches them and converts to a report, so callers get a uniform shape.
 */
export async function validateTour(opts: {
  guidePath: string;
  ref: PRRef | null;
  deps: ValidateDeps | null;
}): Promise<ValidateReport> {
  const report: ValidateReport = {
    guidePath: opts.guidePath,
    errors: [],
    warnings: [],
  };

  let tour: Tour;
  try {
    tour = await loadTour(opts.guidePath);
  } catch (err) {
    report.errors.push(err instanceof Error ? err.message : String(err));
    return report;
  }

  // Per-annotation sanity (independent of PR state).
  for (const f of tour.files) {
    for (const a of f.annotations) {
      if (a.kind === "anchor" && a.anchor.length < 3) {
        report.warnings.push(
          `"${f.path}": anchor "${a.anchor}" is very short (${a.anchor.length} chars); consider something more distinctive`,
        );
      }
    }
  }

  // Overlap checks: same path appearing in both `files` and `skip`.
  const filePaths = new Set(tour.files.map((f) => f.path));
  for (const skipPath of tour.skip) {
    if (filePaths.has(skipPath)) {
      report.errors.push(
        `"${skipPath}" appears in both files and skip — pick one`,
      );
    }
  }

  // Duplicate file entries.
  const seen = new Set<string>();
  for (const f of tour.files) {
    if (seen.has(f.path)) {
      report.errors.push(`duplicate "files" entry for "${f.path}"`);
    }
    seen.add(f.path);
  }

  if (!opts.ref || !opts.deps) {
    // Offline: schema + guide-internal checks are all we can do.
    return report;
  }

  await validateAgainstPR(tour, opts.ref, opts.deps, report);
  return report;
}

async function validateAgainstPR(
  tour: Tour,
  ref: PRRef,
  deps: ValidateDeps,
  report: ValidateReport,
): Promise<void> {
  let payload: PRPayload;
  try {
    payload = await deps.fetchPR(ref);
  } catch (err) {
    report.errors.push(
      `failed to fetch PR ${ref.owner}/${ref.repo}#${ref.number}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return;
  }

  const prFiles = new Set(payload.files.map((f) => f.path));
  const blobShaByPath = new Map<string, string | null>(
    payload.files.map((f) => [f.path, f.blobSha]),
  );
  const resolve = createContentResolver({
    ref,
    headSha: payload.meta.headSha,
    cwd: process.cwd(),
    blobShaByPath,
    remoteFetch: deps.fetchFileContent,
  });

  for (const entry of tour.files) {
    if (!prFiles.has(entry.path)) {
      report.errors.push(
        `"${entry.path}": not in PR file list (paths in the guide must match the PR's changed files)`,
      );
    }
  }
  for (const path of tour.skip) {
    if (!prFiles.has(path)) {
      report.warnings.push(
        `skip: "${path}" is not in the PR file list (will be ignored by the app; remove it)`,
      );
    }
  }

  // For every entry that exists in the PR and has annotations or view=content,
  // fetch content and check each annotation.
  for (const entry of tour.files) {
    if (!prFiles.has(entry.path)) continue;

    const needsContent =
      entry.view === "content" || entry.annotations.length > 0;
    if (!needsContent) continue;

    let res;
    try {
      res = await resolve(entry.path);
    } catch (err) {
      report.errors.push(
        `"${entry.path}": failed to fetch content (${err instanceof Error ? err.message : String(err)}) — the app won't be able to resolve anchors`,
      );
      continue;
    }

    if (!res.ok) {
      if (entry.annotations.length > 0) {
        // Anchors can't resolve without content — hard error.
        report.errors.push(
          `"${entry.path}": has ${entry.annotations.length} annotation(s) but content unavailable (${res.reason}) — anchors will not resolve at runtime.`,
        );
      } else if (entry.view === "content") {
        // view=content with no annotations means the app falls back to diff —
        // annoying but not broken. Warn.
        report.warnings.push(
          `"${entry.path}": view=content requested but content unavailable (${res.reason}) — app will fall back to diff`,
        );
      }
      continue;
    }

    checkAnnotations(entry, res.content, report);
  }
}

function checkAnnotations(
  entry: TourFileEntry,
  content: string,
  report: ValidateReport,
): void {
  const lines = content.split("\n");

  for (let i = 0; i < entry.annotations.length; i++) {
    const a = entry.annotations[i]!;
    const label = `"${entry.path}" annotation[${i}]`;

    if (a.kind === "anchor") {
      checkAnchor(label, a, lines, report);
    } else if (a.kind === "line") {
      if (a.line > lines.length) {
        report.errors.push(
          `${label}: line ${a.line} is past end of file (${lines.length} lines)`,
        );
      }
    } else {
      if (a.end > lines.length) {
        report.errors.push(
          `${label}: end ${a.end} is past end of file (${lines.length} lines)`,
        );
      }
    }
  }
}

function checkAnchor(
  label: string,
  a: Extract<TourAnnotation, { kind: "anchor" }>,
  lines: string[],
  report: ValidateReport,
): void {
  const matches: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]!.includes(a.anchor)) matches.push(i + 1);
    if (matches.length > 4) break; // cap — we only need to know "more than one"
  }

  if (matches.length === 0) {
    report.errors.push(
      `${label}: anchor ${JSON.stringify(a.anchor)} not found in file`,
    );
    return;
  }

  if (matches.length > 1) {
    const shown = matches.slice(0, 3).join(", ");
    const extra = matches.length > 3 ? ` (and more)` : "";
    report.warnings.push(
      `${label}: anchor ${JSON.stringify(a.anchor)} is ambiguous — matches lines ${shown}${extra}. The app pins to line ${matches[0]}. Lengthen the anchor if that's wrong.`,
    );
  }
}

export async function resolveGuidePath(
  explicit: string | undefined,
  cwd: string,
): Promise<string | null> {
  return resolveTourPath(explicit, cwd);
}
