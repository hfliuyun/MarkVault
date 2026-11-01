# MarkVault 迁移到 Cloudflare 的设计

状态：待审核
日期：2026-11-01
取代：`2026-06-17-article-management-design.md`、`2026-06-18-deployment-architecture-design.md`、`2026-06-19/20-notion-sync-*`、`2026-06-16-pastebin-and-totp-design.md` 中的认证部分

## 1. 背景和目标

### 1.1 现状的问题

- **慢**：每次打开文章，请求都要从 Cloudflare 边缘绕到 DMIT 上的 Flask。Flask 每次请求都要 `stat` 全部 `.md` 文件，并且现场渲染 Markdown（`content_index.py` 的 `get_post` 不缓存）。
- **数据源有多份**：Obsidian vault、`blog-content` git 仓库、服务器磁盘、Notion、插件里的发布 hash。插件上传、网页编辑、Notion 回写都会直接改服务器磁盘，各份之间已经不一致。
- **发布容易出错**：slug 要在 frontmatter、文件名、目录名三处保持一致；系列要在 `series.id` 和目录名两处保持一致。任何一篇文章出错，或者因为改了系列导致 slug 重复，所有公开接口都会返回 500。
- **和 Obsidian 的写法冲突**：文件名只能是 `index.md` 或 slug，不支持 wikilink、`![[图片]]`、callout、`==高亮==`，嵌套列表必须 4 空格缩进。
- **Paste 用起来麻烦**：网页端每 2 小时就要重新输入一次 TOTP 码。

### 1.2 目标

1. 去掉 Python 后端和 DMIT 服务器，全部跑在 Cloudflare Workers 免费套餐上，**不绑信用卡**。
2. vault 是文章的唯一数据源。服务器对文章只读，不接受写入。
3. 在 Obsidian 里按习惯写作：文件名就是标题，wikilink、图片粘贴、callout 都能用。发布只需要一条命令。
4. 不打开 Obsidian 也能发布。换一台电脑，跑一个脚本就能配好发布环境。
5. 图片不进 git。图床失效时，文章一个字都不用改，就能换到别的地方。
6. Paste 在已信任的设备上打开就能用，不再需要登录。
7. 现有文章的公开 URL 保持不变。旧的 hash 路由链接（`/#/posts/xxx`）和 `/p/:abbrlink` 旧链接继续能用。

### 1.3 不做的事

- 网页编辑文章、网页上传文章、文章管理页面（`/manage`）
- Notion 同步
- 在手机上发布文章
- 多用户

## 2. 整体架构

### 2.1 组件总览

```
┌──────────────────────── 你的电脑（发布机）────────────────────────┐
│                                                                   │
│  Obsidian vault = 内容仓库 blog-content                            │
│    ├─ *.md（文章、系列）          → git → GitHub 私有仓库           │
│    ├─ .markvault/images.json     → git（图片清单，几 KB）           │
│    └─ 图片原件                    → 不进 git；Syncthing + Time Machine │
│                                                                   │
│  代码仓库 MarkVault                                                │
│    ├─ packages/content   内容解析、校验、渲染（构建和 CLI 共用）       │
│    ├─ packages/cli       markvault 命令                            │
│    ├─ site/              Astro 站点 + Worker                       │
│    └─ obsidian-plugin/   薄插件，只负责调用 markvault                │
│                                                                   │
│  markvault publish                                                 │
│    1. 校验全部内容                                                  │
│    2. 新图片 → 无损压缩 ────────────────────► Cloudinary           │
│    3. 更新 images.json，git commit + push 内容仓库                   │
│    4. astro build                                                  │
│    5. wrangler deploy ────────────┐                                │
└───────────────────────────────────┼───────────────────────────────┘
                                    ▼
┌─────────────── Cloudflare（Workers 免费套餐）───────────────┐
│  Worker "markvault"，绑定自定义域名                          │
│                                                             │
│  静态资源（不计请求数，不限量）                                │
│    ├─ 所有文章、列表、系列、分类、标签页面（预渲染 HTML）        │
│    ├─ CSS/JS、搜索索引（Pagefind）                            │
│    ├─ _redirects（旧 abbrlink 链接）                          │
│    └─ Paste 页面外壳                                         │
│                                                             │
│  Worker 脚本（每天 10 万次请求）                               │
│    ├─ /img/*        → 转发 Cloudinary，边缘缓存，防盗链 ──► Cloudinary
│    ├─ /api/paste/*  → Paste 接口、设备信任 ──────────────► D1
│    ├─ /paste/<id>   → 返回 Paste 查看页外壳                  │
│    └─ Cron（每小时）→ 清理过期 paste 和配对码 ────────────► D1
└─────────────────────────────────────────────────────────────┘
```

### 2.2 每类数据存在哪里

| 数据                     | 唯一数据源               | 其他副本                   | 丢了怎么办                 |
| ------------------------ | ------------------------ | -------------------------- | -------------------------- |
| 文章、系列的 Markdown    | vault                    | GitHub 内容仓库、线上 HTML | 从 GitHub clone            |
| 图片原件                 | vault                    | Time Machine               | 从 Time Machine 恢复       |
| 线上图片                 | Cloudinary（原件无损压缩后的可重建副本） | CF 边缘缓存                | 用 vault 里的原件重新压缩、上传  |
| 图片清单 `images.json` | vault                    | GitHub 内容仓库            | 重新扫描 vault 生成        |
| 线上页面                 | 构建产物（可重建）       | —                         | 重新 `markvault publish` |
| Paste、已信任设备        | D1                       | D1 Time Travel 恢复点      | 用 Time Travel 恢复        |
| 发布机凭据               | 本机配置文件             | —                         | 重新运行 `setup.sh`      |

### 2.3 请求流程

**读文章**：浏览器请求 `/posts/aac-stream/`，CF 边缘直接返回预渲染好的 HTML，不执行 Worker，也不访问任何源站。代码高亮和公式在构建时就生成好了，页面只带很少的 JS（代码复制按钮、移动端菜单、按需加载的 mermaid）。

**读图片**：HTML 里的图片地址是 `/img/<hash>.webp`。Worker 先检查 Referer，再查 CF 边缘缓存。缓存命中就直接返回；没命中就向 Cloudinary 取回，写入缓存后返回。响应头带 `Cache-Control: public, max-age=31536000, immutable`，浏览器之后不再请求同一张图。

**用 Paste**：浏览器打开 `/paste`，拿到静态页面外壳，页面脚本（原生 TS）调用 `/api/paste/items`。Worker 校验设备 cookie 后查询 D1。

**旧链接**：

