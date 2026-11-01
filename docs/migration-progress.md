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

**阶段 0 到 4 已完成，下一步是阶段 5（切换域名）。** 预览站点 https://markvault.wangsheng.workers.dev 上文章、图片和 Paste 都能用，D1 已建表，2 条旧 paste 已导入。阶段 4 的代码还没有推送到 GitHub：推送会触发旧 Pages 项目自动构建 `blog_by_vue`，留到阶段 5 再推。需要用户操作的事见"待用户处理"：信任第一台设备、配对手机、开启 Cloudinary Strict Transformations。

| 阶段 | 内容 | 状态 | 提交 |
|---|---|---|---|
| 0 | 准备：清理工作区、账号、D1、备份服务器数据 | 完成 | 代码 `dbf0deb`；vault `ee21fc2` |
| 1 | 内容层、`markvault check`、`markvault migrate`，vault 迁移 | 完成 | 代码 `277c870`；vault `c42e47e`、`adfca5e` |
| 2 | 渲染管线、Astro 站点、主题、搜索、hash 跳转、`_redirects`、`preview`/`build`/`deploy` 命令 | 完成，已部署预览 | 见 git log |
| 3 | 无损压缩、Cloudinary 上传、`/img/*` Worker、`publish`/`unpublish`、`published.json`、Obsidian 插件 0.2、`scripts/setup.sh` | 完成（Strict Transformations 待用户开启） | 见 git log；vault `e884a74` |
| 4 | Paste：Worker、D1、设备信任、旧数据导入 | 完成，已部署预览（设备配对待用户操作） | 见 git log（未推送） |
| 5 | 切换域名到 Worker | 未开始 | |
| 6 | 清理旧代码、更新文档、下线 DMIT | 未开始 | |

### 阶段 0 明细

| 事项 | 状态 |
|---|---|
| 代码仓库：删除临时脚本和工具缓存，补充 `.gitignore` | 完成（`dbf0deb`） |
| 代码仓库：提交设计文档、主题原型、本文件 | 完成（`763db12`） |
| vault：`.gitignore`、停止跟踪图片、提交迁移前快照，推送到 `origin` | 完成（`ee21fc2`） |
| D1：`markvault`，区域 APAC，`database_id` = `003333e1-03a1-4990-a3ef-08e6d6c87ee8` | 完成（阶段 4 建表，迁移 `0001_init.sql`） |
| 备份 DMIT 的内容目录和 `server_flask/data/`，与 vault 做 diff | 完成（见"环境事实"） |
| Cloudinary：账号已注册，凭据已由用户填进 `~/.config/markvault/config.json` | 完成；Strict Transformations 在阶段 3 开启 |

## 待用户处理

0. ~~信任第一台设备，再配对手机~~：2026-11-01 完成，线上已信任 `Mac · Safari` 和 `Android · Chrome`。切换域名后 cookie 按域名保存，要在新域名上用 `paste-invite` 和「添加设备」再做一遍。
1. **在 Cloudinary 后台开启 Strict Transformations**（2026-11-01 用户说已开启，但实测仍未生效：直接请求 `res.cloudinary.com` 上随机的 `w_709`、`e_grayscale,w_403` 都返回 200，是现场生成的。需要用户在后台再确认）：Settings → Security → Restricted media types / Strict transformations。开启后只有上传时预先生成的 `f_webp,q_auto,c_limit,w_1600` 这一种转换能用，别人拼出别的转换参数时，不会消耗你的额度。开启后告诉 agent，agent 会验证我们自己的图片仍然能正常显示。
   另外，如果 Obsidian 正开着，在「第三方插件」里把 MarkVault Publisher 关掉再打开，才会加载 0.2 版。
