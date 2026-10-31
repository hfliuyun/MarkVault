#!/usr/bin/env node
import { stat } from "node:fs/promises";
import { parseArgs } from "node:util";
import { applyMigration, loadVault, planMigration, type Diagnostic } from "@markvault/content";
import { readConfig, resolveVaultPath } from "./config.ts";
import { buildSite, runInSite } from "./site.ts";

const USAGE = `用法：markvault <命令> [选项]

命令：
  check               校验全部内容，不上传、不部署
  preview             本地预览（astro dev），vault 改动后页面自动刷新
  build               校验后构建站点到 site/dist（含搜索索引）
  deploy              构建并部署到 Cloudflare（wrangler deploy）
  migrate             把旧格式内容转换为新格式（默认只预览，加 --apply 才会修改）

选项：
  --vault <路径>       vault 目录（默认读取 MARKVAULT_VAULT、~/.config/markvault/config.json，最后是 ./content）
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
      help: { type: "boolean", short: "h", default: false },
    },
  });
  const [command] = positionals;
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
      return runBuild(vault, config.ignore, false);
    case "deploy":
      return runBuild(vault, config.ignore, true);
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

async function runBuild(vault: string, ignore: string[] | undefined, deploy: boolean): Promise<number> {
  const { diagnostics } = await loadVault(vault, { ignore });
  const errors = diagnostics.filter((item) => item.level === "error");
  if (errors.length > 0) {
    printDiagnostics(errors);
    process.stderr.write(`\n✗ 有 ${errors.length} 个错误，已停止。先运行 markvault check 查看详情。\n`);
    return 1;
  }
  await buildSite({ vault });
  if (deploy) await runInSite("wrangler", ["deploy"], { vault });
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
    process.stderr.write(`markvault 出错：${(error as Error).stack ?? String(error)}\n`);
    process.exitCode = 1;
  },
);
