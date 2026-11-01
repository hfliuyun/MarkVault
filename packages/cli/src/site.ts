import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Repository root (…/MarkVault), resolved from this file's location. */
export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
export const SITE_DIR = path.join(REPO_ROOT, "site");

function bin(name: string): string {
  return path.join(REPO_ROOT, "node_modules", ".bin", name);
}

export interface SiteEnv {
  vault: string;
  requireUploaded?: boolean;
}

/** Run a tool inside site/ with the vault path passed through the environment. */
export function runInSite(tool: "astro" | "pagefind" | "wrangler", args: string[], env: SiteEnv): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin(tool), args, {
      cwd: SITE_DIR,
      stdio: "inherit",
      env: {
        ...process.env,
        MARKVAULT_VAULT: env.vault,
        MARKVAULT_REQUIRE_UPLOADED: env.requireUploaded ? "1" : "0",
        ASTRO_TELEMETRY_DISABLED: "1",
      },
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${tool} ${args.join(" ")} 失败（${signal ?? `退出码 ${code}`}）`));
    });
  });
}

/** Run a tool inside site/ quietly; its output is returned, or included in the error when it fails. */
export function captureInSite(tool: "wrangler", args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin(tool), args, { cwd: SITE_DIR, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => (output += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (output += chunk.toString()));
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) resolve(output);
      else reject(new Error(`${tool} ${args.slice(0, 2).join(" ")} 失败（${signal ?? `退出码 ${code}`}）\n${output.trim()}`));
    });
  });
}

export async function buildSite(env: SiteEnv): Promise<void> {
  await runInSite("astro", ["build"], env);
  await runInSite("pagefind", ["--site", "dist", "--silent"], env);
}