- `/p/<abbrlink>` 命中 `_redirects`，308 跳转到 `/posts/<slug>/`。
- `/#/posts/<slug>` 这类 hash 路由的 `#` 后面部分浏览器不会发给服务器，所以由页面里的一段内联脚本处理：发现 `location.hash` 以 `#/` 开头，就 `location.replace` 到对应的真实路径。

## 3. 内容模型

### 3.1 vault 结构

**目录结构由你决定，系统不关心笔记放在哪个文件夹。** 构建会扫描整个 vault，只收录 frontmatter 里写了 `publish: true` 的笔记。以下目录不扫描：`.obsidian/`、`.markvault/`、`.git/`、`.stfolder/`、`.trash/`，以及配置项 `ignore` 里列出的目录（比如模板目录）。

建议（不强制）的结构：

```
blog-content/
├── 音视频数据流基础/
│   ├── 音视频数据流基础.md              ← 系列笔记（type: series）
│   ├── 音频流基础：PCM、WAV 与 AAC.md
│   └── images/
├── 独立文章/
│   ├── 逻辑回归.md
│   └── images/
├── 日记/                                ← 没有 publish: true，永远不会发布
└── .markvault/
    └── images.json
```

### 3.2 文章 frontmatter

```yaml
---
publish: true                      # 必填。不写或为 false 就不发布
slug: aac-stream                   # 必填。第一次发布时由工具帮你填，之后不要改
date: 2026-06-30 23:29             # 必填。第一次发布时自动填当前时间
updated: 2026-07-02                # 可选。显示"最后更新"
title: 音频流基础：PCM、WAV 与 AAC 编码深度解析   # 可选。不写就用文件名
summary: 从音频采集全链路出发……      # 可选
categories: [音视频流基础]           # 可选
tags: [AAC, PCM, ADTS, WAV]         # 可选
series: "[[音视频数据流基础]]"        # 可选。指向一篇系列笔记
series_order: 2                    # 可选。系列内的排序，不写就按 date 排
redirect_from: [old-slug]          # 可选。改过 slug 时，让旧地址继续能访问
legacy:
  abbrlinks: [a1b2c3d4]            # 可选。旧博客 /p/:abbrlink 链接
---
```

规则：

- `slug` 只能用小写字母、数字和单个连字符（`^[a-z0-9]+(?:-[a-z0-9]+)*$`），并且在所有文章和系列之间唯一。
- `date` 可以写 `YYYY-MM-DD`、`YYYY-MM-DD HH:mm`、`YYYY-MM-DD HH:mm:ss` 或 ISO 8601。没写时区的一律按 `Asia/Shanghai` 处理。
- 文件名、所在目录都不影响 URL。文件可以随便重命名、随便移动。
- 出现未知字段时只给警告，不报错。

### 3.3 系列

系列也是一篇普通笔记，用 `type: series` 标记，正文就是系列简介：

```yaml
---
publish: true
type: series
slug: av-stream-basics             # 即系列 id，URL 为 /series/av-stream-basics/
title: 音视频数据流基础              # 可选。不写就用文件名
---
整个音视频的开发流程经历下面几步……
```

文章用 `series: "[[音视频数据流基础]]"` 指向这篇系列笔记。在 Obsidian 里这就是一个可以点击跳转的链接，系列笔记的反向链接面板里也能看到它包含哪些文章。

系列内的排序：先按 `series_order` 升序；没写 `series_order` 的文章排在最后，再按 `date` 排。

现在 `series/av_stream_basics/README.md` 匹配不上系列 id `av-stream-basics`，导致这个系列的简介在网站上不显示。改成系列笔记后，这个问题就不存在了。

### 3.4 支持的 Markdown 语法

| 语法                                                       | 处理方式                                                                   |
| ---------------------------------------------------------- | -------------------------------------------------------------------------- |
| CommonMark + GFM（表格、任务列表、删除线、自动链接、脚注） | remark-gfm                                                                 |
| 嵌套列表 2 空格 / tab 缩进                                 | CommonMark 本身支持                                                        |
| `$...$`、`$$...$$` 公式                                | 构建时用 KaTeX 渲染，`_` 和 `*` 不会再被误当成强调                     |
| 代码块                                                     | 构建时用 Shiki 高亮，客户端不再需要 highlight.js                           |
| `[[笔记]]`、`[[笔记\|显示文字]]`、`[[笔记#标题]]`     | 指向已发布的笔记时生成站内链接；指向未发布的笔记时只输出文字，并给出警告   |
| `![[图片.png]]`、`![[图片.png\|300]]`、`![[图片.png\|raw]]` | 换成 `/img/...`，`300` 作为宽度，`raw` 表示不转 WebP（见 4.2） |
| `![](images/a.png)` 相对路径                             | 和上一行相同的处理方式                                                     |
| `> [!note] 标题`、`> [!tip]-`（可折叠）等 callout      | 生成带类型 class 的 `<div class="callout">`，可折叠的用 `<details>`    |
| `==高亮==`                                               | `<mark>`                                                                 |
| `%%注释%%`                                               | 删除                                                                       |
| `^block-id` 块引用标记                                   | 删除                                                                       |
| ` ```mermaid `                                           | 输出 `<pre class="mermaid">`，只在包含 mermaid 的页面按需加载 mermaid.js |
| `![[另一篇笔记]]` 嵌入整篇笔记                           | 不支持。降级为普通链接，并给出警告                                         |
| 原始 HTML                                                  | 允许，但会经过 rehype-sanitize 白名单过滤                                  |

渲染管线的顺序：

```
remark-parse → remark-gfm → remark-cjk-friendly → remark-math → remark-obsidian（自定义）
→ remark-rehype → rehype-raw → rehype-sanitize（白名单）
→ rehype-katex → Shiki → 标题 id 和目录
```

remark-cjk-friendly 解决 CommonMark 的一个中文问题：`**“编码”**决定` 这种中文标点紧挨 `**` 的写法，在 CommonMark 里不会变成粗体。

先过滤正文里的原始 HTML，再交给 KaTeX 和 Shiki。它们生成的 HTML 是可信的，不需要再过滤。

目录从语法树里提取 h2 到 h4，不会再把代码块里的 `# 注释` 当成标题。标题 id 继续沿用现在 `slugify_heading` 的规则（保留中文字符），重复的标题 id 加 `-2`、`-3` 后缀，正文和目录用的是同一套 id。

### 3.5 校验

`markvault check` 和每次构建都会执行同一套校验。**任何一项报错，整次构建就失败，线上继续用上一个版本。**

报错：