2. **作废 Notion token**（前缀 `ntn_5703`，明文在 DMIT 的 `markvault-backend.service` 里）。用户说稍后处理。Cloudflare token 用户已经全部删除，所以旧站的"清理 CF 缓存"功能现在会失败，这不影响旧站正常运行。
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
| 2026-11-01 | Paste 页面用原生 TS，不用 Vue | 三个页面交互简单，不值得加框架；用户内容一律 `textContent` |
| 2026-11-01 | 二维码用 `uqr`，不用 `qrcode` | 无依赖，浏览器出 SVG，终端出半格字符 |
| 2026-11-01 | 配对链接的 token 放在 `#t=`，不放 `?t=` | 片段不会发给服务器，不会进 Workers 日志 |
| 2026-11-01 | 阶段 4 先不推送代码仓库 | 推送会触发旧 Pages 项目构建 `blog_by_vue`；阶段 5 切换时一起处理 |

## 下一步

阶段 5：切换域名（设计文档第 9 节）。

1. 推送代码仓库之前，先在 Pages 项目里停用 Git 自动构建，或者确认那次构建失败不会影响线上旧站。
2. 在 Pages 项目里解绑自定义域名，绑定到 Worker `markvault`，中间会有几分钟不可访问。
3. 按设计文档 7.2 的 URL 对应表逐条验证旧链接，检查文章、图片、搜索、Paste。Paste 用 `paste-invite` 生成新域名的链接，再跑一次 `scripts/dev/paste-smoke.mjs`。
4. 把 `~/.config/markvault/config.json` 里的 `site_url` 改成正式域名（`paste-invite` 和 `publish` 打印的链接用它）。`/img/*` 的防盗链按请求自己的域名放行，不用改。

## 本地测试

- 构建：`npm run markvault -- build`，输出到 `site/dist`，包含 Pagefind 索引和 `_redirects`。
- 本地预览（开发模式）：`npm run markvault -- preview`，访问 http://localhost:4321 。vault 有改动时页面会自动刷新，`/img/*` 直接读 vault 里的原图。开发模式下没有搜索索引。
- 测试构建产物：`zsh scripts/dev/serve-run.sh <命令>` 会在 8787 端口用 wrangler dev 托管 `site/dist`，命令执行完后关闭。配合 `node scripts/dev/cdp.mjs <url> <等待毫秒> <JS 表达式>`（headless Chrome，通过 DevTools 协议驱动）可以检查页面状态。环境变量 `WIDTH`、`HEIGHT`、`SCHEME=light|dark`、`SHOT=文件.png` 用于截图。注意：本机设置了 HTTP 代理，访问 localhost 时要加 `curl --noproxy "*"`。
- 部署预览：`npm run markvault -- deploy`，部署到 https://markvault.wangsheng.workers.dev 。
- Paste 本地测试：
  - `cd site && ../node_modules/.bin/wrangler d1 migrations apply markvault --local` 建本地表（数据在 `site/.wrangler/`）。
  - `npm run markvault -- build` 之后，在 `site/` 下运行 `../node_modules/.bin/wrangler dev --port 8787 --local --test-scheduled --var CLOUDINARY_CLOUD:<cloud_name>`。访问 `/__scheduled` 可以手动触发 Cron。
  - `npm run markvault -- paste-invite --local` 生成本地邀请链接，然后 `node scripts/dev/paste-smoke.mjs <链接>` 跑 44 项接口检查，它只删除自己创建的数据。
  - 对线上跑时去掉 `--local`，并加 `NODE_USE_ENV_PROXY=1`：本机 DNS 会把 workers.dev 解析到被污染的地址，Node 的 fetch 默认不走代理。
  - 旧 paste 导入：`node scripts/import-legacy-pastes.mjs <pastes 目录> [--local]`，可以重复运行。

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

### 2026-11-01（Kiro CLI，阶段 2）

- 渲染管线 `packages/content/src/render/`：
  - `obsidian.ts`：wikilink、图片嵌入（`|300`、`|raw`）、callout（可折叠的用 details）、`==高亮==`、块引用标记、mermaid、本地 .md 链接改写
  - `rehype.ts`：标题 id（沿用 Flask 的规则，重复的加 `-2`）；目录取 h2 到 h4，跳过脚注标题；单独一张图的段落改成 figure，Typora 默认的 alt 不当图注；表格包一层滚动容器；代码块外包 `div.code-block[data-lang]`；统计阅读时长
  - `index.ts`：处理顺序是 sanitize 白名单 → KaTeX → Shiki 双主题。sanitize 关掉了 clobber，否则脚注 id 会被加两次前缀，引用对不上
