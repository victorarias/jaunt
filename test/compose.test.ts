import { describe, expect, test } from "bun:test";
import { composeReviewBody } from "../src/compose.ts";
import { makeAnnotation, makeDraft, makeFile } from "./fixtures.ts";

describe("composeReviewBody", () => {
  test("includes verdict header for each verdict", () => {
    const d = makeDraft();
    const f = [makeFile()];
    expect(composeReviewBody("approve", "", d, f)).toStartWith("**Approve**");
    expect(composeReviewBody("comment", "", d, f)).toStartWith("**Comment**");
    expect(composeReviewBody("request_changes", "", d, f)).toStartWith(
      "**Request changes**",
    );
  });

  test("summary comment wins over draft.overallBody", () => {
    const d = makeDraft({ overallBody: "from draft" });
    const body = composeReviewBody("comment", "from modal", d, [makeFile()]);
    expect(body).toContain("from modal");
    expect(body).not.toContain("from draft");
  });

  test("falls back to draft.overallBody when modal body is empty", () => {
    const d = makeDraft({ overallBody: "draft overall" });
    const body = composeReviewBody("comment", "   ", d, [makeFile()]);
    expect(body).toContain("draft overall");
  });

  test("includes per-file notes under a Notes-by-file section", () => {
    const file = makeFile({ path: "src/a.ts" });
    const d = makeDraft({
      fileStates: {
        "src/a.ts": {
          reviewed: true,
          note: "tiny nit about naming",
          replies: {},
          lineComments: {},
        },
      },
    });
    const body = composeReviewBody("comment", "", d, [file]);
    expect(body).toContain("### Notes by file");
    expect(body).toContain("**src/a.ts**");
    expect(body).toContain("tiny nit about naming");
  });

  test("includes thread replies with line range", () => {
    const file = makeFile({
      path: "src/a.ts",
      annotations: [
        makeAnnotation(12, [{ author: "agent", body: "here's a comment" }]),
        makeAnnotation(
          20,
          [{ author: "agent", body: "another" }],
          /* lineEnd */ 25,
        ),
      ],
    });
    const d = makeDraft({
      fileStates: {
        "src/a.ts": {
          reviewed: true,
          note: "",
          replies: { "0": "reply to 12", "1": "reply to range" },
          lineComments: {},
        },
      },
    });
    const body = composeReviewBody("comment", "", d, [file]);
    expect(body).toContain("_on line 12:_");
    expect(body).toContain("reply to 12");
    expect(body).toContain("_on lines 20–25:_");
    expect(body).toContain("reply to range");
  });

  test("skips empty replies and replies pointing at missing annotations", () => {
    const file = makeFile({
      path: "src/a.ts",
      annotations: [makeAnnotation(5, [{ author: "agent", body: "c" }])],
    });
    const d = makeDraft({
      fileStates: {
        "src/a.ts": {
          reviewed: false,
          note: "",
          replies: { "0": "  ", "9": "orphan" },
          lineComments: {},
        },
      },
    });
    const body = composeReviewBody("approve", "", d, [file]);
    expect(body).not.toContain("_on line");
    expect(body).not.toContain("orphan");
    // When no per-file sections remain, the Notes-by-file block is omitted.
    expect(body).not.toContain("### Notes by file");
  });

  test("includes reviewer-authored line comments sorted by line number", () => {
    const file = makeFile({ path: "src/a.ts" });
    const d = makeDraft({
      fileStates: {
        "src/a.ts": {
          reviewed: true,
          note: "overall thought",
          replies: {},
          lineComments: {
            "42": "thought on line 42",
            "7": "thought on line 7",
            "100": "   ",
          },
        },
      },
    });
    const body = composeReviewBody("comment", "", d, [file]);
    expect(body).toContain("**src/a.ts**");
    expect(body).toContain("overall thought");
    expect(body).toContain("_on line 7:_\n\nthought on line 7");
    expect(body).toContain("_on line 42:_\n\nthought on line 42");
    // Line 7 section comes before line 42 section.
    expect(body.indexOf("_on line 7:_")).toBeLessThan(
      body.indexOf("_on line 42:_"),
    );
    // Whitespace-only comments are skipped.
    expect(body).not.toContain("_on line 100:_");
  });

  test("emits a file section with only line comments even if note+replies are empty", () => {
    const file = makeFile({ path: "src/a.ts" });
    const d = makeDraft({
      fileStates: {
        "src/a.ts": {
          reviewed: false,
          note: "",
          replies: {},
          lineComments: { "3": "single observation" },
        },
      },
    });
    const body = composeReviewBody("comment", "", d, [file]);
    expect(body).toContain("**src/a.ts**");
    expect(body).toContain("_on line 3:_\n\nsingle observation");
  });

  test("omits Notes-by-file when no files have content", () => {
    const body = composeReviewBody("approve", "LGTM", makeDraft(), [makeFile()]);
    expect(body).toBe("**Approve**\n\nLGTM");
  });
});
