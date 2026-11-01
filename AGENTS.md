# 仓库协作指南

MarkVault 是一个 Markdown 优先的个人博客。文章写在 Obsidian vault 里，在本机构建成静态站点，部署到 Cloudflare Workers（免费套餐）。完整设计见 `docs/specs/2026-11-01-cloudflare-migration-design.md`，从 Flask + Vue 迁移过来的记录见 `docs/migration-progress.md`。

**这个仓库是公开的。** 不要提交服务器地址、SSH 用户和密钥路径、token（包括前缀）、zone id、本机绝对路径、设备名这类信息。本机相关的配置放在 `~/.config/markvault/config.json`，不进仓库。

## 项目结构

- `packages/content/`：内容层，构建和 CLI 共用。扫描 vault、解析和校验 frontmatter、建立文章 / 系列 / 分类 / 标签索引、渲染 Markdown（`render/`）、读写 `images.json` 和 `published.json`。
- `packages/cli/`：`markvault` 命令。图片无损压缩和 Cloudinary 上传（`images/`）、修改笔记 frontmatter（`note.ts`）、提交 vault（`git.ts`）、调用 Astro 和 wrangler（`site.ts`）、Paste 邀请链接（`paste.ts`）。
- `site/`：Astro 站点和 Worker。
  - `src/pages/`：首页、分页、文章、系列、分类、标签、搜索、关于、404、Paste 三个页面。
  - `src/components/`、`src/layouts/`、`src/styles/`：页面组件、布局和主题。
  - `src/lib/vault.ts`：读取 vault 并缓存渲染结果。`src/lib/paste/`：Paste 页面脚本（原生 TS）。
  - `integrations/markvault.ts`：开发时监听 vault，构建后写 `_redirects`。
  - `worker/`：`/img/*` 图片转发、`/api/paste/*` 接口、`/paste/<id>` 外壳页、每小时的 Cron。D1 迁移在 `worker/migrations/`。
  - `wrangler.jsonc`：Worker 配置。访客域名和 CDN 回源域名写在 `routes` 里，`vars.SITE_ORIGIN` 是访客看到的地址，要和访客域名一致。
- `obsidian-plugin/`：薄插件，只调用 `markvault publish / check / unpublish`。构建方式见它的 README。
- `scripts/setup.sh`：新电脑一次性配置。`scripts/dev/`：本地测试脚本。
- `docs/`：架构、接口、写作指南、开发指南和变更记录。`docs/specs/`：设计存档。

内容不在这个仓库里。vault 路径的优先级是 `--vault`、环境变量 `MARKVAULT_VAULT`、配置文件里的 `vault`，最后是仓库下的 `./content`（可以是指向 vault 的软链接，已被 gitignore）。

## 常用命令

需要 Node 22.23 以上。在仓库根目录执行：

```sh
npm ci
npm run markvault -- check          # 校验全部内容
npm run markvault -- preview        # 本地预览，vault 改动后自动刷新
npm run markvault -- build          # 构建到 site/dist
npm run markvault -- publish [笔记]  # 校验、上传图片、构建、部署、提交 vault
npm run markvault -- deploy         # 只构建和部署（代码改动用）
npm run typecheck                   # 类型检查
bash scripts/setup.sh               # 新电脑配置
```

测试方法和 Paste 本地环境见 `docs/development-guide.md`。

## 编码风格

- TypeScript 和 Astro，2 空格缩进，ES modules，顶层 import。CLI 直接用 Node 的类型擦除运行 `.ts`，不经过编译，所以不要用 enum、namespace 这类需要转换的语法。
- 文件读写明确使用 UTF-8。
- 文章 slug 一旦发布就不要改，公开 URL 依赖它。确实要改时在 `redirect_from` 里保留旧值。
- Paste 页面里的用户内容一律用 `textContent` 写入，不用 `innerHTML`。正文 HTML 只来自构建时经过 rehype-sanitize 白名单的渲染结果。

## 安全和配置

- 不要提交 `node_modules/`、`site/dist/`、`.wrangler/`、`.astro/`、`.tmp/`、`.env*`、`.dev.vars` 或任何密钥。
- Cloudinary 的 `cloud_name` 不写进 `wrangler.jsonc`，部署时由 CLI 用 `--var` 传入。
- Worker 的写接口必须校验设备 cookie、`Content-Type: application/json` 和 `Origin`，并限制请求体大小。
- 同一个 Cloudflare 账号下还有与本项目无关的资源（例如 D1 数据库 `token_monitor_db`），不要动它们。
- 依赖只加在实际使用它的 workspace 里。

## 提交规范

提交时遵守仓库的 `.gitmessage` 模板：

- `type: <short imperative summary>`
- `Summary`
- `Implementation`
- `Tests`
- `Notes`

提交信息简短、祈使句、格式统一，不要写成随意的一行说明。
