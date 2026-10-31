import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export interface CliConfig {
  vault?: string;
  ignore?: string[];
  cloudinary?: { cloud_name?: string; api_key?: string; api_secret?: string };
}

export const CONFIG_PATH = path.join(
  process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config"),
  "markvault",
  "config.json",
);

export async function readConfig(): Promise<CliConfig> {
  try {
    return JSON.parse(await readFile(CONFIG_PATH, "utf8")) as CliConfig;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw new Error(`读取配置 ${CONFIG_PATH} 失败：${(error as Error).message}`);
  }
}

/** Vault path priority: --vault, MARKVAULT_VAULT, config file, ./content. */
export function resolveVaultPath(flag: string | undefined, config: CliConfig): string {
  const value = flag ?? process.env.MARKVAULT_VAULT ?? config.vault ?? "content";
  return path.resolve(value.replace(/^~(?=\/|$)/, os.homedir()));
}