- 必填字段缺失，`slug` 格式不合法，`date` 无法解析
- `slug` 重复（包括和系列 slug、`redirect_from` 重复）
- `series` 指向的笔记不存在、没有发布，或者不是 `type: series`
- 引用的图片既不在本地，也不在 `images.json` 里
- `legacy.abbrlinks` 里同一个 abbrlink 指向了两篇文章
- 图片路径里有未编码的空格（CommonMark 不认，需要写成 `%20` 或改用 `![[...]]`）
- 已发布笔记的 frontmatter 无法解析

警告：

- wikilink 指向了未发布的笔记
- 出现未知的 frontmatter 字段
- 之前发布过的 slug 这次不见了（判断依据是 `.markvault/published.json` 里的记录），并且没有写进任何文章的 `redirect_from`。这通常说明你改了 slug，或者删了一篇文章，旧 URL 会变成 404。
- 还有没迁移的旧格式文章（有 `slug`、没有 `publish`）
- frontmatter 前面有空行，因此不会被识别

## 4. 图片

### 4.1 原则

- 原图只存在 vault 里，Markdown 里只写本地引用。
- Cloudinary 上只放可以重新生成的副本：原件经过无损压缩后上传，以原件的内容 hash 命名。
- 页面上的图片地址永远是你自己域名下的 `/img/...`，不出现 Cloudinary 的地址。

所以换图床只需要三步：改 Worker 里的上游地址、用原件重新压缩上传、重新构建。文章本身不用改。

### 4.2 上传前的无损压缩

目的：减少 Cloudinary 的存储用量。像素不变，vault 里的原件不动，只压缩要上传的那一份。

| 格式 | 工具 | 做法 |
|---|---|---|
| PNG | oxipng | `-o 4 --strip safe`：重新选择过滤器和 deflate 参数，去掉不影响显示的元数据块 |
| JPEG | jpegtran（mozjpeg） | `-optimize -progressive`：只重排 Huffman 编码，不重新量化 |
| GIF | gifsicle | `-O3`：优化帧和调色板，动画保持不变 |
| SVG | svgo | 默认预设，关闭会改变显示的插件（如 `removeViewBox`） |
| WebP | 不处理 | 有损 WebP 再压缩就不是无损了；无损 WebP 的收益很小 |

元数据：
- 删除 EXIF 里的 GPS、相机型号等信息。手机拍的照片带拍摄位置，这一步同时保护隐私。
- 保留 ICC 色彩配置（否则颜色会变）和 JPEG 的 `Orientation`（否则照片方向会错）。
- 删除元数据不改变像素，仍然算无损。

安全检查：
- 压缩后把新旧两份都解码成原始像素，逐像素比较，不一致就放弃压缩，上传原件。SVG 不做像素比较，只检查能否正常解析。
- 压缩结果不比原件小时，直接上传原件。
- 工具缺失或报错时，给出警告并上传原件，不中断发布。

压缩只在上传新图片时做一次。结果按原件 hash 记录在 `images.json` 里，之后的发布不会重复压缩。

注意：上面说的无损只针对 Cloudinary 上存的那一份。访客看到的交付版本是 `f_webp,q_auto`（见 4.4），属于视觉无损的有损压缩，这是为了加快页面加载。如果某张图需要像素级原样展示（比如像素图或截图对比），可以在引用时加 `![[a.png|raw]]`，这样会交付原格式，不转 WebP。

### 4.3 `images.json`

```json
{
  "version": 1,
  "paths": {
    "音视频数据流基础/images/adts-header.png": "3f2a9c41e0b7d815"
  },
  "assets": {
    "3f2a9c41e0b7d815": {
      "sha256": "3f2a9c41e0b7d815…（完整 64 位）",
      "public_id": "markvault/3f2a9c41e0b7d815",
      "format": "png",
      "width": 1280,
      "height": 720,
      "bytes_original": 241870,
      "bytes_uploaded": 183422,
      "compressor": "oxipng 9.1",
      "uploaded_at": "2026-11-01T10:00:00+08:00"
    }
  }
}
```

- `assets` 的 key 是**原件** sha256 的前 16 位十六进制，同时用作 Cloudinary 的 `public_id` 和线上文件名。内容相同的图片只上传一次。用原件而不是压缩结果算 hash，是因为不同版本的压缩工具输出可能不同，而原件的 hash 永远不变。
- `bytes_original` 和 `bytes_uploaded` 记录压缩效果；`compressor` 为 `null` 表示上传的是原件。`markvault check` 会汇总显示总共省下的空间。
- `paths` 记录 vault 里的相对路径对应哪个 hash。这样**没有图片原件的电脑**（只 clone 了内容仓库）也能完成构建。

构建时处理每一张被引用的图片：

1. 本地有这个文件：计算它的 hash。hash 已经在 `assets` 里就直接使用；不在的话，`publish` 会上传它，`check` 会报"有图片未上传"。
2. 本地没有这个文件：从 `paths` 里查 hash，查不到就报错。

### 4.4 Cloudinary 的使用方式

- 上传：先按 4.2 做无损压缩，再用 Upload API 签名上传，`public_id` 设为 `markvault/<hash>`。上传时就用 `eager` 预先生成交付格式（见下一条），避免访问时才转换、临时消耗 credit。
- 交付格式：
  - 位图（png/jpg/webp）：`f_webp,q_auto,c_limit,w_1600`。所有现代浏览器都支持 WebP，固定格式还能保证 CF 缓存不会因为 `Accept` 头不同而出错。
  - svg、gif：保持原格式。
  - 引用时写了 `|raw` 的图片：不做任何转换，直接交付上传的那一份（无损压缩后的原格式）。不经过转换的原图访问不受 Strict Transformations 限制。
- 在 Cloudinary 后台开启 **Strict Transformations**，只允许 eager 预先生成的那一种转换。这样别人直接访问 `res.cloudinary.com` 拼出各种转换参数时，不能消耗你的转换额度。
- 凭据：`api_key` 和 `api_secret` 只保存在发布机的本地配置里。Worker 只需要 `cloud_name`，这个值本来就是公开的。
- 额度：免费版每月 25 credit。1 credit 相当于 1GB 存储、1GB 流量或 1000 次转换。有了 CF 边缘缓存，到达 Cloudinary 的流量很少。

### 4.5 `/img/*` Worker

