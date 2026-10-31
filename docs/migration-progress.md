# Cloudflare 迁移进度记录

这份文件用于在不同的 agent 工具之间接续工作。**每完成一个阶段或一个独立部分，都要更新这里，并和对应代码放在同一个提交里。**

## 接手时按顺序阅读

1. `AGENTS.md`：仓库约定和提交规范（`.gitmessage` 模板）。
2. `docs/specs/2026-11-01-cloudflare-migration-design.md`：完整设计。以它为准，偏离设计时先在下面"决策记录"里写明原因。
3. `docs/specs/2026-11-01-theme-prototype.html`：视觉原型，用浏览器打开。
4. 本文件的"当前状态"和"下一步"。
5. `git log --oneline -20`。

## 更新规则

- 完成一项就把状态改成"完成"，写上提交号。
- 在"会话日志"末尾追加一条：日期、做了什么、验证了什么、没做完的事。
- 发现设计需要调整时，同时修改设计文档，并在"决策记录"里写明原因。
- 需要用户手动处理的事项写进"待用户处理"，不要假设它已经完成。

## 当前状态

**阶段 0、阶段 1 已完成，下一步是阶段 2。** vault 已迁移成新格式并推送到 GitHub；`markvault check` 结果是 10 篇文章、4 个系列，0 个错误。D1 已创建。只剩 Cloudinary 凭据要用户自己填写（阶段 3 才用到）。

| 阶段 | 内容 | 状态 | 提交 |
|---|---|---|---|
| 0 | 准备：清理工作区、账号、D1、备份服务器数据 | 完成（Cloudinary 凭据待填） | 代码 `dbf0deb`；vault `ee21fc2` |
| 1 | 内容层、`markvault check`、`markvault migrate`，vault 迁移 | 完成 | 代码 `277c870`；vault `c42e47e`、`adfca5e` |
| 2 | Astro 站点、主题、hash 跳转、`_redirects` | 未开始 | |
| 3 | 图片：无损压缩、Cloudinary、`/img/*` | 未开始 | |
| 4 | Paste：Worker、D1、设备信任、旧数据导入 | 未开始 | |
| 5 | 切换域名到 Worker | 未开始 | |
| 6 | 清理旧代码、更新文档、下线 DMIT | 未开始 | |

### 阶段 0 明细

| 事项 | 状态 |
|---|---|
| 代码仓库：删除临时脚本和工具缓存，补充 `.gitignore` | 完成（`dbf0deb`） |
| 代码仓库：提交设计文档、主题原型、本文件 | 完成（`763db12`） |
| vault：`.gitignore`、停止跟踪图片、提交迁移前快照，推送到 `origin` | 完成（`ee21fc2`） |
| D1：`markvault`，区域 APAC，`database_id` = `003333e1-03a1-4990-a3ef-08e6d6c87ee8` | 完成（还没有建表） |
| 备份 DMIT 的内容目录和 `server_flask/data/`，与 vault 做 diff | 完成（见"环境事实"） |
| Cloudinary：账号已注册；凭据由用户填进 `~/.config/markvault/config.json` | 待用户填写；Strict Transformations 在阶段 3 开启 |

## 待用户处理

1. **作废两个已经泄露的密钥。** 它们都没进过 git，但明文放在不该放的地方：
   - Cloudflare API token（前缀 `cfut_Ygj2`）：在已删除的 `server_flask/test_purge.py` 里，DMIT 上 `/home/aa/.config/systemd/user/markvault-backend.service` 里也有。
   - Notion token（前缀 `ntn_5703`）：同样在这个 service 文件里。Notion 同步已经不用了，直接作废。
