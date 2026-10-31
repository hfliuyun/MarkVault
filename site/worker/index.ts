import { handleImage, type ImageEnv } from "./img.ts";

/**
 * MarkVault Worker. Static assets (the Astro build) are served by Cloudflare
 * before this script runs; only paths listed in wrangler.jsonc
 * `assets.run_worker_first` reach it.
 */
export interface Env extends ImageEnv {
  ASSETS: Fetcher;
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith("/img/")) return handleImage(request, env, ctx);
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
