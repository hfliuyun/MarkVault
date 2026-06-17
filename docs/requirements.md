# MarkVault 需求清单

本文档只记录尚未完成或仍需补强的需求。已完成功能和实现历史参见 [changelog.md](changelog.md)。

## 当前状态

已完成：

- 内容索引、文章详情、系列、分类、标签、搜索和旧链接兼容
- 文章模板生成器 `manage.py new_post`
- Markdown HTML 安全清洗
- TOTP 管理认证与 Pastebin 剪贴板
- 系列简介与展示增强
- 文章管理页面

## 待实现需求

### P1：本地图片写作和上传链路

**目标：** 让图片写入文章自己的 `images/` 目录，而不是旧 `server_flask/static/image/`。

**范围：**

- 改造或新增写作辅助上传接口。
- 使图片保存到 `content/posts/<slug>/images/` 或 `content/series/<series-id>/<slug>/images/`。

**验收标准：**

- Markdown 中插入 `![alt](images/file.png)`。
- 前端文章详情通过 `/api/media/posts/:slug/images/:filename` 正常显示图片。
- 图片和 Markdown 一起位于内容仓库，便于整体备份。

### P1：测试补强

**目标：** 为核心内容系统补充自动化测试，降低后续改动风险。

**范围：** 优先覆盖内容索引、重复 slug、frontmatter 校验、媒体路径、搜索、模板生成器、TOTP/Pastebin 和文章管理接口。

**验收标准：**

- 新增测试可通过单一命令运行。
- 关键异常场景有明确断言。
- 后续实现每个单点需求时同步补充对应测试。

### P2：Notion 单向同步

**目标：** 实现 Markdown 到 Notion 的展示或备份同步。

**范围：**

- 新增同步脚本或命令。
- 扫描 `content/posts/`，创建或更新 Notion 页面。
- 写回 `notion.page_id`、`notion.synced_at` 到 Markdown frontmatter。

**验收标准：**

- 没有 `notion.page_id` 的文章可以创建 Notion 页面。
- 已有 `notion.page_id` 的文章可以更新对应 Notion 页面。
- Markdown 仍然是第一主数据源，删除 Notion 或缓存不影响博客可用性。

**注意：** Notion 定位为展示/备份副本，不是主数据源。第一阶段不实现 Notion 到 Markdown 的自动回写。

## 推荐实现顺序

1. **本地图片写作和上传链路**（P1）
2. **测试补强**（P1）
3. **Notion 单向同步**（P2）

## 参考文档

- [changelog.md](changelog.md)：已完成功能和实现历史
- [development-guide.md](development-guide.md)：架构决策、设计理念和开发规范
- [architecture.md](architecture.md)：架构和数据流
- [content-guide.md](content-guide.md)：frontmatter 规范和目录结构
- [api.md](api.md)：公开 API 参考
