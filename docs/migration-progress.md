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

**阶段 0 进行中。** 代码仓库已清理。阶段 1 等待内容仓库（vault）的写权限。

| 阶段 | 内容 | 状态 | 提交 |
|---|---|---|---|
| 0 | 准备：清理工作区、账号、D1、备份服务器数据 | 进行中 | `dbf0deb` |
| 1 | 内容层 `packages/content`、`markvault check`、`markvault migrate` | 未开始 | |
| 2 | Astro 站点、主题、hash 跳转、`_redirects` | 未开始 | |
| 3 | 图片：无损压缩、Cloudinary、`/img/*` | 未开始 | |
| 4 | Paste：Worker、D1、设备信任、旧数据导入 | 未开始 | |
| 5 | 切换域名到 Worker | 未开始 | |
| 6 | 清理旧代码、更新文档、下线 DMIT | 未开始 | |

### 阶段 0 明细

| 事项 | 状态 |
|---|---|
| 代码仓库：删除临时脚本和工具缓存，补充 `.gitignore` | 完成（`dbf0deb`） |
| 代码仓库：提交设计文档、主题原型、本文件 | 完成（见 git log） |
| 内容仓库：补 `.gitignore`、停止跟踪图片、提交迁移前快照 | 等待写权限（见"待用户处理"） |
| 注册 Cloudinary，开启 Strict Transformations | 待用户 |
| `wrangler login`，`wrangler d1 create markvault` | 待用户登录后由 agent 执行 |
| 备份 DMIT 上的 `server_flask/data/` 和内容目录，与本地 vault 做 diff | 待用户（需要 SSH） |

## 待用户处理

1. **作废一个 Cloudflare API token。** 已删除的 `server_flask/test_purge.py` 里明文写着一个 token（前缀 `cfut_Ygj2`）。它从未进入 git，但应该在 Cloudflare 后台作废。
2. **给 agent 开放 vault 目录的写权限**：`/Users/yun/code/blog-content`（代码仓库里的 `content/` 是指向它的软链接）。阶段 0 的内容仓库清理和阶段 1 的 `markvault migrate` 都需要写这个目录。
3. **为内容仓库创建 GitHub 私有仓库并添加 remote。** 现在 `blog-content` 没有任何 remote，只存在于本机和 Syncthing 里。
4. 注册 Cloudinary（不需要绑卡），把 `cloud_name`、`api_key`、`api_secret` 准备好，在阶段 3 前由 `scripts/setup.sh` 写入本机配置。
5. 在本机执行 `npx wrangler login`。
6. SSH 到 DMIT，打包 `~/MarkVault/server_flask/data/` 和 `~/MarkVault/content/` 拷回本机，用于 diff 和导入旧 paste。
7. 内容问题，迁移时需要你决定：
   - `posts/sub2api-deploy-blog/index.md` 的 `title:Sub2API…` 冒号后少一个空格，YAML 解析不出 title。
   - `posts/logistic-regression-2/` 的 slug `logistic-regression_2` 含下划线，不符合 slug 规则，并且内容和 `logistic-regression` 重复。删掉，还是改 slug 保留？
8. 可选：本地分支 `feat/notion-sync-v2` 和 `feat/notion-sync-v2-implementation` 已合并进 main，可以用 `git branch -d` 删除。

## 环境事实

- 代码仓库：`/Users/yun/code/MarkVault`，远端 `origin/main`。
- vault 和内容仓库：`/Users/yun/code/blog-content`。它同时是 Obsidian vault、独立 git 仓库（没有 remote）和 Syncthing 文件夹。根目录下还有一个空的 `.tmp.driveupload/`，说明可能有 Google Drive 也在同步这个目录，需要用户确认。
- vault 里已跟踪的图片有 3 张，未跟踪的有 8 张，另有一个 `.drawio` 源文件。
- 本机：Node v26.10.0、npm 11.19.1、`/opt/homebrew/bin/jpegtran`。没有 oxipng、gifsicle、svgo，阶段 3 改用 npm 包（wasm 或带二进制的包），不依赖 Homebrew。
- 当前线上：前端在 Cloudflare Pages（绑定 GitHub 自动构建），`blog_by_vue/functions/api/[[catchall]].js` 把 `/api/*` 转发到 DMIT 上的 Flask（`VITE_API_BASE_URL`）。
- 前端使用 hash 路由（`createWebHashHistory`），所以旧链接都是 `/#/...` 形式。
- `content/legacy/abbrlink-map.json` 不存在，文章里也没有 `legacy.abbrlinks`。`/p/:abbrlink` 目前没有需要映射的旧链接。

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

1. 等用户处理"待用户处理"第 2 项（vault 写权限），然后完成内容仓库清理：
   - 写入 `.gitignore`。内容是：图片扩展名、`.obsidian/`、`.trash/`、`.stfolder/`、`.stignore`、`*.sync-conflict-*`、`.tmp.driveupload/`、`.DS_Store`。
   - `git rm --cached` 已跟踪的图片。
   - 提交迁移前快照（包括 Notion 回写过的 frontmatter，以及还没提交的 `av_stream_basics` 系列和 `sub2api-deploy-blog`）。
2. 在此期间可以先开始阶段 1 中不需要写 vault 的部分：npm workspaces、`packages/content` 的扫描、校验、链接和图片解析，`markvault check`，以及 `markvault migrate --dry-run`。

## 会话日志

### 2026-11-01（Kiro CLI）

- 讨论并确定迁移方案，写完设计文档和主题原型。
- 代码仓库清理（`dbf0deb`）：
  - 删除 `server_flask/test_purge.py`（含明文 CF token）、`test_delete.py`（Notion 调试脚本）、`blog_by_vue/public/win11-*`（未被引用，其中两个 jpg 实际是文本文件）、`sync_test.log`、`blog_by_vue/wrangler.log`。
  - 删除工具缓存 `.od-skills/`、`blog_by_vue/.od-skills/`、`.superpowers/`、`.wrangler/`、`blog_by_vue/.wrangler/`。
  - `.gitignore` 增加密钥文件和本地工具状态。`.env`（只有 Notion token）保留在本地并被忽略，阶段 6 删除。
- vault 里删除了三个无用文件：`manage.py`（和代码仓库的完全相同）、`2026-09-09.md`（空文件）、`.sync-conflict-20260619-181030-MDPD7CC.DS_Store`。之后写 `.gitignore` 时被权限规则阻止，于是撤销了暂存区改动。vault 的 git 状态和清理前一致，只是少了这三个文件。
- 未完成：内容仓库提交，以及阶段 0 中需要用户处理的事项。
