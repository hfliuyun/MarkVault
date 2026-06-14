# Markdown Blog Requirements

本文档记录博客后续重构需求，用于后续分析、实现或交给其他 AI / 开发者继续推进。

## 0. 当前实现状态与后续单点需求

本章节基于当前代码实现维护进度。后续每次只选择一个待实现需求推进，完成后更新本章节状态，再提交代码。

### 0.1 已完成基础能力

- 已将博客主数据源切换为 Markdown 内容目录：默认读取仓库级 `content/`，也支持通过 `BLOG_CONTENT_ROOT` 指向外部内容仓库。
- 已实现后端内容索引层：扫描 `content/posts/*/index.md` 和 `content/series/*/*/index.md`，解析 frontmatter，校验 `title`、`slug`、`date`，检查重复 `slug`，构建文章、系列、分类和标签索引。
- 已实现新博客 API：`GET /api/posts`、`GET /api/posts/:slug`、`GET /api/series`、`GET /api/series/:series_id`、`GET /api/categories`、`GET /api/tags`、`GET /api/media/posts/:slug/images/:filename`。
- 已保留旧兼容 API：`GET /api/posts_list_metadata`、`GET /api/p/:abbrlink`、`GET /api/md/:abbrlink`、`POST /api/upload_image`、`POST /api/save_post`。
- 已实现内容热加载：修改、新增或删除 `content/posts/*/index.md` 或 `content/series/*/*/index.md` 后，下一次新博客 API 请求会自动刷新内存索引，不需要重启 Flask。
- 已支持系列文件夹内容结构：系列文章可放在 `content/series/<series-id>/<slug>/index.md`，图片仍通过 `/api/media/posts/:slug/images/:filename` 访问。
- 已实现前端新路由和 API 调用层：`/`、`/posts/:slug`、`/series`、`/series/:seriesId`，并抽离 `src/api/posts.js` 和 `src/api/series.js`。
- 已实现首页、文章详情页、系列列表页、系列详情页的基础阅读体验。
- 已实现文章详情页的 Markdown HTML 渲染、代码高亮、数学公式渲染、代码复制、系列侧边栏和正文目录 TOC。
- 已修复 hash 路由下 TOC 跳转问题：目录点击会保留当前文章路由并使用 `/#/posts/:slug#heading` 形式定位正文标题。
- 已初步统一首页、文章详情页、系列页的视觉风格，使用技术笔记 / 文档站风格的全局设计变量。
- 已添加标准 commit message 模板 `.gitmessage`，当前仓库本地已配置 `git config commit.template .gitmessage`。
- 已实现写文章模板生成器：`python3 manage.py new_post "标题" --slug example-slug` 会生成 `content/posts/<slug>/index.md` 和 `images/`，支持 `BLOG_CONTENT_ROOT`，并拒绝覆盖已有 slug。
- 已实现分类和标签页面：新增 `/categories`、`/categories/:category`、`/tags`、`/tags/:tag`，首页和文章详情页的分类、标签均可跳转到对应聚合页。
- 已实现搜索功能：新增 `GET /api/search?q=keyword`，前端提供顶部搜索弹窗和 `/search?q=keyword` 搜索结果页。

### 0.2 待实现需求清单

#### 0.2.1 写文章模板生成器

状态：已完成。

- 目标：提供轻量命令生成新文章目录和初始 Markdown 文件。
- 范围：新增命令，例如 `python manage.py new_post "标题" --slug example-slug`，生成 `content/posts/<slug>/index.md` 和 `images/`。
- 验收标准：
  - 生成的 `index.md` 包含合法 frontmatter：`title`、`slug`、`date`、`summary`、`categories`、`tags`，可选 `series`。
  - 如果目标 slug 已存在，命令应拒绝覆盖并给出明确错误。
  - 生成后访问 `/api/posts` 能看到新文章，不需要重启 Flask。

#### 0.2.2 分类和标签页面

状态：已完成。

- 目标：前端支持按分类和标签浏览文章。
- 范围：新增 `/categories`、`/categories/:category`、`/tags`、`/tags/:tag` 页面；复用现有 `/api/categories` 和 `/api/tags`。
- 验收标准：
  - 分类页展示所有分类及文章数量。
  - 标签页展示所有标签及文章数量。
  - 分类详情和标签详情能列出相关文章并跳转到 `/posts/:slug`。
  - 首页和文章详情页中的分类、标签可以跳转到对应页面。

