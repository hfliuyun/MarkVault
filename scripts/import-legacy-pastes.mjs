// 一次性脚本：把 Flask 时代的 server_flask/data/pastes/*.json 导入 D1（设计文档第 9 节阶段 4）。
// 跳过已过期的；可以重复执行（按 id 先删后插）。阶段 6 删除旧代码时一起删掉。
//
//   node scripts/import-legacy-pastes.mjs <pastes 目录> [--local]
//
// 导入后逐条比对 D1 里内容的 sha256。
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const [dir, flag] = process.argv.slice(2);
if (!dir) {
  console.error("用法：node scripts/import-legacy-pastes.mjs <pastes 目录> [--local]");
  process.exit(1);
}
const target = flag === "--local" ? "--local" : "--remote";
const siteDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "site");
const wrangler = path.join(siteDir, "..", "node_modules", ".bin", "wrangler");

const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const sha256 = (text) => createHash("sha256").update(text, "utf8").digest("hex");
// D1 limits one SQL statement to 100KB, so long content is appended in pieces.
// Split by code point so no surrogate pair is cut in half.
const chunks = (text, size = 20_000) => {
  const points = Array.from(text);
  const out = [];
  for (let i = 0; i < points.length; i += size) out.push(points.slice(i, i + size).join(""));
  return out.length ? out : [""];
};

const now = Math.floor(Date.now() / 1000);
const statements = [];
const imported = [];
for (const file of readdirSync(dir).filter((name) => name.endsWith(".json")).sort()) {
  const paste = JSON.parse(readFileSync(path.join(dir, file), "utf8"));
  if (!/^[a-z0-9]{8}$/.test(paste.id ?? "")) {
    console.warn(`跳过 ${file}：id 格式不对`);
    continue;
  }
  const created = Math.floor(Date.parse(paste.created_at) / 1000);
  const expires = paste.expires_at ? Math.floor(Date.parse(paste.expires_at) / 1000) : null;
  // NaN would land in the SQL as a bare word, so stop before writing anything.
  if (!Number.isFinite(created) || (expires !== null && !Number.isFinite(expires))) {
    console.error(`${file}：created_at 或 expires_at 不是有效时间，没有导入任何内容`);
    process.exit(1);
  }
  if (expires !== null && expires <= now) {
    console.log(`跳过 ${paste.id}：已过期`);
    continue;
  }
  const [first, ...rest] = chunks(paste.content ?? "");
  statements.push(`DELETE FROM pastes WHERE id = ${quote(paste.id)};`);
  statements.push(
    `INSERT INTO pastes (id, title, content, language, created_at, expires_at, device_id) VALUES (` +
      [quote(paste.id), quote(paste.title ?? ""), quote(first), quote(paste.language || "text"), created, expires ?? "NULL", "NULL"].join(", ") +
      ");",
  );
  for (const piece of rest) statements.push(`UPDATE pastes SET content = content || ${quote(piece)} WHERE id = ${quote(paste.id)};`);
  imported.push({ id: paste.id, title: paste.title, hash: sha256(paste.content ?? "") });
}

if (imported.length === 0) {
  console.log("没有需要导入的 paste。");
  process.exit(0);
}

const tmp = mkdtempSync(path.join(os.tmpdir(), "mv-import-"));
const sqlFile = path.join(tmp, "pastes.sql");
writeFileSync(sqlFile, `${statements.join("\n")}\n`, "utf8");
const run = (args) => execFileSync(wrangler, ["d1", "execute", "markvault", target, "--yes", ...args], { cwd: siteDir, encoding: "utf8" });
try {
  run(["--file", sqlFile]);
  const rows = JSON.parse(
    run(["--json", "--command", `SELECT id, content FROM pastes WHERE id IN (${imported.map((item) => quote(item.id)).join(", ")})`]),
  )[0].results;
  let ok = true;
  for (const item of imported) {
    const row = rows.find((other) => other.id === item.id);
    const same = row && sha256(row.content) === item.hash;
    ok &&= Boolean(same);
    console.log(`${same ? "✓" : "✗"} ${item.id} ${item.title ?? ""}${same ? "" : "（内容不一致）"}`);
  }
  process.exit(ok ? 0 : 1);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