- 加了 `remark-cjk-friendly`。不加的话，`**“编码”**决定` 这种中文标点紧挨 `**` 的写法不会变成粗体，containers 那篇里正好有。
- `site/`（Astro 7.4）：
  - 页面：首页、分页、文章、系列、分类、标签、搜索、关于、Paste 占位页、404
  - 样式：按原型拆成 `base`、`prose`、`components` 和三个主题文件
  - 其他：hash 跳转和主题内联脚本，⌘K 跳到搜索页，代码复制按钮，目录跟随滚动高亮，mermaid 按需加载
- CLI 新增 `preview`、`build`、`deploy`，位于 `packages/cli/src/site.ts`。
- 验证：
  - 45 个页面构建通过，tsc 通过。
  - 用 wrangler dev 在本地托管：307 补尾斜杠、`/posts/sub2api-delopy` 308 跳转、404 页面都正常。
  - 旧 hash 链接在浏览器里跳到新路径，`/#/manage` 跳回首页。
  - Pagefind 中文搜索：采样率、容器格式、逻辑、NALU 都能搜到，摘要会高亮命中词。
  - 390px 宽时没有横向溢出。
  - 浅色和深色主题都截图看过。
  - 已部署到 workers.dev，线上各条路由的返回结果和本地一致。
- 还没做的：
  - 图片显示（阶段 3）
  - Paste 页面（阶段 4）
  - `published.json` 检查（和 publish 一起做）
  - `scripts/setup.sh`

### 2026-11-01（Kiro CLI，阶段 3）

- `packages/cli/src/images/compress.ts`：无损压缩，所有格式压缩后都逐像素和原图比较。
  - PNG：先删掉文本、时间和 EXIF 数据块，再用 oxipng-wasm 以 `-o2` 压缩。
  - JPEG：jpegtran 只保留 ICC 色彩配置，照片有旋转信息时补一个只含 Orientation 的最小 EXIF。
  - SVG：svgo。
  - GIF：本机有 gifsicle 才压缩。
  - 测试结果：
    - 9 张图共 2758KB，压缩后 1590KB，像素全部一致。
    - 合成的带 GPS 的 JPEG 压缩后不含 GPS，方向正确（测了 orientation 6 和 8，宽度为 801 这种不是 8 的倍数的也测了）。
- `cloudinary.ts`：签名上传，`public_id` 为 `markvault/<hash>`，`overwrite=false`，位图会 eager 生成 WebP，失败最多重试 3 次。
- `upload.ts`：上传待上传的图片，并按当前引用重建 `images.json`。
- `note.ts`：
  - `prepareNote`：用 yaml Document 修改 frontmatter，保留原来的注释和键的顺序。已有 slug 时不允许用 `--slug` 覆盖。
  - `setPublishFlag`：供 unpublish 使用。
- `git.ts`：提交并推送 vault。推送失败只给警告，不中断发布。
- `packages/content/src/published.ts`：读写 `published.json`。`loadVault` 会根据它警告"已发布的 slug 不见了"。只有已发布的页面集合发生变化时才重写这个文件，避免产生没有内容的提交。
- `site/worker/img.ts`：实现 `/img/*`。只接受站点会生成的那几种 URL；Referer 不在白名单时返回 403；用 caches.default 缓存，`Cache-Control` 设为一年加 `immutable`；SVG 响应带上 CSP；上游失败的响应不缓存。
- 第一次真实发布：上传了 9 张图（vault 提交 `e884a74`）。线上测试结果：
  - WebP 200，84KB，原图 266KB
  - 第二次请求 `cf-cache-status: HIT`
  - 外站 Referer 返回 403，本站 Referer 返回 200
  - 非法路径返回 404，raw 图 200
  - 用浏览器打开 aac-stream，两张图按 1600 宽加载
