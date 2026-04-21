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
    status: mapStatus(f.status),
    additions: f.additions,
    deletions: f.deletions,
    hunks: f.patch ? parseHunks(f.patch) : [],
    binary: !f.patch && (f.additions > 0 || f.deletions > 0),
    language: inferLanguage(f.filename),
  }));

  return { meta, files };
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
