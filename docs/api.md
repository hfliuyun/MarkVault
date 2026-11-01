# MarkVault 接口

博客页面都是静态文件，没有文章接口。Worker 只处理图片和 Paste。实现在 `site/worker/`。

站点前面可以放一层 CDN（例如 EdgeOne）：Worker 通过回源域名（`origin.<域名>`）提供服务，访客访问的是 `blog.<域名>`。Worker 用 `SITE_ORIGIN` 记住访客看到的地址，Paste 的 Origin 校验和图片防盗链都认它。

## 图片

| 路径 | 说明 |
|---|---|
| `GET /img/<hash>.webp` | 位图转成 WebP（最大宽度 1600）。`hash` 是原件 sha256 的前 16 位 |
| `GET /img/<hash>.<ext>` | svg、gif 等不转换的格式 |
| `GET /img/raw/<hash>.<ext>` | 原图（压缩后），用于 `![[图片|raw]]` |

- Referer 的域名既不是当前 Host、也不是 `SITE_ORIGIN` 的域名、也不在 `IMG_REFERER_ALLOW`（逗号分隔的域名，含子域名）里时返回 403。没有 Referer 时放行。
- 站点前面有 CDN 时，命中 CDN 缓存的响应不会再经过 Worker，所以防盗链只在缓存未命中时生效。403 不会被 CDN 缓存（实测 EdgeOne）。
- 响应带 `Cache-Control: public, max-age=31536000, immutable`，并写入边缘缓存。上游失败的响应不缓存。
- 不符合上面格式的路径返回 404。

## Paste

所有接口都在 `/api/paste/` 下，返回 JSON。

### 权限

- **公开**：任何人都能调用。
- **已信任**：需要有效的 `mv_device` cookie，否则返回 401。
- 所有非 GET 请求的 `Origin` 必须是 `SITE_ORIGIN` 或当前 Host，否则返回 403。带请求体的接口要求 `Content-Type: application/json`，否则返回 415。
- 路径不存在返回 404，方法不对返回 405。
- 请求体上限：普通接口 7MB，配对和改名接口 4KB。超过返回 413。

### 设备 cookie

`mv_device` 是 32 字节随机数，`HttpOnly; Secure; SameSite=Lax; Path=/api/paste`，有效期 365 天。D1 里只存它的 SHA-256。距离上次使用超过 24 小时的请求会重新下发 cookie，所以一年内用过一次就不用重新配对。

### 路由

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET | `/api/paste/session` | 公开 | `{ trusted, device }` |
| GET | `/api/paste/items?limit=20&before=<cursor>` | 已信任 | 最近的 paste，每页最多 20 条。5 万字符以内的条目带完整内容。返回 `{ items, next_cursor }` |
| POST | `/api/paste/items` | 已信任 | `{ content, title, language, expires_in }`。`expires_in` 是 `1h`、`1d`（默认）、`1w` 或 `never`。内容最大 1MB |
| GET | `/api/paste/items/:id` | 公开 | 单条 paste。已过期返回 404 |
| DELETE | `/api/paste/items/:id` | 已信任 | 删除 |
| POST | `/api/paste/pair-codes` | 已信任 | 生成 6 位配对码和二维码链接，2 分钟内有效 |
| POST | `/api/paste/pair` | 公开 | `{ code }` 或 `{ token }`，加上 `name`。成功后下发 cookie |
| GET | `/api/paste/devices` | 已信任 | 设备列表 |
| PATCH | `/api/paste/devices/:id` | 已信任 | `{ name }`，改名 |
| DELETE | `/api/paste/devices/:id` | 已信任 | 移除设备，可以移除自己 |

paste id 是 8 位小写字母和数字。

### 配对

- **终端邀请**：`markvault paste-invite` 在本机生成 token，用 `wrangler d1 execute` 写入它的 hash（10 分钟有效），然后打印 `https://<域名>/paste/pair/#t=<token>` 和二维码。能写 D1 就说明是站点主人，所以 Worker 里没有管理密钥。
- **添加设备**：已信任的设备调用 `pair-codes`，新设备扫码，或者输入 6 位码。配对码最多输错 5 次。
- token 放在 URL 片段里，不会发到服务器，也不会进 Workers 日志。`/paste/pair/` 只显示确认页，点按钮后才调用 `POST /api/paste/pair`。这样聊天软件预先抓取链接时，token 不会被提前用掉。

### 数据和清理

表结构在 `site/worker/migrations/0001_init.sql`。Cron 每小时删除过期的 paste，以及过期或已使用的配对码。读取单条 paste 时也会判断是否过期，所以不依赖 Cron 的执行时间。

## 页面路由

| 路径 | 说明 |
|---|---|
| `/`、`/page/<n>/` | 首页和分页 |
| `/posts/<slug>/` | 文章 |
| `/series/`、`/series/<id>/` | 系列 |
| `/categories/`、`/categories/<名称>/` | 分类 |
| `/tags/`、`/tags/<名称>/` | 标签 |
| `/search/?q=…` | 搜索（Pagefind） |
| `/about/` | 关于 |
| `/paste/`、`/paste/<id>`、`/paste/pair/` | Paste 首页、查看、配对 |
| `/p/<abbrlink>` | 旧链接，308 跳转到文章 |
