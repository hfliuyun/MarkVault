import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Record of what is live, written after each successful deploy. Used to warn
 * when a previously published slug disappears (its URL would turn into 404).
 */
export const PUBLISHED_PATH = ".markvault/published.json";

export interface PublishedRecord {
  version: 1;
  deployed_at: string;
  /** slug -> vault-relative note path */
  posts: Record<string, string>;
  series: Record<string, string>;
}

export async function readPublished(root: string): Promise<PublishedRecord | null> {
  try {
    const parsed = JSON.parse(await readFile(path.join(root, PUBLISHED_PATH), "utf8")) as PublishedRecord;
    return parsed.version === 1 ? parsed : null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new Error(`${PUBLISHED_PATH} 无法读取：${(error as Error).message}`);
  }
}

export async function writePublished(root: string, record: PublishedRecord): Promise<void> {
  const target = path.join(root, PUBLISHED_PATH);
  await mkdir(path.dirname(target), { recursive: true });
  const sorted = (input: Record<string, string>) => Object.fromEntries(Object.entries(input).sort(([a], [b]) => (a < b ? -1 : 1)));
  const text = `${JSON.stringify({ ...record, posts: sorted(record.posts), series: sorted(record.series) }, null, 2)}\n`;
  await writeFile(`${target}.tmp`, text, "utf8");
  await rename(`${target}.tmp`, target);
}
