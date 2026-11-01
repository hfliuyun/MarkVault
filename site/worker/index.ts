import { handleApi, type ApiEnv } from "./api.ts";
import { cleanup } from "./cron.ts";
import { handleImage, type ImageEnv } from "./img.ts";

/**
 * MarkVault Worker. Static assets (the Astro build) are served by Cloudflare
 * before this script runs; only paths listed in wrangler.jsonc
 * `assets.run_worker_first` reach it.
 */
export interface Env extends ImageEnv, ApiEnv {
  ASSETS: Fetcher;
}

/** /paste/<id> share links all use one static shell page; it reads the id from the URL. */
const PASTE_VIEW = /^\/paste\/[a-z0-9]{8}\/?$/;

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;
    if (pathname.startsWith("/img/")) return handleImage(request, env, ctx);
    if (pathname === "/api/paste" || pathname.startsWith("/api/paste/")) return handleApi(request, env);
    if (pathname.startsWith("/api/")) {
      return new Response(JSON.stringify({ error: "接口不存在" }), {
        status: 404,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }
    if (PASTE_VIEW.test(pathname)) {
      const shell = await env.ASSETS.fetch(new Request(new URL("/paste/view/", url), { method: request.method, headers: request.headers }));
      const response = new Response(shell.body, shell);
      response.headers.set("X-Robots-Tag", "noindex");
      return response;
    }
    return env.ASSETS.fetch(request);
  },

  async scheduled(_controller, env): Promise<void> {
    await cleanup(env.DB);
  },
} satisfies ExportedHandler<Env>;
