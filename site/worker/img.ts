import { cloudinaryDeliveryUrl, PASSTHROUGH_FORMATS } from "../../packages/content/src/delivery.ts";
import { normalizeOrigin } from "./http.ts";

/**
 * GET /img/<hash>.<ext> and /img/raw/<hash>.<ext> (design doc 4.5).
 * Hides the Cloudinary origin, blocks hotlinking by Referer, and caches the
 * response at the edge for a year (file names are content hashes).
 */

export interface ImageEnv {
  CLOUDINARY_CLOUD: string;
  /** Extra hostnames allowed to embed images, comma separated. */
  IMG_REFERER_ALLOW?: string;
  /** Public address of the site; its pages may embed images even when the Worker is reached under another hostname. */
  SITE_ORIGIN?: string;
}

const PATH = /^\/img\/(raw\/)?([0-9a-f]{16})\.([a-z0-9]{2,5})$/;
const RASTER = new Set(["png", "jpg", "webp", "avif"]);
const CACHE_CONTROL = "public, max-age=31536000, immutable";

function refererAllowed(request: Request, env: ImageEnv): boolean {
  const referer = request.headers.get("Referer");
  if (!referer) return true; // direct visits, RSS readers, privacy settings
  let host: string;
  try {
    host = new URL(referer).hostname;
  } catch {
    return false;
  }
  if (host === new URL(request.url).hostname) return true;
  const site = normalizeOrigin(env.SITE_ORIGIN);
  if (site && host === new URL(site).hostname) return true;
  const extra = (env.IMG_REFERER_ALLOW ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return extra.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

export async function handleImage(request: Request, env: ImageEnv, ctx: ExecutionContext): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
  }
  const url = new URL(request.url);
  const match = PATH.exec(url.pathname);
  if (!match) return new Response("Not Found", { status: 404 });
  const [, rawPrefix, hash, ext] = match;
  const raw = Boolean(rawPrefix);
  // Only the URL shapes the site generates are valid.
  const valid = raw ? RASTER.has(ext) || PASSTHROUGH_FORMATS.has(ext) : ext === "webp" || PASSTHROUGH_FORMATS.has(ext);
  if (!valid) return new Response("Not Found", { status: 404 });

  if (!refererAllowed(request, env)) {
    return new Response("Forbidden", { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  if (!env.CLOUDINARY_CLOUD) return new Response("Image origin not configured", { status: 500 });

  // Cache key without query string or headers: one entry per file.
  const cacheKey = new Request(`${url.origin}${url.pathname}`, { method: "GET" });
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) return request.method === "HEAD" ? new Response(null, cached) : cached;

  const upstream = await fetch(cloudinaryDeliveryUrl(env.CLOUDINARY_CLOUD, hash, ext, raw), {
    cf: { cacheEverything: true, cacheTtl: 31536000 },
  });
  if (!upstream.ok) {
    // Do not cache misses: the image may be uploaded later under this hash.
    return new Response(upstream.status === 404 ? "Not Found" : "Upstream Error", {
      status: upstream.status === 404 ? 404 : 502,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const headers = new Headers();
  headers.set("Content-Type", upstream.headers.get("Content-Type") ?? "application/octet-stream");
  headers.set("Cache-Control", CACHE_CONTROL);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Cross-Origin-Resource-Policy", "same-site");
  if (ext === "svg") {
    // SVG opened directly must not run scripts.
    headers.set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; img-src data:");
  }
  const response = new Response(upstream.body, { status: 200, headers });
  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return request.method === "HEAD" ? new Response(null, response) : response;
}
