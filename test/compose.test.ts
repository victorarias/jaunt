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
        },
      },
    });
    const body = composeReviewBody("approve", "", d, [file]);
    expect(body).not.toContain("_on line");
    expect(body).not.toContain("orphan");
    // When no per-file sections remain, the Notes-by-file block is omitted.
    expect(body).not.toContain("### Notes by file");
  });

  test("omits Notes-by-file when no files have content", () => {
    const body = composeReviewBody("approve", "LGTM", makeDraft(), [makeFile()]);
    expect(body).toBe("**Approve**\n\nLGTM");
  });
});