#### 0.2.3 搜索功能

状态：已完成。

- 目标：支持按关键词搜索博客文章。
- 范围：新增 `GET /api/search?q=keyword`，前端导航搜索入口接入该接口。
- 验收标准：
  - 可搜索标题、摘要、正文、分类和标签。
  - 搜索结果展示标题、摘要、日期、分类、标签，并能跳转文章详情。
  - 空关键词返回空结果或明确提示，不返回 500。

#### 0.2.4 旧链接兼容跳转

- 目标：让旧 `/p/:abbrlink` 链接尽量跳转到新 `/posts/:slug`。
- 范围：建立旧 `abbrlink` 到新 `slug` 的映射策略，可从已迁移文章 metadata 或映射文件读取。
- 验收标准：
  - 已迁移旧文章访问 `/p/:abbrlink` 时跳转到 `/posts/:slug`。
  - 未迁移旧文章返回明确的 404 或归档提示。
  - 不再使用 Python `hash(title)` 作为长期链接依据。

#### 0.2.5 文章详情组件拆分

- 目标：降低 `Post.vue` 复杂度，便于后续维护。
- 范围：拆出文章布局、系列侧边栏、TOC、metadata、正文增强逻辑等组件或 composable。
- 验收标准：
  - 文章详情页现有行为保持不变。
  - TOC 跳转、代码复制、数学公式、代码高亮仍正常。
  - `Post.vue` 只保留页面级数据加载和组件组合逻辑。

#### 0.2.6 移动端文章侧边栏优化

- 目标：改善手机宽度下系列目录和正文目录的阅读体验。
- 范围：将移动端侧边栏改为折叠面板或抽屉，不挤占正文阅读区。
- 验收标准：
  - 手机宽度下文章正文优先展示。
  - 系列目录和 TOC 可展开查看。
  - 点击 TOC 后能定位标题并自动收起或不遮挡正文。

#### 0.2.7 Markdown HTML 安全清洗

- 目标：降低后端 Markdown 渲染和前端 `v-html` 带来的脚本注入风险。
- 范围：在后端渲染后增加 HTML 清洗，或约束 Markdown 渲染输出的安全标签和属性。
- 验收标准：
  - Markdown 中的 `<script>`、事件属性等危险内容不会在浏览器执行。
  - 常用 Markdown 内容、代码块、表格、公式、图片仍正常显示。
  - 安全策略写入文档，明确允许和禁止的 HTML 范围。

#### 0.2.8 本地图片写作和上传链路

- 目标：让图片写入文章自己的 `images/` 目录，而不是旧 `server_flask/static/image/`。
- 范围：改造或新增写作辅助上传接口，使图片保存到 `content/posts/<slug>/images/`。
- 验收标准：
  - Markdown 中插入 `![alt](images/file.png)`。
  - 前端文章详情通过 `/api/media/posts/:slug/images/:filename` 正常显示图片。
  - 图片和 Markdown 一起位于内容仓库，便于整体备份。

#### 0.2.9 Notion 单向同步

- 目标：实现 Markdown 到 Notion 的展示 / 备份同步。
- 范围：新增同步脚本或命令，扫描 `content/posts/`，创建或更新 Notion 页面，并写回 `notion.page_id`、`notion.synced_at`。
- 验收标准：
  - 没有 `notion.page_id` 的文章可以创建 Notion 页面。
  - 已有 `notion.page_id` 的文章可以更新对应 Notion 页面。
  - Markdown 仍然是第一主数据源，删除 Notion 或缓存不影响博客可用性。

#### 0.2.10 测试补强

- 目标：为核心内容系统补充自动化测试，降低后续改动风险。
- 范围：优先覆盖内容索引、重复 slug、frontmatter 校验、媒体路径、搜索、模板生成器。
- 验收标准：
  - 新增测试可通过单一命令运行。
  - 关键异常场景有明确断言。
  - 后续实现每个单点需求时同步补充对应测试。

### 0.3 推荐实现顺序

后续建议按以下顺序推进，每次只实现一个需求点：

