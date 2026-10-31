import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ImageManifest } from "./types.ts";

export const MANIFEST_PATH = ".markvault/images.json";

export function emptyManifest(): ImageManifest {
  return { version: 1, paths: {}, assets: {} };
}

export async function readManifest(root: string): Promise<ImageManifest> {
  let text: string;
  try {
    text = await readFile(path.join(root, MANIFEST_PATH), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyManifest();
    throw error;
  }
  const parsed = JSON.parse(text) as Partial<ImageManifest>;
  if (parsed.version !== 1 || typeof parsed.paths !== "object" || typeof parsed.assets !== "object") {
    throw new Error(`${MANIFEST_PATH} 格式不正确`);
  }
  return { version: 1, paths: parsed.paths ?? {}, assets: parsed.assets ?? {} };
}

/** Write the manifest atomically with sorted keys so Git diffs stay small. */
export async function writeManifest(root: string, manifest: ImageManifest): Promise<void> {
  const target = path.join(root, MANIFEST_PATH);
  await mkdir(path.dirname(target), { recursive: true });
  const sorted: ImageManifest = {
    version: 1,
    paths: sortKeys(manifest.paths),
    assets: sortKeys(manifest.assets),
  };
  const temporary = `${target}.tmp`;
  await writeFile(temporary, `${JSON.stringify(sorted, null, 2)}\n`, "utf8");
  await rename(temporary, target);
}

function sortKeys<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(record).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

export interface FileHash {
  sha256: string;
  /** First 16 hex characters, used as the public file name. */
  key: string;
}

export async function hashFile(absolutePath: string): Promise<FileHash> {
  const data = await readFile(absolutePath);
  const sha256 = createHash("sha256").update(data).digest("hex");
  return { sha256, key: sha256.slice(0, 16) };
}
