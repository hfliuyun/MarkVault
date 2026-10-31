import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { parseFrontmatter, splitFrontmatter } from "./frontmatter.ts";
import type { NoteFile } from "./types.ts";

/** Directories that are never scanned, at any depth. */
export const ALWAYS_IGNORED_DIRS = new Set([
  ".obsidian",
  ".markvault",
  ".git",
  ".stfolder",
  ".trash",
  ".tmp.driveupload",
  "node_modules",
]);

export interface VaultFiles {
  /** Every non-ignored file, vault-relative POSIX paths. */
  allFiles: string[];
  notes: NoteFile[];
}

export interface ScanOptions {
  /** Extra vault-relative directories to skip (e.g. templates). */
  ignore?: string[];
}

export function toPosix(relativePath: string): string {
  return relativePath.split(path.sep).join("/");
}

export async function scanVault(root: string, options: ScanOptions = {}): Promise<VaultFiles> {
  const ignored = new Set((options.ignore ?? []).map((item) => item.replace(/^\/+|\/+$/g, "")));
  const allFiles: string[] = [];

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const absolute = path.join(dir, entry.name);
      const relative = toPosix(path.relative(root, absolute));
      if (entry.isDirectory()) {
        if (ALWAYS_IGNORED_DIRS.has(entry.name) || ignored.has(relative)) continue;
        await walk(absolute);
      } else if (entry.isFile()) {
        if (entry.name === ".DS_Store" || entry.name.includes(".sync-conflict-")) continue;
        allFiles.push(relative);
      }
    }
  }

  await walk(root);
  allFiles.sort();

  const notes: NoteFile[] = [];
  for (const relative of allFiles) {
    if (!relative.toLowerCase().endsWith(".md")) continue;
    const raw = await readFile(path.join(root, relative), "utf8");
    notes.push(parseNote(relative, raw));
  }
  return { allFiles, notes };
}

export function parseNote(relativePath: string, raw: string): NoteFile {
  const { frontmatterText, body, bodyStartLine } = splitFrontmatter(raw);
  const stem = path.posix.basename(relativePath).replace(/\.md$/i, "");
  const note: NoteFile = {
    path: relativePath,
    stem,
    frontmatter: null,
    frontmatterText,
    body,
    bodyStartLine,
  };
  if (frontmatterText !== null) {
    try {
      note.frontmatter = parseFrontmatter(frontmatterText);
    } catch (error) {
      note.frontmatterError = (error as Error).message.split("\n")[0];
    }
  }
  return note;
}