```
GET /img/<hash>.<ext>          默认交付版本（WebP，或 svg/gif 原格式）
GET /img/raw/<hash>.<ext>      |raw 图片，交付上传的那一份，不做转换
  1. 校验 hash 格式（16 位十六进制）和扩展名，不合法返回 404
  2. Referer 检查：允许空 Referer、自己的域名、配置里的白名单；其他来源返回 403
  3. caches.default 命中 → 直接返回
  4. 未命中 → fetch https://res.cloudinary.com/<cloud>/image/upload/[<transform>/]markvault/<hash>.<ext>
  5. 只缓存 200 响应；设置 Cache-Control: public, max-age=31536000, immutable
```

说明：

- `caches.default` 只在自定义域名上生效，在 `*.workers.dev` 上不生效。预览阶段每次都会回源 Cloudinary，这是正常的。
- 每次图片请求都会算一次 Worker 调用，包括缓存命中的情况。按一篇文章 20 张图估算，每天大约 5000 次文章浏览才会用完 10 万次的额度。超出额度时，Worker 请求会失败到 UTC 0 点，但静态页面不受影响。万一真的出现这种情况，可以临时把构建配置 `imageBase` 改成直接指向 Cloudinary，重新发布即可，代价是那段时间没有防盗链。

## 5. 发布工具

### 5.1 `markvault` 命令

```sh
markvault check                    # 校验全部内容，不上传，不部署
markvault publish [笔记路径]        # 完整发布流程（见 5.2）
markvault unpublish <笔记路径>      # 把 publish 改成 false，然后发布
markvault preview                  # 本地预览（astro dev），读取 vault 实时内容
markvault deploy                   # 只构建和部署，不处理内容（用于代码改动）
markvault paste-invite             # 生成 Paste 一次性信任链接（见 6.3）
markvault migrate                  # 一次性迁移旧内容格式（见第 9 节阶段 1）
```

### 5.2 `markvault publish [笔记路径]` 的步骤

1. 如果指定了笔记：
   - 写入 `publish: true`。
   - 没有 `slug` 时，用标题里的英文单词生成一个建议值，并让你确认或修改。标题是纯中文时直接让你输入。
   - 没有 `date` 时写入当前时间。
2. 执行全部校验，有任何报错就停下。
3. 把新图片无损压缩后上传到 Cloudinary，更新 `images.json`。
4. 如果 vault 是 git 仓库，提交 `*.md`、`.markvault/*.json`（提交信息 `publish: <时间>`），然后 push。push 失败只给警告，不中断发布。
5. 执行 `astro build`。
6. 执行 `wrangler deploy`。wrangler 只上传有变化的文件。
7. 更新 `.markvault/published.json`，打印本次新增和更新的文章链接。

### 5.3 本机配置

`~/.config/markvault/config.json`（权限 600，不进任何仓库）：

```json
{
  "vault": "~/code/blog-content",
  "cloudinary": { "cloud_name": "…", "api_key": "…", "api_secret": "…" }
}
```

Cloudflare 的凭据由 `wrangler login` 管理，不放在这里。

### 5.4 新电脑：`scripts/setup.sh`

1. 检查 Node 版本（需要 22 LTS 以上），不满足就提示安装方式。
2. 在代码仓库执行 `npm ci`，并把 `markvault` 链接到 PATH。
3. 询问 vault 路径。可以是已经同步好的完整 vault，也可以帮你 `git clone` 内容仓库。
4. 执行 `wrangler login`，在浏览器里点一下授权。
5. 输入 Cloudinary 凭据，写入本机配置。
6. 执行 `markvault check`，确认环境可用。

目前只支持 macOS 和 Linux。以后需要 Windows 时再加 PowerShell 版本。

### 5.5 Obsidian 插件（重写，变薄）

- 仅桌面端（`isDesktopOnly: true`）。
- 命令：
  - 「发布当前笔记」：弹窗确认 slug，然后调用 `markvault publish <当前笔记>`，进度和结果用 Notice 显示，完成后可以点击打开文章。
  - 「检查」：调用 `markvault check`，把错误列出来，点击可以跳到对应笔记。
  - 「取消发布当前笔记」。
- 设置项只有一个：`markvault` 可执行文件的路径。
- 删除的功能：TOTP 登录、设备令牌、ZIP 上传、拉取服务器版本、自动发布。

### 5.6 内容仓库和同步

- 内容仓库的 `.gitignore` 加上图片扩展名，以及 `.obsidian/workspace*.json`、`.stfolder/`、`.DS_Store`、`*.sync-conflict-*`。已经提交过的 10 张图片（约 4MB）留在 git 历史里，执行 `git rm --cached` 停止跟踪即可，不改写历史。
- Syncthing 和 git 同时作用在 vault 上时，`.git` 目录被同步可能损坏仓库。建议在 `.stignore` 里加上 `.git`，只在主力 Mac 上提交。其他电脑需要发布时，单独 `git clone` 一份内容仓库。

### 5.7 部署路径只有一条

- 停用 Cloudflare Pages 绑定 GitHub 的自动构建，删除 Pages 项目。
- 代码仓库推送到 GitHub 只用来保存版本，不触发部署。
- 文章和代码改动都通过 `markvault publish` 或 `markvault deploy` 部署。

以后如果想做到"git push 就自动发布"，GitHub Actions 已经具备条件：内容仓库有 Markdown，`images.json` 记录了图片，构建不需要原件。到时只需要加一个 workflow，本次不做。

## 6. Paste

### 6.1 体验

- **已信任的设备**：打开 `/paste` 就能用。最上面是输入框，下面列出最近的 paste，每条都有一键复制。在电脑上粘贴进去，手机打开页面就能直接复制最上面那条。
- **分享给别人**：每条 paste 都有 `/paste/<id>` 短链接，任何人都能打开查看，不需要信任设备。
- **添加新设备**：在任意已信任的设备上点「添加设备」，屏幕显示二维码和 6 位配对码，2 分钟内有效。新设备扫码，或者打开 `/paste` 输入配对码。
- **第一台设备**，或者所有设备都丢了：在发布机上执行 `markvault paste-invite`。
- **设备管理**：可以看到所有已信任的设备和最后使用时间，可以改名或移除。

过期选项沿用现在的 `1h`、`1d`（默认）、`1w`、`never`。单条 paste 最大 1MB（D1 单行上限是 2MB）。

### 6.2 设备信任

- 设备凭据是 32 字节随机数，以 HttpOnly cookie `mv_device` 保存。cookie 设置 `Secure`、`SameSite=Lax`、`Path=/api/paste`、`Max-Age` 为 365 天。
- D1 里只保存凭据的 SHA-256。
- 自动续期：每次请求时，如果距离 `last_seen_at` 超过 24 小时，就更新 `last_seen_at` 并重新下发 cookie（365 天）。所以每台设备每天最多产生一次写入。只要一年内用过一次，就永远不用重新配对。
- CSRF 防护：所有写操作要求 `Content-Type: application/json`，并且 `Origin` 必须是自己的域名。

