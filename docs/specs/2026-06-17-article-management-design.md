# 文章管理页面设计（模板下载 / 上传 / 列表管理）

## 概述

为 MarkVault 博客新增 `/manage` 管理页面，替代现有的 `/write` 编辑器页面。提供三个核心功能：

1. **文章列表** — 展示所有已发布文章，支持查看和删除
2. **创建模板** — 填写 metadata 表单，生成并下载包含 frontmatter 的文章模板 ZIP
3. **上传文章** — 拖拽或选择 ZIP/文件夹，上传文章到服务器直接发布

### 背景

- 现有的 `/write` 页面（`Edit.vue`）使用旧 API（`/api/md/:abbrlink`、`/api/save_post`），与新的 content 目录架构不匹配
- 项目已有 CLI 模板生成器（`manage.py new_post`），但缺少 Web 端操作入口
- 项目已实现 TOTP 鉴权系统，管理页面可直接复用
- 文章存储分两种路径：独立文章在 `content/posts/<slug>/`，系列文章在 `content/series/<series-id>/<slug>/`

### 设计原则

- 复用现有 TOTP 鉴权（`require_auth` 装饰器 + `useAuth` composable）
- 复用现有 `post_template.py` 的 frontmatter 生成逻辑
- 正确处理独立文章和系列文章的不同存储路径
- 上传后直接发布，无草稿状态
- 前端复用现有 CSS 变量和玻璃面板风格

---

## 第一部分：后端 API

### 1.1 新增 API 路由

所有管理 API 需要 TOTP 认证（`@require_auth` 装饰器）。

建议新增路由文件 `server_flask/app/api/manage_routes.py`，或直接添加到现有 `routes.py` 中（保持与项目现有风格一致）。

#### GET /api/manage/posts

返回所有已发布文章的管理列表（全量元数据，不含正文 HTML）。

**与 `GET /api/posts` 的区别：** 不分页，返回全部文章，并包含 `source_dir` 字段标识文章的存储位置类型。

请求头：
```
Authorization: Bearer <jwt-token>
```

成功响应（200）：
```json
{
  "total": 5,
  "articles": [
    {
      "title": "逻辑回归",
      "slug": "logistic-regression",
      "date": "2022-01-29 14:40:13",
      "summary": "逻辑回归的基本原理...",
      "categories": ["机器学习"],
      "tags": ["算法", "逻辑回归"],
      "series": {
        "id": "machine-learning-basic",
        "title": "机器学习基础",
        "order": 1
      },
      "location": "series"
    },
    {
      "title": "Git 基本操作",
      "slug": "git-basic",
      "date": "2022-01-20 10:00:00",
      "summary": "常用 Git 命令...",
      "categories": ["工具"],
      "tags": ["Git"],
      "location": "posts"
    }
  ]
}
```

`location` 字段值为 `"posts"` 或 `"series"`，表示文章存储在 `content/posts/` 还是 `content/series/` 下。

**实现要点：**
- 从 `ContentIndex.posts` 获取所有文章
- 通过 `Post.source_path` 判断 location：如果路径包含 `series/` 则为 `"series"`，否则为 `"posts"`
- 调用 `Post.to_metadata_dict()` 获取元数据，追加 `location` 字段

---

#### POST /api/posts/template

生成文章模板 ZIP 并下载。不在服务器创建文件。

请求头：
```
Authorization: Bearer <jwt-token>
Content-Type: application/json
```

请求体：
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

必填字段：`title`、`slug`。其余均可选。

成功响应（200）：
```
Content-Type: application/zip
Content-Disposition: attachment; filename="logistic-regression.zip"
```

ZIP 内容结构：
```
logistic-regression/
  index.md      # 包含完整 frontmatter + 初始标题
  images/       # 空目录
```

错误响应：
- `400`：title 或 slug 为空，slug 格式不合法
- `409`：该 slug 已存在（在 content 目录中已有同名文章）

