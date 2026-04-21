import { createServer, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { ApiDeps } from "./api-handlers.ts";
import type { Tour } from "./tour.ts";
import type { PRRef } from "./types.ts";
import { apiPlugin } from "./vite-api-plugin.ts";

export type StartServerOptions = {
  ref: PRRef;
  tour: Tour | null;
  deps: ApiDeps;
  /** Open a browser tab on start. Default: false. */
  open?: boolean;
  /** Bind to all interfaces. Default: false. */
  host?: boolean;
  /** Port to listen on. 0 = pick a random free port. Default: 0. */
  port?: number;
};

export type ServerHandle = {
  url: string;
  viteServer: ViteDevServer;
  close(): Promise<void>;
};

export async function startServer(
  opts: StartServerOptions,
): Promise<ServerHandle> {
  const here = dirname(fileURLToPath(import.meta.url));
  const webRoot = join(here, "..", "web");

  const viteServer = await createServer({
    root: webRoot,
    configFile: false,
    plugins: [
      react(),
      tailwindcss(),
      apiPlugin({ ref: opts.ref, tour: opts.tour, deps: opts.deps }),
    ],
    server: {
      port: opts.port ?? 0,
      strictPort: false,
      open: opts.open ?? false,
      host: opts.host ? true : undefined,
      allowedHosts: opts.host ? true : undefined,
    },
    clearScreen: false,
  });

  await viteServer.listen();
  const url = resolveUrl(viteServer);

  return {
    url,
    viteServer,
    close: () => viteServer.close(),
  };
}

function resolveUrl(server: ViteDevServer): string {
  const urls = server.resolvedUrls;
  if (urls?.local[0]) return urls.local[0];
  if (urls?.network[0]) return urls.network[0];
  const addr = server.httpServer?.address();
  if (addr && typeof addr === "object" && "port" in addr) {
    return `http://localhost:${addr.port}/`;
  }
  throw new Error("startServer: could not resolve server URL");
}
