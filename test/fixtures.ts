import type {
  Annotation,
  Draft,
  PRFile,
  PRMeta,
  PRPayload,
  PRRef,
  TourMeta,
} from "../src/types.ts";

export const sampleRef: PRRef = {
  owner: "acme",
  repo: "edge-api",
  number: 4821,
};

export function makeMeta(overrides: Partial<PRMeta> = {}): PRMeta {
  return {
    ref: sampleRef,
    title: "refactor: extract rate-limiter",
    body: "Pulls an inline rate-limiter out of auth.ts.",
    headRef: "agent/rate-limit-middleware",
    baseRef: "main",
    headSha: "deadbeef",
    url: `https://github.com/${sampleRef.owner}/${sampleRef.repo}/pull/${sampleRef.number}`,
    author: "claude[bot]",
    ...overrides,
  };
}

export function makeAnnotation(
  lineStart: number,
  comments: Annotation["comments"],
  lineEnd: number = lineStart,
): Annotation {
  return { lineStart, lineEnd, comments };
}

export function makeFile(overrides: Partial<PRFile> = {}): PRFile {
  return {
    path: "src/middleware/rateLimit.ts",
    oldPath: null,
    status: "added",
    additions: 10,
    deletions: 0,
    hunks: [],
    binary: false,
    language: "typescript",
    tourNote: null,
    tourGroup: "other",
    view: "diff",
    content: null,
    annotations: [],
    ...overrides,
  };
}

export function makePayload(overrides: Partial<PRPayload> = {}): PRPayload {
  return {
    meta: makeMeta(),
    files: [makeFile()],
    tour: null,
    ...overrides,
  };
}

export function makeTour(overrides: Partial<TourMeta> = {}): TourMeta {
  return { summary: "", warnings: [], ...overrides };
}

export function makeDraft(overrides: Partial<Draft> = {}): Draft {
  return {
    ref: sampleRef,
    overallBody: "",
    fileStates: {},
    updatedAt: new Date("2026-04-21T12:00:00Z").toISOString(),
    ...overrides,
  };
}
