export type {
  AgentReplies,
  Annotation,
  Comment,
  Draft,
  DiffHunk,
  DiffLine,
  DiffLineType,
  FileDraft,
  FileError,
  FileStatus,
  FileView,
  PRFile,
  PRMeta,
  PRPayload,
  PRRef,
  SubmitResult,
  SubmitTarget,
  TourMeta,
} from "../../src/types.ts";

export type AgentAskContext = {
  path: string;
  lineStart?: number;
  lineEnd?: number;
  code?: string;
  source: "quick" | "line-comment" | "annotation-reply";
};