2. **Cloudinary 凭据**：把 `cloud_name`、`api_key`、`api_secret` 填进 `~/.config/markvault/config.json`（已建好，权限 600）。阶段 3 才会用到。不要贴在对话里。
3. **在 Cloudflare 切换之前，不要打开 Syncthing 和 DMIT 之间的同步。** 服务器上的内容目录是 Syncthing 文件夹，但目前两边都没在运行 Syncthing。迁移后 vault 里已经没有 `index.md`，一旦同步过去，旧的 Flask 站点会一篇文章都找不到。
4. 可选：本地分支 `feat/notion-sync-v2` 和 `feat/notion-sync-v2-implementation` 已合并进 main，可以用 `git branch -d` 删除。

## 环境事实

- 代码仓库：`/Users/yun/code/MarkVault`，远端 `origin/main`。
- vault 和内容仓库：`/Users/yun/code/blog-content`，远端 `https://github.com/hfliuyun/blog-vault.git`（私有，`main`）。代码仓库里的 `content/` 是指向它的软链接。根目录下有一个空的 `.tmp.driveupload/`，可能是某个云盘客户端留下的。
- 本机配置：`~/.config/markvault/config.json`，`vault` 已设为上面的路径。
- 本机工具：Node v26.10.0、npm 11.19.1、`/opt/homebrew/bin/jpegtran`。没有 oxipng、gifsicle、svgo，阶段 3 改用 npm 包（wasm 或自带二进制），不依赖 Homebrew。`wrangler` 已登录（用 `npx wrangler`，版本 4.156）。账号下另有一个与本项目无关的 D1 数据库 `token_monitor_db`，不要动它。
- DMIT 服务器：
  - 地址 `179.255.146.211`，用户 root。私钥在 `~/Library/CloudStorage/OneDrive-个人/应用/ssh_key/DMIT-X1rp8JVmad-id_rsa/id_rsa.pem`，使用时复制到 `.tmp/ssh/` 并设为 600，用完删除。
  - SSH 要走本机代理：`-o ProxyCommand="nc -X 5 -x 127.0.0.1:10808 %h %p"`。
  - 线上服务以用户 `aa` 运行：代码在 `/home/aa/MarkVault`，内容在 `/home/aa/blog-content`（软链接 `content`），systemd 用户服务是 `markvault-backend`（gunicorn 监听 127.0.0.1:8000）。`/root/MarkVault` 是另一份旧副本，没有在用。
- DMIT 的备份在 `.tmp/server-backup/dmit-20261101.tar.gz`，已解压在同一目录（`.tmp/` 被 gitignore）。里面有：
  - 内容目录，和迁移前的 vault 快照 `ee21fc2` 完全一致，只多了一个插件上传的重复目录（见下一条）。
  - `server_flask/data/pastes/` 下的 2 条 paste（`g27h8h3t`、`3cy3ladc`，都是永不过期），阶段 4 导入 D1。
  - `totp_secret.key` 和 Notion 同步状态文件，迁移后都不再需要。
- **2026-11-01 发现线上 API 一直返回 500**，有两个原因：
  - sub2api 那篇的 frontmatter 是坏的。
  - 插件把 h264 那篇按 `series.id` 又写了一份到 `series/av-stream-basics/h264-stream/`，造成 slug 重复。

  已经在服务器上修好：修正了那篇的 title 行，删掉了这个重复目录（内容和原文完全相同，备份里有）。现在 `/api/posts` 返回 200，共 11 篇。服务器上其余内容仍是旧格式，旧站点会一直以这个状态运行到切换。
- 当前线上前端在 Cloudflare Pages（绑定 GitHub 自动构建），`blog_by_vue/functions/api/[[catchall]].js` 把 `/api/*` 转发到 `https://apiblog.liuyun.ac.cn`，也就是 DMIT 上的 Flask。
- 前端使用 hash 路由（`createWebHashHistory`），所以旧链接都是 `/#/...` 形式。
- 没有 `legacy/abbrlink-map.json`，文章里也没有 `legacy.abbrlinks`，所以 `/p/:abbrlink` 目前没有需要映射的旧链接。

## 决策记录

