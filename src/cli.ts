#!/usr/bin/env bun
import { copyFile, mkdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  fetchFileContent,
  fetchPR,
  getCurrentRepo,
  parsePRRef,
  submitReviewComment,
} from "./gh.ts";
import { clearDraft, loadDraft, saveDraft } from "./drafts.ts";
import { writeFeedback } from "./feedback.ts";
import type { ApiDeps } from "./api-handlers.ts";
import { startServer } from "./server.ts";
import { loadTour, resolveTourPath, type Tour } from "./tour.ts";

type ParsedArgs = {
  prRef: string | null;
  guide: string | undefined;
  noGuide: boolean;
  host: boolean;
};

async function main() {
  const raw = process.argv.slice(2);

  if (raw[0] === "install-skill") {
    await installSkill(raw.slice(1));
    return;
  }

  const args = parseArgs(raw);
  const host = args.host;

  if (!args.prRef) {
    printUsage();
    process.exit(1);
  }

  const fallback = await getCurrentRepo();
  const ref = parsePRRef(args.prRef, fallback ?? undefined);
  if (!ref) {
    console.error(
      `pr-tour: cannot resolve PR reference from "${args.prRef}"\n` +
        `  try: pr-tour 349   (from inside a repo gh knows)\n` +
        `  or:  pr-tour owner/repo#349\n` +
        `  or:  pr-tour https://github.com/owner/repo/pull/349`
    );
    process.exit(1);
  }

  let tour: Tour | null = null;
  let tourSource: string | null = null;
  if (!args.noGuide) {
    const tourPath = await resolveTourPath(args.guide, process.cwd());
    if (tourPath) {
      try {
        tour = await loadTour(tourPath);
        tourSource = tourPath;
      } catch (err) {
        console.error(
          `pr-tour: failed to load tour file: ${err instanceof Error ? err.message : String(err)}`
        );
        process.exit(1);
      }
    } else if (args.guide) {
      console.error(`pr-tour: tour file not found: ${args.guide}`);
      process.exit(1);
    }
  }

  console.log(
    `\x1b[2mpr-tour\x1b[0m \x1b[36m${ref.owner}/${ref.repo}\x1b[0m#\x1b[1m${ref.number}\x1b[0m`
  );
  if (tourSource) {
    console.log(`\x1b[2m  tour:\x1b[0m ${tourSource}`);
  }

  const deps: ApiDeps = {
    fetchPR,
    fetchFileContent,
    submitReviewComment,
    writeFeedback,
    loadDraft,
    saveDraft,
    clearDraft,
  };

  const handle = await startServer({
    ref,
    tour,
    deps,
    open: !process.env.PR_TOUR_NO_OPEN && !host,
    host,
  });
  handle.viteServer.printUrls();
  console.log("\x1b[2m(Ctrl-C to stop)\x1b[0m");
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = { prRef: null, guide: undefined, noGuide: false, host: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "-h" || a === "--help") {
      printUsage();
      process.exit(0);
    }
    if (a === "--no-guide") {
      out.noGuide = true;
      continue;
    }
    if (a === "--host") {
      out.host = true;
      continue;
    }
    if (a === "--guide") {
      const next = argv[++i];
      if (!next) {
        console.error("pr-tour: --guide requires a path argument");
        process.exit(1);
      }
      out.guide = next;
      continue;
    }
    if (a.startsWith("--guide=")) {
      out.guide = a.slice("--guide=".length);
      continue;
    }
    if (!out.prRef && !a.startsWith("-")) {
      out.prRef = a;
      continue;
    }
  }
  return out;
}

function printUsage() {
  console.log(
    "usage: pr-tour <pr-ref> [--guide <path>] [--no-guide] [--host]\n" +
      "       pr-tour install-skill [--force]\n" +
      "\n" +
      "  <pr-ref> is one of:\n" +
      "    349                            (number; uses current gh repo)\n" +
      "    owner/repo#349\n" +
      "    owner/repo/349\n" +
      "    https://github.com/.../pull/349\n" +
      "\n" +
      "  tour guide:\n" +
      "    auto-loads .pr-tour-guide.yml (or .yaml) from cwd if present\n" +
      "    --guide <path>   use an explicit tour file\n" +
      "    --no-guide       ignore any tour file, show files alphabetically\n" +
      "\n" +
      "  network:\n" +
      "    --host           bind to all interfaces (for remote-dev access)\n" +
      "\n" +
      "  install-skill:\n" +
      "    copies skill/SKILL.md → ~/.claude/skills/pr-tour/SKILL.md\n" +
      "    so Claude Code picks up the /pr-tour skill.\n" +
      "    --force          overwrite an existing installation"
  );
}

async function installSkill(args: string[]) {
  const force = args.includes("--force") || args.includes("-f");
  if (args.some((a) => a !== "--force" && a !== "-f")) {
    console.error(
      "pr-tour install-skill: unexpected argument(s): " +
        args.filter((a) => a !== "--force" && a !== "-f").join(" "),
    );
    process.exit(1);
  }

  const here = dirname(fileURLToPath(import.meta.url));
  const src = resolve(here, "..", "skill", "SKILL.md");
  const destDir = join(homedir(), ".claude", "skills", "pr-tour");
  const dest = join(destDir, "SKILL.md");

  try {
    await stat(src);
  } catch {
    console.error(`pr-tour install-skill: source not found at ${src}`);
    process.exit(1);
  }

  let existed = false;
  try {
    await stat(dest);
    existed = true;
  } catch {
    // absent — will install fresh
  }

  if (existed && !force) {
    console.error(
      `pr-tour install-skill: ${dest} already exists.\n` +
        `  re-run with --force to overwrite.`,
    );
    process.exit(1);
  }

  await mkdir(destDir, { recursive: true });
  await copyFile(src, dest);

  const verb = existed ? "updated" : "installed";
  console.log(`pr-tour: ${verb} skill → ${dest}`);
  console.log(
    "  Claude Code will pick it up on the next session.\n" +
      "  Use it by asking for a PR tour, or type /pr-tour.",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
