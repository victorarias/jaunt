import type { Draft, PRFile } from "./types.ts";

export type Verdict = "approve" | "comment" | "request_changes";

/**
 * Compose the GitHub review body (also used as the payload for the
 * "back to agent" feedback file). Includes:
 *   - verdict label header
 *   - summary comment (from the modal) or falls back to the draft's overallBody
 *   - per-file notes
 *   - per-annotation thread replies, quoted with their line range
 */
export function composeReviewBody(
  verdict: Verdict,
  body: string,
  draft: Draft,
  files: PRFile[],
): string {
  const parts: string[] = [];

  const verdictLabel =
    verdict === "approve"
      ? "**Approve**"
      : verdict === "request_changes"
        ? "**Request changes**"
        : "**Comment**";
  parts.push(verdictLabel);

  const summary = body.trim() || draft.overallBody.trim();
  if (summary) parts.push(summary);

  const perFile: string[] = [];
  for (const f of files) {
    const state = draft.fileStates[f.path];
    const note = state?.note.trim() ?? "";
    const replies = state?.replies ?? {};
    const lineComments = state?.lineComments ?? {};

    const sections: string[] = [];
    if (note) sections.push(note);

    for (const [idxStr, reply] of Object.entries(replies)) {
      const replyText = reply.trim();
      if (!replyText) continue;
      const idx = parseInt(idxStr, 10);
      const ann = f.annotations[idx];
      if (!ann) continue;
      const range =
        ann.lineStart === ann.lineEnd
          ? `line ${ann.lineStart}`
          : `lines ${ann.lineStart}–${ann.lineEnd}`;
      sections.push(`_on ${range}:_\n\n${replyText}`);
    }

    const sortedLines = Object.keys(lineComments)
      .map((k) => parseInt(k, 10))
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => a - b);
    for (const line of sortedLines) {
      const text = lineComments[String(line)]?.trim();
      if (!text) continue;
      sections.push(`_on line ${line}:_\n\n${text}`);
    }

    if (sections.length > 0) {
      perFile.push(`**${f.path}**\n\n${sections.join("\n\n")}`);
    }
  }
  if (perFile.length > 0) {
    parts.push("---\n\n### Notes by file\n\n" + perFile.join("\n\n"));
  }

  return parts.join("\n\n");
}
