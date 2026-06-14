# MarkVault 需求清单

本文档记录待实现的功能需求。已完成的功能记录在 [实现日志](blog-implementation-log.md)。

架构设计和开发规范参见 [开发指南](blog-development-guide.md)。

## 待实现需求

### 优先级 P0（高优先级）

#### 系列简介与展示增强

**目标：** 为系列增加独立的简介文件，在系列列表和首页展示系列信息。

**范围：**
- 支持在系列目录下添加 `README.md` 作为系列简介
- 系列列表页显示系列简介
- 首页文章列表显示文章所属系列（如果有）

**验收标准：**
- 可在 `content/series/<series-id>/README.md` 写系列简介
- 简介支持可选的 frontmatter（`title`）和 Markdown 正文
- `/api/series` 和 `/api/series/<series-id>` 返回包含 `description_html` 字段
- 系列列表页展示完整简介（由作者控制长度，不截断）
- 系列详情页顶部展示完整系列简介（支持 Markdown 渲染）
- 首页文章卡片显示系列标签徽章（如 `[系列] 机器学习基础`），可点击跳转到系列详情
- 没有 README.md 的系列，`description_html` 为空，前端不显示简介块

**实现要点：**

后端变更：
1. `content_index.py` 在 `_build_series_index()` 中扫描 `content/series/<series-id>/README.md`
2. 如果存在，解析其 frontmatter（可选）和正文 Markdown
3. 使用 `markdown_renderer.py` 渲染为 HTML
4. Series 数据模型增加字段：`description_md`（原始）、`description_html`（渲染后）
5. 系列标题优先使用 README 的 frontmatter title，其次使用文章中的 series.title
6. API 响应包含 `description_html`（可为空字符串）

前端变更：
1. `SeriesList.vue`：在系列卡片中显示完整简介（不截断）
2. `SeriesDetail.vue`：在顶部显示完整系列简介（v-html 渲染）
3. `Home.vue`：文章卡片中显示系列标签徽章，视觉轻量，点击跳转到 `/series/<series-id>`

**系列简介文件规范：**

文件位置：`content/series/<series-id>/README.md`

Frontmatter（可选）：
```yaml
---
title: 机器学习基础  # 可选，覆盖从文章读取的系列标题
---
```

正文格式：
- Markdown 格式，完整显示不截断（由作者控制长度）
- 建议 2-5 段，简明扼要
- 可包含系列目标、适用人群、内容范围

示例：
```markdown
---
title: 机器学习基础
---

这是机器学习系列的学习笔记，涵盖基础算法、数学原理和实践应用。

本系列适合初学者，从监督学习开始，逐步深入到模型评估和优化。
```

---

### 优先级 P1（中优先级）

#### 本地图片写作和上传链路

**目标：** 让图片写入文章自己的 `images/` 目录，而不是旧 `server_flask/static/image/`。

**范围：**
- 改造或新增写作辅助上传接口
- 使图片保存到 `content/posts/<slug>/images/` 或 `content/series/<series-id>/<slug>/images/`

**验收标准：**
- Markdown 中插入 `![alt](images/file.png)`
- 前端文章详情通过 `/api/media/posts/:slug/images/:filename` 正常显示图片
- 图片和 Markdown 一起位于内容仓库，便于整体备份

---

#### 测试补强

**目标：** 为核心内容系统补充自动化测试，降低后续改动风险。

**范围：** 优先覆盖内容索引、重复 slug、frontmatter 校验、媒体路径、搜索、模板生成器。

**验收标准：**
- 新增测试可通过单一命令运行
- 关键异常场景有明确断言
- 后续实现每个单点需求时同步补充对应测试

---

### 优先级 P2（低优先级）

#### Notion 单向同步

**目标：** 实现 Markdown 到 Notion 的展示 / 备份同步。

**范围：**
- 新增同步脚本或命令
- 扫描 `content/posts/`，创建或更新 Notion 页面
- 写回 `notion.page_id`、`notion.synced_at` 到 Markdown frontmatter

**验收标准：**
- 没有 `notion.page_id` 的文章可以创建 Notion 页面
- 已有 `notion.page_id` 的文章可以更新对应 Notion 页面
- Markdown 仍然是第一主数据源，删除 Notion 或缓存不影响博客可用性

**注意：** Notion 定位为展示/备份副本，不是主数据源。第一阶段不实现 Notion -> Markdown 的自动回写。

---

## 推荐实现顺序

后续建议按以下顺序推进，每次只实现一个需求点：

1. **系列简介与展示增强**（P0）
2. **本地图片写作和上传链路**（P1）
3. **测试补强**（P1）
4. **Notion 单向同步**（P2）

---

## 参考文档

- [实现日志](blog-implementation-log.md)：已完成功能和实现历史
- [开发指南](blog-development-guide.md)：架构决策、设计理念和开发规范
- [架构文档](blog-architecture.md)：简要架构和数据流
- [内容写作指南](blog-content-guide.md)：frontmatter 规范和目录结构
- [API 文档](blog-api.md)：公开 API 结构
