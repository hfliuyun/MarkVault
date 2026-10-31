import type { Root } from "mdast";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import { isExternalUrl, isImagePath, safeDecode } from "./resolve.ts";

export interface RawImage {
  target: string;
  alt: string;
  raw: boolean;
  width?: number;
  height?: number;
  line?: number;
}

export interface RawLink {
  target: string;
  heading?: string;
  embed: boolean;
  line?: number;
}

export interface ExtractedRefs {
  images: RawImage[];
  links: RawLink[];
  /** Image-like Markdown that CommonMark could not parse (e.g. spaces in the path). */
  brokenImages: { text: string; line: number }[];
}

const WIKILINK = /(!?)\[\[([^\]\n]+?)\]\]/g;
const OBSIDIAN_COMMENT = /%%[\s\S]*?%%/g;
/** `![alt](path with spaces.png)` – not an image in CommonMark. */
const SPACED_IMAGE = /!\[[^\]\n]*\]\(([^)<>\n]*\s[^)<>\n]*)\)/g;

const parser = unified().use(remarkParse).use(remarkGfm).use(remarkMath);

/** Replace Obsidian %% comments with blank text, keeping line numbers stable. */
export function stripObsidianComments(body: string): string {
  return body.replace(OBSIDIAN_COMMENT, (match) => match.replace(/[^\n]/g, " "));
}

export function parseMarkdown(body: string): Root {
  return parser.parse(stripObsidianComments(body));
}

/** Parse the "|..." options of an image embed: "300", "300x200", "raw", "raw|300". */
export function parseEmbedOptions(parts: string[]): { raw: boolean; width?: number; height?: number; alt?: string } {
  const result: { raw: boolean; width?: number; height?: number; alt?: string } = { raw: false };
  for (const part of parts) {
    const value = part.trim();
    const size = /^(\d+)(?:x(\d+))?$/.exec(value);
    if (value === "raw") result.raw = true;
    else if (size) {
      result.width = Number(size[1]);
      if (size[2]) result.height = Number(size[2]);
    } else if (value) result.alt = value;
  }
  return result;
}

export function extractRefs(body: string, lineOffset: number): ExtractedRefs {
  const tree = parseMarkdown(body);
  const images: RawImage[] = [];
  const links: RawLink[] = [];
  const brokenImages: { text: string; line: number }[] = [];
  const lineOf = (node: { position?: { start: { line: number } } }) =>
    node.position ? node.position.start.line + lineOffset : undefined;

  visit(tree, (node) => {
    if (node.type === "image") {
      if (isExternalUrl(node.url)) return;
      images.push({ target: safeDecode(node.url), alt: node.alt ?? "", raw: false, line: lineOf(node) });
      return;
    }
    if (node.type === "link") {
      if (isExternalUrl(node.url) || node.url.startsWith("#")) return;
      const [target, heading] = safeDecode(node.url).split("#");
      if (!target) return;
      if (isImagePath(target)) return;
      links.push({ target, heading, embed: false, line: lineOf(node) });
      return;
    }
    if (node.type === "text") {
      const value = node.value;
      const baseLine = lineOf(node);
      for (const match of value.matchAll(WIKILINK)) {
        const embed = match[1] === "!";
        const [targetPart, ...options] = match[2].split("|");
        const line = baseLine === undefined ? undefined : baseLine + countNewlines(value.slice(0, match.index));
        const [target, heading] = targetPart.split("#");
        if (embed && isImagePath(target)) {
          const parsed = parseEmbedOptions(options);
          images.push({
            target: target.trim(),
            alt: parsed.alt ?? "",
            raw: parsed.raw,
            width: parsed.width,
            height: parsed.height,
            line,
          });
        } else {
          links.push({ target: target.trim(), heading: heading?.trim() || undefined, embed, line });
        }
      }
      for (const match of value.matchAll(SPACED_IMAGE)) {
        const line = baseLine === undefined ? 0 : baseLine + countNewlines(value.slice(0, match.index));
        brokenImages.push({ text: match[0], line });
      }
    }
  });

  return { images, links, brokenImages };
}

function countNewlines(text: string): number {
  let count = 0;
  for (const char of text) if (char === "\n") count += 1;
  return count;
}
