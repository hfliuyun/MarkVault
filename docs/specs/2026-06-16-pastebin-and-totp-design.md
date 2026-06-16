# TOTP 鉴权系统 + Pastebin 剪贴板功能设计

> 实施状态：已按阶段落地。当前实现复用现有 `api_bp`，新增 TOTP/JWT 鉴权、Paste 文件存储、前端登录弹窗、Paste 创建页和公开查看页。

## 概述

为 MarkVault 博客添加两个新子系统：

1. **TOTP 鉴权** — 基于时间的一次性密码验证，作为管理员认证的统一方案
2. **Pastebin 剪贴板** — 跨设备的文本/代码同步工具，集成在博客中

两者的关系：TOTP 鉴权是基础设施，Pastebin 的创建/删除操作依赖它。后续的文章上传功能也将复用同一套鉴权。

### 背景

- 项目不使用数据库，所有数据以文件系统存储（Markdown 文件为唯一真相源）
- 不希望为鉴权引入用户系统/数据库
- Pastebin 的核心场景是在 Mac 和 Windows 之间同步文本/代码片段
- 博客前端使用 macOS 液态玻璃（Liquid Glass）风格，有明暗双主题

### 设计原则

- 与现有博客系统集成，共用 Flask 后端和 Vue 前端
- 文件系统存储，无数据库依赖
- 前端复用现有 CSS 变量和玻璃质感组件风格
- TOTP 鉴权可被多个功能模块复用

---

## 第一部分：TOTP 鉴权系统

### 1.1 工作流程

```
首次部署:
  CLI 命令 → 生成 TOTP 密钥 → 显示二维码 → 用户扫码绑定 Authenticator APP

日常使用:
  前端需要管理操作 → 检查 JWT → 无效/过期 → 弹出 TOTP 验证框
  → 用户输入 6 位动态密码 → 后端验证 → 签发 JWT (2小时有效)
  → 后续请求自动带 JWT，无需重复验证
```

### 1.2 密钥存储

```
server_flask/
  data/
    auth/
      totp_secret.key    # TOTP 密钥文件，纯文本存储 base32 编码的密钥
```

> **安全要求：** `server_flask/data/` 目录必须加入 `.gitignore`，不能提交到版本控制。

### 1.3 后端实现

#### 新增依赖（添加到 `server_flask/requirements.txt`）

```
pyotp       # TOTP 生成与验证
PyJWT       # JWT token 签发与验证
qrcode[pil] # 二维码生成（CLI setup 命令用）
```

#### 新增服务文件：`server_flask/app/services/auth.py`

职责：

- `generate_totp_secret()` — 生成新的 TOTP 密钥，保存到 `data/auth/totp_secret.key`
- `get_totp_secret()` — 读取已保存的密钥，不存在时抛出错误
- `verify_totp(code: str) -> bool` — 验证 6 位动态密码。使用 `pyotp.TOTP`，建议 `valid_window=1` 允许前后 30 秒的误差
- `create_jwt(expires_hours: int = 2) -> str` — 签发 JWT，payload 包含 `{"role": "admin", "exp": ...}`。签名密钥使用 TOTP 密钥本身或单独的环境变量 `JWT_SECRET`
- `verify_jwt(token: str) -> bool` — 验证 JWT 是否有效且未过期
- `get_provisioning_uri() -> str` — 生成用于二维码扫描的 otpauth:// URI，issuer 设为 `"MarkVault"`

#### 新增路由文件：`server_flask/app/api/auth_routes.py`

| 方法 | 路径 | 鉴权 | 请求体 | 响应 |
|------|------|------|--------|------|
| `POST` | `/api/auth/verify` | 公开 | `{"code": "123456"}` | 成功：`{"token": "jwt...", "expires_in": 7200}`；失败：`{"error": "Invalid code"}`, 401 |
| `GET` | `/api/auth/status` | Bearer JWT | — | 有效：`{"authenticated": true}`；无效：`{"authenticated": false}`, 401 |

#### 鉴权装饰器

