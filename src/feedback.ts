import { homedir } from "node:os";
import { join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import type { PRRef } from "./types.ts";

const FEEDBACK_DIR = join(homedir(), ".pr-tour");

export function feedbackPath(ref: PRRef, dir: string = FEEDBACK_DIR): string {
  return join(dir, `${ref.owner}_${ref.repo}_${ref.number}.feedback.md`);
}

export type WriteFeedbackOptions = {
  /** Override the destination directory. Defaults to ~/.pr-tour. */
  dir?: string;
  /** Override the timestamp used in the header (useful for tests). */
  now?: Date;
};

export async function writeFeedback(
  ref: PRRef,
  body: string,
  options: WriteFeedbackOptions = {},
): Promise<string> {
  const dir = options.dir ?? FEEDBACK_DIR;
  const now = options.now ?? new Date();
  const path = feedbackPath(ref, dir);
  await mkdir(dir, { recursive: true });
  const header =
    `# pr-tour feedback · ${ref.owner}/${ref.repo}#${ref.number}\n` +
    `_submitted ${now.toISOString()}_\n\n`;
  await writeFile(path, header + body, "utf-8");
  return path;
}
