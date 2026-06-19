# Notion Sync Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Phase 1 of Notion Sync to automatically upload local Markdown posts to the Notion Database.

**Architecture:** We will add a `notion_sync` subcommand to `manage.py` which invokes a new `NotionSyncService`. This service will iterate over all markdown files, parse frontmatter using `python-frontmatter`, map fields to the Notion Schema, and make POST/PATCH requests to the Notion API via the `requests` library. If a Notion `page_id` is newly generated, it will rewrite the local Markdown file using `frontmatter.dump` to persist `notion.page_id` and `notion.synced_at`.

**Tech Stack:** Python, `python-frontmatter`, `requests`, `python-dotenv`

---

### Task 1: Setup Dependencies and Environment Variables

**Files:**
- Modify: `server_flask/requirements.txt`
- Create: `.env.example`

- [ ] **Step 1: Add `requests` and `python-dotenv` to requirements**

```text
# append to server_flask/requirements.txt
requests
python-dotenv
```

- [ ] **Step 2: Create `.env.example` in root**

```bash
cat << 'EOF' > .env.example
NOTION_API_TOKEN=your_integration_token
NOTION_DATABASE_ID=384d478b-a9b5-805e-82aa-f8eea7c9830e
EOF
```

- [ ] **Step 3: Commit**

```bash
git add server_flask/requirements.txt .env.example
git commit -m "chore: add dependencies and env example for notion sync"
```

### Task 2: Create Notion Sync Service

**Files:**
- Create: `server_flask/app/services/notion_sync.py`

- [ ] **Step 1: Write `NotionSyncService` structure**

Create `server_flask/app/services/notion_sync.py` with the Notion API client wrapper:
```python
import os
import requests
from datetime import datetime, timezone

NOTION_API_URL = "https://api.notion.com/v1"
NOTION_VERSION = "2022-06-28"

class NotionAPIError(Exception):
    pass

class NotionSyncService:
    def __init__(self, token: str, database_id: str):
        self.headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Notion-Version": NOTION_VERSION
        }
        self.database_id = database_id

    def build_properties(self, metadata: dict) -> dict:
        # Map frontmatter to Notion properties using exact DB schema
        props = {
            "Tille": {"title": [{"text": {"content": metadata.get("title", "Untitled")}}]},
            "slug": {"rich_text": [{"text": {"content": metadata.get("slug", "")}}]},
            "Summary": {"rich_text": [{"text": {"content": metadata.get("summary", "")}}]},
        }
        
        if metadata.get("date"):
            date_val = metadata["date"]
            if isinstance(date_val, datetime):
                date_str = date_val.isoformat()
            else:
                date_str = str(date_val)
            props["Publish Data"] = {"date": {"start": date_str}}
            
        if metadata.get("categories"):
            props["Categories"] = {"multi_select": [{"name": c} for c in metadata["categories"]]}
            
        if metadata.get("tags"):
            props["Tags"] = {"multi_select": [{"name": t} for t in metadata["tags"]]}
            
        series = metadata.get("series", {})
        if isinstance(series, dict) and series:
            if series.get("id"):
                props["Series ID"] = {"select": {"name": str(series["id"])}}
            if series.get("title"):
                props["Series Title"] = {"rich_text": [{"text": {"content": str(series["title"])}}]}
            if series.get("order") is not None:
                props["Series Order"] = {"number": int(series["order"])}
                
        # Default Status is '完成' (Published equivalent from schema)
        props["Status"] = {"status": {"name": "完成"}}
        props["Last Synced"] = {"date": {"start": datetime.now(timezone.utc).isoformat()}}
        return props

    def create_page(self, properties: dict) -> str:
        payload = {"parent": {"database_id": self.database_id}, "properties": properties}
        resp = requests.post(f"{NOTION_API_URL}/pages", headers=self.headers, json=payload)
        if resp.status_code != 200:
            raise NotionAPIError(f"Failed to create page: {resp.text}")
        return resp.json()["id"]

    def update_page(self, page_id: str, properties: dict) -> None:
        payload = {"properties": properties}
        resp = requests.patch(f"{NOTION_API_URL}/pages/{page_id}", headers=self.headers, json=payload)
        if resp.status_code != 200:
            raise NotionAPIError(f"Failed to update page {page_id}: {resp.text}")
```

- [ ] **Step 2: Commit**

```bash
git add server_flask/app/services/notion_sync.py
git commit -m "feat: add Notion API client service"
```

### Task 3: Implement Folder Scanning and Sync Logic

**Files:**
- Modify: `server_flask/app/services/notion_sync.py`

- [ ] **Step 1: Add sync execution logic**

Append to `server_flask/app/services/notion_sync.py`:
```python
import frontmatter
from pathlib import Path

def sync_local_to_notion(content_root: Path, token: str, database_id: str):
    service = NotionSyncService(token, database_id)
    
    files = list(content_root.glob("posts/*/index.md")) + list(content_root.glob("series/*/*/index.md"))
    
    for file_path in files:
        try:
            post = frontmatter.load(file_path)
            metadata = post.metadata
            
            notion_meta = metadata.get("notion", {})
            if not isinstance(notion_meta, dict):
                notion_meta = {}
                
            page_id = notion_meta.get("page_id")
            props = service.build_properties(metadata)
            
            if page_id:
                print(f"Updating Notion page for {metadata.get('title')}")
                service.update_page(page_id, props)
            else:
                print(f"Creating Notion page for {metadata.get('title')}")
                page_id = service.create_page(props)
                notion_meta["page_id"] = page_id
                
            notion_meta["synced_at"] = datetime.now(timezone.utc).isoformat()
            post.metadata["notion"] = notion_meta
            
            with open(file_path, "wb") as f:
                frontmatter.dump(post, f)
        except Exception as e:
            print(f"Error syncing {file_path}: {e}")
```

- [ ] **Step 2: Commit**

```bash
git add server_flask/app/services/notion_sync.py
git commit -m "feat: add local to notion sync execution logic"
```

### Task 4: Add `manage.py` CLI Command

**Files:**
- Modify: `manage.py`

- [ ] **Step 1: Register subcommand**

Add to `manage.py` imports (around line 25):
```python
import os
from dotenv import load_dotenv
from app.services.notion_sync import sync_local_to_notion
```

In `build_parser()`, add the new subparser (around line 102):
```python
    notion_sync = subparsers.add_parser(
        "notion_sync",
        help="Sync local markdown posts to Notion Database.",
    )
    notion_sync.add_argument(
        "--content-root",
        type=Path,
        help="Content root. Defaults to BLOG_CONTENT_ROOT or ./content.",
    )
```

In `main()`, add the route (around line 37):
```python
    if args.command == "notion_sync":
        return handle_notion_sync(args)
```

Add handler function (at the end of `manage.py` before `if __name__ == "__main__":`):
```python
def handle_notion_sync(args: argparse.Namespace) -> int:
    load_dotenv()
    token = os.environ.get("NOTION_API_TOKEN")
    database_id = os.environ.get("NOTION_DATABASE_ID")
    
    if not token or not database_id:
        print("error: NOTION_API_TOKEN and NOTION_DATABASE_ID must be set in env", file=sys.stderr)
        return 2
        
    content_root = args.content_root or Path(os.environ.get("BLOG_CONTENT_ROOT", "./content"))
    
    print(f"Starting Notion Sync from {content_root}...")
    sync_local_to_notion(content_root, token, database_id)
    print("Sync complete.")
    return 0
```

- [ ] **Step 2: Commit**

```bash
git add manage.py
git commit -m "feat: add notion_sync command to manage.py"
```