在 `auth.py` 中实现 `require_auth` 装饰器，供其他路由使用：

```python
from functools import wraps
from flask import request, jsonify

def require_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get('Authorization', '').replace('Bearer ', '')
        if not token or not verify_jwt(token):
            return jsonify({"error": "Authentication required"}), 401
        return f(*args, **kwargs)
    return decorated
```

#### Blueprint 注册

在 `server_flask/app/api/auth_routes.py` 中创建新的 Blueprint `auth_bp`，或将路由添加到现有的 `api_bp`。如果创建新的 Blueprint，需要在 `server_flask/app/__init__.py` 中注册：

```python
from .api.auth_routes import auth_bp
app.register_blueprint(auth_bp, url_prefix='/api/auth')
```

也可以直接在现有的 `api_bp` 中添加路由（更简单，路径为 `/api/auth/verify` 和 `/api/auth/status`）。两种方式均可，保持与项目现有风格一致即可。

### 1.4 CLI 命令扩展

在 `manage.py` 中新增两个子命令：

#### `setup_totp`

```bash
python manage.py setup_totp
```

行为：

1. 检查 `data/auth/totp_secret.key` 是否已存在，若存在则提示并退出（需要先 `reset_totp`）
2. 调用 `generate_totp_secret()` 生成密钥并保存
3. 生成 otpauth:// URI，在终端显示二维码（使用 `qrcode` 库的终端输出）
4. 同时输出密钥字符串（手动输入用）
5. 提示用户扫码后输入一次验证码进行确认

#### `reset_totp`

```bash
python manage.py reset_totp
```

行为：

1. 删除旧的 `data/auth/totp_secret.key`
2. 执行 `setup_totp` 的流程生成新密钥

### 1.5 前端实现

#### 新增组件：`blog_by_vue/src/components/TotpDialog.vue`

全局可复用的 TOTP 验证对话框组件。

**Props:**

- `visible: Boolean` — 控制显示/隐藏（v-model）

**Emits:**

- `authenticated` — 验证成功，携带 JWT token
- `cancelled` — 用户取消

**内部逻辑：**

1. 显示 6 个独立的数字输入格（每格一个字符，自动跳转下一格）
2. 输满 6 位后自动提交，或点击「验证」按钮提交
3. 调用 `POST /api/auth/verify` 发送验证码
4. 成功：将 JWT 存入 `localStorage`（key: `markvault_jwt`），emit `authenticated`
5. 失败：显示错误提示，清空输入框，允许重试

**UI 风格：**

- 使用 `el-dialog` 作为弹窗容器（复用已有的 Element Plus 玻璃效果覆写样式）
- 6 个输入格用独立的 `<input>` 元素，等宽等高，居中排列
- 配色跟随博客主题变量（`--blog-surface`、`--blog-text`、`--blog-border` 等）

#### 新增前端工具：`blog_by_vue/src/composables/useAuth.js`

封装鉴权逻辑的 Vue composable：

```javascript
// 导出的接口：
export function useAuth() {
  return {
    isAuthenticated,    // ref<boolean> - 当前是否已认证
    token,              // ref<string|null> - 当前 JWT
    checkAuth(),        // 检查本地 JWT 是否有效（调用 /api/auth/status）
    requireAuth(),      // 如果未认证，触发 TOTP 对话框，返回 Promise<string>
    clearAuth(),        // 清除本地 JWT
  }
}
```

**JWT 存储与自动携带：**

- JWT 存储在 `localStorage`，key 为 `markvault_jwt`
- 配置 axios interceptor，自动在请求头添加 `Authorization: Bearer <token>`
- 401 响应时自动清除本地 JWT

---

## 第二部分：Pastebin 剪贴板

### 2.1 数据模型

#### 存储结构

```
server_flask/
  data/
    pastes/
      <paste-id>.json     # 每个 paste 一个独立 JSON 文件
```

#### 单个 Paste 的 JSON 结构

