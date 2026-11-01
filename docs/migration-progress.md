# Cloudflare 迁移记录

MarkVault 从 Flask + Vue + VPS 迁移到 Cloudflare Workers 的过程记录。迁移在 2026-11-01 完成。设计以 [迁移设计](specs/2026-11-01-cloudflare-migration-design.md) 为准，这里只记录各阶段的结果、偏离设计的决定和验证情况。

这个仓库是公开的，所以服务器地址、账号 id、本机路径这类环境信息不写在这里。

## 各阶段

| 阶段 | 内容 | 状态 | 提交 |
|---|---|---|---|
| 0 | 准备：清理工作区、账号、D1、备份服务器数据 | 完成 | 代码 `dbf0deb`；vault `ee21fc2` |
| 1 | 内容层、`markvault check`、`markvault migrate`，vault 迁移 | 完成 | 代码 `277c870`；vault `c42e47e`、`adfca5e` |
| 2 | 渲染管线、Astro 站点、主题、搜索、hash 跳转、`_redirects`、`preview`/`build`/`deploy` 命令 | 完成 | 见 git log |
| 3 | 无损压缩、Cloudinary 上传、`/img/*` Worker、`publish`/`unpublish`、`published.json`、Obsidian 插件 0.2、`scripts/setup.sh` | 完成 | 见 git log；vault `e884a74` |
| 4 | Paste：Worker、D1、设备信任、旧数据导入 | 完成 | `ced4448` |
| 5 | 切换域名到 Worker | 完成（2026-11-01 14:09） | `71375dd` |
| 6 | 清理旧代码、更新文档、下线旧服务器 | 完成（2026-11-01） | 见 git log |

## 决策记录

| 日期 | 决策 | 原因 |
|---|---|---|
| 2026-11-01 | 去掉 Flask 和 VPS，全部用 Cloudflare Workers 免费套餐 | 原来性能差；不想维护 Python 后端 |
| 2026-11-01 | 不用 R2 和 Cloudflare Access | 都需要绑信用卡 |
| 2026-11-01 | 图片放 Cloudinary，通过 `/img/*` Worker 转发、缓存、防盗链 | 免费且不用绑卡；Markdown 里只写本地引用，换图床不用改文章 |
| 2026-11-01 | 上传前无损压缩，hash 基于原件 | 减少 Cloudinary 存储；压缩工具版本变化不影响 hash |
| 2026-11-01 | 本机构建、本机部署，发布核心是 `markvault` CLI，Obsidian 插件只调用 CLI | 不打开 Obsidian 也能发布；换电脑跑 `setup.sh` 即可 |
| 2026-11-01 | Paste 用设备信任（一年 cookie + 配对码 / 终端一次性链接），不用 TOTP | 每次输入验证码太麻烦，就不想用了 |
| 2026-11-01 | 前端改用 Astro，博客和 Paste 都不用 Element Plus | 静态 HTML 最快；见设计文档第 7、8 节 |
| 2026-11-01 | 视觉按原型：纸 / 夜 / 素三套主题加跟随系统，只用系统字体 | 希望简洁；Google Fonts 在国内慢 |
| 2026-11-01 | 去掉网页编辑、文章管理页、Notion 同步 | 不再需要 |
| 2026-11-01 | Paste 页面用原生 TS，不用 Vue | 三个页面交互简单，不值得加框架；用户内容一律 `textContent` |
| 2026-11-01 | 二维码用 `uqr`，不用 `qrcode` | 无依赖，浏览器出 SVG，终端出半格字符 |
| 2026-11-01 | 配对链接的 token 放在 `#t=`，不放 `?t=` | 片段不会发给服务器，不会进 Workers 日志 |
| 2026-11-01 | 阶段 4 先不推送代码仓库 | 推送会触发旧 Pages 项目的构建；阶段 5 先关自动构建再推送 |
| 2026-11-01 | 阶段 6 不等两周观察期，切换当天完成 | 切换后验证全部通过，用户确认直接清理 |
| 2026-11-01 | 关闭 workers.dev 地址 | 同一份内容不要有两个地址 |

本地开发和测试方法已经移到 [开发指南](development-guide.md)。

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

- 用户在 workers.dev 上配对了电脑和手机两台设备。
- 检查 Strict Transformations：9 张图的 `f_webp,q_auto,c_limit,w_1600`、原图和 `/img/*.webp` 都返回 200。但伪造的转换参数（随机宽度、`e_grayscale`、`e_blur`）在 Cloudinary 上也返回 200，说明设置还没生效。
- 用户保存设置后复测：新的伪造参数（`w_850`、`e_grayscale,w_352`）返回 401 `Transformation … is not allowed`。我们自己的 9 张图（WebP 转换、原图、`/img/*.webp`）仍然全部 200。
- 上一轮测试在设置生效前生成了 6 个派生图（`9208fed3b117013d` 上的 `w_500`、`f_png,w_2000`、`e_blur:300`、`c_scale,w_3000`、`w_709`、`e_grayscale,w_403`）。已生成的派生图不受 Strict 限制，还能访问，但只占很少的存储，没有删除。

### 2026-11-01（Claude Code，阶段 5）

