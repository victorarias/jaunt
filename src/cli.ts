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
import { validateTour } from "./validate.ts";

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

  if (raw[0] === "validate") {
    await validateCommand(raw.slice(1));
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
      "       pr-tour validate [path] [--pr <ref>] [--offline]\n" +
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
      "  validate:\n" +
      "    parses .pr-tour-guide.yml, checks paths + anchors against the PR.\n" +
      "    [path]           guide to validate (default: cwd's .pr-tour-guide.yml)\n" +
      "    --pr <ref>       PR to check against (default: current branch's PR)\n" +
      "    --offline        skip the gh fetch — schema-only checks\n" +
      "\n" +
      "  install-skill:\n" +
      "    copies skill/SKILL.md → ~/.claude/skills/pr-tour/SKILL.md\n" +
      "    so Claude Code picks up the /pr-tour skill.\n" +
      "    --force          overwrite an existing installation"
  );
}

async function validateCommand(args: string[]) {
  let explicitPath: string | undefined;
  let prRef: string | null = null;
  let offline = false;

  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "--offline") {
      offline = true;
      continue;
    }
    if (a === "--pr") {
      const next = args[++i];
      if (!next) {
        console.error("pr-tour validate: --pr requires a value");
        process.exit(1);
      }
      prRef = next;
      continue;
    }
    if (a.startsWith("--pr=")) {
      prRef = a.slice("--pr=".length);
      continue;
    }
    if (a === "-h" || a === "--help") {
      printUsage();
      process.exit(0);
    }
    if (a.startsWith("-")) {
      console.error(`pr-tour validate: unknown flag ${a}`);
      process.exit(1);
    }
    if (explicitPath === undefined) {
      explicitPath = a;
      continue;
    }
    console.error(`pr-tour validate: unexpected argument ${a}`);
    process.exit(1);
  }

  const guidePath = await resolveTourPath(explicitPath, process.cwd());
  if (!guidePath) {
    console.error(
      explicitPath
        ? `pr-tour validate: guide not found: ${explicitPath}`
        : `pr-tour validate: no .pr-tour-guide.yml (or .yaml) in ${process.cwd()}`,
    );
    process.exit(1);
  }

  let ref = null;
  let deps = null;
  if (!offline) {
    const fallback = await getCurrentRepo();
    if (prRef) {
      ref = parsePRRef(prRef, fallback ?? undefined);
      if (!ref) {
        console.error(`pr-tour validate: cannot resolve --pr "${prRef}"`);
        process.exit(1);
      }
    } else {
      ref = await currentBranchPR(fallback);
      if (!ref) {
        console.error(
          "pr-tour validate: could not resolve a PR for the current branch.\n" +
            "  pass --pr <ref>, or --offline for schema-only checks.",
        );
        process.exit(1);
      }
    }
    deps = { fetchPR, fetchFileContent };
  }

  const report = await validateTour({ guidePath, ref, deps });

  console.log(`\x1b[2mpr-tour validate\x1b[0m ${report.guidePath}`);
  if (ref) {
    console.log(
      `\x1b[2m  against\x1b[0m \x1b[36m${ref.owner}/${ref.repo}\x1b[0m#\x1b[1m${ref.number}\x1b[0m`,
    );
  } else {
    console.log(`\x1b[2m  (offline — schema checks only)\x1b[0m`);
  }

  for (const e of report.errors) console.log(`  \x1b[31merror\x1b[0m   ${e}`);
  for (const w of report.warnings) console.log(`  \x1b[33mwarn\x1b[0m    ${w}`);

  if (report.errors.length === 0 && report.warnings.length === 0) {
    console.log("  \x1b[32mok\x1b[0m — no issues found");
  } else {
    console.log(
      `\n  ${report.errors.length} error(s), ${report.warnings.length} warning(s)`,
    );
  }

  process.exit(report.errors.length > 0 ? 1 : 0);
}

async function currentBranchPR(
  fallback: { owner: string; repo: string } | null,
): Promise<import("./types.ts").PRRef | null> {
  const { $ } = await import("bun");
  try {
    const out = await $`gh pr view --json number`.quiet().json();
    const number = out?.number;
    if (typeof number !== "number" || !fallback) return null;
    return { owner: fallback.owner, repo: fallback.repo, number };
  } catch {
    return null;
  }
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