```json
{
  "id": "a1b2c3d4",
  "title": "config.yaml 片段",
  "content": "server:\n  port: 8080\n  host: 0.0.0.0",
  "language": "yaml",
  "created_at": "2026-06-16T23:00:00+08:00",
  "expires_at": "2026-06-17T23:00:00+08:00"
}
```

字段说明：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | 是 | 6-8 位随机字符（nanoid 风格，字母+数字） |
| `title` | string | 否 | 用户自定义标题，为空时前端显示内容前 30 字符 |
| `content` | string | 是 | 文本/代码内容 |
| `language` | string | 否 | 语法高亮语言标识（如 `python`、`yaml`），默认 `"text"` |
| `created_at` | string | 是 | ISO 8601 格式创建时间 |
| `expires_at` | string \| null | 是 | ISO 8601 格式过期时间，`null` 表示永不过期 |

#### ID 生成

使用 Python `secrets` 模块生成随机 ID：

```python
import secrets
import string

def generate_paste_id(length=8):
    alphabet = string.ascii_lowercase + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(length))
```

### 2.2 后端实现

#### 新增服务文件：`server_flask/app/services/paste.py`

职责：

- `create_paste(content, title, language, expires_in) -> dict` — 创建 paste，生成 ID，计算过期时间，写入 JSON 文件，返回 paste 数据
- `get_paste(paste_id) -> dict | None` — 读取 paste，若已过期则删除文件并返回 None
- `list_pastes() -> list[dict]` — 列出所有未过期的 paste（读取 `data/pastes/` 下所有 JSON），按创建时间倒序
- `delete_paste(paste_id) -> bool` — 删除指定 paste 文件
- `cleanup_expired() -> int` — 扫描并删除所有过期 paste，返回删除数量

#### 过期清理策略

采用**惰性清理 + 主动清理**双策略：

1. **惰性清理：** `get_paste()` 读取时检查过期，过期则删除并返回 404
2. **主动清理：** `list_pastes()` 调用时顺便清理过期内容；也可通过 CLI 命令手动触发

不需要后台定时任务，因为每次列表请求自然会清理。

#### 新增路由（添加到 `server_flask/app/api/routes.py` 或新建 `paste_routes.py`）

| 方法 | 路径 | 鉴权 | 请求体/参数 | 响应 |
|------|------|------|-------------|------|
| `POST` | `/api/paste` | `@require_auth` | `{"content": "...", "title": "可选", "language": "python", "expires_in": "1d"}` | `{"id": "a1b2c3d4", "url": "/paste/a1b2c3d4", ...}` |
| `GET` | `/api/paste/<id>` | 公开 | — | paste 数据或 404 |
| `GET` | `/api/pastes` | `@require_auth` | — | `{"pastes": [...]}` 所有未过期 paste 列表 |
| `DELETE` | `/api/paste/<id>` | `@require_auth` | — | `{"message": "Deleted"}` 或 404 |

#### `expires_in` 参数格式

支持以下值：`"1h"`（1小时）、`"1d"`（1天）、`"1w"`（1周）、`"never"`（永不过期）。

后端解析逻辑：

```python
from datetime import datetime, timedelta

EXPIRY_MAP = {
    "1h": timedelta(hours=1),
    "1d": timedelta(days=1),
    "1w": timedelta(weeks=1),
    "never": None,
}

def parse_expiry(expires_in: str) -> datetime | None:
    delta = EXPIRY_MAP.get(expires_in)
    if delta is None and expires_in != "never":
        raise ValueError(f"Invalid expires_in: {expires_in}")
    return datetime.now().astimezone() + delta if delta else None
```

### 2.3 前端实现

#### 新增路由（添加到 `blog_by_vue/src/router/index.js`）

```javascript
{
  path: "/paste",
  name: "PasteHome",
  component: () => import("@/views/PasteHome.vue"),
},
{
  path: "/paste/:id",
  name: "PasteView",
  component: () => import("@/views/PasteView.vue"),
},
```

#### 新增 API 模块：`blog_by_vue/src/api/paste.js`

