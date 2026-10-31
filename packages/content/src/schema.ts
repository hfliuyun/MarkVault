import { parseFrontmatterDate } from "./dates.ts";

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const KNOWN_POST_KEYS = new Set([
  "publish",
  "type",
  "title",
  "slug",
  "date",
  "updated",
  "summary",
  "categories",
  "tags",
  "series",
  "series_order",
  "redirect_from",
  "legacy",
  // Obsidian built-ins that are harmless to keep.
  "aliases",
  "cssclasses",
]);

export const KNOWN_SERIES_KEYS = new Set(["publish", "type", "title", "slug", "aliases", "cssclasses"]);

export interface FieldIssue {
  level: "error" | "warning";
  message: string;
}

export function isPublished(frontmatter: Record<string, unknown> | null): boolean {
  return frontmatter?.publish === true;
}

/** True when the note looks like a pre-migration post (old Flask format). */
export function isLegacyFormat(frontmatter: Record<string, unknown> | null): boolean {
  if (!frontmatter || "publish" in frontmatter) return false;
  return typeof frontmatter.slug === "string" && "date" in frontmatter;
}

export function readString(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim() || undefined;
  if (typeof value === "number") return String(value);
  return undefined;
}

export function readStringList(value: unknown, field: string, issues: FieldIssue[]): string[] {
  if (value === undefined || value === null) return [];
  const list = Array.isArray(value) ? value : [value];
  const result: string[] = [];
  for (const item of list) {
    const text = readString(item);
    if (text === undefined) {
      issues.push({ level: "error", message: `${field} 只能包含文字，发现了 ${JSON.stringify(item)}` });
      continue;
    }
    result.push(text);
  }
  return result;
}

export function checkSlug(value: unknown, issues: FieldIssue[]): string | undefined {
  const slug = readString(value);
  if (!slug) {
    issues.push({ level: "error", message: "缺少 slug。运行 markvault publish <笔记> 会帮你生成" });
    return undefined;
  }
  if (!SLUG_PATTERN.test(slug)) {
    issues.push({
      level: "error",
      message: `slug "${slug}" 不合法：只能用小写字母、数字和单个连字符，例如 aac-stream`,
    });
    return undefined;
  }
  return slug;
}

export function checkDate(value: unknown, field: string, required: boolean, issues: FieldIssue[]): string | undefined {
  if (value === undefined || value === null || value === "") {
    if (required) issues.push({ level: "error", message: `缺少 ${field}` });
    return undefined;
  }
  const parsed = parseFrontmatterDate(value);
  if (!parsed) {
    issues.push({
      level: "error",
      message: `${field} "${String(value)}" 无法解析，可用格式：YYYY-MM-DD、YYYY-MM-DD HH:mm、YYYY-MM-DD HH:mm:ss 或 ISO 8601`,
    });
  }
  return parsed ?? undefined;
}

/**
 * Read a wikilink-valued property. Accepts "[[Note]]", "[[Note|alias]]",
 * and the unquoted YAML form [[Note]] which parses as a nested array.
 */
export function readWikilinkProperty(value: unknown): string | undefined {
  if (Array.isArray(value) && value.length === 1 && Array.isArray(value[0]) && value[0].length === 1) {
    return readString(value[0][0]);
  }
  const text = readString(value);
  if (!text) return undefined;
  const match = /^\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]$/.exec(text);
  return match ? match[1].trim() : undefined;
}
