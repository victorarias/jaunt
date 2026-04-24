import { homedir } from "node:os";
import { join } from "node:path";
import { appendFile, mkdir, stat, writeFile } from "node:fs/promises";
import type { PRRef } from "./types.ts";

const FEEDBACK_DIR = join(homedir(), ".jaunt");

export function feedbackPath(ref: PRRef, dir: string = FEEDBACK_DIR): string {
  return join(dir, `${ref.owner}_${ref.repo}_${ref.number}.feedback.md`);
}

export type WriteFeedbackOptions = {
  /** Override the destination directory. Defaults to ~/.jaunt. */
  dir?: string;
  /** Override the timestamp used in the section header (useful for tests). */
  now?: Date;
  /**
   * True when this submit ends the review — recorded in the section header
   * so the reading agent can see the review arc (multiple intermediate
   * submissions, one final).
   */
  finish?: boolean;
};

/**
 * Writes a review submission to the feedback file. The first write for a
 * ref creates the file with a top-level header; subsequent writes append a
 * timestamped section. Keeping the file append-only lets the reviewer submit
 * notes multiple times without losing earlier rounds — the agent reads the
 * whole file once the server exits.
 */
export async function writeFeedback(
  ref: PRRef,
  body: string,
  options: WriteFeedbackOptions = {},
): Promise<string> {
  const dir = options.dir ?? FEEDBACK_DIR;
  const now = options.now ?? new Date();
  const finish = options.finish ?? false;
  const path = feedbackPath(ref, dir);
  await mkdir(dir, { recursive: true });

  const exists = await stat(path).then(() => true).catch(() => false);
  const sectionHeader =
    `## ${finish ? "final submission" : "submission"} · ${now.toISOString()}\n\n`;

  if (!exists) {
    const fileHeader = `# jaunt feedback · ${ref.owner}/${ref.repo}#${ref.number}\n\n`;
    await writeFile(path, fileHeader + sectionHeader + body + "\n", "utf-8");
  } else {
    await appendFile(path, "\n\n---\n\n" + sectionHeader + body + "\n", "utf-8");
  }
  return path;
}