```javascript
import axios from 'axios';

export async function createPaste({ content, title, language, expires_in }) {
  const response = await axios.post('/api/paste', { content, title, language, expires_in });
  return response.data;
}

export async function getPaste(id) {
  const response = await axios.get(`/api/paste/${encodeURIComponent(id)}`);
  return response.data;
}

export async function listPastes() {
  const response = await axios.get('/api/pastes');
  return response.data;
}

export async function deletePaste(id) {
  const response = await axios.delete(`/api/paste/${encodeURIComponent(id)}`);
  return response.data;
}
```

#### 新增视图：`blog_by_vue/src/views/PasteHome.vue`

**极简单页布局：** 创建和列表在同一页面。

页面结构（从上到下）：

1. **标题区** — 使用 `.page-heading` 样式，标题"剪贴板"
2. **编辑区** — 玻璃面板（`.glass-panel`）内：
   - 可选标题输入框
   - 代码/文本输入区（使用 `<textarea>` 或集成一个轻量代码编辑器）
   - 工具栏：语言选择下拉框、过期时间下拉框、「创建 Paste」按钮
3. **最近列表** — 玻璃面板内展示已有 paste：
   - 每行显示：语言标签、标题/摘要、创建时间、剩余时间、复制链接按钮、删除按钮
   - 点击行跳转到 `/paste/:id`
   - 列表仅在已认证时显示（需要调用 `GET /api/pastes`）

**交互流程：**

1. 页面加载 → 调用 `useAuth().checkAuth()` 检查认证状态
2. 已认证 → 加载 paste 列表
3. 未认证 → 编辑区仍可见（但创建按钮点击时触发 TOTP 验证），列表区显示"登录后查看"
4. 点击「创建 Paste」→ 如未认证则先触发 `TotpDialog` → 认证后调用 `POST /api/paste` → 成功后刷新列表并显示成功提示（带可复制的分享链接）
5. 删除 → 调用 `DELETE /api/paste/:id` → 从列表中移除

#### 新增视图：`blog_by_vue/src/views/PasteView.vue`

**公开的只读查看页。**

页面结构：

1. **信息栏** — 标题、创建时间、剩余有效时间、语言标签
2. **操作按钮** — 「复制内容」、「查看 Raw 文本」（`/api/paste/:id` 直接获取原始内容）
3. **代码展示区** — 使用 highlight.js 渲染语法高亮，带行号
4. **过期处理** — 如果 paste 已过期或不存在，显示友好的 404 提示

#### 语法高亮