**实现要点：**
- 复用 `post_template.py` 中的 `_build_frontmatter()` 函数生成 frontmatter 内容
- 使用 Python `zipfile` 模块在内存构建 ZIP（`io.BytesIO`），不写入磁盘
- 调用 `ContentIndex` 检查 slug 是否已存在
- ZIP 中的空 `images/` 目录：添加一个以 `/` 结尾的 ZipInfo 条目

```python
import io
import zipfile

def build_template_zip(frontmatter_text: str, slug: str) -> io.BytesIO:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
        body = f"{frontmatter_text}\n\n## 从这里开始写作\n\n"
        zf.writestr(f"{slug}/index.md", body)
        # Add empty images directory
        zf.mkdir(f"{slug}/images/")
    buf.seek(0)
    return buf
```

---

#### POST /api/posts/upload

上传文章。接收 ZIP 文件，解压到 content 目录，触发索引刷新。

请求头：
```
Authorization: Bearer <jwt-token>
Content-Type: multipart/form-data
```

表单字段：
- `file`：ZIP 文件（必填）
- `overwrite`：`"true"` 或 `"false"`（可选，默认 `"false"`），是否覆盖已有文章

成功响应（201）：
```json
{
  "message": "Post published successfully",
  "slug": "logistic-regression",
  "location": "series",
  "path": "content/series/machine-learning-basic/logistic-regression/"
}
```

错误响应：
- `400`：无文件、不是 ZIP、ZIP 内缺少 `index.md`、frontmatter 不合法（缺少 title/slug/date）
- `409`：slug 已存在且 `overwrite` 为 false

**上传处理流程：**

```
接收 ZIP → 解压到临时目录 → 校验结构 → 解析 frontmatter → 检查 slug 冲突
  → 确定目标路径 → 写入 content 目录 → 触发索引刷新 → 返回结果
```

**详细步骤：**

1. **解压 ZIP**：解压到临时目录，安全检查（防止路径遍历 `../`）
2. **定位 index.md**：ZIP 可能是 `slug/index.md`（带一层目录）或直接 `index.md`（无外层目录），两种都要支持
3. **解析 frontmatter**：使用 `python-frontmatter` 解析 `index.md`
4. **校验必填字段**：`title`、`slug`、`date` 必须存在且合法。`slug` 格式校验复用 `SLUG_PATTERN`
5. **确定目标路径**：
   - frontmatter 有 `series.id` → 目标为 `content/series/<series-id>/<slug>/`
   - 无 `series.id` → 目标为 `content/posts/<slug>/`
6. **检查冲突**：目标路径已存在且 `overwrite` 为 false → 返回 409
7. **写入文件**：将 `index.md` 和 `images/` 目录（如果有）复制到目标路径
8. **触发索引刷新**：`ContentIndex` 会在下次请求时通过 `reload_if_changed()` 自动刷新

**安全考量：**
- ZIP 解压时检查所有条目路径，拒绝包含 `..` 或绝对路径的条目
- 限制 ZIP 文件大小（建议 50MB 上限）
- 只允许已知的文件类型（`.md`、图片格式如 `.png`、`.jpg`、`.gif`、`.svg`、`.webp`）

---

#### DELETE /api/posts/<slug>

删除指定文章（删除整个 slug 目录）。

请求头：
```
Authorization: Bearer <jwt-token>
```

成功响应（200）：
```json
{
  "message": "Post deleted",
  "slug": "logistic-regression"
}
```

错误响应：
- `404`：slug 不存在

**实现要点：**
- 通过 `ContentIndex.posts_by_slug` 查找文章
- 从 `Post.source_path` 获取文件路径，取其 `.parent` 作为文章目录
- 使用 `shutil.rmtree()` 删除整个目录
- 删除后，`ContentIndex` 会在下次请求时自动刷新

---

### 1.2 新增服务文件

#### `server_flask/app/services/post_manager.py`

将上传解析和 ZIP 生成逻辑封装在独立的服务文件中，职责：

