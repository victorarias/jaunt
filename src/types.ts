export type PRRef = {
  owner: string;
  repo: string;
  number: number;
};

export type PRMeta = {
  ref: PRRef;
  title: string;
  body: string;
  headRef: string;
  baseRef: string;
  headSha: string;
  url: string;
  author: string;
};

export type DiffLineType = "add" | "del" | "context";

export type DiffLine = {
  type: DiffLineType;
  oldNumber: number | null;
  newNumber: number | null;
  content: string;
};

export type DiffHunk = {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  header: string;
  lines: DiffLine[];
};

export type FileStatus = "added" | "modified" | "deleted" | "renamed";

export type FileView = "diff" | "content";

export type Comment = {
  author: string;
  body: string;
};

export type Annotation = {
  lineStart: number;
  lineEnd: number;
  comments: Comment[];
};

export type PRFile = {
  path: string;
  oldPath: string | null;
  /** Blob SHA of the file at the PR head — used as fallback when the 1MB contents API refuses. */
  blobSha: string | null;
  status: FileStatus;
  additions: number;
  deletions: number;
  hunks: DiffHunk[];
  binary: boolean;
  language: string | null;
  tourNote: string | null;
  tourGroup: "tour" | "other" | "skip";
  view: FileView;
  content: string | null;
  annotations: Annotation[];
};

export type FileError = {
  path: string;
  reason: string;
};

export type TourMeta = {
  summary: string;
  warnings: string[];
  fileErrors: FileError[];
};

/**
 * Result of a content-fetch attempt. `ok: true` carries the file bytes;
 * `ok: false` carries a human-readable reason that gets surfaced in the
 * error banner. Kept as a discriminated union (not a nullable string) so
 * "content unavailable" always comes with an explanation.
 */
export type ContentResult =
  | { ok: true; content: string }
  | { ok: false; reason: string };

export type PRPayload = {
  meta: PRMeta;
  files: PRFile[];
  tour: TourMeta | null;
};

export type FileDraft = {
  reviewed: boolean;
  note: string;
  /** Per-annotation pending reply text. Key is the annotation's index in the file's annotations array. */
  replies: Record<string, string>;
  /** Reviewer-authored comments keyed by post-PR line number (stringified). */
  lineComments: Record<string, string>;
};

export type Draft = {
  ref: PRRef;
  overallBody: string;
  fileStates: Record<string, FileDraft>;
  updatedAt: string;
};

export type SubmitTarget = "github" | "agent";

/**
 * `finish` carries the user's "end review after this submit" toggle. When
 * true, the session is over: the server exits and the draft is cleared.
 * When false, the submit is an intermediate note — the server stays up,
 * the feedback file is appended-to, and the draft keeps reviewed marks
 * so the reviewer can keep going.
 */
export type SubmitResult =
  | { ok: true; target: "github"; url: string; finish: boolean }
  | { ok: true; target: "agent"; path: string; finish: boolean }
  | { ok: false; error: string };