| 日期 | 决策 | 原因 |
|---|---|---|
| 2026-11-01 | 去掉 Flask 和 DMIT，全部用 Cloudflare Workers 免费套餐 | 现在性能差；用户不想维护 Python 后端 |
| 2026-11-01 | 不用 R2 和 Cloudflare Access | 都需要绑信用卡，用户的账号没有绑卡 |
| 2026-11-01 | 图片放 Cloudinary，通过 `/img/*` Worker 转发、缓存、防盗链 | 免费且不用绑卡；Markdown 里只写本地引用，换图床不用改文章 |
| 2026-11-01 | 上传前无损压缩，hash 基于原件 | 减少 Cloudinary 存储；压缩工具版本变化不影响 hash |
| 2026-11-01 | 本机构建、本机部署，发布核心是 `markvault` CLI，Obsidian 插件只调用 CLI | 不打开 Obsidian 也能发布；换电脑跑 `setup.sh` 即可 |
| 2026-11-01 | Paste 用设备信任（一年 cookie + 配对码 / 终端一次性链接），不用 TOTP | 用户每次输入验证码就不想用了 |
| 2026-11-01 | 前端改用 Astro，博客和 Paste 都不用 Element Plus | 静态 HTML 最快；见设计文档第 7、8 节 |
| 2026-11-01 | 视觉按原型：纸 / 夜 / 素三套主题加跟随系统，只用系统字体 | 用户希望简洁；Google Fonts 在国内慢 |
| 2026-11-01 | 去掉网页编辑、文章管理页、Notion 同步 | 用户确认不再需要 |

## 下一步

阶段 2：搭建 Astro 站点。

1. 渲染管线 `packages/content/src/render/`，按设计文档 3.4 节：
   - remark-obsidian：wikilink、图片嵌入、callout、高亮、注释、块引用标记
   - rehype-sanitize
   - KaTeX
   - Shiki 双主题
   - 目录（h2 到 h4，标题 id 沿用旧的 slugify 规则）
2. `site/`：Astro 项目，使用自定义 Content Layer loader 调用 `loadVault()`。按 `docs/specs/2026-11-01-theme-prototype.html` 实现页面和三套主题，再加上 hash 跳转脚本和 `_redirects`（包括 `redirect_from`，比如 `sub2api-delopy`）。
3. `markvault publish` 和 `markvault deploy`，以及 `.markvault/published.json` 的检查。图片在阶段 3 之前先用占位地址。
4. 部署到 `*.workers.dev` 预览，测试 Pagefind 的中文搜索。

## 本地测试

- 类型检查：`node_modules/.bin/tsc --noEmit -p tsconfig.json`（或 `npm run typecheck`）。
- CLI 直接用 Node 运行 TypeScript（Node ≥ 22.18 原生支持类型擦除）：`npm run markvault -- check`，默认读取 `./content`。
- 不碰真实 vault 的测试方法：`rm -rf .tmp/vault-copy && cp -R content/ .tmp/vault-copy`，然后加 `--vault .tmp/vault-copy`。`.tmp/` 已经被 gitignore。
- 2026-11-01 在副本上的结果：手动修正 sub2api 那篇后，`migrate --apply` 完成 15 项；`check` 显示 10 篇文章、4 个系列、9 张待上传图片。剩下 2 个错误（`logistic-regression_2` 的 slug、H264 那篇的占位图片）和 1 个警告（drawio 链接），都是第 7 项里列出的内容问题。

## 会话日志

### 2026-11-01（Kiro CLI）

- 讨论并确定迁移方案，写完设计文档和主题原型。
- 代码仓库清理（`dbf0deb`）：
  - 删除 `server_flask/test_purge.py`（含明文 CF token）、`test_delete.py`（Notion 调试脚本）、`blog_by_vue/public/win11-*`（未被引用，其中两个 jpg 实际是文本文件）、`sync_test.log`、`blog_by_vue/wrangler.log`。
  - 删除工具缓存 `.od-skills/`、`blog_by_vue/.od-skills/`、`.superpowers/`、`.wrangler/`、`blog_by_vue/.wrangler/`。
  - `.gitignore` 增加密钥文件和本地工具状态。`.env`（只有 Notion token）保留在本地并被忽略，阶段 6 删除。