### 6.3 一次性信任链接和配对码

两种方式共用 `pair_codes` 表：

**`markvault paste-invite`（终端）**

1. CLI 在本机生成 32 字节随机 token，计算 hash。
2. 执行 `wrangler d1 execute markvault --remote --command "INSERT INTO pair_codes …"`，写入 token 的 hash，有效期 10 分钟。这一步要求你已经登录 Cloudflare 账号，这本身就证明了你是站点主人。所以 Worker 里不需要保存任何管理密钥。
3. 终端打印 `https://<域名>/paste/pair/#t=<token>`，同时显示二维码。

**「添加设备」（已信任设备上）**

- 调用 `POST /api/paste/pair-codes`，同时生成一个 6 位配对码和一个长 token，有效期 2 分钟。二维码里放的是长 token 的链接。
- 6 位配对码最多允许输错 5 次，超过就作废。

**消费 token**：token 放在 URL 片段（`#t=…`）里，浏览器不会把片段发给服务器，所以不会出现在 Workers 日志里。`GET /paste/pair/` 只返回一个确认页面（"信任这台设备？"加一个设备名输入框）。用户点按钮后才 `POST /api/paste/pair` 真正使用 token。这样做是因为聊天软件会预先抓取链接生成预览，如果 GET 就消费 token，链接会在你点开之前就失效。token 只能使用一次。

### 6.4 接口

| 方法   | 路径                          | 权限   | 说明                                                            |
| ------ | ----------------------------- | ------ | --------------------------------------------------------------- |
| GET    | `/api/paste/session`        | 公开   | 返回 `{ trusted, device }`                                    |
| GET    | `/api/paste/items?limit=20` | 已信任 | 最近的 paste，包含完整内容（方便一键复制）                      |
| POST   | `/api/paste/items`          | 已信任 | `{ content, title, language, expires_in }`                    |
| GET    | `/api/paste/items/:id`      | 公开   | 单条 paste，已过期返回 404                                      |
| DELETE | `/api/paste/items/:id`      | 已信任 | 删除                                                            |
| POST   | `/api/paste/pair-codes`     | 已信任 | 生成配对码和二维码 token                                        |
| POST   | `/api/paste/pair`           | 公开   | `{ code }` 或 `{ token }`，加上 `name`，成功后下发 cookie |
| GET    | `/api/paste/devices`        | 已信任 | 设备列表                                                        |
| PATCH  | `/api/paste/devices/:id`    | 已信任 | 改名                                                            |
| DELETE | `/api/paste/devices/:id`    | 已信任 | 移除设备，可以移除自己                                          |

paste id 沿用现在的格式：8 位小写字母加数字。

### 6.5 D1 表结构

```sql
CREATE TABLE pastes (
  id          TEXT PRIMARY KEY,               -- 8 位 [a-z0-9]
  title       TEXT NOT NULL DEFAULT '',
  content     TEXT NOT NULL,
  language    TEXT NOT NULL DEFAULT 'text',
  created_at  INTEGER NOT NULL,               -- unix 秒
  expires_at  INTEGER,                        -- NULL 表示永不过期
  device_id   TEXT REFERENCES devices(id) ON DELETE SET NULL
);
CREATE INDEX idx_pastes_created ON pastes(created_at DESC);
CREATE INDEX idx_pastes_expires ON pastes(expires_at) WHERE expires_at IS NOT NULL;

CREATE TABLE devices (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  token_hash    TEXT NOT NULL UNIQUE,
  created_at    INTEGER NOT NULL,
  last_seen_at  INTEGER NOT NULL,
  user_agent    TEXT NOT NULL DEFAULT ''
);

CREATE TABLE pair_codes (
  id                 TEXT PRIMARY KEY,
  token_hash         TEXT NOT NULL UNIQUE,     -- 长 token（链接、二维码）
  code_hash          TEXT,                     -- 6 位码，终端邀请没有这一项
  attempts           INTEGER NOT NULL DEFAULT 0,
  expires_at         INTEGER NOT NULL,
  used_at            INTEGER,
  created_by_device  TEXT                      -- NULL 表示由终端生成
);
```

Cron Trigger 每小时执行一次：删除已过期的 paste，以及过期或已使用的 `pair_codes`。读取单条 paste 时同样会判断是否过期，所以不依赖 Cron 的执行时间。

## 7. 代码结构

### 7.1 仓库布局（重构后）

```
MarkVault/
├── package.json              npm workspaces 根
├── packages/
│   ├── content/              内容层：扫描、解析、校验、渲染、图片清单
│   │   ├── scan.ts           找出 publish: true 的笔记，建立文件名 → 笔记的映射
│   │   ├── schema.ts         frontmatter 字段校验（手写，规则见 3.2、3.5）
│   │   ├── model.ts          文章、系列、分类、标签、旧链接索引
│   │   ├── render/           unified 管线和 remark-obsidian
│   │   └── images.ts         图片引用解析、hash、images.json 读写
│   └── cli/                  markvault 命令、Cloudinary 上传、wrangler 调用
├── site/                     Astro 站点 + Worker
│   ├── astro.config.ts
│   ├── integrations/markvault.ts  开发时监听 vault 和本地 /img；构建后写 _redirects
│   ├── wrangler.jsonc
│   ├── src/
│   │   ├── lib/vault.ts       读取 vault（loadVault）并缓存渲染结果，所有页面共用
│   │   ├── site.config.ts     站点名、首页标语、导航
│   │   ├── layouts/          BaseLayout（含 hash 跳转脚本）、PostLayout
│   │   ├── pages/
│   │   │   ├── index.astro、page/[n].astro       首页和分页
│   │   │   ├── posts/[slug].astro
│   │   │   ├── series/index.astro、series/[id].astro
│   │   │   ├── categories/…、tags/…
│   │   │   ├── search.astro、about.astro、404.astro
│   │   │   └── paste/index.astro、paste/view.astro、paste/pair.astro
│   │   ├── components/       Astro 组件：页头、文章元信息、目录、侧边栏
│   │   ├── lib/paste/        Paste 页面脚本（原生 TS，不用 Vue）：api、ui、home、view、pair
│   │   └── styles/           基础排版、正文、组件样式和主题（见 8.7）
│   └── worker/
│       ├── index.ts          路由分发
│       ├── img.ts、api.ts（路由）、paste.ts、devices.ts、http.ts、cron.ts
│       └── migrations/0001_init.sql
├── obsidian-plugin/          重写后的薄插件
├── scripts/setup.sh
└── docs/
```

