# 文档体系重构设计

## 概述

对 MarkVault 项目的文档体系进行全面重构：消除跨文档内容重复，更新过时信息，统一命名和语言规范。

### 当前问题

1. **内容过时** — `AGENTS.md`、`README`、`architecture`、`development-guide` 均未反映 TOTP/Pastebin 功能
2. **重复严重** — `development-guide.md`（518行）与 content-guide、architecture、api 大量重复
3. **实现日志缺失** — 「系列简介与展示增强」已完成但未记录
4. **需求文档过时** — 已完成条目占大量篇幅，推荐顺序未更新
5. **命名不一致** — 文件名带 `blog-` 前缀冗余

### 重构原则

- 每份文档一个明确职责，不交叉
- 中文为主，README 保留中英双版
- 去掉文件名的 `blog-` 前缀
- 所有文档更新至反映当前代码状态（含 TOTP、Pastebin、系列简介等）

---

## 第一部分：目标文档结构

```
MarkVault/
  README.md                      # 英文项目介绍 + 快速开始
  README.zh-CN.md                # 中文项目介绍 + 快速开始
  AGENTS.md                      # AI 工具上下文指南
  docs/
    architecture.md              # 技术架构全景
    api.md                       # 完整 API 参考
    content-guide.md             # 内容写作指南
    development-guide.md         # 架构决策记录（ADR）+ 编码规范
    changelog.md                 # 已实现功能变更日志
    requirements.md              # 待实现需求清单
    specs/                       # 设计规格文档存档
      2026-06-16-pastebin-and-totp-design.md
      2026-06-17-article-management-design.md
```

---

## 第二部分：各文档变更说明

### 2.1 README.md / README.zh-CN.md

**来源：** 现有 `README.md` + `README.zh-CN.md`

**变更内容：**

- **Features 列表更新** — 添加：
  - TOTP 管理员认证（基于时间的动态密码）
  - Pastebin 跨设备剪贴板（文本/代码片段同步，支持语法高亮和过期时间）
  - 系列简介（series README 描述支持）
  - 文章管理页面（模板下载 + 上传发布 + 列表管理）（待实现后补充）
- **Setup 部分更新** — 在后端安装步骤后添加 TOTP 首次绑定说明：
  ```sh
  python manage.py setup_totp
  ```
- **Documentation 部分更新** — 补全所有文档链接，使用新文件名
- **Project Structure 更新** — 反映 `data/` 运行时目录
- 两个 README 保持内容同步

---

### 2.2 AGENTS.md

**来源：** 现有 `AGENTS.md`

**全面重写。** 需要更正的关键内容：

- **项目结构** — 更正为 `content/posts/*/index.md` 和 `content/series/*/*/index.md`，去掉已不存在的 `vite-project/`、`test.js`、`内容大纲.md`
- **新增服务描述** — `auth.py`（TOTP/JWT 鉴权）、`paste.py`（剪贴板存储）、`post_template.py`（文章模板生成）、`post_manager.py`（文章上传管理，待实现后补充）
- **命令更新** — 添加 `manage.py setup_totp`、`manage.py reset_totp`、`manage.py new_post`
- **测试文件更新** — 更正为 `test_content_index.py`、`test_markdown_renderer.py`、`test_post_template.py`
- **运行时数据** — 说明 `server_flask/data/` 目录不应提交
- **前端路由** — 列出所有当前路由含 `/paste`、`/paste/:id`、`/manage`（待实现）

---

### 2.3 docs/architecture.md

**来源：** 现有 `docs/blog-architecture.md`（重命名 + 更新）

**变更内容：**

- **后端服务层更新** — 添加缺失的服务：
  - `auth.py` — TOTP 密码验证 + JWT 签发
  - `paste.py` — Paste CRUD + 过期清理
  - `post_template.py` — 文章模板 frontmatter 生成
  - `post_manager.py` — 文章上传解析和管理（待实现后补充）
- **前端路由更新** — 添加：`/paste`、`/paste/:id`、`/manage`、`/categories`、`/categories/:category`、`/tags`、`/tags/:tag`、`/search`
- **数据流** — 添加认证数据流（前端 JWT → 后端验证）和 Paste 数据流
- **存储结构** — 添加 `server_flask/data/` 运行时数据目录说明（auth/、pastes/）
- **删除** 与 content-guide 和 development-guide 重复的内容目录结构描述（改为交叉引用链接）

---

### 2.4 docs/api.md

**来源：** 现有 `docs/blog-api.md`（重命名）

**变更内容：**

- 内容已基本是最新的，仅需重命名文件
- 将来文章管理 API 实现后，补充 `/api/manage/posts`、`/api/posts/template`、`/api/posts/upload`、`DELETE /api/posts/<slug>` 四个端点

---

### 2.5 docs/content-guide.md

**来源：** 现有 `docs/blog-content-guide.md`（重命名）

**变更内容：**

- 内容已是最新的，仅需重命名文件
- 内部交叉引用链接更新为新文件名

---

### 2.6 docs/development-guide.md

**来源：** 现有 `docs/blog-development-guide.md`（重命名 + 大幅精简）

