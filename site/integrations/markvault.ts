import { createReadStream } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AstroIntegration } from "astro";
import { loadVault, postUrl, type VaultModel } from "@markvault/content";

const CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".avif": "image/avif",
};

interface SharedState {
  version: number;
}

function sharedState(): SharedState {
  const store = globalThis as Record<string, unknown>;
  store.__markvault ??= { version: 0, rendered: new Map() };
  return store.__markvault as SharedState;
}

function resolveVault(siteRoot: string): string {
  return path.resolve(process.env.MARKVAULT_VAULT ?? path.join(siteRoot, "..", "content"));
}

/** Text of the Cloudflare `_redirects` file: legacy abbrlinks and renamed slugs. */
export function buildRedirects(model: VaultModel): string {
  const lines: string[] = [];
  for (const [abbrlink, slug] of [...model.legacyRedirects].sort()) {
    lines.push(`/p/${abbrlink} ${postUrl(slug)} 308`);
  }
  for (const [oldSlug, slug] of [...model.slugRedirects].sort()) {
    lines.push(`/posts/${oldSlug} ${postUrl(slug)} 308`);
    lines.push(`/posts/${oldSlug}/ ${postUrl(slug)} 308`);
  }
  return lines.length > 0 ? `${lines.join("\n")}\n` : "";
}

/**
 * - dev: reload pages when the vault changes; serve /img/<hash>.* from local originals.
 * - build: write dist/_redirects.
 */
export default function markvault(): AstroIntegration {
  let siteRoot = process.cwd();
  return {
    name: "markvault",
    hooks: {
      "astro:config:done": ({ config }) => {
        siteRoot = fileURLToPath(config.root);
      },
      "astro:server:setup": ({ server, logger }) => {
        const vault = resolveVault(siteRoot);
        const state = sharedState();
        server.watcher.add(vault);
        let timer: NodeJS.Timeout | undefined;
        const onChange = (file: string) => {
          if (!file.startsWith(vault) || file.includes(`${path.sep}.obsidian${path.sep}`)) return;
          clearTimeout(timer);
          timer = setTimeout(() => {
            state.version += 1;
            imageIndex = null;
            logger.info(`vault 有变化：${path.relative(vault, file)}`);
            server.ws.send({ type: "full-reload" });
          }, 150);
        };
        server.watcher.on("add", onChange);
        server.watcher.on("change", onChange);
        server.watcher.on("unlink", onChange);

        // /img/<hash>.<ext> and /img/raw/<hash>.<ext> → original file in the vault.
        let imageIndex: Promise<Map<string, string>> | null = null;
        const buildIndex = async () => {
          const { model } = await loadVault(vault);
          const map = new Map<string, string>();
          for (const item of [...model.posts, ...model.series]) {
            for (const image of item.images) {
              if (image.hash && image.resolvedPath) map.set(image.hash, path.join(vault, image.resolvedPath));
            }
          }
          return map;
        };
        server.middlewares.use(async (request, response, next) => {
          const match = /^\/img\/(?:raw\/)?([0-9a-f]{16})\.[a-z0-9]+$/.exec(request.url?.split("?")[0] ?? "");
          if (!match) return next();
          imageIndex ??= buildIndex();
          const file = (await imageIndex).get(match[1]);
          if (!file) {
            response.statusCode = 404;
            response.end("image not found");
            return;
          }
          response.setHeader("Content-Type", CONTENT_TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream");
          response.setHeader("Cache-Control", "no-cache");
          createReadStream(file).pipe(response);
        });
      },
      "astro:build:done": async ({ dir, logger }) => {
        const { model } = await loadVault(resolveVault(siteRoot));
        const text = buildRedirects(model);
        await writeFile(new URL("_redirects", dir), text, "utf8");
        logger.info(`_redirects：${text.split("\n").filter(Boolean).length} 条`);
      },
    },
  };
}
