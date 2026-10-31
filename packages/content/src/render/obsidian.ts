import type { Blockquote, Code, Image, Link, Paragraph, PhrasingContent, Root, RootContent, Text } from "mdast";
import type { Plugin } from "unified";
import { SKIP, visit } from "unist-util-visit";
import { parseEmbedOptions } from "../links.ts";
import { isExternalUrl, isImagePath, safeDecode } from "../resolve.ts";
import { slugifyHeading } from "./slug.ts";

/** Everything the transform needs to turn vault references into site URLs. */
export interface LinkContext {
  /** Resolve an image target written in this note to a public URL. */
  imageUrl(target: string, raw: boolean): { url: string; width?: number; height?: number } | null;
  /** Resolve a note link target to a public URL, or null when it is not published. */
  noteUrl(target: string): string | null;
}

const WIKILINK = /(!?)\[\[([^\]\n]+?)\]\]/g;
const HIGHLIGHT = /==(?=\S)([^=\n]*?\S)==/g;
const BLOCK_ID = /[ \t]\^[A-Za-z0-9-]+(?=\n|$)/g;
const CALLOUT_HEAD = /^\[!([A-Za-z-]+)\]([+-]?)[ \t]*/;

/** Callout type → colour group used by the theme CSS. */
const CALLOUT_GROUPS: Record<string, string> = {
  note: "note", info: "note", todo: "note", abstract: "note", summary: "note", tldr: "note",
  tip: "tip", hint: "tip", important: "tip", success: "tip", check: "tip", done: "tip", example: "tip",
  question: "warn", help: "warn", faq: "warn", warning: "warn", caution: "warn", attention: "warn", quote: "note", cite: "note",
  failure: "danger", fail: "danger", missing: "danger", danger: "danger", error: "danger", bug: "danger",
};

const CALLOUT_LABELS: Record<string, string> = {
  note: "注意", info: "信息", todo: "待办", abstract: "摘要", summary: "摘要", tldr: "摘要",
  tip: "提示", hint: "提示", important: "重要", success: "完成", check: "完成", done: "完成", example: "示例",
  question: "问题", help: "问题", faq: "问题", warning: "警告", caution: "警告", attention: "警告",
  failure: "失败", fail: "失败", missing: "缺失", danger: "危险", error: "错误", bug: "Bug",
  quote: "引用", cite: "引用",
};

export const remarkObsidian: Plugin<[LinkContext], Root> = (context) => (tree) => {
  visit(tree, (node, index, parent) => {
    if (!parent || index === undefined) return;

    if (node.type === "code" && (node as Code).lang === "mermaid") {
      parent.children[index] = mermaidBlock(node as Code) as RootContent;
      return SKIP;
    }
    if (node.type === "blockquote") {
      const callout = toCallout(node as Blockquote);
      if (callout) parent.children[index] = callout as RootContent;
      return;
    }
    if (node.type === "image") {
      rewriteImage(node as Image, context);
      return;
    }
    if (node.type === "link") {
      const replacement = rewriteLink(node as Link, context);
      if (replacement) {
        parent.children.splice(index, 1, ...(replacement as RootContent[]));
        return [SKIP, index + replacement.length];
      }
      return;
    }
    if (node.type === "text") {
      const replacement = transformText((node as Text).value, context);
      if (replacement) {
        parent.children.splice(index, 1, ...(replacement as RootContent[]));
        return [SKIP, index + replacement.length];
      }
    }
  });
};

function mermaidBlock(node: Code): Paragraph {
  return {
    type: "paragraph",
    children: [],
    data: { hName: "pre", hProperties: { className: ["mermaid"] }, hChildren: [{ type: "text", value: node.value }] },
  };
}

function rewriteImage(node: Image, context: LinkContext): void {
  if (isExternalUrl(node.url)) return;
  const resolved = context.imageUrl(safeDecode(node.url), false);
  if (!resolved) return;
  node.url = resolved.url;
  node.data = { ...node.data, hProperties: imageProperties(resolved) };
}

function imageProperties(resolved: { width?: number; height?: number }, width?: number, height?: number) {
  const properties: Record<string, string | number> = { loading: "lazy", decoding: "async" };
  const finalWidth = width ?? resolved.width;
  let finalHeight = height ?? resolved.height;
  if (width && !height && resolved.width && resolved.height) {
    finalHeight = Math.round((resolved.height * width) / resolved.width);
  }
  if (finalWidth) properties.width = finalWidth;
  if (finalHeight) properties.height = finalHeight;
  return properties;
}

/** Local Markdown links: published note → site URL; unpublished → plain text. */
function rewriteLink(node: Link, context: LinkContext): PhrasingContent[] | null {
  if (isExternalUrl(node.url) || node.url.startsWith("#") || node.url.startsWith("/")) return null;
  const [target, heading] = safeDecode(node.url).split("#");
  if (!target || isImagePath(target)) return null;
  const url = context.noteUrl(target);
  if (!url) return node.children;
  node.url = heading ? `${url}#${slugifyHeading(heading)}` : url;
  return null;
}