**这是最大的变更。** 从 518 行精简为约 200-250 行。

**保留的内容（独一无二）：**

- 核心设计理念（Markdown 为唯一真相源、内容与代码分离）
- 架构决策记录（ADR）：
  - URL 与 slug 规则
  - 系列文章 metadata 设计
  - 图片路径策略
  - 草稿与发布策略
  - 旧文章兼容策略
  - Web 编辑器定位
- 编码规范：
  - Vue 组件命名、2 空格缩进
  - Python snake_case、4 空格缩进
  - Commit message 风格
- 安全策略（HTML 白名单清洗规则）

**删除的重复内容（改为交叉引用链接）：**

- ~~内容目录结构~~ → 参见 [content-guide.md](content-guide.md)
- ~~Frontmatter schema~~ → 参见 [content-guide.md](content-guide.md)
- ~~后端分层架构~~ → 参见 [architecture.md](architecture.md)
- ~~推荐 API 设计示例~~ → 参见 [api.md](api.md)
- ~~写作工具 (manage.py)~~ → 参见 [content-guide.md](content-guide.md)
- ~~前端路由和组件列表~~ → 参见 [architecture.md](architecture.md)
- ~~Notion 同步规划细节~~ → 参见 [requirements.md](requirements.md)

---

### 2.7 docs/changelog.md

**来源：** 现有 `docs/blog-implementation-log.md`（重命名 + 补充）

**变更内容：**

- **补充缺失条目** — 添加「系列简介与展示增强」已完成条目，包括：
  - README.md 系列简介文件支持
  - `description_html` API 字段
  - 前端系列列表/详情页简介展示
  - 首页系列标签徽章
- 后续实现的文章管理功能也在此记录
- 内部引用链接更新为新文件名

---

### 2.8 docs/requirements.md

**来源：** 现有 `docs/blog-requirements.md`（重命名 + 精简）

**变更内容：**

- **已完成条目精简** — 「系列简介与展示增强」的详细描述移到 changelog，requirements 只保留一行标记
- **新增待实现条目** — 添加文章管理页面需求（指向 spec 文档）
- **更新推荐顺序** — 反映当前实际状态（TOTP/Pastebin 已完成，文章管理待实现）
- **更新 TOTP/Pastebin 状态** — 在已完成部分添加标记

---

### 2.9 docs/blog-migration.md

**处理方式：** 删除。

迁移工作已在 Phase 1 完成，此文档已成为历史存档。如果需要保留，可移至 `docs/archive/migration.md`。

---

## 第三部分：文件操作清单

### 重命名

```
docs/blog-api.md              → docs/api.md
docs/blog-architecture.md     → docs/architecture.md
docs/blog-content-guide.md    → docs/content-guide.md
docs/blog-development-guide.md → docs/development-guide.md
docs/blog-implementation-log.md → docs/changelog.md
docs/blog-requirements.md     → docs/requirements.md
```

### 删除或归档

```
docs/blog-migration.md         → 删除（或移至 docs/archive/）
```

### 更新

```
README.md                      → 更新 Features、Setup、Docs 链接
README.zh-CN.md                → 同步更新
AGENTS.md                      → 全面重写
docs/architecture.md           → 更新服务层、路由、数据流
docs/development-guide.md      → 大幅精简（518行 → ~200行）
docs/changelog.md              → 补充「系列简介」条目
docs/requirements.md           → 精简已完成条目、更新顺序
```

### 不变

```
docs/api.md                    → 仅重命名，内容不变
docs/content-guide.md          → 仅重命名，内容不变
docs/specs/*                   → 保留
```

---

## 第四部分：交叉引用更新

所有文档内部的交叉引用链接需要统一更新为新文件名。涉及的链接模式：

```
blog-api.md              → api.md
blog-architecture.md     → architecture.md
blog-content-guide.md    → content-guide.md
blog-development-guide.md → development-guide.md
blog-implementation-log.md → changelog.md
blog-requirements.md     → requirements.md
```

影响的文件（含内部链接引用）：
- 所有 `docs/` 下的文件（互相引用）
- `README.md` / `README.zh-CN.md`（Documentation 部分）

---

## 第五部分：实现顺序

建议按以下顺序执行，减少中间态的链接断裂：

### 步骤 1：重命名文件

用 `git mv` 重命名所有 `docs/blog-*.md` 文件。一次性完成全部重命名。

### 步骤 2：更新交叉引用

批量搜索替换所有文档中的旧文件名引用。

### 步骤 3：更新内容

按文件逐个更新：
1. `AGENTS.md`（独立，无依赖）
2. `docs/changelog.md`（补充缺失条目）
3. `docs/requirements.md`（精简已完成条目）
4. `docs/architecture.md`（更新服务和路由）
5. `docs/development-guide.md`（大幅精简）
6. `README.md` + `README.zh-CN.md`（最后更新，确保链接正确）

### 步骤 4：删除/归档

删除 `docs/blog-migration.md`（或移至 archive）。

### 步骤 5：验证

- 检查所有 markdown 内部链接是否有效
- 确认无残留的旧文件名引用