- `build_template_zip(options: NewPostOptions) -> io.BytesIO` — 生成模板 ZIP（复用 `_build_frontmatter`）
- `process_upload(zip_file, overwrite: bool, content_index: ContentIndex) -> dict` — 处理上传：解压、校验、写入、返回结果
- `delete_post(slug: str, content_index: ContentIndex) -> bool` — 删除文章目录

---

## 第二部分：前端实现

### 2.1 路由变更

修改 `blog_by_vue/src/router/index.js`：

```javascript
// 删除旧路由
// { path: "/write", name: "Write", component: () => import("@/views/Edit.vue") }

// 新增管理路由
{
  path: "/manage",
  name: "Manage",
  component: () => import("@/views/ManagePosts.vue"),
}
```

### 2.2 删除旧文件

- 删除 `blog_by_vue/src/views/Edit.vue`

### 2.3 修改 PageHeader.vue

- `goWrite()` 方法改为跳转 `/manage`（重命名为 `goManage()` 更清晰）
- 可选：将导航按钮的 tooltip 从"写文章"改为"管理"

### 2.4 新增 API 模块

#### `blog_by_vue/src/api/manage.js`

```javascript
import axios from 'axios';

export async function listManagedPosts() {
  const response = await axios.get('/api/manage/posts');
  return response.data;
}

export async function downloadTemplate(options) {
  const response = await axios.post('/api/posts/template', options, {
    responseType: 'blob',
  });
  return response;
}

export async function uploadPost(file, overwrite = false) {
  const form = new FormData();
  form.append('file', file);
  form.append('overwrite', String(overwrite));
  const response = await axios.post('/api/posts/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
}

export async function deletePost(slug) {
  const response = await axios.delete(`/api/posts/${encodeURIComponent(slug)}`);
  return response.data;
}
```

### 2.5 新增视图

#### `blog_by_vue/src/views/ManagePosts.vue`

**整页需要 TOTP 认证。** 使用 `useAuth` composable 检查认证状态，未登录时触发 `TotpDialog`。

**页面结构：**

使用 Element Plus `el-tabs` 组件切换三个功能区。

##### Tab 1 — 文章列表（默认 Tab）

- 使用 `el-table` 展示所有文章
- 列：标题、slug、日期、分类（标签形式）、系列（如有，显示系列名称）、位置（posts/series）
- 操作列：
  - 「查看」按钮 → 跳转 `/posts/:slug`
  - 「删除」按钮 → `el-popconfirm` 二次确认 → 调用 `deletePost(slug)` → 刷新列表
- 顶部可选：`el-input` 简单的客户端筛选（按标题/slug 过滤表格行）
- 表格数据通过 `GET /api/manage/posts` 获取

##### Tab 2 — 创建模板

表单字段（使用 `el-form` + `el-input` / `el-tag` 等 Element Plus 组件）：

| 字段 | 组件 | 必填 | 说明 |
|------|------|------|------|
| 标题 | `el-input` | ✅ | 文章标题 |
| slug | `el-input` | ✅ | URL 标识，自动校验格式 |
| 摘要 | `el-input` (textarea) | ❌ | 简短描述 |
| 分类 | 标签输入 | ❌ | 支持多个 |
| 标签 | 标签输入 | ❌ | 支持多个 |
| 系列 ID | `el-input` | ❌ | 可选，如 `machine-learning-basic` |
| 系列标题 | `el-input` | ❌ | 可选，系列显示名称 |
| 系列排序 | `el-input-number` | ❌ | 可选，系列内排序号 |

**交互流程：**
1. 用户填写表单
2. 前端校验 slug 格式（`/^[a-z0-9]+(?:-[a-z0-9]+)*$/`）
3. 点击「生成并下载」→ 调用 `downloadTemplate(options)` → 触发浏览器下载 ZIP
4. 下载成功后显示提示

**下载触发方式：**
```javascript
const response = await downloadTemplate(formData);
const url = URL.createObjectURL(response.data);
const a = document.createElement('a');
a.href = url;
a.download = `${formData.slug}.zip`;
a.click();
URL.revokeObjectURL(url);
```

