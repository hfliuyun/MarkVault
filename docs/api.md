# MarkVault API

所有接口都挂载在 `/api` 下。公开博客接口读取 `BLOG_CONTENT_ROOT` 指向的内容目录；如果未设置该环境变量，则读取仓库级 `content/`。

## 认证

管理类接口使用 TOTP 动态码换取短期 JWT。运行时认证数据保存在 `server_flask/data/`，不应提交。

首次绑定：

```sh
python3 manage.py setup_totp --account admin
```

如需重置密钥：

```sh
python3 manage.py reset_totp --account admin
```

需要认证的请求必须携带：

```text
Authorization: Bearer <jwt-token>
```

### `POST /api/auth/verify`

验证 6 位 TOTP 动态码并返回 JWT。

请求体：

```json
{
  "code": "123456"
}
```

成功响应：

```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "expires_in": 7200
}
```

错误：

- `400`：尚未配置 TOTP
- `401`：验证码无效

### `GET /api/auth/status`

检查当前 Bearer token 是否有效。

成功响应：

```json
{
  "authenticated": true
}
```

未登录或 token 无效：

```json
{
  "authenticated": false
}
```

### `GET /api/auth/provisioning-uri`

返回已配置的 `otpauth://` URI，方便首次绑定时手动导入认证器。该接口只在服务端已生成密钥后可用。

## Pastebin

Paste 数据以 JSON 文件形式保存在 `server_flask/data/pastes/`。

### `POST /api/paste`

创建 Paste。需要认证。

请求体：

```json
{
  "content": "print('hello world')",
  "title": "Example",
  "language": "python",
  "expires_in": "1d"
}
```

`expires_in` 支持 `1h`、`1d`、`1w` 和 `never`，默认值为 `1d`。

成功响应：

```json
{
  "id": "a1b2c3d4",
  "title": "Example",
  "content": "print('hello world')",
  "language": "python",
  "created_at": "2026-06-16T23:00:00+08:00",
  "expires_at": "2026-06-17T23:00:00+08:00",
  "url": "/paste/a1b2c3d4"
}
```

### `GET /api/paste/:id`

公开读取单个 Paste。不存在或已过期时返回 `404`。

### `GET /api/pastes`

列出未过期 Paste。需要认证。列表项不包含正文 `content`。

### `DELETE /api/paste/:id`

删除 Paste。需要认证。

## 文章

### `GET /api/posts`

返回按发布时间倒序排列的分页文章列表。

查询参数：

- `page`：页码，默认 `1`
- `size`：每页数量，默认 `10`

响应示例：

```json
{
  "total": 1,
  "page": 1,
  "size": 1,
  "articles": [
    {
      "title": "逻辑回归",
      "slug": "logistic-regression",
      "date": "2022-01-29 14:40:13",
      "summary": "逻辑回归的基本原理、损失函数和梯度推导。",
      "categories": ["机器学习"],
      "tags": ["算法", "逻辑回归", "监督学习"],
      "series": {
        "id": "machine-learning-basic",
        "title": "机器学习基础",
        "order": 1
      }
    }
  ]
}
```

### `GET /api/posts/:slug`

返回渲染后的文章详情。

响应示例：

```json
{
  "title": "逻辑回归",
  "slug": "logistic-regression",
  "date": "2022-01-29 14:40:13",
  "summary": "逻辑回归的基本原理、损失函数和梯度推导。",
  "categories": ["机器学习"],
  "tags": ["算法", "逻辑回归", "监督学习"],
  "series": {
    "id": "machine-learning-basic",
    "title": "机器学习基础",
    "order": 1
  },
  "content": "<h2 id=\"...\">...</h2>",
  "toc": [
    {
      "level": 2,
      "title": "逻辑回归是什么",
      "id": "逻辑回归是什么"
    }
  ],
  "series_posts": []
}
```

错误：

- `404`：文章不存在
- `500`：内容索引错误，例如重复 slug 或 metadata 不合法

## 系列

### `GET /api/series`

返回所有系列，按最近更新时间倒序排列。

响应示例：

```json
{
  "series": [
    {
      "id": "machine-learning-basic",
      "title": "机器学习基础",
      "count": 1,
      "updated_at": "2022-01-29 14:40:13",
      "description_html": "<p>...</p>"
    }
  ]
}
```

### `GET /api/series/:series_id`

返回单个系列及其文章。系列内文章优先按 `series.order` 排序，没有 order 的文章排在后面。

响应示例：

```json
{
  "id": "machine-learning-basic",
  "title": "机器学习基础",
  "count": 1,
  "updated_at": "2022-01-29 14:40:13",
  "description_html": "<p>...</p>",
  "posts": [
    {
      "title": "逻辑回归",
      "slug": "logistic-regression",
      "date": "2022-01-29 14:40:13",
      "summary": "逻辑回归的基本原理、损失函数和梯度推导。",
      "categories": ["机器学习"],
      "tags": ["算法", "逻辑回归", "监督学习"]
    }
  ]
}
```

