#!/usr/bin/env node
import { stat } from "node:fs/promises";
import { parseArgs } from "node:util";
import {
  applyMigration,
  loadVault,
  planMigration,
  postUrl,
  readPublished,
  writePublished,
  type Diagnostic,
} from "@markvault/content";
import { readConfig, resolveVaultPath, type CliConfig } from "./config.ts";
import { commitVault } from "./git.ts";
import { requireCredentials } from "./images/cloudinary.ts";
import { syncImages, writeManifestPaths } from "./images/upload.ts";
import { prepareNote, setPublishFlag } from "./note.ts";
import { buildSite, runInSite } from "./site.ts";

const USAGE = `用法：markvault <命令> [选项]

命令：
  check               校验全部内容，不上传、不部署
  publish [笔记]       发布：补 slug/date → 校验 → 压缩并上传新图片 → 构建 → 部署 → 提交 vault
  unpublish <笔记>     把笔记的 publish 改成 false，然后发布
  preview             本地预览（astro dev），vault 改动后页面自动刷新
  build               校验后构建站点到 site/dist（含搜索索引）
  deploy              只构建和部署（代码改动用；不上传图片、不提交 vault）
  migrate             把旧格式内容转换为新格式（默认只预览，加 --apply 才会修改）

选项：
  --vault <路径>       vault 目录（默认读取 MARKVAULT_VAULT、~/.config/markvault/config.json，最后是 ./content）
  --slug <slug>       publish 一篇还没有 slug 的笔记时指定 slug
  --no-git            publish 时不提交、不推送 vault
  --apply             migrate 时真正写入
  -h, --help          显示帮助
`;

async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      vault: { type: "string" },
      apply: { type: "boolean", default: false },
      slug: { type: "string" },
      "no-git": { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  const [command, target] = positionals;
  if (values.help || !command) {
    process.stdout.write(USAGE);
    return command || values.help ? 0 : 1;
  }

  const config = await readConfig();
  const vault = resolveVaultPath(values.vault, config);
  if (!(await isDirectory(vault))) {
    process.stderr.write(`vault 目录不存在：${vault}\n`);
    return 1;
  }

  switch (command) {
    case "check":
      return runCheck(vault, config.ignore);
    case "migrate":
      return runMigrate(vault, values.apply);
    case "preview":
      await runInSite("astro", ["dev"], { vault });
      return 0;
    case "build":
      return runBuild(vault, config, false);
    case "deploy":
      return runBuild(vault, config, true);
    case "publish":
      return runPublish(vault, config, { note: target, slug: values.slug, git: !values["no-git"] });
    case "unpublish":
      if (!target) {
        process.stderr.write("用法：markvault unpublish <笔记路径>\n");
        return 1;
      }
      await setPublishFlag(vault, target, false);
      process.stdout.write(`${target}：publish 改为 false\n`);
      return runPublish(vault, config, { git: !values["no-git"] });
    default:
      process.stderr.write(`未知命令：${command}\n\n${USAGE}`);
      return 1;
  }
}

async function runCheck(vault: string, ignore: string[] | undefined): Promise<number> {
  const { model, diagnostics } = await loadVault(vault, { ignore });
  printDiagnostics(diagnostics);

  const errors = diagnostics.filter((item) => item.level === "error").length;
  const warnings = diagnostics.length - errors;
  const lines = [
    `vault：${model.root}`,
    `文章 ${model.posts.length} 篇，系列 ${model.series.length} 个`,
  ];
  if (model.pendingImages.size > 0) lines.push(`待上传图片 ${model.pendingImages.size} 张（publish 时会上传）`);
  lines.push(errors > 0 ? `✗ ${errors} 个错误，${warnings} 个警告` : `✓ 没有错误，${warnings} 个警告`);
  process.stdout.write(`\n${lines.join("\n")}\n`);
  return errors > 0 ? 1 : 0;
}

function stopOnErrors(diagnostics: Diagnostic[]): boolean {
  const errors = diagnostics.filter((item) => item.level === "error");
  if (errors.length === 0) return false;
  printDiagnostics(errors);
  process.stderr.write(`\n✗ 有 ${errors.length} 个错误，已停止。先运行 markvault check 查看详情。\n`);
  return true;
}

function cloudName(config: CliConfig): string {
  return requireCredentials(config.cloudinary).cloud_name;
}

/** build: for local testing (images may be pending). deploy: production build, then wrangler deploy. */
async function runBuild(vault: string, config: CliConfig, deploy: boolean): Promise<number> {
  const { diagnostics } = await loadVault(vault, { ignore: config.ignore, requireUploaded: deploy });
  if (stopOnErrors(diagnostics)) return 1;
  await buildSite({ vault, requireUploaded: deploy });
  if (deploy) await runInSite("wrangler", ["deploy", "--var", `CLOUDINARY_CLOUD:${cloudName(config)}`], { vault });
  return 0;
}

