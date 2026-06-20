# Notion Sync V2：图片缓存 + 防抖 + 冲突保护

## 背景与问题

当前 Phase 1 已实现"本地 Markdown → Notion"的同步，核心逻辑在 [notion_sync.py](file:///Users/yun/code/MarkVault/server_flask/app/services/notion_sync.py) 和 [mistletoe_notion.py](file:///Users/yun/code/MarkVault/server_flask/app/services/mistletoe_notion.py)。

现有流程：
1. 扫描所有 `index.md`，用 MD5 content hash 判断内容是否变化
2. 若变化：`clear_page_blocks()` 删除 Notion 页面所有 blocks → 重新转换 Markdown → `append_page_blocks()` 全量重建
3. 每张图片每次都调用 Notion File Upload API 重新上传二进制文件

**问题**：
- 图片重新上传是最大的资源浪费——二进制传输 + 两步 API 调用（创建 upload → POST 文件），且图片内容极少变化
- 编辑窗口期内（发布后 1-2 天）多次小修改会触发多次全量重建
- 无冲突保护——如果在 Notion 端手动编辑了内容，下次同步会无警告覆盖

## 设计目标

在保持"本地 Markdown 为主源、正文全量重建"的简洁架构前提下，通过三个正交优化显著减少资源浪费：

1. **图片缓存**：避免未变化图片的重复上传
2. **防抖合并**：编辑窗口期内延迟执行，只同步最终状态
3. **冲突保护**：检测 Notion 端人工编辑，避免意外覆盖

## 状态存储策略

### 原则：Markdown 只存身份，机器状态全部外置

Markdown frontmatter **只保留** `notion.page_id`（和可选的 `sync_enabled`），所有同步机器状态存放在集中式 sidecar 文件中。

**frontmatter**（内容文件内，用户可见）：
```yaml
notion:
  page_id: "notion-page-xxx"
```

**同步状态文件** `server_flask/data/notion_sync_state.json`（gitignored）：
```json
{
  "posts/my-post/index.md": {
    "content_hash": "md5-of-metadata-plus-body",
    "synced_at": "2026-06-20T12:00:00+00:00",
    "notion_last_edited_time": "2026-06-20T12:00:05.000Z",
    "page_id": "notion-page-xxx"
  }
}
```

**图片缓存文件** `server_flask/data/notion_image_cache.json`（gitignored）：
```json
{
  "posts/my-post/images/arch.png": {
    "content_hash": "a1b2c3d4e5f6...",
    "file_upload_id": "notion-file-upload-xxx",
    "uploaded_at": "2026-06-20T12:00:00+00:00"
  }
}
```

两个文件都在 `server_flask/data/`，该目录已在 `.gitignore` 中，不会提交到 Git。

### 迁移兼容

现有文章的 frontmatter 可能已包含 `notion.synced_at` 和 `notion.content_hash`。同步时检测到这些字段后：
1. 将其迁移到 `notion_sync_state.json`
2. 从 frontmatter 中移除这些字段，只保留 `notion.page_id`
3. 回写清理后的 frontmatter（仅迁移时触发一次）

## 详细设计

### 1. 图片缓存系统

#### 缓存查找流程

```
图片需要上传?
  ├─ 缓存中有此路径的记录?
  │   ├─ 本地文件 hash == 缓存 hash?
  │   │   ├─ YES → 直接用缓存的 file_upload_id（跳过上传）
  │   │   └─ NO  → 图片内容变了，重新上传，更新缓存
  │   └─ NO → 首次遇到此图片，上传并写入缓存
  └─ 文件不存在 → 跳过，打印警告
```

#### 优雅降级与重试策略

由于 `append_page_blocks()` 是批量操作（最多 100 个 blocks），如果某个缓存的 `file_upload_id` 已失效，整个 append 请求会失败。

**重试流程**：
1. 首次 `append_page_blocks()` 失败，且错误信息包含 file 相关错误
2. 清除**该文章所有图片**的缓存条目
3. 重新执行 `convert_to_notion_blocks()`，所有图片走全新上传
4. 重试 `append_page_blocks()` 一次
5. 第二次仍失败 → 记录错误，跳过该文章

这个策略牺牲了精确定位（不逐图排查哪个失效），换来了实现简洁和可靠的恢复。

#### 接口设计

`mistletoe_notion.py` 不需要修改。缓存逻辑封装在调用方注入的 `upload_callback` 中：

```python
# 调用方注入带缓存的回调
def make_image_upload_callback(file_path, content_root, image_cache, service):
    def handle_image_upload(src):
        abs_path = file_path.parent / src
        rel_path = str(abs_path.relative_to(content_root))
        return image_cache.get_or_upload(rel_path, str(abs_path), service)
    return handle_image_upload
```

### 2. 防抖机制（真正的延迟合并）

#### 问题

`ContentIndex.reload()` 每次检测到文件变化就调用 `sync_local_to_notion_async()`。冷却期内如果只是跳过（`continue`），由于 `content_signature` 已更新，`reload_if_changed()` 不会再触发，最后一次编辑永远不会同步。

#### 方案：`threading.Timer` 延迟合并

用 `threading.Timer` 实现真正的 debounce：每次收到同步请求时，取消上一次的定时器，重新设置一个新定时器。只有在一段时间没有新变化后，定时器触发实际同步。

```python
import threading
import time

SYNC_DEBOUNCE_SECONDS = 30 * 60  # 30 分钟

_sync_timer: threading.Timer | None = None
_sync_timer_lock = threading.Lock()

def sync_local_to_notion_async(content_root: Path):
    """延迟合并的异步同步入口。每次调用重置定时器。"""
    token = os.environ.get("NOTION_API_TOKEN")
    database_id = os.environ.get("NOTION_DATABASE_ID")
    if not token or not database_id:
        return

    global _sync_timer
    with _sync_timer_lock:
        # 取消上一次还没执行的定时器
        if _sync_timer is not None:
            _sync_timer.cancel()

        # 重新设置定时器
        _sync_timer = threading.Timer(
            SYNC_DEBOUNCE_SECONDS,
            _run_debounced_sync,
            args=(content_root, token, database_id)
        )
        _sync_timer.daemon = True
        _sync_timer.start()

SYNC_RETRY_DELAY_SECONDS = 60  # 锁忙时重试延迟

def _schedule_sync(delay, content_root, token, database_id):
    """统一的定时器调度。所有 debounce 和 retry 都走同一个全局 _sync_timer，
    避免堆积多个 pending timer。"""
    global _sync_timer
    with _sync_timer_lock:
        if _sync_timer is not None:
            _sync_timer.cancel()
        _sync_timer = threading.Timer(
            delay, _run_debounced_sync,
            args=(content_root, token, database_id)
        )
        _sync_timer.daemon = True
        _sync_timer.start()

def _run_debounced_sync(content_root, token, database_id):
    """定时器触发后执行的实际同步。锁忙时短延迟重试。"""
    if not _sync_lock.acquire(blocking=False):
        # 另一个同步正在运行，通过统一调度器设置重试
        _schedule_sync(SYNC_RETRY_DELAY_SECONDS, content_root, token, database_id)
        return
    try:
        sync_local_to_notion(content_root, token, database_id)
    finally:
        _sync_lock.release()
```

`sync_local_to_notion_async()` 中的定时器设置也改为调用 `_schedule_sync(SYNC_DEBOUNCE_SECONDS, ...)`。

#### 行为特征

| 场景 | 行为 |
|---|---|
| 用户编辑一次后不再改动 | 30 分钟后自动同步 |
| 用户 10 分钟内改了 5 次 | 每次重置定时器，最后一次改动后 30 分钟同步 |
| 定时器触发时同步锁被占用 | 60 秒后自动重试，不丢弃 |
| `manage.py notion_sync` 手动触发 | 立即同步，不走防抖 |
| `manage.py notion_sync --no-cooldown` | 同上，立即同步 |
| 服务重启 | 定时器丢失，下次 reload 时重新设置定时器 |

#### 首次同步（新文章）

首次创建的文章（无 `page_id`）仍走防抖流程。理由：
- 新文章创建后用户可能立即开始编辑
- 30 分钟后同步可以避免多次创建页面的风险
- 如果用户想立即看到 Notion 上的效果，使用 `manage.py notion_sync` 手动触发

### 3. Notion 端编辑冲突保护

#### 方案：等值比较 Notion 自身时间戳

同步成功后，记录 Notion 返回的 `last_edited_time` 到 sidecar。下次同步前，获取当前的 `last_edited_time`，做等值比较。

```python
def get_page_info(self, page_id: str) -> dict | None:
    """获取 Notion 页面信息（含 last_edited_time）"""
    resp = requests.get(
        f"{NOTION_API_URL}/pages/{page_id}",
        headers=self.headers
    )
    if resp.status_code != 200:
        return None
    data = resp.json()
    return {
        "last_edited_time": data.get("last_edited_time"),
        "archived": data.get("archived", False)
    }
```

#### 冲突判断逻辑

```
已有 page_id?
  ├─ YES → sidecar 中有该文章的 notion_last_edited_time 记录?
  │   ├─ YES → 获取当前 Notion last_edited_time
  │   │   ├─ 当前值 == 记录值? → 安全，正常同步
  │   │   └─ 当前值 != 记录值? → Notion 端有人工编辑
  │   │       ├─ --force-overwrite?  → 覆盖，打印警告
  │   │       └─ 正常模式?          → 跳过此文章，打印冲突提示
  │   └─ NO → unknown remote state（sidecar 丢失/VPS 重装）
  │       → 自动 adopt：获取 Notion last_edited_time，记录到 sidecar
  │       → **不记录 content_hash**（确保下次同步检测到 hash 不匹配，触发正文同步）
  │       → 只更新 properties（轻量 PATCH），跳过正文重建
  │       → 打印提示信息
  │       → 需要 --force-overwrite 才执行完整正文同步
  └─ NO → 新建流程，无需冲突检查
```

**关键**：冲突检查必须在 `update_page(props)` **之前**执行。因为 `update_page` 本身会改变 `last_edited_time`，检查要在任何写操作之前完成。

冲突提示信息：
```
CONFLICT: "文章标题" has been edited in Notion since last sync.
  Notion last_edited_time: 2026-06-20T15:00:05.000Z (current)
  Recorded after sync:     2026-06-20T12:00:05.000Z
  Use --force-overwrite to overwrite Notion changes.
  Skipping this article.
```

Sidecar 丢失时的提示信息：
```
ADOPT: "文章标题" has page_id but no sync state recorded.
  Adopting current Notion state. Properties updated, body sync skipped.
  Use --force-overwrite to force full sync including body.
```

### 4. CLI 参数设计

将 `--force` 拆分为两个独立参数，避免语义重载：

| 参数 | 作用 | 风险等级 |
|---|---|---|
| `--no-cooldown` | 跳过防抖延迟，立即同步所有有变化的文章 | 低（只是提前执行） |
| `--force-overwrite` | 忽略 Notion 端冲突，强制覆盖 | 高（可能丢失 Notion 编辑） |

```python
notion_sync = subparsers.add_parser("notion_sync", ...)
notion_sync.add_argument("--no-cooldown", action="store_true",
    help="Skip debounce delay, sync immediately.")
notion_sync.add_argument("--force-overwrite", action="store_true",
    help="Overwrite Notion pages even if edited since last sync.")
notion_sync.add_argument("--content-root", type=Path,
    help="Content root. Defaults to BLOG_CONTENT_ROOT or ./content.")
```

注意：`manage.py notion_sync`（无参数）默认就是立即同步、不走防抖（防抖只作用于自动触发）。`--no-cooldown` 实际上只在将来可能的定时任务场景下有意义。当前阶段手动调用默认就是立即执行。

### 5. 完整同步流程（优化后）

```
对每篇文章:
  1. 解析 frontmatter，获取 page_id
  2. 迁移检查：frontmatter 有旧字段（synced_at/content_hash）? → 迁移到 sidecar，清理 frontmatter
  3. 从 sidecar 读取同步状态（content_hash, notion_last_edited_time）
  4. 计算当前 content_hash
  5. hash 未变? → 跳过（已有逻辑）
  6. 已有 page_id?
     │  YES → sidecar 有 notion_last_edited_time?
     │   │  YES → 获取 Notion 页面 last_edited_time，等值比较
     │   │         不等 且 非 --force-overwrite? → 跳过，打印冲突
     │   │  NO  → unknown remote state（sidecar 丢失）
     │   │         → 获取并记录 Notion last_edited_time
     │   │         → 只更新 properties，跳过正文
     │   │         → 非 --force-overwrite? → 打印 ADOPT 提示，continue
     │  NO  → 新建流程
  7. 构建 properties
  8. 转换 Markdown → Notion blocks（图片走缓存回调）
  9. 创建 or 更新:
     │  新建: create_page(props, children=blocks)
     │  更新: update_page(props) → clear_blocks() → append_blocks()
     │         append 失败且为 file 相关错误?
     │           → 清除该文章图片缓存 → 重新转换 → 重试一次
 10. 获取 Notion 返回的 last_edited_time
 11. 更新 sidecar（content_hash, synced_at, notion_last_edited_time）
 12. 回写 frontmatter（仅首次写入 page_id，或迁移清理旧字段时）
 13. 保存图片缓存和同步状态到磁盘
```

## 文件变更清单

### 新增文件

| 文件 | 说明 |
|---|---|
| `server_flask/app/services/notion_image_cache.py` | 图片缓存管理类：加载/保存 JSON、hash 计算、get_or_upload、按文章清除 |
| `server_flask/app/services/notion_sync_state.py` | 同步状态管理类：加载/保存 JSON、读取/更新单篇文章的同步状态 |
| `server_flask/test_notion_image_cache.py` | 图片缓存单元测试：cache hit/miss、hash 变化、降级重试 |
| `server_flask/test_notion_sync.py` | 同步逻辑单元测试（mock Notion API）：冲突检测、force-overwrite、防抖行为、frontmatter 迁移、sidecar 丢失 adopt |

### 修改文件

| 文件 | 变更说明 |
|---|---|
| `server_flask/app/services/notion_sync.py` | 重构同步逻辑：集成图片缓存回调、`threading.Timer` 防抖、冲突检测、sidecar 状态读写、frontmatter 迁移逻辑、append 失败重试 |
| `manage.py` | `notion_sync` 子命令添加 `--no-cooldown` 和 `--force-overwrite` 参数 |

### 不修改的文件

| 文件 | 原因 |
|---|---|
| `server_flask/app/services/mistletoe_notion.py` | 无需修改，缓存逻辑通过 `upload_callback` 注入 |
| `server_flask/app/services/content_index.py` | 触发逻辑不变，仍调用 `sync_local_to_notion_async()`；防抖在 async 入口内部处理 |

## 远期演进（不在本次范围内）

- **阶段三：局部 diff** — 如果未来发现特定长文频繁小修改成为痛点，再考虑按章节（heading 分割）做局部重建或有限的 block patch
- **Phase 2：Notion → 本地** — 利用 Notion Webhooks 接收页面变更通知，拉取内容转为 Markdown 写入本地
- **多 content root 隔离** — 当前 `notion_sync_state.json` 和 `notion_image_cache.json` 假设单一 content root。如果未来需要支持多个 content root，可按 content root 路径 hash 分文件存储（如 `server_flask/data/notion-sync/<hash>/state.json`）

## 验证方案

### 自动化测试

```sh
cd server_flask

# 编译检查
python3 -m compileall app/services/notion_image_cache.py app/services/notion_sync_state.py app/services/notion_sync.py

# 新增测试
python3 -m unittest test_notion_image_cache.py test_notion_sync.py

# 回归测试
python3 -m unittest test_content_index.py test_markdown_renderer.py test_post_template.py
```

#### 新增测试覆盖范围

**test_notion_image_cache.py**：
- cache hit：图片 hash 未变，返回缓存的 file_upload_id，不调用上传
- cache miss：首次上传，写入缓存
- hash 变化：图片内容变了，重新上传，更新缓存
- 缓存文件不存在：首次运行，自动创建空缓存
- 按文章清除：清除指定路径前缀的所有缓存条目

**test_notion_sync.py**（mock `requests`）：
- 正常同步流程：新建 + 更新
- hash 未变跳过
- 冲突检测：`last_edited_time` 不等，跳过
- `--force-overwrite`：冲突时仍覆盖
- append 失败重试：首次 append 失败 → 清除图片缓存 → 重试成功
- frontmatter 迁移：旧格式 `notion.synced_at` 迁移到 sidecar 并清理
- sidecar 丢失 adopt：有 page_id 无 sidecar → 自动记录状态、只更新属性、跳过正文

### 手动验证

1. **图片缓存验证**：
   - 首次同步含图片文章 → 日志显示 upload → 缓存文件写入
   - 改文字不改图 → 日志显示 cache hit → 图片未重传
   - 改图片内容 → 日志显示 cache miss → 重新上传

2. **防抖验证**：
   - 触发自动同步 → 日志显示定时器设置
   - 30 分钟内再次触发 → 日志显示定时器重置
   - 定时器到期后 → 实际同步执行
   - `manage.py notion_sync` → 立即同步，不走防抖

3. **冲突保护验证**：
   - 同步后在 Notion 手动编辑 → 再次同步 → 冲突提示，跳过
   - 加 `--force-overwrite` → 覆盖成功

4. **Sidecar 丢失验证**：
   - 删除 `notion_sync_state.json`（模拟 VPS 重装）
   - 触发同步 → 打印 ADOPT 提示 → 只更新属性、跳过正文
   - sidecar 重建，记录了当前 Notion `last_edited_time`
   - 再次触发同步 → 正常同步（有 sidecar 记录了）

5. **迁移验证**：
   - 旧格式 frontmatter（含 `synced_at`/`content_hash`）→ 同步后 frontmatter 只剩 `page_id` → sidecar 有完整状态