- 用 Cloudflare API 关闭 Pages 项目 `markvaultfront` 的 Git 自动构建，然后推送代码仓库（`e2635fd..63cdb39`），Pages 没有新构建。
- 13:56:56 从 Pages 解绑 `blog.liuyun.ac.cn`，绑定 Worker 时失败：`blog` 上还有 CNAME，令牌没有 DNS 权限删掉它。13:57:44 把域名加回 Pages，旧站 13:58 恢复，中断约 1 分钟。
- 用户在后台删掉 CNAME，后台脚本 14:09:33 绑定到 Worker，随后从 Pages 解绑。
- `site/wrangler.jsonc` 加上 `routes`（custom domain），重新部署（版本 `009c1499`）。`site_url` 改成正式域名，`setup.sh` 和 CLI 提示里的默认值也一起改了。
- 在正式域名上验证：
  - 首页、全部文章、系列 / 分类 / 标签（含中文路径）、搜索、关于、Pagefind 都是 200。补尾斜杠和 `sub2api-delopy` 跳转正常，不存在的页面 404，旧的 `/api/posts` 返回 404 JSON。
  - 9 张图 `/img/*.webp` 都是 200 并命中边缘缓存（`cf-cache-status: HIT`，`caches.default` 只在自定义域名上生效）。外站 Referer 403，原图 200。
  - 浏览器里旧 hash 链接 `/#/posts/…`、`/#/paste/<id>`、`/#/manage`、`/#/search?q=…` 跳到对应新地址。
  - `paste-smoke` 44 项通过，它创建的数据都已删除。
- 没做：用户在正式域名上重新信任设备。

### 2026-11-01（Claude Code，阶段 6）

- 用户在正式域名上重新信任了设备，确认不等两周观察期，直接清理。
- 线上：
  - 停止并禁用旧服务器上的 Flask 服务。服务器上同时运行的其他服务没有动，旧代码和数据留在服务器上。
  - 删除 Pages 项目 `markvaultfront`。
  - `site/wrangler.jsonc` 设 `workers_dev: false` 并重新部署，workers.dev 地址返回 404，正式域名正常。
- 代码仓库：
  - 删除 `server_flask/`、`blog_by_vue/`、`manage.py`、`.github/workflows/deploy-backend.yml`、`docs/deploy-content-action-template.yml`、`docs/vps-setup-guide.md`、`.env.example`、`scripts/import-legacy-pastes.mjs`（旧 paste 已在阶段 4 导入）、`docs/requirements.md`（列的都是旧系统的需求）。`.gitignore` 去掉 Python 和 `server_flask/data/` 相关的规则。
  - 按新架构重写 `AGENTS.md`、`README.md`、`README.zh-CN.md`、`docs/architecture.md`、`docs/api.md`、`docs/content-guide.md`、`docs/development-guide.md`，`docs/changelog.md` 加上这次迁移。
  - 仓库是公开的，所以本文件删掉了服务器地址、SSH 信息、zone id、token 前缀、设备名和本机路径，"本地测试"移到开发指南。这些信息在更早的提交历史里仍然能看到。
- 验证：类型检查（packages、site、worker）、`markvault check`、`markvault build` 通过。
- 需要用户在后台处理：删除旧 API 子域名的 DNS 记录和 tunnel 里对应的 hostname、删除 GitHub 仓库里旧部署用的 `VPS_*` secrets、作废旧的 Notion token。

### 2026-11-01（Claude Code，EdgeOne 加速）

- 背景：国内直连 Cloudflare 太慢。用 EdgeOne 国际版在前面加一层 CDN。没有 ICP 备案，只能选"全球（不含中国大陆）"，国内访客走境外节点。
- 先用测试域名 `edge.<域名>` 验证：回源 Host 一开始用默认值，Cloudflare 又把请求送回 EdgeOne，返回 423 和 `cdn-loop: TencentEdgeOne; loops=16`。改成自定义回源 Host 后正常。缓存规则：页面 10 分钟、`/_astro` 和 `/img` 30 天、`/api` 和 `/paste` 不缓存。
- 测速：本机走代理测文章页，直连 Cloudflare 5 次里 3 次超时或超过 17 秒，EdgeOne 5 次都在 1–2.6 秒；用户在 itdog 上看到国内节点整体更绿，手机 4G 打开也明显更快。
- 测试期间为了能加载图片，把 `IMG_REFERER_ALLOW` 设成 `liuyun.ac.cn`（提交 `871b8f4`）。其他子域名的页面能引用 `/img/*`，外站和仿冒域名仍然 403。
- 切换准备：
  - Worker 加 `SITE_ORIGIN`（`site/worker/http.ts` 的 `assertSameOrigin` 和 `img.ts` 的 Referer 校验）：比对本机 Host 之外也认访客地址，经过 CDN 时 Paste 的写操作和图片不会被误判成跨站。
  - `wrangler.jsonc` 的 `routes` 加上回源域名 `origin.<域名>`，`vars.SITE_ORIGIN` 设成访客地址，重新部署（版本 `d4d0a10e`）。
  - 新增 `packages/cli/src/edgeone.ts`：腾讯云 TC3-HMAC-SHA256 签名，调用 `CreatePurgeTask`（`purge_host`）。签名用官方文档的示例核对过，结果一致。`deploy` 和 `publish` 部署后等 10 秒再清缓存，避免 CDN 把旧页面回填进去。
  - `setup.sh` 加了可选的 EdgeOne 配置步骤（zone_id、SecretId、SecretKey）。
- 验证：`origin.<域名>` 和 `blog.<域名>` 的首页、文章页、`session` 都是 200；图片 Referer 是本域名时 200、外站 403；配对接口 `Origin` 是访客地址时 400（配对码错误，说明已经进了业务层）、外站 403。`blog` 行为不变。
- 待做：在 EdgeOne 添加 `blog.<域名>` 加速域名、切换 DNS、配置子账号密钥。