删除：`server_flask/`、`blog_by_vue/`（迁移完成后）、`manage.py`、`.github/workflows/deploy-backend.yml`、`docs/deploy-content-action-template.yml`、`docs/vps-setup-guide.md`、`.env.example` 中的 Notion 配置。

### 7.2 前端迁移

- 外观按第 8 节重新设计，不再沿用现在的毛玻璃和极光渐变风格。纯展示的部分（文章、列表、目录、侧边栏）改写成 Astro 组件，不再需要客户端 JS。
- 博客页面和 Paste 都不再使用 Element Plus。用到的按钮、下拉框、空状态、分页都按第 8 节的设计令牌手写，体积小，风格也统一。
- 搜索使用 Pagefind，在构建后生成索引，浏览器端按需加载。中文分词效果需要在第一阶段实测。效果不好的话，改用 MiniSearch 加 `Intl.Segmenter` 自己建索引。
- 路由从 hash 模式改成真实路径。URL 对应关系：

| 旧地址                                 | 新地址                                         |
| -------------------------------------- | ---------------------------------------------- |
| `/#/`                                | `/`                                          |
| `/#/posts/<slug>`                    | `/posts/<slug>/`                             |
| `/#/p/<abbrlink>`                    | `/p/<abbrlink>` → 308 → `/posts/<slug>/` |
| `/#/series`、`/#/series/<id>`      | `/series/`、`/series/<id>/`                |
| `/#/categories/<c>`、`/#/tags/<t>` | `/categories/<c>/`、`/tags/<t>/`           |
| `/#/search?q=…`                     | `/search/?q=…`                              |
| `/#/paste`、`/#/paste/<id>`        | `/paste/`、`/paste/<id>`                   |
| `/#/manage`                          | 删除，跳转到 `/`                             |

### 7.3 `wrangler.jsonc`

```jsonc
{
  "name": "markvault",
  "main": "./worker/index.ts",
  "compatibility_date": "2026-11-01",
  "assets": {
    "directory": "./dist",
    "binding": "ASSETS",
    "not_found_handling": "404-page",
    "run_worker_first": ["/api/*", "/img/*", "/paste/*"]
  },
  "d1_databases": [
    { "binding": "DB", "database_name": "markvault", "database_id": "…" }
  ],
  "vars": {
    "CLOUDINARY_CLOUD": "…",
    "SITE_ORIGIN": "https://<域名>",
    "IMG_REFERER_ALLOW": ""
  },
  "triggers": { "crons": ["0 * * * *"] }
}
```

`/paste/*` 需要先经过 Worker：`/paste/<id>` 要返回 `paste/view/index.html` 这个外壳页面，其他 `/paste/...` 路径原样交给 `env.ASSETS.fetch`。

## 8. 视觉设计和主题

原型：`docs/specs/2026-11-01-theme-prototype.html`，用浏览器直接打开。包含首页、文章页、Paste 三个视图，右上角可以切换主题。地址后面加 `?theme=paper`、`?theme=night`、`?theme=plain` 可以直接指定主题。

### 8.1 方向

安静的阅读页面：暖色纸张背景，衬线标题，无衬线正文，大量留白，一种强调色。去掉现在的毛玻璃、模糊、极光渐变和卡片阴影。视觉层次只靠字号、字重、颜色深浅和细分隔线来表达。

具体约束：
- 不用阴影表达层级（唯一的例外是主题菜单这类浮层）。
- 不用渐变、不用模糊。
- 一个页面只用一种强调色，只用在链接悬停、当前项、系列标签这几处。
- 动效只保留主题切换时 150ms 的颜色过渡。用户开启"减少动态效果"时关闭。

### 8.2 字体

全部使用系统字体，不加载任何 Web 字体：

| 用途 | 字体栈 |
|---|---|
| 标题 | `"Iowan Old Style", Charter, Georgia, "Songti SC", "Noto Serif SC", "Source Han Serif SC", serif` |
| 正文 | `-apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Noto Sans SC", "Microsoft YaHei", sans-serif` |
| 代码 | `"JetBrains Mono", "SF Mono", Menlo, Consolas, "PingFang SC", monospace` |

现在的 `style.css` 第一行从 Google Fonts 加载 Inter。Google Fonts 在国内访问很慢，甚至会阻塞首屏渲染，去掉它本身就能明显加快打开速度。中文 Web 字体单个文件就有几 MB，也不考虑。

### 8.3 排版

| 项目 | 取值 |
|---|---|
| 正文宽度 | 42rem（约 672px，每行约 40 个汉字） |
| 正文字号 / 行高 | 17px / 1.85（窄屏 16.5px） |
| 文章标题 | 衬线 2.25rem，字重 500 |
| h2 | 衬线 1.5rem，上间距 2.4em |
| h3 | 无衬线 1.15rem，字重 600 |
| 段落间距 | 1.15em |
| 圆角 | 8px（卡片 12px） |

标题使用 `text-wrap: balance`，避免长标题最后一行只剩一两个字。

### 8.4 页面布局

**页头**：左边站点名（衬线），旁边是导航（文章、系列、分类、标签、关于），右边是搜索（⌘K）、Paste、主题切换。窄屏时导航收进 ☰ 菜单。去掉管理和登录按钮。

**首页**：
- 顶部一句标题和一句介绍，内容写在配置里。
- 文章按年份分组，每条一行：左边是月-日（等宽数字），右边是标题、摘要（最多两行）和系列标签（如"音视频数据流基础 · 2"）。
- 不用卡片，条目之间只有细分隔线。
- 每页 10 篇，底部"更早的文章 →"。

**文章页**：
- 标题上方：系列名和第几篇（强调色小字）。
- 标题下方：日期、阅读时间、标签，再加一条分隔线。
- 宽屏（≥1100px）右侧显示粘性目录，当前章节左边框变成强调色。窄屏时目录变成正文上方一个可以折叠的"目录"。
- 文末：系列框（列出系列全部文章，当前篇高亮），然后是上一篇 / 下一篇。

**Paste**：大输入框（等宽字体），底部一条工具栏放语言、过期时间和保存按钮。下面是最近列表，每条显示前两行内容、语言、时间、来源设备，以及"复制"和"链接"按钮。

### 8.5 正文元素

