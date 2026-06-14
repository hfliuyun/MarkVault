# MarkVault 实现日志

本文档记录已完成的功能和实现历史，用于追溯和参考。当前版本的待实现需求参见 [需求清单](blog-requirements.md)。

## 基础能力（Phase 1）

### 内容索引系统

**实现内容：**
- 将博客主数据源切换为 Markdown 内容目录：默认读取仓库级 `content/`，也支持通过 `BLOG_CONTENT_ROOT` 指向外部内容仓库
- 实现后端内容索引层：扫描 `content/posts/*/index.md` 和 `content/series/*/*/index.md`，解析 frontmatter，校验 `title`、`slug`、`date`，检查重复 `slug`，构建文章、系列、分类和标签索引
- 支持系列文件夹内容结构：系列文章可放在 `content/series/<series-id>/<slug>/index.md`，图片仍通过 `/api/media/posts/:slug/images/:filename` 访问

### API 层

**新博客 API：**
- `GET /api/posts` - 文章列表
- `GET /api/posts/:slug` - 文章详情
- `GET /api/series` - 系列列表
- `GET /api/series/:series_id` - 系列详情
- `GET /api/categories` - 分类列表
- `GET /api/tags` - 标签列表
- `GET /api/media/posts/:slug/images/:filename` - 文章图片

**兼容旧 API：**
- `GET /api/posts_list_metadata`
- `GET /api/p/:abbrlink`
- `GET /api/md/:abbrlink`
- `POST /api/upload_image`
- `POST /api/save_post`

### 内容热加载

**实现内容：**
- 修改、新增或删除 `content/posts/*/index.md` 或 `content/series/*/*/index.md` 后，下一次新博客 API 请求会自动刷新内存索引
- 不需要重启 Flask 服务

### 前端路由和视图

**实现路由：**
- `/` - 首页文章列表
- `/posts/:slug` - 文章详情页
- `/series` - 系列列表页
- `/series/:seriesId` - 系列详情页
- `/categories` - 分类列表页
- `/categories/:category` - 分类详情页
- `/tags` - 标签列表页
- `/tags/:tag` - 标签详情页
- `/search` - 搜索结果页

**API 调用层：**
- 抽离 `src/api/posts.js` 和 `src/api/series.js`
- 集中管理 API 端点

### 文章详情页功能

**Markdown 渲染：**
- Markdown HTML 渲染
- 代码高亮（语法高亮）
- 数学公式渲染（KaTeX）
- 代码复制按钮

**导航功能：**
- 系列侧边栏：显示当前系列的所有文章
- 正文目录 TOC：显示文章标题大纲
- 修复 hash 路由下 TOC 跳转问题：目录点击保留当前文章路由并使用 `/#/posts/:slug#heading` 形式定位正文标题

**组件拆分：**
- `Post.vue` 只保留页面级数据加载、路由监听和组件组合逻辑
- 布局、正文、元信息、侧边栏、TOC、Markdown 增强和标题跳转逻辑已拆出到独立组件

### 移动端适配

**文章侧边栏优化：**
- 手机宽度下默认优先展示正文
- 通过文章导航抽屉查看系列目录和正文 TOC
- 点击 TOC 后会定位标题并收起抽屉

### 视觉风格

**实现内容：**
- 初步统一首页、文章详情页、系列页的视觉风格
- 使用技术笔记 / 文档站风格的全局设计变量

### 开发工具

**Commit Message 模板：**
- 添加标准 commit message 模板 `.gitmessage`
- 当前仓库本地已配置 `git config commit.template .gitmessage`

## 已完成功能清单

### 写文章模板生成器

**状态：** 已完成

**目标：** 提供轻量命令生成新文章目录和初始 Markdown 文件。

**实现方式：**
- 新增命令 `python3 manage.py new_post "标题" --slug example-slug`
- 生成 `content/posts/<slug>/index.md` 和 `images/` 目录
- 支持 `BLOG_CONTENT_ROOT` 环境变量
- 拒绝覆盖已有 slug

**验收标准：**
- ✅ 生成的 `index.md` 包含合法 frontmatter：`title`、`slug`、`date`、`summary`、`categories`、`tags`，可选 `series`
- ✅ 如果目标 slug 已存在，命令拒绝覆盖并给出明确错误
- ✅ 生成后访问 `/api/posts` 能看到新文章，不需要重启 Flask

