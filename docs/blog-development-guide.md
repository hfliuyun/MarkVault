# MarkVault 开发指南

本文档面向开发者和维护者，说明项目的核心设计理念、架构决策和开发规范。

## 核心设计理念

### Markdown 为唯一真相源

博客的唯一真实数据源必须是 Markdown 文件。

数据库、JSON 索引、内存缓存、搜索索引、Notion 页面都只能作为 Markdown 的派生结果或同步副本。它们可以被删除并从 Markdown 重新生成，不能成为必须备份的主数据。

**主要原则：**

- 用户主要只负责创建和维护 Markdown 文档
- 博客自动从 Markdown metadata 中识别文章信息
- 博客自动识别系列文章，并在文章详情页和系列页展示
- 图片需要本地保存，并和 Markdown 一起备份
- 旧文章只作为文件备份保留，不进入新博客索引
- Notion 可作为第二同步源或展示备份，但不是主数据源

### 内容与代码分离

代码仓库和内容仓库有意分离：Markdown 文件是文章的唯一主数据源，生成索引、缓存、搜索数据以及未来可能的同步目标都应该可以从内容目录重新构建。

在开发中，内容树可以存放在单独的 Git 仓库中，并通过 `BLOG_CONTENT_ROOT` 环境变量或本地 `content/` 软链接挂载到代码仓库。

## 架构决策记录（ADR）

### URL 与 slug

**决策：** 新博客使用稳定的 `slug` 作为文章 URL 标识。

推荐 URL：

```text
/posts/logistic-regression
```

对应 Markdown metadata：

```yaml
---
title: 逻辑回归
slug: logistic-regression
---
```

**规则：**

- `slug` 优先从 Markdown metadata 读取
- 正式文章应手动定义 `slug`
- 不建议从标题自动生成正式链接，因为标题可能修改
- 旧的 `/p/:abbrlink` 链接可以保留兼容，但不是新博客主路由

### 系列文章 metadata

**决策：** 系列文章使用结构化 metadata 进行组织。

系列文章 metadata 写法：

```yaml
series:
  id: machine-learning-basic
  title: 机器学习基础
  order: 3
```

**规则：**

- 有 `series.id` 的文章属于系列
- 没有 `series` 的文章是独立文章
- 同一个 `series.id` 的文章聚合成一个系列
- 系列内优先按 `series.order` 排序
- 如果缺少 `series.order`，退化为按 `date` 排序

### 系列展示位置

**决策：** 文章详情页侧边栏展示系列导航。

侧边栏可包含：

- 当前文章所属系列的文章列表
- 当前文章的正文目录 TOC

独立文章不展示系列文章列表。

### 首页与系列页

**决策：** 首页按时间展示所有文章，系列通过专门页面展示。

系列展示位置：

- 文章详情页（侧边栏）
- 系列列表页 (`/series`)
- 单个系列详情页 (`/series/:series_id`)

首页不把系列文章折叠成目录，保持简单的时间线列表。

### 本地图片

**决策：** 图片需要和 Markdown 一起本地保存，便于整体备份。

推荐使用文章文件夹结构，让图片和文章绑定：

```text
content/posts/logistic-regression/images/sigmoid.png
```

Markdown 中本地图片推荐写法：

```md
![sigmoid](images/sigmoid.png)
```

### 草稿、隐藏、置顶

**决策：** 暂时不支持草稿、隐藏、置顶功能。

博客主要是自用，这些功能不进入第一阶段范围：

- 草稿 `draft`
- 隐藏文章 `hidden`
- 置顶文章 `pinned`

### 旧文章处理

**决策：** 旧文章只作为文件备份保留，不进入新博客索引。

```text
旧文章只作为文件备份保留，不在首页、系列页、归档页展示。
```

后续如果需要恢复某篇旧文章，可以手动迁移到新内容结构。

### 网页编辑功能

**决策：** 网页编辑器可以弱化，不需要做成完整 CMS。

可选方向：

- 点击"写文章"后生成一份带 metadata 的 Markdown 模板
- 用户在本地继续编辑 Markdown
- 可以提供脚本或页面辅助生成文章目录与初始 `index.md`

不要求第一阶段实现完整在线 Markdown 编辑和保存。

## 推荐实践

### 内容目录结构

推荐的统一内容目录结构：

```text
content/
  posts/
    logistic-regression/
      index.md
      images/
        sigmoid.png
        loss-function.png

    recommender-system/
      index.md
      images/
        intro.png

  series/
    machine-learning-basic/
      logistic-regression/
        index.md
        images/
          
  legacy/
    old-posts/
      逻辑回归.md
      推荐系统.md
    abbrlink-map.json
```

**规则：**

