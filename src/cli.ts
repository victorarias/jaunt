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
  port: number | undefined;
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
      `jaunt: cannot resolve PR reference from "${args.prRef}"\n` +
        `  try: jaunt 349   (from inside a repo gh knows)\n` +
        `  or:  jaunt owner/repo#349\n` +
        `  or:  jaunt https://github.com/owner/repo/pull/349`
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
          `jaunt: failed to load tour file: ${err instanceof Error ? err.message : String(err)}`
        );
        process.exit(1);
      }
    } else if (args.guide) {
      console.error(`jaunt: tour file not found: ${args.guide}`);
      process.exit(1);
    }
  }

  console.log(
    `\x1b[2mjaunt\x1b[0m \x1b[36m${ref.owner}/${ref.repo}\x1b[0m#\x1b[1m${ref.number}\x1b[0m`
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
    port: args.port,
    onSubmit: (result) => {
      if (!result.ok) return;
      // Machine-readable sentinel lines so a spawning agent can grep stdout
      // for a signal even if it chose to background instead of await. The
      // `finish=` suffix tells the agent whether the review is over or the
      // user intends to keep submitting — process exit is still authoritative.
      if (result.target === "agent") {
        console.log(
          `jaunt: FEEDBACK_READY path=${result.path} finish=${result.finish}`,
        );
      } else {
        console.log(
          `jaunt: REVIEW_POSTED url=${result.url} finish=${result.finish}`,
        );
      }
      if (!result.finish) return;
      // finish=true: the reviewer ticked "end review after this submit",
      // so the session is done. Give the event loop a beat so the HTTP
      // response + Vite HMR flush before we tear down.
      setTimeout(() => {
        void handle.close().finally(() => process.exit(0));
      }, 250);
    },
  });
  handle.viteServer.printUrls();
  // Machine-readable startup sentinel so an agent spawning jaunt can grab
  // the bound port without parsing vite's pretty-printed URL output. Useful
  // when re-launching after acting on feedback so the user's browser refresh
  // hits the same port.
  const boundPort = portFromHandle(handle);
  if (boundPort !== null) {
    console.log(`jaunt: LISTENING port=${boundPort} url=${handle.url}`);
  }
  console.log(
    "\x1b[2m(Ctrl-C to stop; submits append to feedback; server exits on \"end review\" submit)\x1b[0m",
  );
}

function portFromHandle(handle: {
  viteServer: { httpServer: { address(): unknown } | null };
}): number | null {
  const addr = handle.viteServer.httpServer?.address?.();
  if (addr && typeof addr === "object" && "port" in addr) {
    const p = (addr as { port: number }).port;
    return Number.isFinite(p) ? p : null;
  }
  return null;
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = {
    prRef: null,
    guide: undefined,
    noGuide: false,
    host: false,
    port: undefined,
  };
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
        console.error("jaunt: --guide requires a path argument");
        process.exit(1);
      }
      out.guide = next;
      continue;
    }
    if (a.startsWith("--guide=")) {
      out.guide = a.slice("--guide=".length);
      continue;
    }
    if (a === "--port") {
      const next = argv[++i];
      const n = next ? parseInt(next, 10) : NaN;
      if (!Number.isFinite(n) || n < 0 || n > 65535) {
        console.error("jaunt: --port requires an integer 0–65535");
        process.exit(1);
      }
      out.port = n;
      continue;
    }
    if (a.startsWith("--port=")) {
      const n = parseInt(a.slice("--port=".length), 10);
      if (!Number.isFinite(n) || n < 0 || n > 65535) {
        console.error("jaunt: --port requires an integer 0–65535");
        process.exit(1);
      }
      out.port = n;
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
    "usage: jaunt <pr-ref> [--guide <path>] [--no-guide] [--host] [--port <N>]\n" +
      "       jaunt validate [path] [--pr <ref>] [--offline]\n" +
      "       jaunt install-skill [--force]\n" +
      "\n" +
      "  <pr-ref> is one of:\n" +
      "    349                            (number; uses current gh repo)\n" +
      "    owner/repo#349\n" +
      "    owner/repo/349\n" +
      "    https://github.com/.../pull/349\n" +
      "\n" +
      "  tour guide:\n" +
      "    auto-loads .jaunt-guide.yml (or .yaml) from cwd if present\n" +
      "    --guide <path>   use an explicit tour file\n" +
      "    --no-guide       ignore any tour file, show files alphabetically\n" +
      "\n" +
      "  network:\n" +
      "    --host           bind to all interfaces (for remote-dev access)\n" +
      "    --port <N>       bind to a specific port (default: random free)\n" +
      "\n" +
      "  validate:\n" +
      "    parses .jaunt-guide.yml, checks paths + anchors against the PR.\n" +
      "    [path]           guide to validate (default: cwd's .jaunt-guide.yml)\n" +
      "    --pr <ref>       PR to check against (default: current branch's PR)\n" +
      "    --offline        skip the gh fetch — schema-only checks\n" +
      "\n" +
      "  install-skill:\n" +
      "    copies skill/SKILL.md → ~/.claude/skills/jaunt/SKILL.md\n" +
      "    so Claude Code picks up the /jaunt skill.\n" +
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
        console.error("jaunt validate: --pr requires a value");
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
      console.error(`jaunt validate: unknown flag ${a}`);
      process.exit(1);
    }
    if (explicitPath === undefined) {
      explicitPath = a;
      continue;
    }
    console.error(`jaunt validate: unexpected argument ${a}`);
    process.exit(1);
  }

  const guidePath = await resolveTourPath(explicitPath, process.cwd());
  if (!guidePath) {
    console.error(
      explicitPath
        ? `jaunt validate: guide not found: ${explicitPath}`
        : `jaunt validate: no .jaunt-guide.yml (or .yaml) in ${process.cwd()}`,
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
        console.error(`jaunt validate: cannot resolve --pr "${prRef}"`);
        process.exit(1);
      }
    } else {
      ref = await currentBranchPR(fallback);
      if (!ref) {
        console.error(
          "jaunt validate: could not resolve a PR for the current branch.\n" +
            "  pass --pr <ref>, or --offline for schema-only checks.",
        );
        process.exit(1);
      }
    }
    deps = { fetchPR, fetchFileContent };
  }

  const report = await validateTour({ guidePath, ref, deps });

  console.log(`\x1b[2mjaunt validate\x1b[0m ${report.guidePath}`);
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
      "jaunt install-skill: unexpected argument(s): " +
        args.filter((a) => a !== "--force" && a !== "-f").join(" "),
    );
    process.exit(1);
  }

  const here = dirname(fileURLToPath(import.meta.url));
  const src = resolve(here, "..", "skill", "SKILL.md");
  const destDir = join(homedir(), ".claude", "skills", "jaunt");
  const dest = join(destDir, "SKILL.md");

  try {
    await stat(src);
  } catch {
    console.error(`jaunt install-skill: source not found at ${src}`);
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
      `jaunt install-skill: ${dest} already exists.\n` +
        `  re-run with --force to overwrite.`,
    );
    process.exit(1);
  }

  await mkdir(destDir, { recursive: true });
  await copyFile(src, dest);

  const verb = existed ? "updated" : "installed";
  console.log(`jaunt: ${verb} skill → ${dest}`);
  console.log(
    "  Claude Code will pick it up on the next session.\n" +
      "  Use it by asking for a PR tour, or type /jaunt.\n" +
      "  Tip: `bun add -g @victorarias/jaunt` puts `jaunt` on PATH so the skill's\n" +
      "  launch commands work without bunx prefixes.",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
