# MarkVault 架构

本文档说明 MarkVault 的系统结构、后端服务层、前端路由、核心数据流和运行时存储。内容写作规范参见 [content-guide.md](content-guide.md)，接口细节参见 [api.md](api.md)。

## 架构原则

MarkVault 以 Markdown 文件作为文章内容的唯一真实数据源。文章索引、缓存、搜索结果、分类标签和未来可能的同步目标都必须能从 `content/` 重新构建。

代码仓库和内容仓库可以分离：内容目录可以是仓库内的 `content/`，也可以是外部仓库，通过 `BLOG_CONTENT_ROOT` 指向。

## 后端结构

Flask 后端位于 `server_flask/`，主要分为路由层、服务层和模型层。

路由层：

- `app/api/routes.py`：文章、系列、分类、标签、搜索、媒体和旧接口兼容。
- `app/api/auth_routes.py`：TOTP 验证、JWT 状态检查和绑定信息查询。
- `app/api/paste_routes.py`：Pastebin 创建、查看、列表和删除。
- `app/api/__init__.py`：统一创建并注册 API Blueprint。

服务层：

- `app/services/content_index.py`：扫描 `content/posts/*/index.md` 和 `content/series/*/*/index.md`，构建内存索引。
- `app/services/markdown_renderer.py`：渲染 Markdown、生成 TOC、清洗 HTML。
- `app/services/media.py`：处理文章本地图片路径与图片访问。
- `app/services/auth.py`：管理 TOTP 密钥、验证码校验、JWT 签发和验证。
- `app/services/paste.py`：管理 Paste JSON 文件和过期清理。
- `app/services/post_template.py`：生成文章模板 frontmatter。
- `app/services/post_manager.py`：生成模板 ZIP、校验上传 ZIP、发布文章目录和删除文章。

模型层：

- `app/models/post.py`：文章数据模型和元数据序列化。

文章管理功能已实现，后端通过 `manage_routes.py` 暴露管理接口，前端通过 `/manage` 页面提供文章列表、模板下载、上传发布和删除。原始设计见 [specs/2026-06-17-article-management-design.md](specs/2026-06-17-article-management-design.md)。

## 内容数据流

```text
content/posts/*/index.md
content/series/*/*/index.md
content/series/<series-id>/README.md
  -> ContentIndex
  -> Flask API
  -> Vue 页面
```

文章详情 API 返回 metadata、渲染后的 HTML、目录 TOC 和系列相邻文章。前端在页面中处理 KaTeX、代码高亮、代码复制和标题跳转。

系列简介来自 `content/series/<series-id>/README.md`，后端会渲染为 `description_html`，并在系列列表和系列详情接口中返回。

## 认证数据流

```text
python3 manage.py setup_totp
  -> server_flask/data/auth/
  -> POST /api/auth/verify
  -> JWT
  -> Authorization: Bearer <token>
  -> 受保护 API
```

管理员先通过 CLI 生成 TOTP 密钥，再用认证器应用获得 6 位动态码。前端通过 `/api/auth/verify` 换取短期 JWT，并在需要认证的请求中带上 `Authorization` 请求头。

## Pastebin 数据流

```text
/paste
  -> /api/paste
  -> server_flask/data/pastes/*.json
  -> /paste/:id
```

创建、列表和删除 Paste 需要登录；公开查看单个 Paste 不需要登录。过期 Paste 会在读取或列表时清理。

## 文章管理数据流

```text
/manage
  -> /api/manage/posts
  -> /api/posts/template
  -> /api/posts/upload
  -> DELETE /api/posts/:slug
  -> content/posts/ 或 content/series/
```

管理页面复用 TOTP/JWT 鉴权。模板下载不会在服务器创建文章；上传 ZIP 会解析 frontmatter，并根据是否存在 `series.id` 写入独立文章目录或系列文章目录。

## 前端结构

Vue 前端位于 `blog_by_vue/`：

- `src/views/`：页面级组件。
- `src/components/`：共享组件和文章详情子组件。
- `src/api/`：后端接口封装。
- `src/composables/`：认证、Markdown 增强和标题导航等复用逻辑。
- `src/router/index.js`：Hash 路由配置。
- `src/style.css`：全局样式和主题变量。

当前路由：

- `/`：文章列表
- `/posts/:slug`：文章详情
- `/p/:abbrlink`：旧链接跳转
- `/series`、`/series/:seriesId`：系列列表和详情
- `/categories`、`/categories/:category`：分类列表和详情
- `/tags`、`/tags/:tag`：标签列表和详情
- `/search`：搜索结果
- `/paste`、`/paste/:id`：Paste 创建/管理和公开查看
- `/manage`：文章管理页面

## 存储结构

- `content/`：文章 Markdown、系列 README、图片和旧链接映射。
- `server_flask/data/auth/`：TOTP 运行时密钥。
- `server_flask/data/pastes/`：Pastebin JSON 数据。
- `blog_by_vue/dist/`：前端构建产物。

`server_flask/data/`、虚拟环境、`node_modules/` 和构建产物不应提交。

## 扩展点

后续可以添加派生存储或同步目标，但不能改变 Markdown 作为第一主数据源的原则：

- 生成式 `index.json`
- SQLite 缓存
- 搜索索引
- Markdown 到 Notion 的单向同步

## Notion Sync 架构
同步机制 (`notion_sync.py`) 使用 `mistletoe` AST 解析器提取 Markdown 抽象语法树，遍历生成原生 Notion Blocks。为了保证高效的远程 API 同步，避免因 `git` 操作刷新 `mtime` 而引发的误判，脚本采用 **MD5 内容指纹 (Hash)** 缓存策略。这与本地服务器热重载使用的基于文件系统的 `stat` 策略（注重内存响应效率）形成对比。