- vault 里删除了三个无用文件：`manage.py`（和代码仓库的完全相同）、`2026-09-09.md`（空文件）、`.sync-conflict-20260619-181030-MDPD7CC.DS_Store`。之后写 `.gitignore` 时被权限规则阻止，于是撤销了暂存区改动。vault 的 git 状态和清理前一致，只是少了这三个文件。
- 未完成：内容仓库提交，以及阶段 0 中需要用户处理的事项。

### 2026-11-01（Kiro CLI，阶段 1）

- 新增仓库根的 npm workspaces（`package.json`、`tsconfig.json`）。依赖：`yaml`、`unified`、`remark-parse`、`remark-gfm`、`remark-math`、`unist-util-visit`，以及开发依赖 `typescript`、`@types/node`。
- `packages/content/src/` 各文件：
  - `scan.ts`：遍历 vault，跳过 `.obsidian` 等目录。
  - `frontmatter.ts`：用 YAML core schema 解析，日期保持字符串。
  - `dates.ts`：没有时区的日期按 +08:00 处理。
  - `schema.ts`：字段规则。
  - `resolve.ts`：按 Obsidian 的方式解析链接，同名时选离笔记最近的。
  - `links.ts`：用 mdast 提取图片、wikilink、callout 之外的链接，并检测路径里有空格的图片。
  - `images.ts`：`images.json` 的读写，以及 sha256 计算。
  - `model.ts`：`loadVault()`，执行设计文档 3.5 节的全部校验，`published.json` 那一项除外。
  - `migrate.ts`：`planMigration()` 和 `applyMigration()`。先把新内容写到临时文件再改名，计划有错误时不做任何修改。
- `packages/cli/src/main.ts`：实现 `check` 和 `migrate`（加 `--apply` 才写入）。vault 路径的优先级是 `--vault`、`MARKVAULT_VAULT`、`~/.config/markvault/config.json`，最后是 `./content`。
- 设计文档的修改：
  - 3.5 节补充了几条新校验。
  - 7.1 节把 zod 改为手写校验，因为字段少，不值得多一个依赖。
  - 第 9 节阶段 1 补充了实现细节。
- 验证：tsc 通过；真实 vault 只做了预览，副本上做了完整流程（见"本地测试"）。
- 没做：对真实 vault 执行迁移（等待写权限和内容修正）。`published.json` 检查推迟到阶段 2。

### 2026-11-01（Kiro CLI，完成阶段 0 和阶段 1）

- vault：
  - 加了 `.gitignore`，停止跟踪 3 张图片，提交迁移前快照 `ee21fc2`。
  - 添加 `origin` 并推送到 GitHub。
- 按用户的授权修正内容（`c42e47e`）：
  - sub2api：删掉开头的空行，修正 `title:`。slug 的拼写错误 `sub2api-delopy` 改成 `sub2api-deploy`，同时加上 `redirect_from: [sub2api-delopy]`。
  - 删除 `logistic-regression-2`。
  - 删掉 h264 那篇的占位图片。
  - README 里坏掉的 drawio 链接改成 Obsidian 注释。
- 执行 `markvault migrate --apply`，共 14 项（`adfca5e`）。之后 `check` 没有错误也没有警告。slug 和线上一致，只少了有意删除的 `logistic-regression_2`。
- SSH 到 DMIT 备份内容和数据，做了 diff（结果见"环境事实"）。线上 API 原本返回 500，已在服务器上修好。
- D1：先建在了 WNAM 区域，随即删除，改建到 APAC，因为离用户更近。
- 建立 `~/.config/markvault/config.json`，权限 600，Cloudinary 字段留空。
- 删除了 `.tmp/ssh/`（私钥副本）和 `.tmp/vault-head/`。
