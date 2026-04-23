import { $ } from "bun";
import type {
  DiffHunk,
  DiffLine,
  FileStatus,
  PRFile,
  PRMeta,
  PRPayload,
  PRRef,
} from "./types.ts";

type ApiFile = {
  sha: string;
  filename: string;
  previous_filename?: string;
  status: "added" | "modified" | "removed" | "renamed" | "copied" | "changed" | "unchanged";
  additions: number;
  deletions: number;
  patch?: string;
};

export async function fetchPR(ref: PRRef): Promise<PRPayload> {
  const slug = `${ref.owner}/${ref.repo}`;

  const metaResp = await $`gh pr view ${ref.number} --repo ${slug} --json title,body,headRefName,baseRefName,headRefOid,url,author`
    .quiet()
    .json();

  const meta: PRMeta = {
    ref,
    title: metaResp.title,
    body: metaResp.body ?? "",
    headRef: metaResp.headRefName,
    baseRef: metaResp.baseRefName,
    headSha: metaResp.headRefOid,
    url: metaResp.url,
    author: metaResp.author?.login ?? "unknown",
  };

  const apiFiles =
    (await $`gh api --paginate /repos/${slug}/pulls/${ref.number}/files`.quiet().json()) as ApiFile[];

  const files: PRFile[] = apiFiles.map((f): PRFile => ({
    path: f.filename,
    oldPath: f.previous_filename ?? null,
    blobSha: f.sha ?? null,
    status: mapStatus(f.status),
    additions: f.additions,
    deletions: f.deletions,
    hunks: f.patch ? parseHunks(f.patch) : [],
    binary: !f.patch && (f.additions > 0 || f.deletions > 0),
    language: inferLanguage(f.filename),
    tourNote: null,
    tourGroup: "other",
    view: "diff",
    content: null,
    annotations: [],
  }));

  return { meta, files, tour: null };
}

function mapStatus(s: ApiFile["status"]): FileStatus {
  if (s === "added") return "added";
  if (s === "removed") return "deleted";
  if (s === "renamed") return "renamed";
  return "modified";
}

function parseHunks(patch: string): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  const lines = patch.split("\n");
  let current: DiffHunk | null = null;
  let oldLn = 0;
  let newLn = 0;

  for (const raw of lines) {
    const headerMatch = raw.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/);
    if (headerMatch) {
      const oldStart = Number.parseInt(headerMatch[1]!, 10);
      const oldLines = headerMatch[2] ? Number.parseInt(headerMatch[2], 10) : 1;
      const newStart = Number.parseInt(headerMatch[3]!, 10);
      const newLines = headerMatch[4] ? Number.parseInt(headerMatch[4], 10) : 1;
      current = {
        oldStart,
        oldLines,
        newStart,
        newLines,
        header: (headerMatch[5] ?? "").trim(),
        lines: [],
      };
      hunks.push(current);
      oldLn = oldStart;
      newLn = newStart;
      continue;
    }
    if (!current) continue;

    const marker = raw[0];
    const content = raw.slice(1);
    let line: DiffLine | null = null;
    if (marker === "+") {
      line = { type: "add", oldNumber: null, newNumber: newLn++, content };
    } else if (marker === "-") {
      line = { type: "del", oldNumber: oldLn++, newNumber: null, content };
    } else if (marker === " ") {
      line = {
        type: "context",
        oldNumber: oldLn++,
        newNumber: newLn++,
        content,
      };
    } else if (marker === "\\") {
      // "\ No newline at end of file" — ignore
      continue;
    } else if (raw === "") {
      // trailing blank line between hunks / end of patch
      continue;
    }
    if (line) current.lines.push(line);
  }

  return hunks;
}

const EXT_TO_LANG: Record<string, string> = {
  ts: "typescript",
  tsx: "tsx",
  js: "javascript",
  jsx: "jsx",
  mjs: "javascript",
  cjs: "javascript",
  go: "go",
  py: "python",
  rs: "rust",
  java: "java",
  kt: "kotlin",
  rb: "ruby",
  php: "php",
  c: "c",
  h: "c",
  cpp: "cpp",
  hpp: "cpp",
  cc: "cpp",
  cs: "csharp",
  swift: "swift",
  md: "markdown",
  mdx: "mdx",
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  fish: "bash",
  sql: "sql",
  html: "html",
  css: "css",
  scss: "scss",
  less: "less",
  proto: "proto",
  ini: "ini",
  xml: "xml",
};

function inferLanguage(path: string): string | null {
  const lower = path.toLowerCase();
  const base = lower.split("/").pop() ?? lower;
  if (base === "dockerfile") return "docker";
  if (base === "makefile") return "makefile";
  const ext = base.includes(".") ? base.split(".").pop() : null;
  if (!ext) return null;
  return EXT_TO_LANG[ext] ?? null;
}

