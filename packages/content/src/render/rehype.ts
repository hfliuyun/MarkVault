import type { Element, ElementContent, Root } from "hast";
import { toString } from "hast-util-to-string";
import type { Plugin } from "unified";
import { SKIP, visit } from "unist-util-visit";
import { HeadingIds } from "./slug.ts";

export interface TocEntry {
  level: number;
  title: string;
  id: string;
}

export interface RenderStats {
  toc: TocEntry[];
  hasMath: boolean;
  hasMermaid: boolean;
  hasCode: boolean;
  text: string;
}

const HEADINGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);

/** Heading ids (Flask-compatible) and a table of contents of h2–h4. */
export const rehypeHeadings: Plugin<[RenderStats], Root> = (stats) => (tree) => {
  const ids = new HeadingIds();
  visit(tree, "element", (node) => {
    if (!HEADINGS.has(node.tagName)) return;
    // The visually hidden footnote heading keeps its own id (used by aria).
    if (classList(node).includes("sr-only")) return;
    const title = toString(node).trim();
    if (!title) return;
    const id = ids.next(title);
    node.properties = { ...node.properties, id };
    const level = Number(node.tagName.slice(1));
    if (level >= 2 && level <= 4) stats.toc.push({ level, title, id });
  });
};

/** Typora / Obsidian default alt texts that are not worth showing as captions. */
const NOISY_ALT = /^(image-\d+|截屏|屏幕截图|screenshot|img[_-]?\d|pasted image)/i;

/**
 * - A paragraph that holds only one image becomes <figure> with an optional caption.
 * - Tables get a scroll wrapper.
 * - Collects flags used to load math / mermaid assets only when needed.
 */
export const rehypeLayout: Plugin<[RenderStats], Root> = (stats) => (tree) => {
  visit(tree, "element", (node, index, parent) => {
    if (!parent || index === undefined) return;

    const classes = classList(node);
    if (classes.includes("katex") || classes.includes("katex-display")) stats.hasMath = true;
    if (node.tagName === "pre" && classes.includes("mermaid")) stats.hasMermaid = true;
    if (node.tagName === "pre" && classes.includes("shiki")) stats.hasCode = true;

    if (node.tagName === "table") {
      parent.children[index] = element("div", { className: ["table-wrap"] }, [node]);
      return SKIP;
    }

    if (node.tagName === "pre" && classes.includes("shiki")) {
      const lang = String(node.properties?.["data-lang"] ?? node.properties?.dataLang ?? "text");
      parent.children[index] = element("div", { className: ["code-block"], dataLang: lang }, [node]);
      return SKIP;
    }

    if (node.tagName === "p") {
      const meaningful = node.children.filter((child) => !(child.type === "text" && !child.value.trim()));
      const only = meaningful[0];
      if (meaningful.length === 1 && only.type === "element" && only.tagName === "img") {
        const alt = String(only.properties?.alt ?? "").trim();
        const children: ElementContent[] = [only];
        if (alt && !NOISY_ALT.test(alt)) children.push(element("figcaption", {}, [{ type: "text", value: alt }]));
        parent.children[index] = element("figure", {}, children);
        return SKIP;
      }
    }

    if (node.tagName === "a") {
      const href = String(node.properties?.href ?? "");
      if (/^https?:\/\//.test(href)) node.properties = { ...node.properties, rel: ["noopener"] };
    }
  });
  stats.text = toString(tree);
};

function classList(node: Element): string[] {
  const value = node.properties?.className ?? node.properties?.class;
  if (Array.isArray(value)) return value.map(String);
  return typeof value === "string" ? (value as string).split(/\s+/) : [];
}

function element(tagName: string, properties: Element["properties"], children: ElementContent[]): Element {
  return { type: "element", tagName, properties, children };
}

/** Rough reading time: 400 CJK characters or 200 other words per minute. */
export function readingMinutes(text: string): number {
  const cjk = (text.match(/[\u3400-\u9fff\uf900-\ufaff]/g) ?? []).length;
  const words = (text.replace(/[\u3400-\u9fff\uf900-\ufaff]/g, " ").match(/[A-Za-z0-9_]+/g) ?? []).length;
  return Math.max(1, Math.round(cjk / 400 + words / 200));
}
