import path from "node:path";
import { hashFile, readManifest } from "./images.ts";
import { extractRefs, type RawImage, type RawLink } from "./links.ts";
import { FileResolver } from "./resolve.ts";
import { scanVault, type ScanOptions } from "./scan.ts";
import {
  KNOWN_POST_KEYS,
  KNOWN_SERIES_KEYS,
  checkDate,
  checkSlug,
  isLegacyFormat,
  isPublished,
  readString,
  readStringList,
  readWikilinkProperty,
  type FieldIssue,
} from "./schema.ts";
import type {
  Diagnostic,
  ImageRef,
  LoadResult,
  NoteFile,
  NoteLink,
  Post,
  Series,
  VaultModel,
} from "./types.ts";

export interface LoadOptions extends ScanOptions {
  /**
   * When true, a referenced local image that is not in images.json is an
   * error (build mode). When false it is only reported as pending (check mode).
   */
  requireUploaded?: boolean;
}

export async function loadVault(root: string, options: LoadOptions = {}): Promise<LoadResult> {
  const absoluteRoot = path.resolve(root);
  const diagnostics: Diagnostic[] = [];
  const { allFiles, notes } = await scanVault(absoluteRoot, options);
  const resolver = new FileResolver(allFiles);

  let manifest;
  try {
    manifest = await readManifest(absoluteRoot);
  } catch (error) {
    diagnostics.push({ level: "error", file: ".markvault/images.json", message: (error as Error).message });
    manifest = { version: 1 as const, paths: {}, assets: {} };
  }

  const report = (file: string, issues: FieldIssue[]) => {
    for (const issue of issues) diagnostics.push({ level: issue.level, file, message: issue.message });
  };

  // Pass 1: classify published notes and read their frontmatter.
  const posts: Post[] = [];
  const series: Series[] = [];
  const seriesTargets = new Map<Post, { target: string; order?: number }>();
  let legacyCount = 0;

  for (const note of notes) {
    if (note.frontmatterError) {
      // Unparseable frontmatter: an error when the note was meant to be
      // published, otherwise a warning so it does not vanish silently.
      const meantToPublish = /^publish:\s*true\s*$/m.test(note.frontmatterText ?? "");
      const looksLikePost = /^slug:/m.test(note.frontmatterText ?? "");
      if (meantToPublish || looksLikePost) {
        diagnostics.push({
          level: meantToPublish ? "error" : "warning",
          file: note.path,
          line: 1,
          message: `frontmatter 解析失败：${note.frontmatterError}`,
        });
      }
      continue;
    }
    if (isLegacyFormat(note.frontmatter)) legacyCount += 1;
    if (note.frontmatterText === null && /^\s*\n---[ \t]*\n[\s\S]*?^(slug|publish):/m.test(note.body)) {
      diagnostics.push({
        level: "warning",
        file: note.path,
        line: 1,
        message: "第一行不是 ---（frontmatter 前面有空行），Obsidian 和 markvault 都不会把它当成 frontmatter",
      });
    }
    if (!isPublished(note.frontmatter)) continue;

    const frontmatter = note.frontmatter as Record<string, unknown>;
    const type = frontmatter.type;
    if (type === "series") {
      const item = readSeries(note, frontmatter, report);
      if (item) series.push(item);
    } else if (type === undefined || type === null || type === "post") {
      const result = readPost(note, frontmatter, report);
      if (result) {
        posts.push(result.post);
        if (result.seriesTarget) seriesTargets.set(result.post, result.seriesTarget);
      }
    } else {
      diagnostics.push({ level: "error", file: note.path, message: `type "${String(type)}" 不认识，只能是 series 或不写` });
    }
  }

  if (legacyCount > 0) {
    diagnostics.push({
      level: "warning",
      file: ".",
      message: `发现 ${legacyCount} 篇旧格式文章（有 slug、没有 publish 字段），它们不会被发布。运行 markvault migrate 转换`,
    });
  }

  // Pass 2: global uniqueness of slugs, redirect_from and abbrlinks.
  const postsBySlug = new Map<string, Post>();
  const seriesBySlug = new Map<string, Series>();
  const claimed = new Map<string, string>();
  const claim = (slug: string, file: string, what: string) => {
    const owner = claimed.get(slug);
    if (owner) {
      diagnostics.push({ level: "error", file, message: `${what} "${slug}" 和 ${owner} 重复` });
      return false;
    }
    claimed.set(slug, file);
    return true;
  };
  for (const post of posts) if (claim(post.slug, post.path, "slug")) postsBySlug.set(post.slug, post);
  for (const item of series) if (claim(item.slug, item.path, "系列 slug")) seriesBySlug.set(item.slug, item);

  const slugRedirects = new Map<string, string>();
  for (const post of posts) {
    for (const old of post.redirectFrom) {
      if (claim(old, post.path, "redirect_from")) slugRedirects.set(old, post.slug);
    }
  }

  const legacyRedirects = new Map<string, string>();
  const abbrlinkOwner = new Map<string, string>();
  for (const post of posts) {
    for (const abbrlink of post.legacyAbbrlinks) {
      const owner = abbrlinkOwner.get(abbrlink);
      if (owner) {
        diagnostics.push({ level: "error", file: post.path, message: `legacy.abbrlinks "${abbrlink}" 已被 ${owner} 使用` });
        continue;
      }
      abbrlinkOwner.set(abbrlink, post.path);
      legacyRedirects.set(abbrlink, post.slug);
    }
  }

  // Pass 3: resolve series membership.
  const seriesByPath = new Map(series.map((item) => [item.path, item]));
  for (const [post, ref] of seriesTargets) {
    const resolved = resolver.resolve(ref.target, post.path, ".md");
    if (resolved.status === "ambiguous") {
      diagnostics.push({
        level: "error",
        file: post.path,
        message: `series "[[${ref.target}]]" 有多个同名笔记：${resolved.candidates.join("、")}，请写成带路径的链接`,
      });
      continue;
    }
    if (resolved.status === "missing") {
      diagnostics.push({ level: "error", file: post.path, message: `series 指向的笔记 "[[${ref.target}]]" 不存在` });
      continue;
    }
    const target = seriesByPath.get(resolved.path);
    if (!target) {
      diagnostics.push({
        level: "error",
        file: post.path,
        message: `series 指向的 ${resolved.path} 不是已发布的系列笔记（需要 publish: true 和 type: series）`,
      });
      continue;
    }
    post.series = { path: target.path, order: ref.order };
    target.posts.push(post);
  }
  for (const item of series) {
    item.posts.sort((a, b) => {
      const orderA = a.series?.order ?? Number.MAX_SAFE_INTEGER;
      const orderB = b.series?.order ?? Number.MAX_SAFE_INTEGER;
      if (orderA !== orderB) return orderA - orderB;
      return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
    });
    if (item.posts.length === 0) {
      diagnostics.push({ level: "warning", file: item.path, message: "这个系列还没有任何已发布的文章" });
    }
  }

  // Pass 4: links and images in every published note.
  const publishedPaths = new Set<string>([...posts.map((post) => post.path), ...series.map((item) => item.path)]);
  const manifestResolver = new FileResolver(Object.keys(manifest.paths));
  const pendingImages = new Map<string, string>();
  for (const item of [...posts, ...series]) {
    const refs = extractRefs(item.body, item.bodyStartLine - 1);
    for (const broken of refs.brokenImages) {
      diagnostics.push({
        level: "error",
        file: item.path,
        line: broken.line,
        message: `图片路径里有空格，Markdown 无法识别：${broken.text}。把空格写成 %20，或改用 ![[文件名]]`,
      });
    }
    item.links = resolveLinks(refs.links, item.path, resolver, publishedPaths, diagnostics);
    item.images = await resolveImages(refs.images, item.path, absoluteRoot, resolver, manifestResolver, manifest, options, pendingImages, diagnostics);
  }

  posts.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  const model: VaultModel = {
    root: absoluteRoot,
    notes,
    posts,
    series,
    postsBySlug,
    seriesBySlug,
    legacyRedirects,
    slugRedirects,
    pendingImages,
    manifest,
  };
  diagnostics.sort(compareDiagnostics);
  return { model, diagnostics };
}

