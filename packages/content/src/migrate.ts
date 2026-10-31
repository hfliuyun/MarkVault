import { mkdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { composeNote } from "./frontmatter.ts";
import { scanVault } from "./scan.ts";
import { readString } from "./schema.ts";

/**
 * One-time conversion from the Flask-era layout:
 *   posts/<dir>/index.md, series/<dir>/<dir>/index.md, series/<dir>/README.md,
 *   frontmatter series: {id, title, order}, notion: {...}
 * to the vault model in the design doc (publish: true, series wikilink,
 * series notes with type: series, notes named after their titles).
 */

export interface MigrationAction {
  kind: "rewrite" | "rename" | "create";
  from?: string;
  to: string;
  summary: string[];
}

export interface MigrationPlan {
  actions: MigrationAction[];
  notes: string[];
  errors: string[];
  /** Final file contents keyed by destination path. */
  contents: Map<string, string>;
  /** Source files that will be removed after their content moves. */
  removals: string[];
}

interface LegacyPost {
  path: string;
  frontmatter: Record<string, unknown>;
  body: string;
  seriesId?: string;
  seriesTitle?: string;
  seriesOrder?: number;
}

interface SeriesPlan {
  id: string;
  title: string;
  titleSource: string;
  /** Existing README to convert, if any. */
  readmePath?: string;
  readmeBody: string;
  destination: string;
}

const KEY_ORDER = [
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
];

/** Characters Obsidian does not allow in note names, mapped to safe ones. */
const FILENAME_REPLACEMENTS: Record<string, string> = {
  ":": "：",
  "/": "／",
  "\\": "＼",
  "*": "＊",
  "?": "？",
  '"': "＂",
  "<": "＜",
  ">": "＞",
  "|": "｜",
  "#": "＃",
  "^": "＾",
  "[": "【",
  "]": "】",
};

export function titleToFileStem(title: string): string {
  const replaced = [...title].map((char) => FILENAME_REPLACEMENTS[char] ?? char).join("");
  return replaced.replace(/\s+/g, " ").replace(/^\.+/, "").trim() || "untitled";
}

const LEGACY_POST_PATH = /^(posts\/[^/]+|series\/[^/]+\/[^/]+)\/([^/]+)\.md$/;
const LEGACY_README_PATH = /^series\/([^/]+)\/README\.md$/;
const SPACED_IMAGE = /(!\[[^\]\n]*\]\()([^)<>\n]*\s[^)<>\n]*)(\))/g;
/** A frontmatter block pushed down by blank lines; nobody parses it. */
export const LEADING_BLANK_FRONTMATTER = /^\s*\n---[ \t]*\n[\s\S]*?\n---[ \t]*(\n|$)/;