错误：

- `404`：系列不存在
- `500`：内容索引错误

系列简介规则：

- `content/series/<series-id>/README.md` 可以包含可选 frontmatter 和 Markdown 正文。
- README frontmatter 中的 `title` 会覆盖 API 响应中的系列标题。
- README 不存在时，`description_html` 为空字符串。
- README 正文会渲染为经过清洗的 HTML 并完整返回。

## 分类和标签

### `GET /api/categories`

返回所有分类及文章数量。

### `GET /api/categories/:category`

返回指定分类下的文章列表。

### `GET /api/tags`

返回所有标签及文章数量。

### `GET /api/tags/:tag`

返回指定标签下的文章列表。

## 搜索

### `GET /api/search`

按关键词搜索标题、摘要、Markdown 正文、分类和标签。

查询参数：

- `q`：搜索关键词

空关键词返回空结果，不视为错误。

响应示例：

```json
{
  "query": "逻辑回归",
  "total": 1,
  "articles": [
    {
      "title": "逻辑回归",
      "slug": "logistic-regression",
      "date": "2022-01-29 14:40:13",
      "summary": "逻辑回归的基本原理、损失函数和梯度推导。",
      "categories": ["机器学习"],
      "tags": ["算法", "逻辑回归", "监督学习"]
    }
  ]
}
```

错误：

- `500`：内容索引错误

## 媒体

文章本地图片通过以下接口提供：

```text
GET /api/media/posts/:slug/images/:filename
```

Markdown 中推荐写法：

```md
![alt](images/file.png)
```

后端在渲染文章详情 HTML 时会把上述路径改写为媒体接口地址。

## 旧接口兼容

旧接口保留用于迁移和兼容，不建议新前端继续依赖。

`GET /api/p/:abbrlink` 会通过显式映射解析旧链接：

- 文章 frontmatter 中的 `legacy.abbrlinks`
- `content/legacy/abbrlink-map.json`

找到映射时返回永久跳转：

```text
308 Location: /api/posts/:slug
```

没有映射时返回未迁移错误。

其他旧接口：

- `GET /api/posts_list_metadata`
- `GET /api/md/:abbrlink`
- `POST /api/upload_image`
- `POST /api/save_post`

## 文章管理

文章管理接口需要认证，前端入口为 `/manage`。

### `GET /api/manage/posts`

返回全部文章的管理列表，不分页，并额外包含文章所在位置。

响应示例：

```json
{
  "total": 1,
  "articles": [
    {
      "title": "逻辑回归",
      "slug": "logistic-regression",
      "date": "2022-01-29 14:40:13",
      "summary": "逻辑回归的基本原理。",
      "categories": ["机器学习"],
      "tags": ["算法"],
      "series": {
        "id": "machine-learning-basic",
        "title": "机器学习基础",
        "order": 1
      },
      "location": "series"
    }
  ]
}
```

`location` 为 `posts` 或 `series`。

### `POST /api/posts/template`

根据请求体生成文章模板 ZIP 并下载。该接口不会在服务器创建文章文件。

请求体示例：

```json
{
  "title": "逻辑回归",
  "slug": "logistic-regression",
  "summary": "逻辑回归学习笔记。",
  "categories": ["机器学习"],
  "tags": ["算法", "监督学习"],
  "series_id": "machine-learning-basic",
  "series_title": "机器学习基础",
  "series_order": 1
}
```

成功时返回 `application/zip`，文件名为 `<slug>.zip`。ZIP 内包含 `<slug>/index.md` 和空的 `<slug>/images/` 目录。

错误：

- `400`：标题为空、slug 不合法或系列排序参数不合法
- `409`：slug 已存在

### `POST /api/posts/upload`

上传文章 ZIP，校验后发布到内容目录。

表单字段：

- `file`：ZIP 文件
- `overwrite`：是否覆盖已有文章，字符串 `true` 或 `false`

成功响应：

```json
{
  "message": "Post published successfully",
  "slug": "logistic-regression",
  "location": "series",
  "path": "content/series/machine-learning-basic/logistic-regression/"
}
```

上传规则：

- ZIP 必须包含 `index.md`。
- 支持 `<slug>/index.md` 和顶层 `index.md` 两种结构。
- 允许 Markdown 和常见图片格式。
- ZIP 最大 50MB。
- frontmatter 必须包含合法的 `title`、`slug` 和 `date`。
- 有 `series.id` 时写入 `content/series/<series-id>/<slug>/`，否则写入 `content/posts/<slug>/`。

错误：

- `400`：缺少文件、不是 ZIP、结构不合法或 metadata 不合法
- `409`：slug 已存在且未允许覆盖

### `DELETE /api/posts/:slug`

删除指定文章目录。需要认证。

成功响应：

```json
{
  "message": "Post deleted",
  "slug": "logistic-regression"
}
```

错误：

- `404`：文章不存在

详细设计见 [specs/2026-06-17-article-management-design.md](specs/2026-06-17-article-management-design.md)。