function readPost(
  note: NoteFile,
  frontmatter: Record<string, unknown>,
  report: (file: string, issues: FieldIssue[]) => void,
): { post: Post; seriesTarget?: { target: string; order?: number } } | null {
  const issues: FieldIssue[] = [];
  const slug = checkSlug(frontmatter.slug, issues);
  const date = checkDate(frontmatter.date, "date", true, issues);
  const updated = checkDate(frontmatter.updated, "updated", false, issues);
  const title = readString(frontmatter.title) ?? note.stem;
  const summary = readString(frontmatter.summary) ?? "";
  const categories = readStringList(frontmatter.categories, "categories", issues);
  const tags = readStringList(frontmatter.tags, "tags", issues);
  const redirectFrom = readStringList(frontmatter.redirect_from, "redirect_from", issues);

  let seriesTarget: { target: string; order?: number } | undefined;
  if (frontmatter.series !== undefined && frontmatter.series !== null) {
    const target = readWikilinkProperty(frontmatter.series);
    if (target) seriesTarget = { target };
    else if (typeof frontmatter.series === "object" && !Array.isArray(frontmatter.series)) {
      issues.push({ level: "error", message: "series 还是旧格式 {id, title, order}。运行 markvault migrate 转换" });
    } else {
      issues.push({ level: "error", message: `series 必须是指向系列笔记的链接，例如 "[[音视频数据流基础]]"` });
    }
  }
  if (frontmatter.series_order !== undefined && frontmatter.series_order !== null) {
    if (!Number.isInteger(frontmatter.series_order)) {
      issues.push({ level: "error", message: "series_order 必须是整数" });
    } else if (!seriesTarget) {
      issues.push({ level: "warning", message: "写了 series_order 但没有 series，series_order 会被忽略" });
    } else {
      seriesTarget.order = frontmatter.series_order as number;
    }
  }

  let legacyAbbrlinks: string[] = [];
  if (frontmatter.legacy !== undefined && frontmatter.legacy !== null) {
    if (typeof frontmatter.legacy !== "object" || Array.isArray(frontmatter.legacy)) {
      issues.push({ level: "error", message: "legacy 必须是对象，例如 legacy: { abbrlinks: [a1b2c3d4] }" });
    } else {
      legacyAbbrlinks = readStringList((frontmatter.legacy as Record<string, unknown>).abbrlinks, "legacy.abbrlinks", issues);
    }
  }
  for (const old of redirectFrom) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(old)) issues.push({ level: "error", message: `redirect_from "${old}" 不是合法的 slug` });
  }

  const extra: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(frontmatter)) {
    if (KNOWN_POST_KEYS.has(key)) continue;
    extra[key] = value;
    issues.push({
      level: "warning",
      message: key === "notion" ? "notion 字段已不再使用，可以删除" : `未知字段 ${key}，会被忽略`,
    });
  }

  report(note.path, issues);
  if (!slug || !date || issues.some((issue) => issue.level === "error")) return null;

  return {
    post: {
      kind: "post",
      path: note.path,
      slug,
      title,
      date,
      updated,
      summary,
      categories,
      tags,
      redirectFrom,
      legacyAbbrlinks,
      extra,
      body: note.body,
      bodyStartLine: note.bodyStartLine,
      images: [],
      links: [],
    },
    seriesTarget,
  };
}