1. 旧链接兼容跳转。
2. 文章详情组件拆分。
3. 移动端文章侧边栏优化。
4. Markdown HTML 安全清洗。
5. 本地图片写作和上传链路。
6. 测试补强。
7. Notion 单向同步。

## 1. 核心目标

博客的唯一真实数据源必须是 Markdown 文件。

数据库、JSON 索引、内存缓存、搜索索引、Notion 页面都只能作为 Markdown 的派生结果或同步副本。它们可以被删除并从 Markdown 重新生成，不能成为必须备份的主数据。

主要目标：

- 用户主要只负责创建和维护 Markdown 文档。
- 博客自动从 Markdown metadata 中识别文章信息。
- 博客自动识别系列文章，并在文章详情页和系列页展示。
- 图片需要本地保存，并和 Markdown 一起备份。
- 旧文章只作为文件备份保留，不进入新博客索引。
- Notion 可作为第二同步源或展示备份，但第一阶段不作为主数据源。

## 2. 已确认决策

### 2.1 URL 与 slug

新博客使用稳定的 `slug` 作为文章 URL 标识。

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

规则：

- `slug` 优先从 Markdown metadata 读取。
- 正式文章应手动定义 `slug`。
- 不建议从标题自动生成正式链接，因为标题可能修改。
- 旧的 `/p/:abbrlink` 链接可以后续保留兼容，但不是新博客主路由。

### 2.2 系列文章 metadata 写法

系列文章使用结构化 metadata：

```yaml
series:
  id: machine-learning-basic
  title: 机器学习基础
  order: 3
```

规则：

- 有 `series.id` 的文章属于系列。
- 没有 `series` 的文章是独立文章。
- 同一个 `series.id` 的文章聚合成一个系列。
- 系列内优先按 `series.order` 排序。
- 如果缺少 `series.order`，可以退化为按 `date` 排序。

### 2.3 系列展示位置

文章详情页左侧使用可折叠侧边栏。

侧边栏可包含：

- 当前文章所属系列的文章列表。
- 当前文章的正文目录 TOC。

独立文章不展示系列文章列表。

### 2.4 首页与系列页

首页仍然按时间展示文章列表。

系列只在以下位置展示：

- 文章详情页。
- 系列列表页。
- 单个系列详情页。

首页不需要把系列文章折叠成目录。

### 2.5 网页编辑功能

网页编辑器可以弱化，不需要做成完整 CMS。

可选方向：

- 点击“写文章”后生成一份带 metadata 的 Markdown 模板。
- 用户在本地继续编辑 Markdown。
- 可以提供脚本或页面辅助生成文章目录与初始 `index.md`。

不要求第一阶段实现完整在线 Markdown 编辑和保存。

### 2.6 本地图片

图片需要和 Markdown 一起本地保存，便于整体备份。

推荐使用文章文件夹结构，让图片和文章绑定。

### 2.7 草稿、隐藏、置顶

暂时不需要支持：

- 草稿 `draft`
- 隐藏文章 `hidden`
- 置顶文章 `pinned`

博客主要是自用，这些功能不进入第一阶段范围。

### 2.8 旧文章处理

旧文章选择方案 A：

```text
旧文章只作为文件备份保留，不进入新博客索引，不在首页、系列页、归档页展示。
```

后续如果需要恢复某篇旧文章，可以手动迁移到新内容结构。

## 3. 推荐内容目录结构

推荐新建统一内容目录：

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

  legacy/
    old-posts/
      逻辑回归.md
      推荐系统.md
```

规则：

- 后端只扫描 `content/posts/`。
- 后端不扫描 `content/legacy/`。
- 新文章使用 `content/posts/<slug>/index.md`。
- 图片放在对应文章目录下的 `images/` 中。
- 备份博客内容时只需要备份 `content/`。

Markdown 中本地图片推荐写法：

```md
![sigmoid](images/sigmoid.png)
```

## 4. 推荐 Markdown metadata schema

完整示例：

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
---
```

独立文章示例：

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

字段说明：

- `title`：文章标题。
- `slug`：稳定 URL 标识。
- `date`：发布时间。
- `summary`：文章摘要。可手写，后续也可以缺省时从正文自动截取。
- `categories`：分类列表。
- `tags`：标签列表。
- `series`：可选，存在时表示文章属于系列。
- `notion`：可选，记录 Notion 同步信息。

