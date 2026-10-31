import { parse, stringify } from "yaml";

export interface SplitResult {
  frontmatterText: string | null;
  body: string;
  /** 1-based line where the body starts. */
  bodyStartLine: number;
}

const FENCE = /^---[ \t]*$/;

/** Split a note into its YAML frontmatter block and body. */
export function splitFrontmatter(raw: string): SplitResult {
  const text = raw.startsWith("\uFEFF") ? raw.slice(1) : raw;
  const lines = text.split(/\r?\n/);
  if (lines.length === 0 || !FENCE.test(lines[0])) {
    return { frontmatterText: null, body: text, bodyStartLine: 1 };
  }
  for (let index = 1; index < lines.length; index += 1) {
    if (FENCE.test(lines[index])) {
      return {
        frontmatterText: lines.slice(1, index).join("\n"),
        body: lines.slice(index + 1).join("\n"),
        bodyStartLine: index + 2,
      };
    }
  }
  return { frontmatterText: null, body: text, bodyStartLine: 1 };
}

/**
 * Parse frontmatter YAML. Uses the YAML 1.2 core schema, so dates stay as
 * strings and are interpreted by our own date parser.
 */
export function parseFrontmatter(text: string): Record<string, unknown> {
  if (!text.trim()) return {};
  const value = parse(text, { schema: "core", uniqueKeys: true });
  if (value === null || value === undefined) return {};
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error("frontmatter 不是键值对象");
  }
  return value as Record<string, unknown>;
}

/** Serialize frontmatter and body back into a note. */
export function composeNote(frontmatter: Record<string, unknown>, body: string): string {
  const yamlText = stringify(frontmatter, {
    lineWidth: 0,
    defaultStringType: "PLAIN",
    defaultKeyType: "PLAIN",
  }).trimEnd();
  const normalizedBody = body.replace(/^\n+/, "");
  return `---\n${yamlText}\n---\n\n${normalizedBody}`;
}
