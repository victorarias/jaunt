import { homedir } from "node:os";
import { join } from "node:path";
import { appendFile, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import type {
  AgentTranscript,
  PRRef,
  SubmitIntent,
  TranscriptEntry,
} from "./types.ts";

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

/**
 * Reads both the feedback file (questions only) and the agent reply file,
 * merges them into a single chronological transcript. Used by the web UI to
 * render the back-and-forth as a chat. Empty files (or missing files) yield
 * an empty transcript — the panel hides itself in that case.
 */
export async function readAgentTranscript(
  ref: PRRef,
  dir: string = FEEDBACK_DIR,
): Promise<AgentTranscript> {
  const arPath = agentRepliesPath(ref, dir);
  const [feedback, replies] = await Promise.all([
    readMaybe(feedbackPath(ref, dir)),
    readMaybe(arPath),
  ]);

  const entries: TranscriptEntry[] = [];
  for (const s of parseSections(feedback)) {
    if (s.kind === "question") entries.push({ role: "user", body: s.body, at: s.at });
  }
  for (const s of parseSections(replies)) {
    if (s.kind === "agent reply") entries.push({ role: "agent", body: s.body, at: s.at });
  }
  entries.sort((a, b) => a.at.localeCompare(b.at));

  return {
    path: arPath,
    entries,
    updatedAt: entries.at(-1)?.at ?? null,
  };
}

async function readMaybe(path: string): Promise<string> {
  try {
    return await readFile(path, "utf-8");
  } catch (err) {
    if ((err as { code?: unknown }).code === "ENOENT") return "";
    throw err;
  }
}

type ParsedSection = { kind: string; at: string; body: string };

// Whitelist the section kinds we know about so a stray `## ` inside a
// question or reply body cannot split a section in two.
const SECTION_HEADER_RE =
  /^## (question|submission|final submission|agent reply) · (\S+)\s*$/gm;

function parseSections(content: string): ParsedSection[] {
  if (!content) return [];
  const hits: { kind: string; at: string; idx: number; end: number }[] = [];
  SECTION_HEADER_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = SECTION_HEADER_RE.exec(content)) !== null) {
    const [whole, kind, at] = m;
    if (!kind || !at) continue;
    hits.push({ kind, at, idx: m.index, end: m.index + whole.length });
  }
  return hits.map((h, i) => {
    const next = hits[i + 1];
    const raw = content.slice(h.end, next ? next.idx : content.length);
    // Strip leading newline(s), trailing newline(s), and any trailing `---`
    // separator left behind by appendFile in writeAgentReply / writeFeedback.
    const body = raw.replace(/^\s*\n/, "").replace(/\n\s*---\s*\n?$/, "").trimEnd();
    return { kind: h.kind, at: h.at, body };
  });
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