- 按插件的运行方式做了一次完整发布：`env -i`、只有最基本的 PATH、带代理变量、没有 TTY。构建、部署、提交、推送全部成功。
- Obsidian 插件 0.2：已重写，构建产物也复制到了 vault 的插件目录。`data.json` 换成了新设置，旧的明文设备令牌随之删除。
- `scripts/setup.sh`：在本机完整跑过一遍，所有步骤都识别为"已配置"并跳过，最后的 check 通过。
- 没做：验证 Strict Transformations 的效果（等用户在后台开启）；gifsicle 没装，所以 GIF 压缩没测。

### 2026-11-01（Claude Code，阶段 4）

- 从 Kiro 会话 `sess_fe2cbc06-…` 接手。
- D1 迁移 `site/worker/migrations/0001_init.sql`：`devices`、`pastes`（`device_id` 外键，删除设备时置空）、`pair_codes`。
- Worker，在 `site/worker/` 下：
  - `http.ts`：cookie、Origin 校验、按流限制大小的 JSON 读取、随机 token / id / 配对码、sha256。
  - `devices.ts`：会话和每 24 小时续期、配对码、配对、设备列表 / 改名 / 移除。
  - `paste.ts`：列表（游标分页，只内联 5 万字符以内）、创建（1MB）、公开读取、删除。
  - `api.ts`：路由表，分公开 / 会话 / 已信任三种权限，未知路径 404，方法不对 405。
  - `cron.ts`：每小时清理。
  - `index.ts`：`/paste/<id>` 返回查看页外壳并带 `X-Robots-Tag: noindex`。
- CLI：`markvault paste-invite [--local]` 在本机生成 token，通过 `wrangler d1 execute` 写入 hash，在终端打印链接和二维码。`scripts/setup.sh` 增加站点地址一步。
- 页面：`site/src/pages/paste/` 下的 `index`、`view`、`pair`，脚本在 `site/src/lib/paste/`，样式 `site/src/styles/paste.css`，三套主题都适配。
- 安全复核（只读 subagent）没有发现高危问题。按它的意见修了这些：
  - 配对码 5 次限制的并发竞争：改成在一个 batch 里先计数再认领。
  - `expires_in` 接受 `__proto__`、`toString` 这类继承属性：改用 `Object.hasOwn`。
  - 请求体大小只看 `Content-Length`：改成按流计数，配对接口上限 4KB。
  - 配对 token 放在查询参数里会进 Workers 日志：改成放在 `#t=`。
  - 列表一页最多 50 条、每条内联 10 万字符：改成 20 条、5 万字符。
  - 导入脚本没有校验时间戳。
  - 创建接口返回的 `size` 按 UTF-16 计：改成和列表一样按字符计。
- 验证：
  - tsc 通过（根目录、site、worker），构建 47 个页面。
  - 本地：`paste-smoke` 44 项通过。另外用一次性脚本测了：续期、Cron 之前已过期的条目、外键置空、大条目不内联、Cron 删除；修复后的 200 个并发错误猜测、继承属性、无 `Content-Length` 的 8MB 请求，以及 emoji 的 `size`。
  - headless Chrome 测试 24 项通过；浅色、深色、390px 手机宽度都截图看过。
  - 线上：D1 迁移完成，2 条旧 paste 导入后 sha256 一致，已部署（版本 `777cd9b7`，Cron `0 * * * *`）。`paste-smoke` 对 workers.dev 44 项通过，它自己创建的设备和 paste 都已删除。
- 没做：
  - 用户自己的设备配对（见"待用户处理"）。
  - 推送代码仓库（见决策记录）。
  - 手机上的真机测试。

### 2026-11-01（Claude Code，阶段 4 收尾）

- 用户完成设备配对：D1 里有 `Mac · Safari`（13:30）和 `Android · Chrome`（13:32）两台设备。
- 检查 Strict Transformations：9 张图的 `f_webp,q_auto,c_limit,w_1600`、原图和 `/img/*.webp` 都返回 200。但伪造的转换参数（随机宽度、`e_grayscale`、`e_blur`）在 Cloudinary 上也返回 200，说明设置还没生效。