使用 [highlight.js](https://highlightjs.org/) 实现前端语法高亮：

- 安装：`npm install highlight.js`
- 在 `PasteView.vue` 和 `PasteHome.vue` 中按需导入
- 主题选择：随博客明暗主题切换（亮色用 `github`，暗色用 `github-dark` 或类似主题）
- 语言检测：优先使用用户选择的语言，其次使用 highlight.js 的自动检测

### 2.4 UI 风格要求

所有 Pastebin 相关页面必须遵循现有博客的视觉规范：

- **复用 CSS 变量** — `--blog-surface`、`--blog-text`、`--blog-border`、`--blog-accent`、`--glass-blur`、`--glass-shadow` 等
- **玻璃面板** — 使用 `.glass-panel` class 或同等样式（`backdrop-filter`、半透明背景、方向性边框）
- **明暗主题** — 通过 `[data-theme='dark']` 选择器适配，不能写死颜色
- **字体** — 正文用 `var(--blog-font)`（Inter），代码区用等宽字体（如 `'Fira Code', 'JetBrains Mono', monospace`）
- **圆角** — 使用 `var(--radius-sm/md/lg)`
- **响应式** — 640px 断点下适配移动端

---

## 第三部分：文件与目录变更汇总

### 新增文件

```
server_flask/
  app/
    services/
      auth.py              # TOTP + JWT 鉴权服务
      paste.py             # Paste CRUD + 过期清理服务
    api/
      auth_routes.py       # 鉴权 API 路由（或合并到 routes.py）
      paste_routes.py      # Paste API 路由（或合并到 routes.py）
  data/                    # 运行时数据目录（.gitignore 排除）
    auth/
      totp_secret.key
    pastes/
      <id>.json

blog_by_vue/
  src/
    views/
      PasteHome.vue        # Paste 创建+列表页
      PasteView.vue        # Paste 只读查看页
    components/
      TotpDialog.vue       # TOTP 验证弹窗（全局可复用）
    composables/
      useAuth.js           # 鉴权状态管理 composable
    api/
      paste.js             # Paste API 调用封装
      auth.js              # Auth API 调用封装
```

### 修改文件

```
server_flask/
  requirements.txt              # 添加 pyotp、PyJWT、qrcode[pil]
  app/__init__.py               # 注册新 Blueprint（如果使用独立 Blueprint）
  app/api/routes.py             # 添加路由（如果合并到现有文件）

blog_by_vue/
  src/router/index.js           # 添加 /paste 和 /paste/:id 路由
  src/main.js                   # 添加 axios interceptor（JWT 自动携带）

manage.py                       # 添加 setup_totp 和 reset_totp 子命令

.gitignore                      # 添加 server_flask/data/
```

---

## 第四部分：实现顺序

建议按以下顺序实现，每步可独立验证：

### 阶段 1：TOTP 鉴权后端

1. 安装依赖（`pyotp`、`PyJWT`、`qrcode[pil]`）
2. 实现 `server_flask/app/services/auth.py`
3. 实现 `server_flask/app/api/auth_routes.py`
4. 注册 Blueprint / 路由
5. 扩展 `manage.py` 添加 `setup_totp` 和 `reset_totp` 命令

**验证点：** 运行 `python manage.py setup_totp`，扫码绑定后用 curl 测试 `/api/auth/verify`。

### 阶段 2：TOTP 鉴权前端

1. 实现 `TotpDialog.vue` 组件
2. 实现 `useAuth.js` composable
3. 实现 `src/api/auth.js`
4. 配置 axios interceptor
5. 在 PageHeader.vue 的登录按钮（已有的 `goLogin`）中接入 TOTP 验证

**验证点：** 点击登录按钮 → 弹出验证框 → 输入动态密码 → 成功提示。

### 阶段 3：Pastebin 后端

1. 实现 `server_flask/app/services/paste.py`
2. 实现 `server_flask/app/api/paste_routes.py`（使用 `@require_auth` 装饰器）
3. 注册路由

**验证点：** 先用 curl 获取 JWT，然后用 curl 测试 paste 的 CRUD 操作。

### 阶段 4：Pastebin 前端

1. 安装 `highlight.js`
2. 实现 `src/api/paste.js`
3. 实现 `PasteHome.vue`
4. 实现 `PasteView.vue`
5. 添加路由到 `router/index.js`

**验证点：** 完整流程 — 认证 → 创建 paste → 复制链接 → 新窗口打开查看 → 删除。

---

## 第五部分：API 接口完整参考

### 鉴权接口

#### POST /api/auth/verify

验证 TOTP 动态密码，签发 JWT。

请求：
```json
{
  "code": "123456"
}
```

成功响应（200）：
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "expires_in": 7200
}
```

失败响应（401）：
```json
{
  "error": "Invalid code"
}
```

#### GET /api/auth/status

检查当前 JWT 是否有效。

请求头：
```
Authorization: Bearer <jwt-token>
```

成功响应（200）：
```json
{
  "authenticated": true
}
```

失败响应（401）：
```json
{
  "authenticated": false
}
```

### Paste 接口

#### POST /api/paste

创建新的 paste。需要认证。

请求头：
```
Authorization: Bearer <jwt-token>
```

请求体：
```json
{
  "content": "print('hello world')",
  "title": "测试脚本",
  "language": "python",
  "expires_in": "1d"
}
```

`expires_in` 可选值：`"1h"`、`"1d"`、`"1w"`、`"never"`。默认 `"1d"`。

`title` 可选，为空时前端可用内容前 30 字符作为显示标题。

`language` 可选，默认 `"text"`。

成功响应（201）：
```json
{
  "id": "a1b2c3d4",
  "title": "测试脚本",
  "content": "print('hello world')",
  "language": "python",
  "created_at": "2026-06-16T23:00:00+08:00",
  "expires_at": "2026-06-17T23:00:00+08:00",
  "url": "/paste/a1b2c3d4"
}
```

#### GET /api/paste/:id

获取单个 paste。公开访问，无需认证。

成功响应（200）：
```json
{
  "id": "a1b2c3d4",
  "title": "测试脚本",
  "content": "print('hello world')",
  "language": "python",
  "created_at": "2026-06-16T23:00:00+08:00",
  "expires_at": "2026-06-17T23:00:00+08:00"
}
```

过期或不存在（404）：
```json
{
  "error": "Paste not found or expired"
}
```

#### GET /api/pastes

列出所有未过期的 paste。需要认证。

成功响应（200）：
```json
{
  "pastes": [
    {
      "id": "a1b2c3d4",
      "title": "测试脚本",
      "language": "python",
      "created_at": "2026-06-16T23:00:00+08:00",
      "expires_at": "2026-06-17T23:00:00+08:00"
    }
  ]
}
```

注意：列表接口的响应**不包含** `content` 字段，减少数据传输量。

#### DELETE /api/paste/:id

删除指定 paste。需要认证。

成功响应（200）：
```json
{
  "message": "Paste deleted"
}
```

不存在（404）：
```json
{
  "error": "Paste not found"
}
```

---

## 附录：现有项目关键上下文

供实现时参考，避免需要反复查阅源码。

### 项目目录结构

```
MarkVault/
  blog_by_vue/              # Vue 3 前端
    src/
      api/                  # API 调用模块（axios 封装）
      components/           # 共享组件（PageHeader.vue 等）
      composables/          # Vue composables
      router/index.js       # 路由配置（createWebHashHistory）
      views/                # 页面视图
      style.css             # 全局样式（CSS 变量定义）
      main.js               # 入口文件
      App.vue               # 根组件
  server_flask/             # Flask 后端
    app/
      __init__.py           # Flask app factory（create_app）
      api/
        __init__.py          # api_bp Blueprint 定义
        routes.py            # API 路由
      services/              # 业务逻辑层
    utils/                   # 工具函数
    requirements.txt
    run.py                   # Flask 启动入口
  manage.py                  # CLI 管理命令
  content/                   # 博客内容目录（.gitignore 排除）
