# MarkVault 架构

本文是简要说明。完整设计和每个决定的原因见 [Cloudflare 迁移设计](specs/2026-11-01-cloudflare-migration-design.md)。

## 组件

```
发布机（本机）
  vault（Obsidian，单独的私有 Git 仓库）
    ├─ *.md                      文章和系列
    ├─ .markvault/images.json    图片清单（hash → 线上地址）
    └─ .markvault/published.json 已发布的 slug，用来发现失效的 URL
  代码仓库（本仓库）
    ├─ packages/content   扫描、校验、渲染，构建和 CLI 共用
    ├─ packages/cli       markvault 命令
    ├─ site/              Astro 站点 + Worker
    └─ obsidian-plugin/   调用 markvault 的薄插件

markvault publish
  校验 → 新图片无损压缩 → Cloudinary → 更新 images.json
  → astro build → wrangler deploy → 提交并推送 vault

Cloudflare Worker "markvault"（免费套餐，绑定正式域名）
  静态资源：全部预渲染页面、CSS/JS、Pagefind 索引、_redirects、Paste 页面外壳
  Worker 脚本：
    /img/*        Referer 检查 → 边缘缓存 → Cloudinary
    /api/paste/*  Paste 接口和设备信任 → D1
    /paste/<id>   返回 Paste 查看页外壳
    Cron 每小时   清理过期的 paste 和配对码
```

只有 `/api/*`、`/img/*` 和 `/paste/*` 会先经过 Worker（`wrangler.jsonc` 里的 `run_worker_first`）。其余请求直接由静态资源返回，不计入 Worker 的请求数。

## 数据存在哪里

| 数据 | 数据源 | 丢了怎么办 |
|---|---|---|
| 文章、系列 | vault | 从内容仓库 clone |
| 图片原件 | vault（不进 Git） | 从备份恢复 |
| 线上图片 | Cloudinary | 用原件重新压缩、上传 |
| `images.json`、`published.json` | vault | 重新扫描 vault 生成 |
| 线上页面 | 构建产物 | 重新 `markvault publish` |
| Paste、已信任的设备 | D1 | D1 Time Travel |
| Cloudinary 凭据、vault 路径 | `~/.config/markvault/config.json` | 重新运行 `scripts/setup.sh` |

## 请求流程

- **文章页**：边缘直接返回预渲染的 HTML。代码高亮和公式在构建时生成，页面只带少量 JS（代码复制、目录高亮、移动端菜单、按需加载的 mermaid）。
- **图片**：HTML 里的地址是 `/img/<hash>.webp`。Worker 检查 Referer，先查 `caches.default`，没命中再向 Cloudinary 取。响应头是一年加 `immutable`。
- **Paste**：`/paste/` 是静态外壳，页面脚本调用 `/api/paste/*`。Worker 用 `mv_device` cookie 识别已信任的设备。
- **旧链接**：`/p/<abbrlink>` 和 `redirect_from` 里的旧 slug 由构建时生成的 `_redirects` 做 308 跳转。旧前端的 hash 路由（`/#/posts/...`）由页面里的内联脚本换成真实路径。

## 内容渲染

渲染管线在 `packages/content/src/render/`：

```
remark-parse → remark-gfm → remark-cjk-friendly → remark-math → remark-obsidian
→ remark-rehype → rehype-raw → rehype-sanitize（白名单）
→ rehype-katex → Shiki → 标题 id 和目录
```

先用白名单过滤正文里的原始 HTML，再交给 KaTeX 和 Shiki。它们生成的 HTML 是可信的。
