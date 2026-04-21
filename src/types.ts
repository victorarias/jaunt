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

export type PRFile = {
  path: string;
  oldPath: string | null;
  status: FileStatus;
  additions: number;
  deletions: number;
  hunks: DiffHunk[];
  binary: boolean;
  language: string | null;
};

export type PRPayload = {
  meta: PRMeta;
  files: PRFile[];
};

export type FileDraft = {
  reviewed: boolean;
  note: string;
};

export type Draft = {
  ref: PRRef;
  overallBody: string;
  fileStates: Record<string, FileDraft>;
  updatedAt: string;
};

export type SubmitResult = {
  ok: true;
  url: string;
} | {
  ok: false;
  error: string;
};