export function parsePRRef(
  input: string,
  fallback?: { owner: string; repo: string }
): PRRef | null {
  const trimmed = input.trim();

  const urlMatch = trimmed.match(
    /github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/
  );
  if (urlMatch) {
    return {
      owner: urlMatch[1]!,
      repo: urlMatch[2]!,
      number: Number.parseInt(urlMatch[3]!, 10),
    };
  }

  const ownerRepoMatch = trimmed.match(/^([^/]+)\/([^/#]+)[#/](\d+)$/);
  if (ownerRepoMatch) {
    return {
      owner: ownerRepoMatch[1]!,
      repo: ownerRepoMatch[2]!,
      number: Number.parseInt(ownerRepoMatch[3]!, 10),
    };
  }

  const numMatch = trimmed.match(/^#?(\d+)$/);
  if (numMatch && fallback) {
    return { ...fallback, number: Number.parseInt(numMatch[1]!, 10) };
  }

  return null;
}

export async function getCurrentRepo(): Promise<{
  owner: string;
  repo: string;
} | null> {
  try {
    const out = await $`gh repo view --json nameWithOwner`.quiet().json();
    const nameWithOwner = out?.nameWithOwner as string | undefined;
    if (!nameWithOwner) return null;
    const [owner, repo] = nameWithOwner.split("/");
    if (!owner || !repo) return null;
    return { owner, repo };
  } catch {
    return null;
  }
}

export async function submitReviewComment(
  ref: PRRef,
  body: string
): Promise<string> {
  const slug = `${ref.owner}/${ref.repo}`;
  await $`gh pr review ${ref.number} --repo ${slug} --comment --body ${body}`.quiet();
  return `https://github.com/${slug}/pull/${ref.number}`;
}

export async function fetchFileContent(
  ref: PRRef,
  sha: string,
  path: string,
  blobSha?: string | null,
): Promise<string | null> {
  const slug = `${ref.owner}/${ref.repo}`;
  // Try the contents API first — cheap, serves raw bytes directly. But it
  // hard-caps at 1MB, so large files (long generated components, plan docs
  // with giant code blocks, etc.) get a 403 and we fall through.
  let contentsErr: string | null = null;
  try {
    const apiPath = `/repos/${slug}/contents/${path}?ref=${sha}`;
    const result = await $`gh api ${apiPath} -H ${"Accept: application/vnd.github.raw"}`.quiet();
    return result.stdout.toString("utf-8");
  } catch (err) {
    contentsErr = describeFetchError(err);
  }

  // Fallback: Git blobs API via the blob sha carried on the PR-files entry.
  // No 1MB cap — handles large files. Returns base64 JSON; decode ourselves.
  if (!blobSha) {
    logFetchFailure(path, contentsErr, "no blob sha on the PR-files entry");
    return null;
  }
  let blobErr: string | null = null;
  try {
    const blob = (await $`gh api /repos/${slug}/git/blobs/${blobSha}`
      .quiet()
      .json()) as { content?: string; encoding?: string };
    if (blob.encoding === "base64" && typeof blob.content === "string") {
      return Buffer.from(blob.content, "base64").toString("utf-8");
    }
    blobErr = `unexpected blob response (encoding=${String(blob.encoding)}, content=${typeof blob.content})`;
  } catch (err) {
    blobErr = describeFetchError(err);
  }

  logFetchFailure(path, contentsErr, blobErr);
  return null;
}

function describeFetchError(err: unknown): string {
  // Bun's $ throws a ShellError with stderr/stdout/exitCode fields. We want
  // the stderr text (gh's error message) when available, otherwise fall back
  // to the generic message. Keep it single-line so it logs cleanly.
  if (typeof err === "object" && err !== null) {
    const e = err as {
      stderr?: unknown;
      exitCode?: number;
      message?: string;
    };
    const stderrBuf = e.stderr;
    let stderrText = "";
    if (typeof stderrBuf === "string") stderrText = stderrBuf;
    else if (stderrBuf && typeof (stderrBuf as Buffer).toString === "function") {
      stderrText = (stderrBuf as Buffer).toString("utf-8");
    }
    const trimmed = stderrText.trim().replace(/\s+/g, " ");
    if (trimmed) return `exit ${e.exitCode ?? "?"}: ${trimmed}`;
    if (e.message) return e.message;
  }
  return err instanceof Error ? err.message : String(err);
}

function logFetchFailure(
  path: string,
  contentsErr: string | null,
  blobErr: string | null,
): void {
  // Surface both error messages on stderr so a user looking at the pr-tour
  // process output can see *what* gh actually said — the swallowed errors
  // used to silently turn into "file content unavailable" warnings in the
  // sidebar, with no diagnostic trail. Goes to stderr so it doesn't fight
  // the LISTENING/submit sentinel lines the CLI prints to stdout.
  const parts = [`pr-tour: fetchFileContent failed for "${path}"`];
  if (contentsErr) parts.push(`  contents API: ${contentsErr}`);
  if (blobErr) parts.push(`  blob API:     ${blobErr}`);
  console.error(parts.join("\n"));
}
