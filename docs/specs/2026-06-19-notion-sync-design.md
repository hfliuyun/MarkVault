# Notion 同步集成设计规范

## 目标
将 MarkVault 的 Markdown 博客系统与 Notion 进行集成打通。在初期阶段（Phase 1），核心目标是实现本地博客内容自动上传并同步到 Notion Database 中，作为内容备份与方便阅读的呈现。在未来阶段（Phase 2），我们将扩展支持将 Notion 作为内容发布平台（CMS），实现在 Notion 中编写文章后自动下拉同步到本地 `content/` 目录下。

## Notion 数据库结构设计 (Schema)
我们采用 **单表（Single Database）方案**，通过添加特定字段来区分独立文章与系列文章，并利用 Notion 强大的视图功能对系列进行分组展示。

| Notion 属性名 (Property) | 字段类型 (Type) | 对应本地 Markdown 字段 | 说明 / 扩展考量 |
| :--- | :--- | :--- | :--- |
| **Title** | `Title` (标题) | `title` | 文章的标题。 |
| **Slug** | `Rich Text` (文本) | `slug` | 文章的 URL 路径。 |
| **Status** | `Status` (状态) | *(本地无对应)* | 状态值：`Draft` (草稿), `Published` (已发布)。为后续 Notion 作为发布平台（CMS）预留的开关。从本地上传到 Notion 的文章将默认设为 `Published`。 |
| **Publish Date** | `Date` (日期) | `date` | 文章发布时间。 |
| **Summary** | `Rich Text` (文本) | `summary` | 文章简短摘要。 |
| **Categories** | `Multi-select` (多选) | `categories` | 文章分类。 |
| **Tags** | `Multi-select` (多选) | `tags` | 文章标签。 |
| **Series ID** | `Select` (单选) | `series.id` | 系列英文 ID，用于在 Notion 视图中进行按系列分组（Group by）。 |
| **Series Title**| `Rich Text` (文本) | `series.title` | 系列的中文显示名称。 |
| **Series Order**| `Number` (数字) | `series.order` | 文章在系列中的排序序号。 |
| **Last Synced** | `Date` (日期) | `notion.synced_at` | 记录最近一次的同步时间，用于判断本地与 Notion 的内容新旧状态。 |

## 同步流程设计

### Phase 1: 本地同步至 Notion (当前目标)
1. 扫描读取本地 `content/posts` 和 `content/series` 目录下的所有 Markdown 格式文章。
2. 提取文章的 Frontmatter 元数据信息。
3. 对比文章的 `notion.synced_at`（或文件最后修改时间）与 Notion 端的状态。
4. 调用 Notion API，更新或创建对应的 Notion 页面及 Database 行。
5. （可选回写）如果是新建的 Notion 页面，将分配到的 Notion Page ID 回写到本地文件的 `notion.page_id`，并更新 `notion.synced_at` 时间戳。

### Phase 2: Notion 同步至本地 (未来扩展)
1. 读取 Notion Database 中状态为 `Status == Published` 的所有文章。
2. 对比 Notion 的 `Last Edited Time` 与本地记录的 `notion.synced_at`。
3. 如果发现 Notion 端内容较新，则拉取 Notion 页面内容，转换为 Markdown 格式。
4. 将转换后的 Markdown 连同提取的 Frontmatter 写入本地对应的目录路径中。

## 技术实现细节
- 依赖 `mcp_notion-mcp-server` 提供的 API 工具进行交互。
- 后端逻辑将通过新建的 Python 脚本或集成在 `manage.py` 的子命令中进行触发（例如 `python3 manage.py notion_sync`）。