```

### 前端技术栈

- Vue 3（Composition API，`<script setup>`）
- Vue Router（Hash 模式）
- Axios（HTTP 请求）
- Element Plus（UI 组件库，已全局配置玻璃样式覆写）
- 字体：Inter（Google Fonts）

### 后端技术栈

- Flask
- python-frontmatter（Markdown metadata 解析）
- Blueprint 注册在 `/api` 前缀下

### CSS 变量速查

```css
/* 表面/背景 */
--blog-bg, --blog-surface, --blog-surface-hover

/* 文字 */
--blog-text, --blog-subtle, --blog-muted

/* 边框 */
--blog-border, --blog-border-strong

/* 强调色 */
--blog-accent          /* 亮: #0066cc, 暗: #2997ff */

/* 玻璃效果 */
--glass-shadow, --glass-blur, --glass-border-tl, --glass-border-br

/* 圆角 */
--radius-sm: 8px, --radius-md: 12px, --radius-lg: 20px

/* 字体 */
--blog-font: 'Inter', -apple-system, ...
```

### 现有 `.glass-panel` class

直接使用此 class 即可获得完整的玻璃面板效果（含 hover 状态和暗色模式适配）。

### PageHeader 中已有的空登录方法

`PageHeader.vue` 第 73 行已有空的 `goLogin` 方法和登录按钮（User 图标），可直接接入 TOTP 验证流程。
