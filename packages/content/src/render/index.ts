import rehypeShiki from "@shikijs/rehype";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import remarkCjkFriendly from "remark-cjk-friendly";
import remarkCjkFriendlyGfmStrikethrough from "remark-cjk-friendly-gfm-strikethrough";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import path from "node:path";
import { stripObsidianComments } from "../links.ts";
import type { ImageRef, Post, Series, VaultModel } from "../types.ts";
import { remarkObsidian, type LinkContext } from "./obsidian.ts";
import { readingMinutes, rehypeHeadings, rehypeLayout, type RenderStats, type TocEntry } from "./rehype.ts";

export type { TocEntry } from "./rehype.ts";
export { slugifyHeading } from "./slug.ts";

export interface RenderOptions {
  /** Prefix for image URLs, e.g. "/img" (default) or a Cloudinary base. */
  imageBase?: string;
}

export interface RenderedNote {
  html: string;
  toc: TocEntry[];
  readingMinutes: number;
  hasMath: boolean;
  hasMermaid: boolean;
  hasCode: boolean;
  /** Plain-text excerpt for list pages when there is no summary. */
  excerpt: string;
}

/** Raster formats are delivered as WebP; svg/gif keep their format. */
const KEEP_FORMAT = new Set(["svg", "gif"]);

export function imagePublicPath(hash: string, extension: string, raw: boolean, base = "/img"): string {
  const ext = extension.toLowerCase().replace(/^\./, "");
  if (raw) return `${base}/raw/${hash}.${ext === "jpeg" ? "jpg" : ext}`;
  return `${base}/${hash}.${KEEP_FORMAT.has(ext) ? ext : "webp"}`;
}

export function postUrl(slug: string): string {
  return `/posts/${slug}/`;
}

export function seriesUrl(slug: string): string {
  return `/series/${slug}/`;
}

/**
 * Sanitize schema: GitHub's defaults plus the classes and attributes our own
 * transforms emit (callouts, math, mermaid, image sizing). Runs before KaTeX
 * and Shiki, whose output is trusted.
 */
const schema = {
  ...defaultSchema,
  // Content is authored by the site owner; keep footnote ids exactly as
  // remark-rehype generates them so references and definitions match.
  clobber: [],
  clobberPrefix: "",
  tagNames: [...(defaultSchema.tagNames ?? []), "mark", "details", "summary"],
  attributes: {
    ...defaultSchema.attributes,
    "*": [...(defaultSchema.attributes?.["*"] ?? []), "className"],
    img: [...(defaultSchema.attributes?.img ?? []), "loading", "decoding"],
    div: [...(defaultSchema.attributes?.div ?? []), "dataCallout"],
    details: ["open", "dataCallout"],
  },
};

type Processor = (markdown: string, context: LinkContext, stats: RenderStats) => Promise<string>;

let processorPromise: Promise<Processor> | null = null;

function getProcessor(): Promise<Processor> {
  processorPromise ??= (async () => {
    return async (markdown, context, stats) => {
      const file = await unified()
        .use(remarkParse)
        .use(remarkGfm)
        .use(remarkCjkFriendly)
        .use(remarkCjkFriendlyGfmStrikethrough)
        .use(remarkMath)
        .use(remarkObsidian, context)
        .use(remarkRehype, { allowDangerousHtml: true, footnoteLabel: "脚注", footnoteBackLabel: "返回正文" })
        .use(rehypeRaw)
        .use(rehypeSanitize, schema)
        .use(rehypeKatex)
        .use(rehypeShiki, {
          themes: { light: "github-light", dark: "github-dark" },
          defaultColor: false,
          lazy: true,
          fallbackLanguage: "text",
          addLanguageClass: true,
          transformers: [
            {
              pre(node) {
                node.properties["data-lang"] = this.options.lang;
              },
            },
          ],
        })
        .use(rehypeHeadings, stats)
        .use(rehypeLayout, stats)
        .use(rehypeStringify)
        .process(markdown);
      return String(file);
    };
  })();
  return processorPromise;
}

/** Build the link context for one note from the loaded vault model. */
export function linkContextFor(model: VaultModel, item: Post | Series, options: RenderOptions = {}): LinkContext {
  const base = options.imageBase ?? "/img";
  const images = new Map<string, ImageRef>();
  for (const ref of item.images) images.set(`${ref.raw ? "raw:" : ""}${ref.target}`, ref);
  const links = new Map<string, string | undefined>();
  for (const link of item.links) links.set(link.target, link.resolvedPath);
  const urlByPath = new Map<string, string>();
  for (const post of model.posts) urlByPath.set(post.path, postUrl(post.slug));
  for (const series of model.series) urlByPath.set(series.path, seriesUrl(series.slug));

  return {
    imageUrl(target, raw) {
      const ref = images.get(`${raw ? "raw:" : ""}${target}`) ?? images.get(target);
      if (!ref?.hash || !ref.resolvedPath) return null;
      const extension = path.posix.extname(ref.resolvedPath);
      return { url: imagePublicPath(ref.hash, extension, raw, base), width: ref.width, height: ref.height };
    },
    noteUrl(target) {
      const resolved = links.get(target);
      return resolved ? (urlByPath.get(resolved) ?? null) : null;
    },
  };
}

export async function renderNote(model: VaultModel, item: Post | Series, options: RenderOptions = {}): Promise<RenderedNote> {
  const stats: RenderStats = { toc: [], hasMath: false, hasMermaid: false, hasCode: false, text: "" };
  const process = await getProcessor();
  const html = await process(stripObsidianComments(item.body), linkContextFor(model, item, options), stats);
  const text = stats.text.replace(/\s+/g, " ").trim();
  return {
    html,
    toc: stats.toc,
    readingMinutes: readingMinutes(text),
    hasMath: stats.hasMath,
    hasMermaid: stats.hasMermaid,
    hasCode: stats.hasCode,
    excerpt: text.length > 120 ? `${text.slice(0, 120)}…` : text,
  };
}
