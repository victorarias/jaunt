import { homedir } from "node:os";
import { join } from "node:path";
import { appendFile, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import type { AgentReplies, PRRef, SubmitIntent } from "./types.ts";

const FEEDBACK_DIR = join(homedir(), ".jaunt");

export function feedbackPath(ref: PRRef, dir: string = FEEDBACK_DIR): string {
  return join(dir, `${ref.owner}_${ref.repo}_${ref.number}.feedback.md`);
}

export function agentRepliesPath(
  ref: PRRef,
  dir: string = FEEDBACK_DIR,
): string {
  return join(dir, `${ref.owner}_${ref.repo}_${ref.number}.agent.md`);
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
  /** Distinguishes full review submissions from lightweight agent asks. */
  intent?: SubmitIntent;
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
  const intent = options.intent ?? "review";
  const path = feedbackPath(ref, dir);
  await mkdir(dir, { recursive: true });

  const exists = await stat(path).then(() => true).catch(() => false);
  const label =
    intent === "question"
      ? "question"
      : finish
        ? "final submission"
        : "submission";
  const sectionHeader = `## ${label} · ${now.toISOString()}\n\n`;

  if (!exists) {
    const fileHeader = `# jaunt feedback · ${ref.owner}/${ref.repo}#${ref.number}\n\n`;
    await writeFile(path, fileHeader + sectionHeader + body + "\n", "utf-8");
  } else {
    await appendFile(path, "\n\n---\n\n" + sectionHeader + body + "\n", "utf-8");
  }
  return path;
}

export async function readAgentReplies(
  ref: PRRef,
  dir: string = FEEDBACK_DIR,
): Promise<AgentReplies> {
  const path = agentRepliesPath(ref, dir);
  try {
    const [body, s] = await Promise.all([readFile(path, "utf-8"), stat(path)]);
    return {
      path,
      body,
      updatedAt: s.mtime.toISOString(),
    };
  } catch (err) {
    const code = (err as { code?: unknown }).code;
    if (code !== "ENOENT") throw err;
    return { path, body: "", updatedAt: null };
  }
}

export type WriteAgentReplyOptions = {
  /** Override the destination directory. Defaults to ~/.jaunt. */
  dir?: string;
  /** Override the timestamp used in the section header (useful for tests). */
  now?: Date;
};

export async function writeAgentReply(
  ref: PRRef,
  body: string,
  options: WriteAgentReplyOptions = {},
): Promise<string> {
  const dir = options.dir ?? FEEDBACK_DIR;
  const now = options.now ?? new Date();
  const path = agentRepliesPath(ref, dir);
  await mkdir(dir, { recursive: true });

  const exists = await stat(path).then(() => true).catch(() => false);
  const section = `## agent reply · ${now.toISOString()}\n\n${body}\n`;
  if (!exists) {
    const fileHeader = `# jaunt agent replies · ${ref.owner}/${ref.repo}#${ref.number}\n\n`;
    await writeFile(path, fileHeader + section, "utf-8");
  } else {
    await appendFile(path, "\n\n---\n\n" + section, "utf-8");
  }
  return path;
}

export async function clearAgentReplies(
  ref: PRRef,
  dir: string = FEEDBACK_DIR,
): Promise<void> {
  await rm(agentRepliesPath(ref, dir), { force: true });
}
