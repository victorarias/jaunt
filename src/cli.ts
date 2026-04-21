#!/usr/bin/env bun
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { getCurrentRepo, parsePRRef } from "./gh.ts";
import { apiPlugin } from "./vite-api-plugin.ts";
import { loadTour, resolveTourPath, type Tour } from "./tour.ts";

type ParsedArgs = {
  prRef: string | null;
  guide: string | undefined;
  noGuide: boolean;
  host: boolean;
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
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

  const here = dirname(fileURLToPath(import.meta.url));
  const webRoot = join(here, "..", "web");

  const server = await createServer({
    root: webRoot,
    configFile: false,
    plugins: [react(), tailwindcss(), apiPlugin({ ref, tour })],
    server: {
      port: 0,
      strictPort: false,
      open: !process.env.PR_TOUR_NO_OPEN && !host,
      host: host ? true : undefined,
      allowedHosts: host ? true : undefined,
    },
    clearScreen: false,
  });

  await server.listen();
  server.printUrls();
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
      "    --host           bind to all interfaces (for remote-dev access)"
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