function readSeries(
  note: NoteFile,
  frontmatter: Record<string, unknown>,
  report: (file: string, issues: FieldIssue[]) => void,
): Series | null {
  const issues: FieldIssue[] = [];
  const slug = checkSlug(frontmatter.slug, issues);
  for (const key of Object.keys(frontmatter)) {
    if (!KNOWN_SERIES_KEYS.has(key)) issues.push({ level: "warning", message: `系列笔记里的字段 ${key} 不会被使用` });
  }
  report(note.path, issues);
  if (!slug || issues.some((issue) => issue.level === "error")) return null;
  return {
    kind: "series",
    path: note.path,
    slug,
    title: readString(frontmatter.title) ?? note.stem,
    body: note.body,
    bodyStartLine: note.bodyStartLine,
    images: [],
    links: [],
    posts: [],
  };
}

function resolveLinks(
  raw: RawLink[],
  fromNote: string,
  resolver: FileResolver,
  publishedPaths: Set<string>,
  diagnostics: Diagnostic[],
): NoteLink[] {
  const result: NoteLink[] = [];
  for (const link of raw) {
    const item: NoteLink = { target: link.target, heading: link.heading, embed: link.embed, line: link.line };
    if (!link.target) {
      result.push(item); // same-note heading link: [[#标题]]
      continue;
    }
    const resolved = resolver.resolve(link.target, fromNote, ".md");
    if (resolved.status === "found") {
      item.resolvedPath = resolved.path;
      if (!resolved.path.toLowerCase().endsWith(".md")) {
        diagnostics.push({ level: "warning", file: fromNote, line: link.line, message: `链接指向非笔记文件 ${resolved.path}，发布后不会生成链接` });
      } else if (!publishedPaths.has(resolved.path)) {
        diagnostics.push({ level: "warning", file: fromNote, line: link.line, message: `链接 "${link.target}" 指向未发布的笔记，发布后只显示文字` });
      } else if (link.embed) {
        diagnostics.push({ level: "warning", file: fromNote, line: link.line, message: `不支持嵌入整篇笔记 ![[${link.target}]]，会降级为普通链接` });
      }
    } else if (resolved.status === "ambiguous") {
      diagnostics.push({ level: "warning", file: fromNote, line: link.line, message: `链接 "${link.target}" 有多个同名笔记：${resolved.candidates.join("、")}` });
    } else {
      diagnostics.push({ level: "warning", file: fromNote, line: link.line, message: `链接 "${link.target}" 指向的文件不存在，发布后只显示文字` });
    }
    result.push(item);
  }
  return result;
}