| 元素 | 样式 |
|---|---|
| 链接 | 文字颜色不变，1px 强调色下划线，悬停时文字变成强调色 |
| 行内代码 | 浅底色，等宽字体 0.88em |
| 代码块 | 浅底色加 1px 边框，右上角显示语言；悬停时语言换成"复制"按钮 |
| 表格 | 只有横线，没有竖线，表头下面是一条加粗线；超宽时横向滚动 |
| 引用 | 左侧 3px 灰线，次要文字颜色，不用斜体（中文斜体是机器倾斜的，很难看） |
| callout | 左侧 3px 类型色边框，背景是类型色 7% 混合；note 蓝、tip 绿、warning 黄、danger 红 |
| `==高亮==` | 柔和的黄色底 |
| 图片 | 居中，6px 圆角，1px 边框；alt 文字作为图注 |
| 分隔线 | 居中的 `· · ·` |
| 公式 | KaTeX 继承文字颜色，所以所有主题下都正确 |

### 8.6 主题

内置三套主题，再加一个"跟随系统"：

| 主题 | 背景 | 文字 | 强调色 | 标题字体 |
|---|---|---|---|---|
| 纸（默认浅色） | `#faf9f5` 暖白 | `#1f1e1d` | `#b0532f` 赤陶 | 衬线 |
| 夜（默认深色） | `#1f1e1c` 暖黑 | `#ecebe5` | `#e08a65` | 衬线 |
| 素 | `#ffffff` 冷白 | `#16181d` | `#2f5fd0` 蓝 | 无衬线 |

"跟随系统"在系统浅色时用"纸"，深色时用"夜"。这是默认选项。

所有正文文字与背景的对比度都不低于 WCAG AA 的 4.5:1。比如"纸"主题的次要文字用 `#6f6e67`，而不是更浅的灰色。

**实现方式**：
- 每套主题是一个只定义 CSS 变量的文件：`site/src/styles/themes/<name>.css`，通过 `html[data-theme="<name>"]` 生效。变量包括 `--bg`、`--surface`、`--text`、`--text-2`、`--muted`、`--border`、`--accent`、`--accent-soft`、`--code-bg`、`--mark`、`--heading-font`，以及 4 个 callout 颜色。
- 组件样式只能用这些变量，不允许写死颜色。所以加一套新主题只需要新增一个变量文件，再在主题菜单里注册一项。
- 用户的选择保存在 `localStorage` 的 `mv-theme` 里（`auto`、`paper`、`night`、`plain`）。
- `<head>` 最前面内联一小段脚本，在页面绘制之前就设置好 `data-theme`，避免刷新时先闪一下默认主题。
- 代码高亮：Shiki 使用双主题输出（`defaultColor: false`），生成 `--shiki-light` 和 `--shiki-dark` 两组变量。每套主题声明自己用浅色还是深色那一组。
- mermaid：切换主题时用对应的 mermaid 主题（`neutral` 或 `dark`）重新渲染。

### 8.7 文件位置

```
site/src/styles/
├── base.css          重置、字体栈、排版
├── prose.css         正文元素（8.5）
├── components.css    页头、列表、目录、系列框、Paste
└── themes/
    ├── paper.css
    ├── night.css
    └── plain.css
```

## 9. 迁移步骤

每个阶段结束后，旧站都正常运行，直到第 5 阶段切换域名。**迁移期间不要再用旧插件发布文章。** 旧插件写的是服务器磁盘，新流程不会读取那里的内容。

### 阶段 0：准备

- 注册 Cloudinary，开启 Strict Transformations。
- `wrangler d1 create markvault`，执行建表迁移。
- 备份服务器上的 `server_flask/data/`（pastes 和 auth）以及服务器内容目录。把服务器内容目录和本地 vault 做一次 diff，确认没有只存在于服务器上的修改（比如网页编辑器改过的正文）。

### 阶段 1：内容层和迁移脚本

- 实现 `packages/content` 和 `markvault check`。
- 实现 `markvault migrate`，它对 vault 做这些修改（在 git 里可以完整查看 diff）：
  - `series/<dir>/README.md` → `<系列标题>.md`，加上 `type: series`、`publish: true`，`slug` 设为文章里实际使用的 `series.id`（例如 `av-stream-basics`）。
  - 文章：加上 `publish: true`；`series: {id, title, order}` → `series: "[[系列标题]]"` 和 `series_order`；删除 `notion` 字段；`index.md` 改名为 `<标题>.md`（去掉文件名不允许的字符）。
  - `slug`、`date`、`legacy` 保持不变。
  - 不在 `posts/*/`、`series/*/*/` 下面的笔记（比如 `2026-09-09.md`）不加 `publish`，也就不会被发布。
- 验收标准：`markvault check` 没有报错；新旧两套系统列出的文章 slug 集合完全一致。

实现补充：
- `markvault migrate` 默认只预览，加 `--apply` 才写入；计划中有任何错误时什么都不改。
- 没有 README 的系列会新建一篇空的系列笔记，放在第一篇文章所在目录的上一级。
- 迁移后的文件名和 vault 里已有的笔记重名时，加上 ` (<slug>)` 后缀，保证 wikilink 不会有歧义。
- 系列标题取当前线上实际显示的那个（`series/<id>/README.md` 的 title，否则取第一篇文章的 `series.title`），不一致的地方在预览里列出来。
- frontmatter 前面有空行的笔记（旧系统和 Obsidian 都不识别）会报错，要先手动修正。
- `.markvault/published.json` 的"slug 消失"警告要依赖 publish 写入的记录，放到阶段 2 实现 `publish` 时一起做。

### 阶段 2：Astro 站点

实现补充：
- 没有用 Astro Content Layer，页面在 `getStaticPaths` 里直接调用 `site/src/lib/vault.ts`。数据模型已经由 `packages/content` 建好，再套一层 loader 没有好处。
- `site/integrations/markvault.ts` 负责三件事：开发时监听 vault 目录，有改动就刷新页面；开发时用 vault 里的原图响应 `/img/<hash>.*`；构建完成后写 `dist/_redirects`。
- 阶段 2 的 `wrangler.jsonc` 只有静态资源，没有 `main`。阶段 3、4 再加 Worker 脚本和 D1 绑定。

- 搭建 `site/`，按第 8 节和原型实现页面、三套主题，以及 hash 跳转脚本和 `_redirects`。
- 部署到 `markvault.<子域>.workers.dev` 预览，逐页和旧站对比。
- 验证 Pagefind 的中文搜索效果。

### 阶段 3：图片