## 5. 后端需求

### 5.1 内容索引模块

后端需要增加文章索引层，职责包括：

- 扫描 `content/posts/`。
- 找到每篇文章的 `index.md`。
- 解析 frontmatter。
- 校验必需字段。
- 检查重复 `slug`。
- 构建文章列表索引。
- 构建系列索引。
- 构建分类和标签索引。
- 处理本地图片访问路径。
- 渲染 Markdown 为 HTML。

第一阶段可以使用内存索引。

后续可以引入：

- 生成式 `index.json`
- SQLite
- 搜索索引

但这些都必须能从 Markdown 重建。

### 5.2 API 设计建议

推荐新 API：

```text
GET /api/posts
GET /api/posts/:slug
GET /api/series
GET /api/series/:series_id
GET /api/categories
GET /api/tags
GET /api/search?q=keyword
```

文章详情接口建议返回：

- 文章基础 metadata。
- 渲染后的 HTML。
- 当前文章所属系列信息。
- 当前系列内文章列表。
- 当前文章目录 TOC。

编辑或模板功能需要原始 Markdown 时，可以单独提供管理接口，不应和公开文章详情接口混在一起。

### 5.3 兼容旧链接

旧的 `/p/:abbrlink` 可以后续保留，但不是第一阶段重点。

推荐策略：

- 如果能从旧 metadata 找到对应新 `slug`，则跳转到 `/posts/:slug`。
- 如果旧文章没有迁移，则可以返回 404 或旧文章归档提示。

## 6. 前端需求

### 6.1 首页

首页功能：

- 展示文章列表。
- 按发布时间倒序。
- 支持分页。
- 显示标题、日期、分类、标签、摘要。
- 点击进入 `/posts/:slug`。

首页不需要展示系列折叠目录。

### 6.2 文章详情页

文章详情页功能：

- 使用 `/posts/:slug` 路由。
- 展示文章标题、日期、分类、标签。
- 渲染 Markdown HTML。
- 支持代码高亮。
- 支持数学公式。
- 支持代码复制。
- 左侧显示可折叠侧边栏。
- 如果文章属于系列，侧边栏显示系列文章列表。
- 当前文章在系列列表中高亮。
- 侧边栏可显示正文目录 TOC。
- 独立文章不展示系列文章列表。

### 6.3 系列页

需要两个页面：

```text
/series
/series/:series_id
```

`/series`：

- 展示所有系列。
- 显示系列标题、文章数量、最新更新时间。

`/series/:series_id`：

- 展示该系列下所有文章。
- 按 `series.order` 排序。
- 支持点击进入文章详情页。

### 6.4 分类和标签

第一阶段可作为低优先级。

后续可以支持：

```text
/categories/:category
/tags/:tag
```

## 7. 写文章模板需求

可以提供一个轻量模板生成能力。

目标：

- 用户输入标题、分类、标签、系列信息。
- 系统生成文章目录。
- 系统生成带 metadata 的 `index.md`。
- 系统创建 `images/` 目录。

示例生成结果：

```text
content/posts/logistic-regression/
  index.md
  images/
```

示例命令：

```sh
python manage.py new_post "逻辑回归" --slug logistic-regression
```

或在网页中点击“写文章”生成模板。

## 8. Notion 同步需求

Notion 定位：

```text
Notion 是展示/备份副本，不是第一主数据源。
```

### 8.1 第一阶段：Markdown -> Notion

推荐第一阶段只做单向同步：

```text
Markdown -> Notion
```

流程：

1. 扫描 `content/posts/`。
2. 找到没有 `notion.page_id` 的文章。
3. 在 Notion 创建页面。
4. 将文章内容同步到 Notion。
5. 把 `notion.page_id` 和 `notion.synced_at` 写回 Markdown metadata。
6. 后续根据 `page_id` 更新 Notion 页面。

### 8.2 后续阶段：Notion -> Markdown 手动回写

Notion 逆向写回 Markdown 可以作为后续能力，但必须显式触发。

建议规则：

- 默认不从 Notion 自动覆盖 Markdown。
- 只有用户在 Notion 中点击明确动作，例如“更新网站”，才允许回写。
- 回写前应检查 Markdown 和 Notion 的更新时间。
- 如果 Markdown 本地版本更新，应拒绝覆盖或要求人工确认。
- 最好先生成 diff 或预览，再写回文件。

