import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { Document, isMap, parseDocument, Scalar } from "yaml";
import { SLUG_PATTERN, formatNowForFrontmatter, splitFrontmatter } from "@markvault/content";

export interface PrepareResult {
  path: string;
  slug: string;
  changes: string[];
}

/** "Sub2API 部署实战：Fedora + Podman" → "sub2api-fedora-podman". Empty when nothing ASCII. */
export function suggestSlug(title: string): string {
  return (title.toLowerCase().match(/[a-z0-9]+/g) ?? []).join("-").slice(0, 60).replace(/-+$/, "");
}

async function askSlug(title: string, suggestion: string): Promise<string> {
  if (!process.stdin.isTTY) {
    throw new Error(`"${title}" 还没有 slug。请用 --slug 指定，例如 --slug ${suggestion || "my-post"}`);
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    for (;;) {
      const prompt = suggestion ? `slug（回车使用 ${suggestion}）：` : "slug（小写字母、数字和连字符）：";
      const answer = (await rl.question(prompt)).trim() || suggestion;
      if (SLUG_PATTERN.test(answer)) return answer;
      process.stdout.write("slug 只能用小写字母、数字和单个连字符，例如 aac-stream\n");
    }
  } finally {
    rl.close();
  }
}

/**
 * Mark one note for publishing: publish: true, a slug and a date. Edits the
 * YAML in place so the user's key order and comments survive.
 */
export async function prepareNote(vault: string, notePath: string, slugOption?: string): Promise<PrepareResult> {
  const absolute = path.resolve(vault, notePath);
  const relative = path.relative(vault, absolute).split(path.sep).join("/");
  if (relative.startsWith("../")) throw new Error(`${notePath} 不在 vault 里`);
  if (!relative.toLowerCase().endsWith(".md")) throw new Error(`${notePath} 不是 Markdown 笔记`);

  const raw = await readFile(absolute, "utf8").catch(() => {
    throw new Error(`找不到笔记 ${notePath}`);
  });
  const { frontmatterText, body } = splitFrontmatter(raw);
  const doc: Document = frontmatterText === null ? new Document({}) : parseDocument(frontmatterText, { schema: "core" });
  if (doc.errors.length > 0) throw new Error(`${relative} 的 frontmatter 无法解析：${doc.errors[0].message.split("\n")[0]}`);
  if (!isMap(doc.contents)) doc.contents = doc.createNode({}) as never;

  const changes: string[] = [];
  const title = String(doc.get("title") ?? path.basename(relative, ".md"));

  if (doc.get("publish") !== true) {
    if (doc.has("publish")) doc.set("publish", true);
    else (doc.contents as unknown as { items: unknown[] }).items.unshift(doc.createPair("publish", true));
    changes.push("publish: true");
  }

  let slug = typeof doc.get("slug") === "string" ? String(doc.get("slug")).trim() : "";
  if (slugOption && slugOption !== slug) {
    if (!SLUG_PATTERN.test(slugOption)) throw new Error(`--slug "${slugOption}" 不合法：只能用小写字母、数字和单个连字符`);
    if (slug) throw new Error(`这篇笔记已经有 slug "${slug}"。改 slug 会让旧链接失效，请手动修改并加上 redirect_from`);
    slug = slugOption;
    doc.set("slug", slug);
    changes.push(`slug: ${slug}`);
  } else if (!slug) {
    slug = await askSlug(title, suggestSlug(title));
    doc.set("slug", slug);
    changes.push(`slug: ${slug}`);
  }

  if (!doc.has("date")) {
    const now = new Scalar(formatNowForFrontmatter());
    doc.set("date", now);
    changes.push(`date: ${now.value}`);
  }

  if (changes.length > 0) {
    const yamlText = doc.toString({ lineWidth: 0, flowCollectionPadding: false }).trimEnd();
    await writeFile(absolute, `---\n${yamlText}\n---\n${body.startsWith("\n") ? "" : "\n"}${body}`, "utf8");
  }
  return { path: relative, slug, changes };
}

/** Set publish: true/false on a note (used by unpublish). */
export async function setPublishFlag(vault: string, notePath: string, value: boolean): Promise<void> {
  const absolute = path.resolve(vault, notePath);
  const raw = await readFile(absolute, "utf8").catch(() => {
    throw new Error(`找不到笔记 ${notePath}`);
  });
  const { frontmatterText, body } = splitFrontmatter(raw);
  if (frontmatterText === null) throw new Error(`${notePath} 没有 frontmatter`);
  const doc = parseDocument(frontmatterText, { schema: "core" });
  if (doc.errors.length > 0) throw new Error(`${notePath} 的 frontmatter 无法解析：${doc.errors[0].message.split("\n")[0]}`);
  doc.set("publish", value);
  await writeFile(absolute, `---\n${doc.toString({ lineWidth: 0, flowCollectionPadding: false }).trimEnd()}\n---\n${body.startsWith("\n") ? "" : "\n"}${body}`, "utf8");
}