### 分类和标签页面

**状态：** 已完成

**目标：** 前端支持按分类和标签浏览文章。

**实现方式：**
- 新增 `/categories`、`/categories/:category`、`/tags`、`/tags/:tag` 页面
- 复用现有 `/api/categories` 和 `/api/tags` 接口

**验收标准：**
- ✅ 分类页展示所有分类及文章数量
- ✅ 标签页展示所有标签及文章数量
- ✅ 分类详情和标签详情能列出相关文章并跳转到 `/posts/:slug`
- ✅ 首页和文章详情页中的分类、标签可以跳转到对应页面

### 搜索功能

**状态：** 已完成

**目标：** 支持按关键词搜索博客文章。

**实现方式：**
- 新增 `GET /api/search?q=keyword` 接口
- 前端提供顶部搜索弹窗和 `/search?q=keyword` 搜索结果页

**验收标准：**
- ✅ 可搜索标题、摘要、正文、分类和标签
- ✅ 搜索结果展示标题、摘要、日期、分类、标签，并能跳转文章详情
- ✅ 空关键词返回空结果或明确提示，不返回 500

### 旧链接兼容跳转

**状态：** 已完成

**目标：** 让旧 `/p/:abbrlink` 链接尽量跳转到新 `/posts/:slug`。

**实现方式：**
- 建立旧 `abbrlink` 到新 `slug` 的映射策略
- 可从已迁移文章 frontmatter 的 `legacy.abbrlinks` 读取
- 或从 `content/legacy/abbrlink-map.json` 映射文件读取

**验收标准：**
- ✅ 已迁移旧文章访问 `/p/:abbrlink` 时跳转到 `/posts/:slug`
- ✅ 未迁移旧文章返回明确的 404 或归档提示
- ✅ 不再使用 Python `hash(title)` 作为长期链接依据

### 文章详情组件拆分

**状态：** 已完成

**目标：** 降低 `Post.vue` 复杂度，便于后续维护。

**实现方式：**
- 拆出文章布局、系列侧边栏、TOC、metadata、正文增强逻辑等组件或 composable

**验收标准：**
- ✅ 文章详情页现有行为保持不变
- ✅ TOC 跳转、代码复制、数学公式、代码高亮仍正常
- ✅ `Post.vue` 只保留页面级数据加载和组件组合逻辑

### 移动端文章侧边栏优化

**状态：** 已完成

**目标：** 改善手机宽度下系列目录和正文目录的阅读体验。

**实现方式：**
- 将移动端侧边栏改为抽屉模式，不挤占正文阅读区

**验收标准：**
- ✅ 手机宽度下文章正文优先展示
- ✅ 系列目录和 TOC 可展开查看
- ✅ 点击 TOC 后能定位标题并自动收起或不遮挡正文

### Markdown HTML 安全清洗

**状态：** 已完成

**目标：** 降低后端 Markdown 渲染和前端 `v-html` 带来的脚本注入风险。

**实现方式：**
- 在后端 Markdown 渲染后增加 HTML 白名单清洗
- 约束 Markdown 渲染输出的安全标签和属性

**验收标准：**
- ✅ Markdown 中的 `<script>`、事件属性等危险内容不会在浏览器执行
- ✅ 常用 Markdown 内容、代码块、表格、公式、图片仍正常显示
- ✅ 安全策略写入文档，明确允许和禁止的 HTML 范围

**安全策略：**
- **允许常用 Markdown HTML 标签**：标题、段落、列表、引用、链接、图片、代码块、表格、脚注相关标签
- **允许必要属性**：标题 `id`、链接 `href/title`、图片 `src/alt/title`、代码 `class`、表格对齐相关属性
- **禁止脚本和嵌入执行面**：`script`、`style`、`iframe` 等危险块会被移除
- **禁止危险协议和事件属性**：`javascript:`、`onclick`、`onerror` 等不会出现在渲染结果中

## 参考文档

- [需求清单](blog-requirements.md)：当前待实现功能需求
- [开发指南](blog-development-guide.md)：架构决策和开发规范
- [架构文档](blog-architecture.md)：简要架构和数据流
- [内容写作指南](blog-content-guide.md)：frontmatter 规范和目录结构