不建议第一阶段实现完整双向同步。

## 9. 重构顺序与内容

本项目应先完成基础重构，再进入后续功能实现。

推荐顺序：

```text
内容目录重构
  -> 后端内容索引重构
  -> 新 API 重构
  -> 前端路由和数据层重构
  -> 文章详情页和系列展示重构
  -> 首页和整体视觉重构
  -> 写作辅助
  -> Notion 同步
```

### 9.1 第一步：建立新内容目录

目标：

- 新增统一内容目录 `content/`。
- 新文章统一进入 `content/posts/`。
- 旧文章移动或保留到 `content/legacy/`。
- 后端只扫描 `content/posts/`。
- 确保旧文章不会进入新博客首页、系列页和索引。

推荐结构：

```text
content/
  posts/
    example-post/
      index.md
      images/

  legacy/
    old-posts/
```

验收标准：

- 项目中存在 `content/posts/`。
- 至少有一篇符合新 metadata 规范的示例文章。
- 旧文章目录不被新索引扫描。

### 9.2 第二步：重构后端内容索引

目标：

- 从 API route 中移除直接扫描 Markdown 的逻辑。
- 新增独立内容索引模块。
- 后端通过索引读取文章、系列、分类和标签。

建议新增模块：

```text
server_flask/app/services/content_index.py
server_flask/app/services/markdown_renderer.py
server_flask/app/services/media.py
server_flask/app/models/post.py
```

`content_index.py` 负责：

- 扫描 `content/posts/<slug>/index.md`。
- 解析 frontmatter。
- 校验 `title`、`slug`、`date` 等字段。
- 检查重复 `slug`。
- 构建 `posts_by_slug`。
- 构建文章列表。
- 构建系列索引。
- 构建分类和标签索引。

`markdown_renderer.py` 负责：

- Markdown 转 HTML。
- 代码块、表格、脚注、数学公式等扩展支持。
- 后续可加入 HTML 安全清洗。

`media.py` 负责：

- 将文章内本地图片路径转换为浏览器可访问 URL。
- 处理 `images/` 目录下的静态资源访问。

验收标准：

- 不通过 Flask route 直接 `os.listdir()` 扫文章。
- 可以按 slug 获取文章。
- 可以获取文章列表。
- 可以获取系列列表和单个系列。
- 重复 slug 能被发现并报错。

### 9.3 第三步：重构后端 API

目标：

- 新 API 服务新前端。
- 旧 API 暂时保留，避免一次性破坏现有页面。

优先实现：

```text
GET /api/posts
GET /api/posts/:slug
GET /api/series
GET /api/series/:series_id
```

后续再考虑：

```text
GET /api/categories
GET /api/tags
GET /api/search?q=keyword
```

文章详情接口建议返回：

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

验收标准：

- `/api/posts` 支持分页。
- `/api/posts/:slug` 能返回文章正文、metadata、TOC 和系列信息。
- `/api/series` 能返回所有系列。
- `/api/series/:series_id` 能返回系列文章。

### 9.4 第四步：重构前端路由和 API 调用

目标：

- 前端改用新 API。
- 新路由使用 `/posts/:slug`。
- API 调用从页面组件中抽离。

建议新增：

```text
blog_by_vue/src/api/posts.js
blog_by_vue/src/api/series.js
```

建议路由：

```text
/
/posts/:slug
/series
/series/:series_id
```

旧路由：

```text
/p/:abbrlink
```

可以暂时保留，后续用于兼容跳转。

验收标准：

- 首页从 `/api/posts` 读取文章列表。
- 文章详情页从 `/api/posts/:slug` 读取文章。
- 系列页从 `/api/series` 读取数据。
- 页面组件中不再散落 axios URL 字符串。

### 9.5 第五步：重构文章详情页

文章详情页是博客体验的核心，应优先重做。

目标布局：

```text
左侧侧边栏        中间正文
系列文章列表      标题
文章目录 TOC      metadata
                 Markdown 正文
```

建议组件：

```text
ArticleLayout.vue
SeriesSidebar.vue
ArticleToc.vue
MetadataLine.vue
```

功能要求：

