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

export type TourMeta = {
  summary: string;
  warnings: string[];
};

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
};

export type Draft = {
  ref: PRRef;
  overallBody: string;
  fileStates: Record<string, FileDraft>;
  updatedAt: string;
};

export type SubmitTarget = "github" | "agent";

export type SubmitResult =
  | { ok: true; target: "github"; url: string }
  | { ok: true; target: "agent"; path: string }
  | { ok: false; error: string };