- 后端扫描 `content/posts/*/index.md` 和 `content/series/*/*/index.md`
- 后端不扫描 `content/legacy/`
- 新独立文章使用 `content/posts/<slug>/index.md`
- 系列文章可以使用 `content/series/<series-id>/<slug>/index.md` 组织
- 图片放在对应文章目录下的 `images/` 中
- 备份博客内容时只需要备份 `content/`

### Frontmatter Schema

**完整示例（系列文章）：**

```yaml
---
title: 逻辑回归
slug: logistic-regression
date: 2022-01-29 14:40:13
summary: 逻辑回归的基本原理、损失函数和梯度推导。
categories:
  - 机器学习
tags:
  - 算法
  - 逻辑回归
  - 监督学习
series:
  id: machine-learning-basic
  title: 机器学习基础
  order: 3
notion:
  page_id:
  synced_at:
legacy:
  abbrlinks:
    - f9b01ad8
---
```

**独立文章示例：**

```yaml
---
title: Git 基本操作
slug: git-basic
date: 2022-01-20 10:00:00
summary: 常用 Git 命令和基本工作流记录。
categories:
  - 工具
tags:
  - Git
---
```

**字段说明：**

- `title`：文章标题（必需）
- `slug`：稳定 URL 标识（必需）
- `date`：发布时间，格式 `YYYY-MM-DD HH:mm:ss` 或 `YYYY-MM-DD`（必需）
- `summary`：文章摘要，可手写，后续也可以缺省时从正文自动截取（推荐）
- `categories`：分类列表（可选）
- `tags`：标签列表（可选）
- `series`：系列信息（可选，存在时表示文章属于系列）
- `notion`：Notion 同步信息（可选）
- `legacy`：旧链接兼容映射（可选）

### 后端分层架构

后端 Flask API 分为以下层次：

**路由层** (`app/api/routes.py`)：
- 暴露 HTTP 端点
- 参数验证
- 调用服务层
- 保留旧兼容 API

**服务层**：
- `app/services/content_index.py`：扫描 Markdown，构建内存索引
- `app/services/markdown_renderer.py`：Markdown 转 HTML，TOC 生成
- `app/services/media.py`：本地图片路径重写和服务
- `app/services/post_template.py`：文章模板生成

**模型层**：
- `app/models/post.py`：Post 数据类定义

**职责划分：**

`content_index.py` 负责：
- 扫描 `content/posts/<slug>/index.md` 和 `content/series/*/*/index.md`
- 解析 frontmatter
- 校验 `title`、`slug`、`date` 等字段
- 检查重复 `slug`
- 构建 `posts_by_slug` 索引
- 构建文章列表索引
- 构建系列索引
- 构建分类和标签索引

`markdown_renderer.py` 负责：
- Markdown 转 HTML
- 代码块、表格、脚注、数学公式等扩展支持
- HTML 安全清洗

`media.py` 负责：
- 将文章内本地图片路径转换为浏览器可访问 URL
- 处理 `images/` 目录下的静态资源访问

### 前端组件组织

**API 调用层** (`src/api/`)：
- `posts.js`：文章相关 API
- `series.js`：系列相关 API
- 集中管理 API 端点，避免在组件中散落 axios URL

**路由结构**：

```text
/                          # 首页文章列表
/posts/:slug               # 文章详情页
/series                    # 系列列表页
/series/:series_id         # 系列详情页
/categories                # 分类列表页
/categories/:category      # 分类详情页
/tags                      # 标签列表页
/tags/:tag                 # 标签详情页
/search                    # 搜索结果页
/p/:abbrlink               # 旧链接兼容跳转
```

**关键组件**：

- `Home.vue`：首页文章列表
- `Post.vue`：文章详情页
- `SeriesList.vue`：系列列表页
- `SeriesDetail.vue`：系列详情页
- `PostSidebarContent.vue`：文章侧边栏（系列导航、TOC）

### 推荐 API 设计

**新 API 端点：**

```text
GET /api/posts                      # 文章列表（支持分页）
GET /api/posts/:slug                # 文章详情
GET /api/series                     # 系列列表
GET /api/series/:series_id          # 系列详情
GET /api/categories                 # 分类列表
GET /api/tags                       # 标签列表
GET /api/search?q=keyword           # 搜索
GET /api/media/posts/:slug/images/:filename  # 文章图片
```

**文章详情接口返回结构：**

```json
{
  "post": {
    "title": "逻辑回归",
    "slug": "logistic-regression",
    "date": "2022-01-29 14:40:13",
    "summary": "...",
    "categories": ["机器学习"],
    "tags": ["算法", "逻辑回归"],
    "content": "<h1>...</h1>",
    "toc": []
  },
  "series": {
    "id": "machine-learning-basic",
    "title": "机器学习基础",
    "posts": []
  }
}
```

独立文章的 `series` 可以是 `null`。

### 兼容旧链接

旧的 `/p/:abbrlink` 可以保留兼容，推荐策略：

