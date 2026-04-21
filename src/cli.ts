#!/usr/bin/env bun
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { getCurrentRepo, parsePRRef } from "./gh.ts";
import { apiPlugin } from "./vite-api-plugin.ts";

async function main() {
  const arg = process.argv[2];
  if (!arg || arg === "-h" || arg === "--help") {
    printUsage();
    process.exit(arg ? 0 : 1);
  }

  const fallback = await getCurrentRepo();
  const ref = parsePRRef(arg, fallback ?? undefined);
  if (!ref) {
    console.error(
      `pr-tour: cannot resolve PR reference from "${arg}"\n` +
        `  try: pr-tour 349   (from inside a repo gh knows)\n` +
        `  or:  pr-tour owner/repo#349\n` +
        `  or:  pr-tour https://github.com/owner/repo/pull/349`
    );
    process.exit(1);
  }

  console.log(
    `\x1b[2mpr-tour\x1b[0m \x1b[36m${ref.owner}/${ref.repo}\x1b[0m#\x1b[1m${ref.number}\x1b[0m`
  );

  const here = dirname(fileURLToPath(import.meta.url));
  const webRoot = join(here, "..", "web");

  const server = await createServer({
    root: webRoot,
    configFile: false,
    plugins: [react(), tailwindcss(), apiPlugin({ ref })],
    server: {
      port: 0,
      strictPort: false,
      open: !process.env.PR_TOUR_NO_OPEN,
    },
    clearScreen: false,
  });

  await server.listen();
  server.printUrls();
  console.log("\x1b[2m(Ctrl-C to stop)\x1b[0m");
}

function printUsage() {
  console.log(
    "usage: pr-tour <pr-ref>\n" +
      "\n" +
      "  <pr-ref> is one of:\n" +
      "    349                            (number; uses current gh repo)\n" +
      "    owner/repo#349\n" +
      "    owner/repo/349\n" +
      "    https://github.com/.../pull/349"
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