##### Tab 3 — 上传文章

**上传区域：**
- 使用 Element Plus `el-upload` 组件，拖拽模式（`drag`）
- 支持 `.zip` 文件
- 支持文件夹上传（设置 `webkitdirectory` 属性）
  - 文件夹上传时，前端自行用 JSZip 打包为 ZIP 后再上传
- 文件大小限制：50MB

**上传后预览：**
- 上传前，前端先解析 ZIP 内的 `index.md`（使用 JSZip 在浏览器端读取）
- 提取 frontmatter 展示预览卡片：标题、slug、日期、分类、标签、系列
- 如果 slug 与已有文章冲突，显示警告并提供「覆盖」选项

**确认发布：**
- 用户确认后调用 `uploadPost(file, overwrite)` → 成功提示 → 自动切换到文章列表 Tab 并刷新

**前端依赖：**
- `jszip`（npm 包）— 用于浏览器端 ZIP 读取（预览 frontmatter）和文件夹打包

### 2.6 UI 风格要求

与 Pastebin 页面保持一致：

- 复用 `.glass-panel` class 和博客 CSS 变量
- 明暗主题通过 `[data-theme='dark']` 适配
- 使用 `.page-heading` 作为页面标题样式
- 响应式：640px 断点适配移动端
- Tab 组件使用 Element Plus 默认样式（已通过全局 CSS 覆写适配玻璃风格）

---

## 第三部分：文件变更汇总

### 新增文件

```
server_flask/
  app/
    services/
      post_manager.py         # ZIP 生成、上传解析、删除逻辑
    api/
      manage_routes.py        # 管理 API 路由（或合并到 routes.py）

blog_by_vue/
  src/
    views/
      ManagePosts.vue          # 管理页面（三 Tab 布局）
    api/
      manage.js                # 管理 API 调用封装
```

### 修改文件

```
blog_by_vue/
  src/
    router/index.js            # 删除 /write，新增 /manage
    components/PageHeader.vue  # goWrite → goManage，跳转改为 /manage

server_flask/
  app/api/__init__.py          # 注册新 Blueprint（如使用独立 Blueprint）
  app/api/routes.py            # 添加路由（如合并到现有文件）
```

### 删除文件

```
blog_by_vue/
  src/
    views/Edit.vue             # 旧编辑器页面
```

### 新增前端依赖

```
jszip                          # 浏览器端 ZIP 读取和打包
```

---

## 第四部分：实现顺序

### 阶段 1：后端 API

1. 新增 `server_flask/app/services/post_manager.py`
   - 实现 `build_template_zip()`
   - 实现 `process_upload()`
   - 实现 `delete_post()`
2. 新增管理路由（4 个端点）
3. 注册路由

**验证点：** 用 curl 测试四个端点 — 获取文章列表、下载模板 ZIP、上传 ZIP、删除文章。

### 阶段 2：前端页面

1. 安装 `jszip`
2. 新增 `src/api/manage.js`
3. 新增 `src/views/ManagePosts.vue`（三 Tab 布局）
4. 修改 `router/index.js`（删除 /write，新增 /manage）
5. 修改 `PageHeader.vue`（跳转路径更新）
6. 删除 `src/views/Edit.vue`

**验证点：** 完整流程 — 登录 → 创建模板下载 → 本地编辑 index.md → 上传 ZIP → 文章列表出现新文章 → 删除文章。

---

## 第五部分：关键实现细节

### 5.1 ZIP 上传路径判断逻辑

```python
def determine_target_dir(content_root: Path, metadata: dict) -> Path:
    """根据 frontmatter 确定文章的目标存储路径。"""
    slug = metadata["slug"]
    series = metadata.get("series")
    if series and series.get("id"):
        series_id = series["id"]
        return content_root / "series" / series_id / slug
    return content_root / "posts" / slug
```

### 5.2 ZIP 结构校验