- 如果能从旧 metadata 找到对应新 `slug`，则跳转到 `/posts/:slug`
- 如果旧文章没有迁移，则返回 404 或旧文章归档提示

映射方式：

1. 在新文章 frontmatter 中添加 `legacy.abbrlinks`
2. 或使用 `content/legacy/abbrlink-map.json` 批量映射

## 非功能性要求

### 安全性

**Markdown HTML 清洗策略：**

- **允许常用 Markdown HTML 标签**：标题、段落、列表、引用、链接、图片、代码块、表格、脚注相关标签
- **允许必要属性**：标题 `id`、链接 `href/title`、图片 `src/alt/title`、代码 `class`、表格对齐相关属性
- **禁止脚本和嵌入执行面**：`script`、`style`、`iframe` 等危险块会被移除
- **禁止危险协议和事件属性**：`javascript:`、`onclick`、`onerror` 等不会出现在渲染结果中

**XSS 防护：**

- 后端 Markdown 渲染后进行 HTML 白名单清洗
- 前端使用 `v-html` 时只渲染经过清洗的 HTML
- 本地图片路径统一转换，避免路径注入

### 性能

**内容热加载机制：**

- 修改、新增或删除 Markdown 文件后，下一次 API 请求自动刷新内存索引
- 不需要重启 Flask 服务
- 通过文件 mtime 检测变更

**缓存策略：**

- 第一阶段使用内存索引
- 后续可以引入生成式 `index.json`、SQLite 或搜索索引
- 所有缓存必须能从 Markdown 重建

### 视觉风格

**推荐视觉方向：**

```text
技术笔记 / 个人知识库 / 文档站风格
```

**设计原则：**

- 页面安静、清晰，优先阅读体验
- 避免大面积渐变和厚重卡片
- 避免复杂装饰
- 内容区宽度控制在适合阅读的范围
- 使用一个主要强调色
- 代码块、表格、引用、公式要有统一样式
- 首页和文章页使用同一套间距、字体和颜色变量

**全局设计变量：**

- 颜色
- 字体
- 间距
- 边框
- 代码块样式
- 正文排版样式

## 写作工具

### 文章模板生成器

提供轻量命令生成新文章目录和初始 Markdown 文件：

```sh
python3 manage.py new_post "标题" --slug example-slug
```

带元数据的示例：

```sh
python3 manage.py new_post "逻辑回归" \
  --slug logistic-regression \
  --summary "逻辑回归学习笔记。" \
  --category "机器学习" \
  --tag "算法" \
  --tag "监督学习"
```

生成系列文章：

```sh
python3 manage.py new_post "博客内容索引" \
  --slug blog-content-index \
  --series-id blog-system \
  --series-title "博客系统重构" \
  --series-order 2
```

生成器会：
- 创建 `content/posts/<slug>/index.md` 和 `images/` 目录
- 生成合法 frontmatter
- 支持 `BLOG_CONTENT_ROOT` 环境变量
- 拒绝覆盖已有 slug

## Notion 同步

### 定位

```text
Notion 是展示/备份副本，不是第一主数据源。
```

### 第一阶段：Markdown -> Notion

推荐第一阶段只做单向同步：

```text
Markdown -> Notion
```

流程：

1. 扫描 `content/posts/`
2. 找到没有 `notion.page_id` 的文章
3. 在 Notion 创建页面
4. 将文章内容同步到 Notion
5. 把 `notion.page_id` 和 `notion.synced_at` 写回 Markdown metadata
6. 后续根据 `page_id` 更新 Notion 页面

### 后续阶段：Notion -> Markdown 手动回写

Notion 逆向写回 Markdown 可以作为后续能力，但必须显式触发。

建议规则：

- 默认不从 Notion 自动覆盖 Markdown
- 只有用户在 Notion 中点击明确动作（例如"更新网站"）才允许回写
- 回写前应检查 Markdown 和 Notion 的更新时间
- 如果 Markdown 本地版本更新，应拒绝覆盖或要求人工确认
- 最好先生成 diff 或预览，再写回文件

不建议第一阶段实现完整双向同步。

## 实现注意事项

- `slug` 必须唯一且稳定
- 不要再使用 Python `hash(title)` 作为长期链接
- Markdown 渲染后的 HTML 需要考虑安全清洗
- `v-html` 渲染内容时要避免脚本注入风险
- 本地图片路径需要统一转换为浏览器可访问 URL
- 文章索引和数据库缓存必须能从 `content/` 重建
- 旧文章目录不能被新索引扫描到

## 参考文档

- [需求清单](blog-requirements.md)：待实现功能需求
- [实现日志](blog-implementation-log.md)：已完成功能归档
- [架构文档](blog-architecture.md)：简要架构和数据流
- [内容写作指南](blog-content-guide.md)：frontmatter 规范和目录结构
- [API 文档](blog-api.md)：公开 API 结构