async function runPublish(
  vault: string,
  config: CliConfig,
  options: { note?: string; slug?: string; git: boolean },
): Promise<number> {
  const step = (text: string) => process.stdout.write(`\n▸ ${text}\n`);

  if (options.note) {
    const prepared = await prepareNote(vault, options.note, options.slug);
    step(`准备笔记 ${prepared.path}`);
    process.stdout.write(prepared.changes.length ? `  写入 ${prepared.changes.join("，")}\n` : "  frontmatter 无需修改\n");
  }

  step("校验");
  let { model, diagnostics } = await loadVault(vault, { ignore: config.ignore });
  const warnings = diagnostics.filter((item) => item.level === "warning");
  if (stopOnErrors(diagnostics)) return 1;
  if (warnings.length > 0) printDiagnostics(warnings);
  process.stdout.write(`  文章 ${model.posts.length} 篇，系列 ${model.series.length} 个，${warnings.length} 个警告\n`);

  if (model.pendingImages.size > 0) {
    step(`上传 ${model.pendingImages.size} 张新图片（无损压缩后上传 Cloudinary）`);
    const report = await syncImages(model, requireCredentials(config.cloudinary), (line) => process.stdout.write(`${line}\n`));
    const saved = report.bytesOriginal - report.bytesUploaded;
    process.stdout.write(`  完成 ${report.uploaded} 张，共省下 ${Math.round(saved / 1024)}KB\n`);
    ({ model, diagnostics } = await loadVault(vault, { ignore: config.ignore, requireUploaded: true }));
    if (stopOnErrors(diagnostics)) return 1;
  } else {
    // Keep images.json paths in step with renamed/removed references.
    await writeManifestPaths(model);
  }

  step("构建");
  await buildSite({ vault, requireUploaded: true });

  step("部署");
  await runInSite("wrangler", ["deploy", "--var", `CLOUDINARY_CLOUD:${cloudName(config)}`], { vault });

  const previous = await readPublished(vault);
  const next = {
    version: 1 as const,
    deployed_at: new Date().toISOString(),
    posts: Object.fromEntries(model.posts.map((post) => [post.slug, post.path])),
    series: Object.fromEntries(model.series.map((item) => [item.slug, item.path])),
  };
  const unchanged =
    previous !== null &&
    JSON.stringify(Object.entries(previous.posts).sort()) === JSON.stringify(Object.entries(next.posts).sort()) &&
    JSON.stringify(Object.entries(previous.series).sort()) === JSON.stringify(Object.entries(next.series).sort());
  // Only rewrite the record when the set of live pages changed, so a re-deploy
  // does not create an empty-looking commit.
  if (!unchanged) await writePublished(vault, next);
  const added = model.posts.filter((post) => !previous?.posts[post.slug]);
  const removed = Object.keys(previous?.posts ?? {}).filter((slug) => !next.posts[slug]);

  if (options.git) {
    step("提交 vault");
    const result = await commitVault(vault, `publish: ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`);
    process.stdout.write(`  ${result.committed ? "已提交" : "没有需要提交的改动"}${result.pushed ? "，已推送" : ""}\n`);
    if (result.message) process.stdout.write(`  ${result.message}\n`);
  }

  const base = (config.site_url ?? "").replace(/\/$/, "");
  process.stdout.write("\n✓ 发布完成\n");
  if (previous) {
    for (const post of added) process.stdout.write(`  新文章：${post.title}  ${base}${postUrl(post.slug)}\n`);
    for (const slug of removed) process.stdout.write(`  已下线：${slug}\n`);
  }
  return 0;
}

async function runMigrate(vault: string, apply: boolean): Promise<number> {
  const plan = await planMigration(vault);
  if (plan.actions.length === 0 && plan.errors.length === 0) {
    process.stdout.write("没有需要迁移的旧格式内容。\n");
    return 0;
  }

  for (const action of plan.actions) {
    const label = action.kind === "create" ? "新建" : action.kind === "rename" ? "改名" : "改写";
    const head = action.from && action.from !== action.to ? `${action.from}\n      → ${action.to}` : action.to;
    process.stdout.write(`[${label}] ${head}\n`);
    for (const line of action.summary) process.stdout.write(`      · ${line}\n`);
  }
  if (plan.notes.length > 0) {
    process.stdout.write("\n需要留意：\n");
    for (const note of plan.notes) process.stdout.write(`  · ${note}\n`);
  }
  if (plan.errors.length > 0) {
    process.stdout.write("\n错误（不会做任何修改）：\n");
    for (const error of plan.errors) process.stdout.write(`  ✗ ${error}\n`);
    return 1;
  }

  if (!apply) {
    process.stdout.write(`\n以上为预览，共 ${plan.actions.length} 项。确认后加 --apply 执行。建议先提交 vault 的 git，方便查看 diff。\n`);
    return 0;
  }
  await applyMigration(vault, plan);
  process.stdout.write(`\n已完成 ${plan.actions.length} 项。接下来运行 markvault check。\n`);
  return 0;
}

function printDiagnostics(diagnostics: Diagnostic[]): void {
  let currentFile = "";
  for (const item of diagnostics) {
    if (item.file !== currentFile) {
      currentFile = item.file;
      process.stdout.write(`\n${item.file}\n`);
    }
    const mark = item.level === "error" ? "✗ 错误" : "! 警告";
    const where = item.line ? `第 ${item.line} 行：` : "";
    process.stdout.write(`  ${mark}  ${where}${item.message}\n`);
  }
}

async function isDirectory(target: string): Promise<boolean> {
  try {
    return (await stat(target)).isDirectory();
  } catch {
    return false;
  }
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    const detail = process.env.MARKVAULT_DEBUG ? ((error as Error).stack ?? String(error)) : (error as Error).message;
    process.stderr.write(`✗ ${detail}\n`);
    process.exitCode = 1;
  },
);
