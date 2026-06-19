# MarkVault 开发指南

本文档记录项目级设计决策和开发规范。内容目录和 frontmatter 细节参见 [content-guide.md](content-guide.md)，后端/前端结构参见 [architecture.md](architecture.md)，接口结构参见 [api.md](api.md)。

## 核心设计理念

### Markdown 为唯一真相源

博客的唯一真实数据源必须是 Markdown 文件。数据库、JSON 索引、内存缓存、搜索索引、Paste 运行时数据和未来可能的同步目标都不能替代文章内容本身。

主要原则：

- 用户主要维护 Markdown 文档和本地图片。
- 博客从 Markdown frontmatter 中识别文章信息。
- 文章索引、搜索、分类、标签和系列都必须能从内容目录重建。
- Notion 可作为展示或备份副本，但不是主数据源。

### 内容与代码分离

代码仓库和内容仓库有意分离。内容树可以放在单独的 Git 仓库，通过 `BLOG_CONTENT_ROOT` 或本地 `content/` 软链接挂载到代码仓库。

`server_flask/data/` 是运行时目录，用于 TOTP 和 Pastebin 数据，不属于文章主数据源，也不应提交。

## 架构决策记录

### URL 与 slug

新博客使用稳定的 `slug` 作为文章 URL 标识：

```text
/posts/logistic-regression
```

规则：

- `slug` 从 Markdown frontmatter 读取。
- 正式文章应手动定义 `slug`。
- 不从可变标题自动生成长期链接。
- 旧 `/p/:abbrlink` 只作为兼容路由保留。

### 系列文章 metadata

系列文章使用结构化 metadata：

```yaml
series:
  id: machine-learning-basic
  title: 机器学习基础
  order: 3
```

规则：

- 有 `series.id` 的文章属于系列。
- 同一个 `series.id` 的文章聚合成一个系列。
- 系列内优先按 `series.order` 排序，缺省时排在有序文章之后。
- `content/series/<series-id>/README.md` 可提供系列简介；其 frontmatter `title` 优先于文章里的 `series.title`。

### 图片路径策略

图片和文章一起保存在文章目录：

```text
content/posts/logistic-regression/images/sigmoid.png
```

Markdown 中使用相对路径：

```md
![sigmoid](images/sigmoid.png)
```

后端负责把本地图片路径转换为浏览器可访问的 media API URL。

### 草稿与发布策略

当前不支持草稿、隐藏和置顶：

- `draft`
- `hidden`
- `pinned`

文章只要进入可扫描的 `content/posts/*/index.md` 或 `content/series/*/*/index.md` 路径，并且 frontmatter 合法，就会被视为已发布。

### 旧文章兼容策略

旧文章只作为文件备份保留，不进入新索引。恢复旧文章时，应手动迁移到新内容结构，并通过以下方式保留旧链接映射：

- 新文章 frontmatter 中的 `legacy.abbrlinks`
- `content/legacy/abbrlink-map.json`

不要再使用 Python `hash(title)` 生成长期链接。

### Web 管理功能定位

网页管理功能不做完整 CMS。当前 `/manage` 页面提供文章列表、模板下载、上传发布和文章删除，仍然以 Markdown 文件为主数据源；用户可以通过模板生成结构化文章目录，再在本地编辑 Markdown。设计存档见 [specs/2026-06-17-article-management-design.md](specs/2026-06-17-article-management-design.md)。

## 编码规范

### 前端

- Vue 模板、脚本和 CSS 使用 2 空格缩进。
- 组件使用 PascalCase，例如 `PageHeader.vue`。
- 页面视图按页面角色命名，例如 `Home.vue`、`Post.vue`、`PasteHome.vue`。
- API 调用集中放在 `blog_by_vue/src/api/`，避免组件中散落 URL。
- 复用全局 CSS 变量和现有玻璃面板风格，优先保证阅读体验。

### 后端

- Python 使用 4 空格缩进。
- 函数和变量使用描述性 snake_case。
- 文件读写明确使用 UTF-8。
- 路由层只做 HTTP 参数处理和响应组织，核心逻辑放到服务层。
- 上传、删除、认证等管理操作必须校验权限和输入。

### Commit Message

使用简短祈使句：

```text
Add blog post editor validation
Fix Markdown render route
Document Pastebin auth flow
```

## 安全策略

Markdown 渲染后的 HTML 必须经过白名单清洗，前端 `v-html` 只渲染后端清洗过的内容。

允许范围：

- 常用 Markdown 标签：标题、段落、列表、引用、链接、图片、代码块、表格、脚注相关标签。
- 必要属性：标题 `id`、链接 `href/title`、图片 `src/alt/title`、代码 `class`、表格对齐属性。

禁止范围：

- `script`、`style`、`iframe` 等可执行或嵌入型危险块。
- `javascript:`、事件属性和其他危险协议。

TOTP 密钥、Pastebin 数据、JWT 签名材料和其他运行时数据必须留在 `server_flask/data/` 或环境变量中，不应提交。

## 参考文档

- [requirements.md](requirements.md)：待实现功能需求
- [changelog.md](changelog.md)：已完成功能归档
- [architecture.md](architecture.md)：架构和数据流
- [content-guide.md](content-guide.md)：frontmatter 规范和目录结构
- [api.md](api.md)：公开 API 参考

### Notion Sync
要运行 Notion 同步，需在 `server_flask/.env` 配置:
- `NOTION_API_TOKEN`: Notion 机器人的集成 Token
- `NOTION_DATABASE_ID`: 目标 Database ID