实现补充：
- PNG 用 oxipng 的 wasm 版，压缩级别 `-o2`。`-o4` 只再小 4% 左右，耗时却多一倍（一张 2700×4100 的图要 13 秒）。透明像素的颜色值保持不变（`optimiseAlpha=false`），所以逐像素比较能通过。
- JPEG 用 jpegtran `-copy icc -optimize -progressive`。照片有旋转信息时，另写一个只包含 Orientation 的最小 EXIF 段，DCT 数据原样不动，像素完全一致。曾经尝试过用 jpegtran 做无损旋转，但解码后像素有 ±1 的差异，所以放弃了。
- 为了把 EXIF 和 GPS 去掉，去元数据后的结果即使比原图大一点（不超过 5%）也照样采用。
- 本机没有 jpegtran 或 gifsicle 时，JPEG 和 GIF 原样上传，给出提示，不中断发布。
- Cloudinary 的 `cloud_name` 不写进 `wrangler.jsonc`，因为代码仓库是公开的，写进去别人就能绕过防盗链直接访问 Cloudinary。由 `markvault deploy` 和 `markvault publish` 用 `--var CLOUDINARY_CLOUD:<name>` 传入；本地测试时 `scripts/dev/serve-run.sh` 从本机配置读取。
- 交付规则（转换参数、最大宽度、哪些格式原样交付）放在 `packages/content/src/delivery.ts`，CLI、渲染器和 Worker 共用这一份。

- 实现无损压缩、Cloudinary 上传和 `/img/*`。把现有的 10 张图片全部压缩上传，生成 `images.json`。
- 验收：逐像素比较全部通过；手机照片的 GPS 已删除，方向和颜色正确；`markvault check` 显示压缩前后的总大小。
- 内容仓库停止跟踪图片文件。

### 阶段 4：Paste

实现补充：
- 页面脚本用原生 TS（`site/src/lib/paste/`），不用 Vue。三个页面的交互都很简单，不值得为它加一个框架；用户内容一律走 `textContent`。
- 列表接口每页最多 20 条，只内联 5 万字符以内的内容。更长的条目在点「复制」时再取（`ClipboardItem` 接收 Promise，Safari 也不会丢掉点击授权），一页最多约 100 万字符，不会超出免费版每次 10ms 的 CPU。
- 列表用 `before=<created_at>:<id>` 游标分页，永不过期的条目多了也能翻到。
- 输错配对码时无法对应到某一行，所以每次尝试都给所有有效的配对码加一次 `attempts`。计数和认领放在同一个 `db.batch` 里（D1 按事务执行），并发请求不能绕过 5 次的限制。匿名请求可以用 5 次错误尝试让当前配对码作废，这个代价可以接受：链接和二维码不受影响，重新生成即可。
- 请求体按流计数：只带 token、配对码或设备名的接口上限 4KB，创建 paste 上限 7MB。不依赖 `Content-Length`，分块上传也会被拦下。
- 终端邀请有效期 10 分钟，「添加设备」的配对码 2 分钟。
- Cron 另外删除一年多没用过的设备：它们的 cookie 在浏览器里已经过期，记录留着没有用。
- 二维码用 `uqr`（无依赖，浏览器输出 SVG，终端用半格字符加固定黑白色，深色终端也能扫）。
- 旧 paste 用 `scripts/import-legacy-pastes.mjs` 导入，长内容分段拼接（D1 单条 SQL 上限 100KB），导入后比对 sha256。
- `scripts/dev/paste-smoke.mjs` 是接口的端到端检查，只删除自己创建的数据，切换域名后可以对线上再跑一次。

- 实现 Worker 接口、设备信任、配对、Cron，以及 Paste 页面。
- 写一个一次性脚本，把备份的 `data/pastes/*.json` 导入 D1，跳过已过期的。
- 用 `markvault paste-invite` 信任第一台设备，然后在手机上走一遍配对流程。

### 阶段 5：切换

1. 在 Pages 项目里解绑自定义域名，然后绑定到 Worker。中间会有几分钟不可访问。
2. 按 7.2 的 URL 对应表逐条验证旧链接，并检查文章、图片、搜索、Paste。
3. 停用 Pages 的 Git 自动构建。

实现补充：
- 实际顺序是先停用 Pages 自动构建，再推送代码仓库，最后切换域名，避免推送触发一次 `blog_by_vue` 构建。
- Pages 解绑域名后不会删掉它的 CNAME，而 Worker 自定义域名要求这个名字上没有别的 DNS 记录。wrangler 的令牌没有 DNS 编辑权限，这条 CNAME 要在后台手动删除。
- 自定义域名写进 `wrangler.jsonc` 的 `routes`（`custom_domain: true`），以后的 `deploy` 会保留它。

### 阶段 6：清理（切换后观察两周）

- 关闭 DMIT 上的 `markvault-backend` 服务，删除 `apiblog` 的 DNS 记录。
- 按 7.1 删除旧代码和旧文档，更新 `AGENTS.md`、`docs/architecture.md`、`docs/content-guide.md`、`docs/development-guide.md`、`docs/api.md`。
- 在 `docs/changelog.md` 里记录这次迁移。

**实现补充**：切换后验证全部通过，用户确认后在切换当天完成，没有等两周。另外删除了 `docs/requirements.md`（只有旧系统的需求）、`scripts/import-legacy-pastes.mjs`，并关闭了 workers.dev 地址（`workers_dev: false`）。仓库是公开的，`docs/migration-progress.md` 里的服务器和账号信息一并删掉。

## 10. 风险和待验证事项

| 事项                                | 影响                          | 应对                                                  |
| ----------------------------------- | ----------------------------- | ----------------------------------------------------- |
| Workers、D1 免费版是否需要绑卡      | 方案能否成立                  | 阶段 0 创建 D1 时就能确认                             |
| Pagefind 中文分词效果               | 搜索质量                      | 阶段 2 实测，不好就换 MiniSearch + `Intl.Segmenter` |
| 图片请求消耗 Worker 额度            | 流量很大时图片失效到 UTC 0 点 | 长期缓存头；必要时临时直连 Cloudinary                 |
| Cloudinary 调整免费政策或账号出问题 | 图片暂时失效                  | 原件在 vault，换托管后重新上传、重新构建              |
| Syncthing 同步 `.git` 损坏仓库    | 内容历史                      | `.stignore` 排除 `.git`                           |
| 改了 slug 导致旧 URL 404            | 外链失效                      | `published.json` 警告，加上 `redirect_from`       |
| D1 数据误删                         | Paste 数据                    | D1 Time Travel 恢复（免费版保留时长以官方文档为准）   |
| 切换域名的几分钟内不可访问          | 访问中断                      | 选访问量低的时间操作                                  |
| 压缩工具在新电脑上缺失或版本不同 | 少省一点空间 | 缺失时上传原件；hash 基于原件，版本不同不影响已上传的图片 |