- 支持 Markdown HTML 渲染。
- 支持代码高亮。
- 支持数学公式。
- 支持代码复制。
- 左侧侧边栏可折叠。
- 当前文章属于系列时显示系列文章列表。
- 当前文章在系列列表中高亮。
- 独立文章不显示系列列表。
- 移动端侧边栏应折叠或变成抽屉。

验收标准：

- 系列文章进入详情页后能看到完整系列目录。
- 独立文章详情页不显示空系列块。
- 正文阅读宽度合理。
- 代码块、公式、图片显示正常。

### 9.6 第六步：重构首页和系列页

目标：

- 首页变成更适合技术笔记的轻量文章列表。
- 系列页用于展示系列集合和系列详情。

首页建议：

- 不再使用厚重卡片和大阴影。
- 使用轻量列表和分隔线。
- 每篇文章展示标题、摘要、日期、分类、标签。
- 点击标题进入 `/posts/:slug`。

系列页建议：

```text
/series
  展示所有系列

/series/:series_id
  展示该系列全部文章
```

验收标准：

- 首页视觉更干净。
- 系列页能按 `series.order` 展示文章。
- 首页不把系列文章折叠成目录。

### 9.7 第七步：统一视觉风格

推荐视觉方向：

```text
技术笔记 / 个人知识库 / 文档站风格
```

设计原则：

- 页面安静、清晰，优先阅读体验。
- 避免大面积渐变和厚重卡片。
- 避免复杂装饰。
- 内容区宽度控制在适合阅读的范围。
- 使用一个主要强调色。
- 代码块、表格、引用、公式要有统一样式。
- 首页和文章页使用同一套间距、字体和颜色变量。

建议新增全局设计变量：

```text
颜色
字体
间距
边框
代码块样式
正文排版样式
```

验收标准：

- 首页、文章详情页、系列页视觉一致。
- 移动端无明显布局错乱。
- 文章正文长时间阅读不累。

### 9.8 第八步：写作辅助

在内容系统稳定后，再做写作辅助。

目标：

- 提供文章模板生成能力。
- 可以通过命令或网页生成文章目录和 `index.md`。

示例：

```sh
python manage.py new_post "逻辑回归" --slug logistic-regression
```

生成：

```text
content/posts/logistic-regression/
  index.md
  images/
```

验收标准：

- 能生成合法 metadata。
- 能自动创建文章目录和图片目录。
- 生成后的文章能被博客索引识别。

### 9.9 第九步：Notion 同步

Notion 同步放在基础博客重构完成之后。

第一步只做：

```text
Markdown -> Notion
```

后续再考虑：

```text
Notion -> Markdown 手动回写
```

验收标准：

- Markdown 文章能同步到 Notion。
- Markdown metadata 能记录 `notion.page_id`。
- 删除 Notion 或缓存后，Markdown 仍然是可用主数据。

## 10. 分阶段实施建议

### 第一阶段：基础重构

必须完成：

- 内容目录重构。
- 后端内容索引。
- 新文章 API。
- 新前端路由。
- 新文章详情页。
- 本地图片支持。
- 系列数据结构。

完成第一阶段后，博客应该可以基于新 Markdown 结构正常阅读。

### 第二阶段：体验完善

继续完成：

- 首页视觉重构。
- 系列页。
- 文章目录 TOC。
- 侧边栏移动端适配。
- 写文章模板生成器。

### 第三阶段：扩展能力

后续再做：

- 旧链接兼容。
- 分类和标签页。
- 搜索。
- Notion 单向同步。
- Notion 手动回写 Markdown。

## 11. 当前非目标

第一阶段不做：

- 完整 CMS。
- 多用户权限。
- 草稿、隐藏、置顶。
- 评论系统。
- 数据库作为主数据源。
- Notion 自动双向同步。
- 旧文章完整迁移和展示。

## 12. 后续实现时需要注意

- `slug` 必须唯一且稳定。
- 不要再使用 Python `hash(title)` 作为长期链接。
- Markdown 渲染后的 HTML 需要考虑安全清洗。
- `v-html` 渲染内容时要避免脚本注入风险。
- 本地图片路径需要统一转换为浏览器可访问 URL。
- 文章索引和数据库缓存必须能从 `content/` 重建。
- 旧文章目录不能被新索引扫描到。