/** Wikilinks, image embeds, ==highlight== and block ids inside a text node. */
function transformText(value: string, context: LinkContext): PhrasingContent[] | null {
  if (!value.includes("[[") && !value.includes("==") && !value.includes("^")) return null;
  const cleaned = value.replace(BLOCK_ID, "");
  const output: PhrasingContent[] = [];
  let cursor = 0;
  for (const match of cleaned.matchAll(WIKILINK)) {
    const start = match.index ?? 0;
    if (start > cursor) output.push(...highlight(cleaned.slice(cursor, start)));
    output.push(...wikilink(match[1] === "!", match[2], context));
    cursor = start + match[0].length;
  }
  if (cursor < cleaned.length) output.push(...highlight(cleaned.slice(cursor)));
  const unchanged = output.length === 1 && output[0].type === "text" && output[0].value === value;
  return unchanged ? null : output;
}

function highlight(text: string): PhrasingContent[] {
  const output: PhrasingContent[] = [];
  let cursor = 0;
  for (const match of text.matchAll(HIGHLIGHT)) {
    const start = match.index ?? 0;
    if (start > cursor) output.push({ type: "text", value: text.slice(cursor, start) });
    output.push({ type: "emphasis", data: { hName: "mark" }, children: [{ type: "text", value: match[1] }] });
    cursor = start + match[0].length;
  }
  if (cursor < text.length) output.push({ type: "text", value: text.slice(cursor) });
  return output;
}

function wikilink(embed: boolean, inner: string, context: LinkContext): PhrasingContent[] {
  const [targetPart, ...options] = inner.split("|");
  const [rawTarget, heading] = targetPart.split("#");
  const target = rawTarget.trim();

  if (embed && isImagePath(target)) {
    const parsed = parseEmbedOptions(options);
    const resolved = context.imageUrl(target, parsed.raw);
    if (!resolved) return [{ type: "text", value: parsed.alt ?? target }];
    return [
      {
        type: "image",
        url: resolved.url,
        alt: parsed.alt ?? "",
        data: { hProperties: imageProperties(resolved, parsed.width, parsed.height) },
      },
    ];
  }

  const label = options.length > 0 ? options.join("|").trim() : heading && !target ? heading.trim() : targetPart.trim();
  if (!target) {
    // [[#标题]] links inside the same note.
    return [{ type: "link", url: `#${slugifyHeading(heading ?? "")}`, children: [{ type: "text", value: label }] }];
  }
  const url = context.noteUrl(target);
  if (!url) return [{ type: "text", value: label }];
  const href = heading ? `${url}#${slugifyHeading(heading)}` : url;
  return [{ type: "link", url: href, children: [{ type: "text", value: label }] }];
}

/** `> [!tip]- 标题` → <details>/<div class="callout"> with a title row. */
function toCallout(node: Blockquote): RootContent | null {
  const first = node.children[0];
  if (!first || first.type !== "paragraph") return null;
  const head = first.children[0];
  if (!head || head.type !== "text") return null;
  const match = CALLOUT_HEAD.exec(head.value);
  if (!match) return null;

  const type = match[1].toLowerCase();
  const fold = match[2];
  const group = CALLOUT_GROUPS[type] ?? "note";

  // Title is the rest of the first line; everything after the line break is body.
  const rest = head.value.slice(match[0].length);
  const newline = rest.indexOf("\n");
  const titleText = newline === -1 ? rest : rest.slice(0, newline);
  const titleChildren: PhrasingContent[] = [];
  const bodyInline: PhrasingContent[] = [];
  if (newline === -1) {
    if (titleText) titleChildren.push({ type: "text", value: titleText });
    // Other inline nodes on the first line still belong to the title.
    let index = 1;
    for (; index < first.children.length; index += 1) {
      const child = first.children[index];
      if (child.type === "break") {
        index += 1;
        break;
      }
      if (child.type === "text" && child.value.includes("\n")) {
        const cut = child.value.indexOf("\n");
        if (cut > 0) titleChildren.push({ type: "text", value: child.value.slice(0, cut) });
        bodyInline.push({ type: "text", value: child.value.slice(cut + 1) });
        index += 1;
        break;
      }
      titleChildren.push(child);
    }
    bodyInline.push(...first.children.slice(index));
  } else {
    if (titleText) titleChildren.push({ type: "text", value: titleText });
    bodyInline.push({ type: "text", value: rest.slice(newline + 1) }, ...first.children.slice(1));
  }
  if (titleChildren.length === 0) titleChildren.push({ type: "text", value: CALLOUT_LABELS[type] ?? type });

  const body: RootContent[] = [];
  if (bodyInline.some((child) => child.type !== "text" || child.value.trim())) {
    body.push({ type: "paragraph", children: bodyInline });
  }
  body.push(...(node.children.slice(1) as RootContent[]));

  const foldable = fold === "+" || fold === "-";
  const title: RootContent = {
    type: "paragraph",
    children: titleChildren,
    data: { hName: foldable ? "summary" : "div", hProperties: { className: ["callout-title"] } },
  };
  const content: RootContent = {
    type: "blockquote",
    children: body as Blockquote["children"],
    data: { hName: "div", hProperties: { className: ["callout-body"] } },
  };
  const properties: Record<string, unknown> = {
    className: ["callout", `callout-${group}`],
    dataCallout: type,
  };
  if (fold === "+") properties.open = true;
  return {
    type: "blockquote",
    children: [title, content] as Blockquote["children"],
    data: { hName: foldable ? "details" : "div", hProperties: properties as never },
  };
}