async function resolveImages(
  raw: RawImage[],
  fromNote: string,
  root: string,
  resolver: FileResolver,
  manifestResolver: FileResolver,
  manifest: VaultModel["manifest"],
  options: LoadOptions,
  pendingImages: Map<string, string>,
  diagnostics: Diagnostic[],
): Promise<ImageRef[]> {
  const result: ImageRef[] = [];
  for (const image of raw) {
    const ref: ImageRef = { ...image };
    const resolved = resolver.resolve(image.target, fromNote);
    if (resolved.status === "found") {
      ref.resolvedPath = resolved.path;
      const { key, sha256 } = await hashFile(path.join(root, resolved.path));
      ref.hash = key;
      const asset = manifest.assets[key];
      if (asset) {
        ref.width ??= asset.width;
        ref.height ??= asset.height;
      } else {
        pendingImages.set(resolved.path, sha256);
        if (options.requireUploaded) {
          diagnostics.push({ level: "error", file: fromNote, line: image.line, message: `图片 ${resolved.path} 还没有上传，先运行 markvault publish` });
        }
      }
    } else if (resolved.status === "ambiguous") {
      diagnostics.push({
        level: "error",
        file: fromNote,
        line: image.line,
        message: `图片 ${image.target} 有多个同名文件：${resolved.candidates.join("、")}，请写成带路径的引用`,
      });
    } else {
      const manifestResolved = manifestResolver.resolve(image.target, fromNote);
      const manifestPath = manifestResolved.status === "found" ? manifestResolved.path : undefined;
      const key = manifestPath ? manifest.paths[manifestPath] : undefined;
      if (manifestPath && key && manifest.assets[key]) {
        ref.resolvedPath = manifestPath;
        ref.hash = key;
        ref.width ??= manifest.assets[key].width;
        ref.height ??= manifest.assets[key].height;
      } else {
        diagnostics.push({ level: "error", file: fromNote, line: image.line, message: `图片 ${image.target} 找不到：本地没有这个文件，images.json 里也没有记录` });
      }
    }
    result.push(ref);
  }
  return result;
}

function compareDiagnostics(a: Diagnostic, b: Diagnostic): number {
  if (a.level !== b.level) return a.level === "error" ? -1 : 1;
  if (a.file !== b.file) return a.file < b.file ? -1 : 1;
  return (a.line ?? 0) - (b.line ?? 0);
}