上传的 ZIP 应包含一个文章目录，内部必须有 `index.md`，可选 `images/` 子目录。

支持两种 ZIP 结构：

```
# 结构 A：带外层目录（模板下载生成的格式）
logistic-regression/
  index.md
  images/
    sigmoid.png

# 结构 B：无外层目录（用户直接压缩内容）
index.md
images/
  sigmoid.png
```

解析逻辑应自动检测哪种结构并正确处理。

### 5.3 frontmatter 校验规则

复用 `ContentIndex._load_post()` 中的校验逻辑，上传时检查：

- `title`：必须存在且非空
- `slug`：必须存在，且匹配 `^[a-z0-9]+(?:-[a-z0-9]+)*$`
- `date`：必须存在，格式为 `YYYY-MM-DD HH:mm:ss` 或 `YYYY-MM-DD`
- 如果有 `series.order` 则必须有 `series.id`

### 5.4 覆盖更新逻辑

当 `overwrite=true` 且目标 slug 已存在时：

1. 先备份旧目录（重命名为 `<slug>.bak`）
2. 写入新内容
3. 如果写入成功，删除备份
4. 如果写入失败，从备份恢复

### 5.5 文件夹上传的前端处理

浏览器原生的文件夹上传（`webkitdirectory`）会将文件夹内的所有文件作为 FileList 返回。前端需要用 JSZip 将这些文件重新打包为 ZIP：

```javascript
import JSZip from 'jszip';

async function packFolderToZip(files) {
  const zip = new JSZip();
  for (const file of files) {
    // file.webkitRelativePath 包含相对路径如 "my-post/index.md"
    zip.file(file.webkitRelativePath, file);
  }
  return await zip.generateAsync({ type: 'blob' });
}
```

---

## 附录：现有代码关键上下文

### Post 数据模型（`server_flask/app/models/post.py`）

```python
@dataclass(frozen=True)
class Post:
    title: str
    slug: str
    date: datetime
    summary: str
    categories: list[str]
    tags: list[str]
    source_path: Path          # index.md 的完整路径
    body: str
    series: dict[str, Any] | None = None
    ...
```

`source_path` 是定位文章的关键 — 通过 `source_path.parent` 可获取文章目录路径。

### 模板 frontmatter 生成（`server_flask/app/services/post_template.py`）

`_build_frontmatter(options, title, slug)` 函数已封装好 frontmatter 生成逻辑，支持 title、slug、date、summary、categories、tags、series 全部字段。`build_template_zip()` 应直接复用此函数。

### Slug 校验正则（`server_flask/app/services/post_template.py`）

```python
SLUG_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
```

### 鉴权装饰器（`server_flask/app/services/auth.py`）

```python
from app.services.auth import require_auth

@api_bp.route('/manage/posts', methods=['GET'])
@require_auth
def list_managed_posts():
    ...
```

### 内容索引刷新

`ContentIndex.reload_if_changed()` 通过文件系统签名自动检测变更。上传或删除文章后，无需手动调用 reload — 下一次 API 请求会自动触发。

### 现有前端技术栈

- Vue 3（Composition API, `<script setup>`）
- Vue Router（Hash 模式，`createWebHashHistory`）
- Axios（自动携带 JWT via interceptor）
- Element Plus（已全局配置玻璃样式覆写）
- `useAuth` composable（鉴权状态管理）
- `TotpDialog` 组件（TOTP 验证弹窗）

### CSS 变量速查

```css
--blog-surface, --blog-surface-hover    /* 玻璃面板背景 */
--blog-text, --blog-subtle, --blog-muted /* 文字层次 */
--blog-border, --blog-border-strong     /* 边框 */
--blog-accent                           /* 强调色 */
--glass-blur, --glass-shadow            /* 玻璃效果 */
--radius-sm/md/lg                       /* 圆角 */
```

`.glass-panel` class 提供完整的玻璃面板效果。`.page-heading` 提供统一的页面标题样式。