export async function planMigration(root: string): Promise<MigrationPlan> {
  const absoluteRoot = path.resolve(root);
  const { notes } = await scanVault(absoluteRoot);
  const plan: MigrationPlan = { actions: [], notes: [], errors: [], contents: new Map(), removals: [] };

  const legacyPosts: LegacyPost[] = [];
  const readmes = new Map<string, { path: string; title?: string; body: string }>();

  for (const note of notes) {
    const readme = LEGACY_README_PATH.exec(note.path);
    if (readme) {
      if (note.frontmatterError) {
        plan.errors.push(`${note.path}: frontmatter 解析失败（${note.frontmatterError}），请先手动修正`);
        continue;
      }
      readmes.set(readme[1], { path: note.path, title: readString(note.frontmatter?.title), body: note.body });
      continue;
    }

    const match = LEGACY_POST_PATH.exec(note.path);
    if (!match) continue;
    const [, directory, stem] = match;
    if (stem !== "index" && stem !== path.posix.basename(directory)) continue;
    if (note.frontmatterText === null && LEADING_BLANK_FRONTMATTER.test(note.body)) {
      plan.errors.push(`${note.path}: 第一行不是 ---（frontmatter 前面有空行），Obsidian 也不会识别。删掉开头的空行后再迁移`);
      continue;
    }
    if (note.frontmatterError) {
      plan.errors.push(`${note.path}: frontmatter 解析失败（${note.frontmatterError}），请先手动修正后再迁移`);
      continue;
    }
    const frontmatter = note.frontmatter;
    if (!frontmatter || "publish" in frontmatter) continue;
    if (typeof frontmatter.slug !== "string") continue;

    const item: LegacyPost = { path: note.path, frontmatter, body: note.body };
    const series = frontmatter.series;
    if (series && typeof series === "object" && !Array.isArray(series)) {
      const record = series as Record<string, unknown>;
      item.seriesId = readString(record.id);
      item.seriesTitle = readString(record.title);
      if (Number.isInteger(record.order)) item.seriesOrder = record.order as number;
    }
    legacyPosts.push(item);
  }

  // Decide one series note per series id.
  const seriesPlans = new Map<string, SeriesPlan>();
  const postsBySeries = new Map<string, LegacyPost[]>();
  for (const post of legacyPosts) {
    if (!post.seriesId) continue;
    const list = postsBySeries.get(post.seriesId) ?? [];
    list.push(post);
    postsBySeries.set(post.seriesId, list);
  }
  const usedReadmes = new Set<string>();
  for (const [id, posts] of [...postsBySeries].sort(([a], [b]) => (a < b ? -1 : 1))) {
    posts.sort((a, b) => (a.path < b.path ? -1 : 1));
    const titles = [...new Set(posts.map((post) => post.seriesTitle).filter(Boolean))] as string[];

    // The Flask index only used series/<id>/README.md. When the folder name
    // differs from the id, fall back to a README in the folder holding the posts.
    let readmeKey: string | undefined;
    if (readmes.has(id)) readmeKey = id;
    else {
      const folders = new Set(
        posts.map((post) => /^series\/([^/]+)\//.exec(post.path)?.[1]).filter(Boolean) as string[],
      );
      if (folders.size === 1) {
        const [folder] = folders;
        if (readmes.has(folder)) readmeKey = folder;
      }
    }
    const readme = readmeKey ? readmes.get(readmeKey) : undefined;
    if (readmeKey) usedReadmes.add(readmeKey);

    let title: string;
    let titleSource: string;
    if (readme?.title && readmeKey === id) {
      title = readme.title;
      titleSource = `README 标题（当前线上显示）`;
    } else if (titles.length > 0) {
      title = titles[0];
      titleSource = `文章里的 series.title（当前线上显示）`;
    } else {
      title = id;
      titleSource = "系列 id";
    }
    if (titles.length > 1) {
      plan.notes.push(`系列 ${id} 的文章里写了不同的标题：${titles.join("、")}。使用"${title}"`);
    }
    if (readme?.title && readme.title !== title) {
      plan.notes.push(`系列 ${id} 的 README 标题是"${readme.title}"，但线上显示的是"${title}"，迁移后使用"${title}"。需要的话改系列笔记的 title`);
    }

    const folder = readme ? path.posix.dirname(readme.path) : path.posix.dirname(path.posix.dirname(posts[0].path));
    const destination = `${folder === "." ? "" : `${folder}/`}${titleToFileStem(title)}.md`;
    seriesPlans.set(id, { id, title, titleSource, readmePath: readme?.path, readmeBody: readme?.body ?? "", destination });
  }
  for (const [key, readme] of readmes) {
    if (!usedReadmes.has(key)) plan.notes.push(`${readme.path} 没有对应的文章，保持不动`);
  }

  // Destination names must be unique as Obsidian note names.
  const takenNames = new Map<string, string>();
  for (const note of notes) takenNames.set(note.stem.toLowerCase(), note.path);
  const movingAway = new Set<string>([...legacyPosts.map((post) => post.path), ...[...seriesPlans.values()].flatMap((item) => (item.readmePath ? [item.readmePath] : []))]);
  for (const movedPath of movingAway) {
    const stem = path.posix.basename(movedPath, ".md").toLowerCase();
    if (takenNames.get(stem) === movedPath) takenNames.delete(stem);
  }
  const reserveName = (destination: string, fallbackSuffix: string): string => {
    const stem = path.posix.basename(destination, ".md");
    let candidate = destination;
    if (takenNames.has(stem.toLowerCase())) {
      candidate = `${path.posix.dirname(destination)}/${stem} (${fallbackSuffix}).md`;
    }
    const finalStem = path.posix.basename(candidate, ".md").toLowerCase();
    if (takenNames.has(finalStem)) {
      plan.errors.push(`无法为 ${destination} 找到不重名的文件名，请手动处理`);
    }
    takenNames.set(finalStem, candidate);
    return candidate;
  };

  for (const item of seriesPlans.values()) {
    item.destination = reserveName(item.destination, item.id);
    const frontmatter = { publish: true, type: "series", title: item.title, slug: item.id };
    plan.contents.set(item.destination, composeNote(frontmatter, fixSpacedImages(item.readmeBody)));
    plan.actions.push({
      kind: item.readmePath ? "rename" : "create",
      from: item.readmePath,
      to: item.destination,
      summary: [
        `系列笔记 slug: ${item.id}`,
        `title: ${item.title}（来源：${item.titleSource}）`,
        item.readmePath ? "正文来自 README" : "新建，正文为空，可以补上系列简介",
      ],
    });
    if (item.readmePath) plan.removals.push(item.readmePath);
  }

  for (const post of [...legacyPosts].sort((a, b) => (String(a.frontmatter.slug) < String(b.frontmatter.slug) ? -1 : 1))) {
    const summary: string[] = ["加上 publish: true"];
    const next: Record<string, unknown> = { publish: true };
    for (const [key, value] of Object.entries(post.frontmatter)) {
      if (key === "notion") {
        summary.push("删除 notion 字段");
        continue;
      }
      if (key === "series") continue;
      next[key] = value;
    }
    if (post.seriesId) {
      const seriesPlan = seriesPlans.get(post.seriesId)!;
      const linkName = path.posix.basename(seriesPlan.destination, ".md");
      next.series = `[[${linkName}]]`;
      if (post.seriesOrder !== undefined) next.series_order = post.seriesOrder;
      summary.push(`series → "[[${linkName}]]"${post.seriesOrder !== undefined ? `，series_order: ${post.seriesOrder}` : ""}`);
    }

    const title = readString(post.frontmatter.title) ?? path.posix.basename(path.posix.dirname(post.path));
    const directory = path.posix.dirname(post.path);
    const destination = reserveName(`${directory}/${titleToFileStem(title)}.md`, String(post.frontmatter.slug));
    const body = fixSpacedImages(post.body);
    if (body !== post.body) summary.push("图片路径中的空格改写为 %20");

    plan.contents.set(destination, composeNote(orderKeys(next), body));
    plan.actions.push({
      kind: destination === post.path ? "rewrite" : "rename",
      from: post.path,
      to: destination,
      summary,
    });
    if (destination !== post.path) plan.removals.push(post.path);
  }

  plan.actions.sort((a, b) => (a.to < b.to ? -1 : 1));
  return plan;
}

export async function applyMigration(root: string, plan: MigrationPlan): Promise<void> {
  if (plan.errors.length > 0) throw new Error("迁移计划有错误，未做任何修改");
  const absoluteRoot = path.resolve(root);

  // Refuse to overwrite files that are not part of the plan.
  const removals = new Set(plan.removals);
  for (const destination of plan.contents.keys()) {
    const target = path.join(absoluteRoot, destination);
    const isRewriteInPlace = plan.actions.some((action) => action.kind === "rewrite" && action.to === destination);
    if (!isRewriteInPlace && !removals.has(destination) && (await exists(target))) {
      throw new Error(`目标文件已存在：${destination}，未做任何修改`);
    }
  }

  // Write everything to temporary files first, then move into place.
  const staged: [string, string][] = [];
  for (const [destination, content] of plan.contents) {
    const target = path.join(absoluteRoot, destination);
    await mkdir(path.dirname(target), { recursive: true });
    const temporary = `${target}.markvault-migrate.tmp`;
    await writeFile(temporary, content, "utf8");
    staged.push([temporary, target]);
  }
  const destinations = new Set(plan.contents.keys());
  for (const removal of plan.removals) {
    if (destinations.has(removal)) continue;
    const source = path.join(absoluteRoot, removal);
    // Keep a copy until the new file is in place, then drop it.
    await rename(source, `${source}.markvault-migrate.old`);
  }
  for (const [temporary, target] of staged) await rename(temporary, target);
  for (const removal of plan.removals) {
    if (destinations.has(removal)) continue;
    await unlink(path.join(absoluteRoot, `${removal}.markvault-migrate.old`));
  }
}

function orderKeys(record: Record<string, unknown>): Record<string, unknown> {
  const ordered: Record<string, unknown> = {};
  for (const key of KEY_ORDER) if (key in record) ordered[key] = record[key];
  for (const [key, value] of Object.entries(record)) if (!(key in ordered)) ordered[key] = value;
  return ordered;
}

/** `![a](images/x y.png)` → `![a](images/x%20y.png)`, outside code fences. */
export function fixSpacedImages(body: string): string {
  let inFence = false;
  return body
    .split("\n")
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
      if (inFence) return line;
      return line.replace(SPACED_IMAGE, (_, open: string, target: string, close: string) => `${open}${target.trim().replace(/ /g, "%20")}${close}`);
    })
    .join("\n");
}

async function exists(file: string): Promise<boolean> {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

