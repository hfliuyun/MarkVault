import path from "node:path";

export const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".avif"]);

export function isImagePath(target: string): boolean {
  return IMAGE_EXTENSIONS.has(path.posix.extname(target).toLowerCase());
}

export function isExternalUrl(target: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("//");
}

export type ResolveResult =
  | { status: "found"; path: string }
  | { status: "missing" }
  | { status: "ambiguous"; candidates: string[] };

/**
 * Resolves link targets the way Obsidian does, closely enough for a blog:
 * 1. relative to the linking note's folder,
 * 2. as a vault-root path,
 * 3. by unique path suffix / file name anywhere in the vault
 *    (when several match, the one closest to the linking note wins).
 */
export class FileResolver {
  private readonly files: Set<string>;
  private readonly byName = new Map<string, string[]>();

  constructor(allFiles: string[]) {
    this.files = new Set(allFiles);
    for (const file of allFiles) {
      const name = path.posix.basename(file).toLowerCase();
      const list = this.byName.get(name) ?? [];
      list.push(file);
      this.byName.set(name, list);
    }
  }

  has(file: string): boolean {
    return this.files.has(file);
  }

  /**
   * @param target link target as written (already URL-decoded)
   * @param fromNote vault-relative path of the note containing the link
   * @param defaultExtension appended when the target has no extension (".md" for note links)
   */
  resolve(target: string, fromNote: string, defaultExtension = ""): ResolveResult {
    let cleaned = target.trim().replace(/\\/g, "/");
    if (!cleaned) return { status: "missing" };
    if (defaultExtension && !path.posix.extname(cleaned)) cleaned += defaultExtension;

    const noteDir = path.posix.dirname(fromNote);
    const relative = path.posix.normalize(path.posix.join(noteDir === "." ? "" : noteDir, cleaned));
    if (!relative.startsWith("../") && this.files.has(relative)) return { status: "found", path: relative };

    const rooted = path.posix.normalize(cleaned.replace(/^\/+/, ""));
    if (!rooted.startsWith("../") && this.files.has(rooted)) return { status: "found", path: rooted };

    const name = path.posix.basename(cleaned).toLowerCase();
    const suffix = `/${cleaned.replace(/^(\.\.?\/)+/, "").toLowerCase()}`;
    const candidates = (this.byName.get(name) ?? []).filter((file) =>
      `/${file.toLowerCase()}`.endsWith(suffix),
    );
    if (candidates.length === 1) return { status: "found", path: candidates[0] };
    if (candidates.length === 0) return { status: "missing" };

    const ranked = candidates
      .map((file) => ({ file, distance: folderDistance(noteDir, path.posix.dirname(file)) }))
      .sort((a, b) => a.distance - b.distance);
    if (ranked[0].distance < ranked[1].distance) return { status: "found", path: ranked[0].file };
    return { status: "ambiguous", candidates: candidates.sort() };
  }
}

function folderDistance(from: string, to: string): number {
  const a = from === "." ? [] : from.split("/");
  const b = to === "." ? [] : to.split("/");
  let common = 0;
  while (common < a.length && common < b.length && a[common] === b[common]) common += 1;
  return a.length - common + (b.length - common);
}

/** Decode %XX sequences in a Markdown link destination without throwing. */
export function safeDecode(value: string): string {
  try {
    return decodeURI(value);
  } catch {
    return value;
  }
}
