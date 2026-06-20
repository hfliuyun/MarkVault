# Notion Sync V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade Notion sync from full-rebuild-every-time to image-cached, debounced, conflict-protected sync while keeping the simple "clear + append" architecture for text blocks.

**Architecture:** Three new modules (`notion_image_cache.py`, `notion_sync_state.py`, and their tests) plus a refactored `notion_sync.py`. The sync state and image cache are stored as JSON files in `server_flask/data/` (gitignored). Frontmatter is cleaned up to only store `notion.page_id`. `manage.py` gets `--no-cooldown` and `--force-overwrite` flags.

**Tech Stack:** Python 3, `python-frontmatter`, `requests`, `threading.Timer`, `unittest` with `unittest.mock`

**Design Spec:** [`docs/specs/2026-06-20-notion-sync-v2-design.md`](file:///Users/yun/code/MarkVault/docs/specs/2026-06-20-notion-sync-v2-design.md)

---

### Task 1: Create `NotionImageCache` Module

**Files:**
- Create: `server_flask/app/services/notion_image_cache.py`

- [ ] **Step 1: Create `notion_image_cache.py` with `NotionImageCache` class**

```python
"""Image cache for Notion sync: avoids re-uploading unchanged images."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


class NotionImageCache:
    """Maps local image paths to Notion file_upload_ids, keyed by content hash."""

    def __init__(self, cache_path: Path):
        self.cache_path = cache_path
        self._data: dict[str, dict[str, Any]] = {}
        self._load()

    def _load(self) -> None:
        if self.cache_path.exists():
            with open(self.cache_path, "r", encoding="utf-8") as f:
                self._data = json.load(f)
        else:
            self._data = {}

    def save(self) -> None:
        self.cache_path.parent.mkdir(parents=True, exist_ok=True)
        with open(self.cache_path, "w", encoding="utf-8") as f:
            json.dump(self._data, f, indent=2, ensure_ascii=False)

    @staticmethod
    def file_hash(file_path: str) -> str | None:
        """Compute MD5 hash of a file. Returns None if file doesn't exist."""
        path = Path(file_path)
        if not path.exists():
            return None
        md5 = hashlib.md5()
        with open(path, "rb") as f:
            for chunk in iter(lambda: f.read(8192), b""):
                md5.update(chunk)
        return md5.hexdigest()

    def get_cached_upload_id(self, rel_path: str, abs_path: str) -> str | None:
        """Return cached file_upload_id if image hasn't changed, else None."""
        entry = self._data.get(rel_path)
        if entry is None:
            return None
        current_hash = self.file_hash(abs_path)
        if current_hash is None:
            return None
        if entry.get("content_hash") == current_hash:
            return entry.get("file_upload_id")
        return None

    def update(self, rel_path: str, abs_path: str, file_upload_id: str) -> None:
        """Record a successful upload in the cache."""
        current_hash = self.file_hash(abs_path)
        self._data[rel_path] = {
            "content_hash": current_hash,
            "file_upload_id": file_upload_id,
            "uploaded_at": datetime.now(timezone.utc).isoformat(),
        }

    def clear_for_article(self, path_prefix: str) -> None:
        """Remove all cache entries whose key starts with path_prefix."""
        keys_to_remove = [k for k in self._data if k.startswith(path_prefix)]
        for key in keys_to_remove:
            del self._data[key]

    def get_or_upload(self, rel_path: str, abs_path: str, service: Any) -> str | None:
        """Return cached file_upload_id or upload and cache. Returns None on failure."""
        cached_id = self.get_cached_upload_id(rel_path, abs_path)
        if cached_id is not None:
            print(f"  Image cache hit: {rel_path}")
            return cached_id

        print(f"  Image cache miss, uploading: {rel_path}")
        file_upload_id = service.upload_local_file(abs_path)
        if file_upload_id:
            self.update(rel_path, abs_path, file_upload_id)
        return file_upload_id
```

- [ ] **Step 2: Verify it compiles**

Run:
```bash
cd server_flask && python3 -m compileall app/services/notion_image_cache.py
```
Expected: `Compiling ... OK`

- [ ] **Step 3: Commit**

```bash
git add server_flask/app/services/notion_image_cache.py
git commit -m "feat: add NotionImageCache for caching uploaded images

Summary:
- New module to cache image file_upload_ids by content hash.
- Avoids re-uploading unchanged images during Notion sync.

Implementation:
- JSON-based cache stored in server_flask/data/notion_image_cache.json.
- get_or_upload() checks MD5 hash, returns cached ID or uploads fresh.
- clear_for_article() supports bulk invalidation on retry.

Tests:
- python3 -m compileall passed.

Notes:
- Unit tests will be added in a subsequent task."
```

---

### Task 2: Create `NotionSyncState` Module

**Files:**
- Create: `server_flask/app/services/notion_sync_state.py`

- [ ] **Step 1: Create `notion_sync_state.py` with `NotionSyncState` class**

```python
"""Sync state sidecar for Notion sync: tracks per-article sync metadata."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


class NotionSyncState:
    """Manages per-article sync state stored in a JSON sidecar file."""

    def __init__(self, state_path: Path):
        self.state_path = state_path
        self._data: dict[str, dict[str, Any]] = {}
        self._load()

    def _load(self) -> None:
        if self.state_path.exists():
            with open(self.state_path, "r", encoding="utf-8") as f:
                self._data = json.load(f)
        else:
            self._data = {}

    def save(self) -> None:
        self.state_path.parent.mkdir(parents=True, exist_ok=True)
        with open(self.state_path, "w", encoding="utf-8") as f:
            json.dump(self._data, f, indent=2, ensure_ascii=False)

    def get(self, file_key: str) -> dict[str, Any]:
        """Get sync state for a file. Returns empty dict if not found."""
        return dict(self._data.get(file_key, {}))

    def update(self, file_key: str, **kwargs: Any) -> None:
        """Update sync state fields for a file. Only updates provided fields."""
        if file_key not in self._data:
            self._data[file_key] = {}
        self._data[file_key].update(kwargs)

    def has_state(self, file_key: str) -> bool:
        """Check if any sync state exists for a file."""
        return file_key in self._data

    def record_sync(
        self,
        file_key: str,
        content_hash: str,
        notion_last_edited_time: str,
        page_id: str,
    ) -> None:
        """Record a successful sync."""
        self._data[file_key] = {
            "content_hash": content_hash,
            "synced_at": datetime.now(timezone.utc).isoformat(),
            "notion_last_edited_time": notion_last_edited_time,
            "page_id": page_id,
        }

    def record_adopt(
        self,
        file_key: str,
        notion_last_edited_time: str,
        page_id: str,
    ) -> None:
        """Record an adopt (sidecar recovery) — intentionally omits content_hash
        so the next sync detects a hash mismatch and triggers body rebuild."""
        self._data[file_key] = {
            "synced_at": datetime.now(timezone.utc).isoformat(),
            "notion_last_edited_time": notion_last_edited_time,
            "page_id": page_id,
            # content_hash intentionally omitted
        }
```

- [ ] **Step 2: Verify it compiles**

Run:
```bash
cd server_flask && python3 -m compileall app/services/notion_sync_state.py
```
Expected: `Compiling ... OK`

- [ ] **Step 3: Commit**

```bash
git add server_flask/app/services/notion_sync_state.py
git commit -m "feat: add NotionSyncState for per-article sync metadata

Summary:
- New module to track content_hash, synced_at, notion_last_edited_time per article.
- Stored in server_flask/data/notion_sync_state.json (gitignored).

Implementation:
- record_sync() saves full state after successful sync.
- record_adopt() intentionally omits content_hash for sidecar recovery.
- get()/has_state() for reading state during sync decisions.

Tests:
- python3 -m compileall passed.

Notes:
- Unit tests will be added in a subsequent task."
```

---

### Task 3: Write Tests for `NotionImageCache`

**Files:**
- Create: `server_flask/test_notion_image_cache.py`

- [ ] **Step 1: Write test file**

```python
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock

from app.services.notion_image_cache import NotionImageCache


class TestNotionImageCache(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.cache_path = Path(self.temp_dir.name) / "image_cache.json"
        self.cache = NotionImageCache(self.cache_path)

        # Create a test image file
        self.image_dir = Path(self.temp_dir.name) / "images"
        self.image_dir.mkdir()
        self.image_path = self.image_dir / "test.png"
        self.image_path.write_bytes(b"fake-image-content")

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_cache_miss_first_upload(self):
        """First encounter: no cache entry, returns None."""
        result = self.cache.get_cached_upload_id("posts/test/images/test.png", str(self.image_path))
        self.assertIsNone(result)

    def test_cache_hit_after_update(self):
        """After caching, same file returns cached ID."""
        self.cache.update("posts/test/images/test.png", str(self.image_path), "file-upload-123")
        result = self.cache.get_cached_upload_id("posts/test/images/test.png", str(self.image_path))
        self.assertEqual(result, "file-upload-123")

    def test_cache_miss_after_content_change(self):
        """If file content changes, cache returns None."""
        self.cache.update("posts/test/images/test.png", str(self.image_path), "file-upload-123")
        # Change image content
        self.image_path.write_bytes(b"new-image-content")
        result = self.cache.get_cached_upload_id("posts/test/images/test.png", str(self.image_path))
        self.assertIsNone(result)

    def test_cache_miss_file_not_found(self):
        """If file doesn't exist, returns None."""
        result = self.cache.get_cached_upload_id("posts/test/images/missing.png", "/nonexistent/path.png")
        self.assertIsNone(result)

    def test_clear_for_article(self):
        """clear_for_article removes all entries with matching prefix."""
        self.cache.update("posts/test/images/a.png", str(self.image_path), "id-a")
        self.cache.update("posts/test/images/b.png", str(self.image_path), "id-b")
        self.cache.update("posts/other/images/c.png", str(self.image_path), "id-c")
        self.cache.clear_for_article("posts/test/")
        self.assertIsNone(self.cache.get_cached_upload_id("posts/test/images/a.png", str(self.image_path)))
        self.assertIsNone(self.cache.get_cached_upload_id("posts/test/images/b.png", str(self.image_path)))
        # Other article's cache is untouched
        self.assertEqual(
            self.cache.get_cached_upload_id("posts/other/images/c.png", str(self.image_path)),
            "id-c",
        )

    def test_save_and_reload(self):
        """Cache persists to disk and reloads correctly."""
        self.cache.update("posts/test/images/test.png", str(self.image_path), "file-upload-456")
        self.cache.save()
        # Reload from same path
        cache2 = NotionImageCache(self.cache_path)
        result = cache2.get_cached_upload_id("posts/test/images/test.png", str(self.image_path))
        self.assertEqual(result, "file-upload-456")

    def test_empty_cache_file_not_exist(self):
        """No cache file → empty cache, no error."""
        cache = NotionImageCache(Path(self.temp_dir.name) / "nonexistent.json")
        self.assertIsNone(cache.get_cached_upload_id("any", str(self.image_path)))

    def test_get_or_upload_cache_hit(self):
        """get_or_upload returns cached ID without calling service."""
        self.cache.update("posts/test/images/test.png", str(self.image_path), "cached-id")
        mock_service = MagicMock()
        result = self.cache.get_or_upload("posts/test/images/test.png", str(self.image_path), mock_service)
        self.assertEqual(result, "cached-id")
        mock_service.upload_local_file.assert_not_called()

    def test_get_or_upload_cache_miss(self):
        """get_or_upload calls service on cache miss and caches result."""
        mock_service = MagicMock()
        mock_service.upload_local_file.return_value = "new-upload-id"
        result = self.cache.get_or_upload("posts/test/images/test.png", str(self.image_path), mock_service)
        self.assertEqual(result, "new-upload-id")
        mock_service.upload_local_file.assert_called_once_with(str(self.image_path))
        # Should now be cached
        cached = self.cache.get_cached_upload_id("posts/test/images/test.png", str(self.image_path))
        self.assertEqual(cached, "new-upload-id")


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run tests**

Run:
```bash
cd server_flask && python3 -m unittest test_notion_image_cache.py -v
```
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add server_flask/test_notion_image_cache.py
git commit -m "test: add unit tests for NotionImageCache

Summary:
- Tests for cache hit, miss, content change, file not found, save/reload.
- Tests for clear_for_article prefix matching.
- Tests for get_or_upload with mock service.

Implementation:
- Uses tempfile for isolated test fixtures.
- Mock service verifies upload is skipped on cache hit.

Tests:
- python3 -m unittest test_notion_image_cache.py: all passed.

Notes:
- None."
```

---

### Task 4: Write Tests for `NotionSyncState`

**Files:**
- Create: `server_flask/test_notion_sync_state.py`

- [ ] **Step 1: Write test file**

```python
import tempfile
import unittest
from pathlib import Path

from app.services.notion_sync_state import NotionSyncState


class TestNotionSyncState(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.state_path = Path(self.temp_dir.name) / "sync_state.json"
        self.state = NotionSyncState(self.state_path)

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_empty_state(self):
        """No state file → empty state, no error."""
        self.assertFalse(self.state.has_state("posts/test/index.md"))
        self.assertEqual(self.state.get("posts/test/index.md"), {})

    def test_record_sync(self):
        """record_sync stores all fields."""
        self.state.record_sync(
            "posts/test/index.md",
            content_hash="abc123",
            notion_last_edited_time="2026-06-20T12:00:00.000Z",
            page_id="page-xxx",
        )
        state = self.state.get("posts/test/index.md")
        self.assertEqual(state["content_hash"], "abc123")
        self.assertEqual(state["notion_last_edited_time"], "2026-06-20T12:00:00.000Z")
        self.assertEqual(state["page_id"], "page-xxx")
        self.assertIn("synced_at", state)
        self.assertTrue(self.state.has_state("posts/test/index.md"))

    def test_record_adopt_omits_content_hash(self):
        """record_adopt intentionally omits content_hash."""
        self.state.record_adopt(
            "posts/test/index.md",
            notion_last_edited_time="2026-06-20T12:00:00.000Z",
            page_id="page-xxx",
        )
        state = self.state.get("posts/test/index.md")
        self.assertNotIn("content_hash", state)
        self.assertEqual(state["notion_last_edited_time"], "2026-06-20T12:00:00.000Z")
        self.assertEqual(state["page_id"], "page-xxx")

    def test_save_and_reload(self):
        """State persists to disk and reloads correctly."""
        self.state.record_sync(
            "posts/test/index.md",
            content_hash="abc123",
            notion_last_edited_time="2026-06-20T12:00:00.000Z",
            page_id="page-xxx",
        )
        self.state.save()
        state2 = NotionSyncState(self.state_path)
        reloaded = state2.get("posts/test/index.md")
        self.assertEqual(reloaded["content_hash"], "abc123")

    def test_update_partial_fields(self):
        """update() merges fields without overwriting others."""
        self.state.update("posts/test/index.md", content_hash="abc", page_id="p1")
        self.state.update("posts/test/index.md", content_hash="def")
        state = self.state.get("posts/test/index.md")
        self.assertEqual(state["content_hash"], "def")
        self.assertEqual(state["page_id"], "p1")


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run tests**

Run:
```bash
cd server_flask && python3 -m unittest test_notion_sync_state.py -v
```
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add server_flask/test_notion_sync_state.py
git commit -m "test: add unit tests for NotionSyncState

Summary:
- Tests for empty state, record_sync, record_adopt, save/reload, partial update.
- Verifies record_adopt intentionally omits content_hash.

Implementation:
- Uses tempfile for isolated state files.

Tests:
- python3 -m unittest test_notion_sync_state.py: all passed.

Notes:
- None."
```

---

### Task 5: Refactor `notion_sync.py` — Integrate Image Cache, Sync State, Debounce, and Conflict Protection

**Files:**
- Modify: `server_flask/app/services/notion_sync.py`

This is the largest task. The full replacement of `notion_sync.py`:

- [ ] **Step 1: Rewrite `notion_sync.py`**

Replace the entire file content with:

```python
"""Notion sync service: uploads local Markdown posts to Notion Database.

V2: Image caching, debounce, conflict protection, sidecar state.
"""

from __future__ import annotations

import hashlib
import json
import os
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import frontmatter
import requests

from .mistletoe_notion import convert_to_notion_blocks
from .notion_image_cache import NotionImageCache
from .notion_sync_state import NotionSyncState

NOTION_API_URL = "https://api.notion.com/v1"
NOTION_VERSION = "2022-06-28"

SYNC_DEBOUNCE_SECONDS = 30 * 60  # 30 minutes
SYNC_RETRY_DELAY_SECONDS = 60    # lock-busy retry

DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"


class NotionAPIError(Exception):
    pass


class NotionSyncService:
    def __init__(self, token: str, database_id: str):
        self.headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Notion-Version": NOTION_VERSION,
        }
        self.database_id = database_id

    def build_properties(self, metadata: dict) -> dict:
        props = {
            "Title": {"title": [{"text": {"content": metadata.get("title", "Untitled")}}]},
            "slug": {"rich_text": [{"text": {"content": metadata.get("slug", "")}}]},
            "Summary": {"rich_text": [{"text": {"content": metadata.get("summary", "")}}]},
        }

        if metadata.get("date"):
            date_val = metadata["date"]
            if isinstance(date_val, datetime):
                date_str = date_val.isoformat()
            else:
                date_str = str(date_val)
            props["Publish Date"] = {"date": {"start": date_str}}

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

        props["Status"] = {"status": {"name": "完成"}}
        props["Last Synced"] = {"date": {"start": datetime.now(timezone.utc).isoformat()}}
        return props

    def upload_local_file(self, file_path: str) -> str | None:
        """Uploads a local file to Notion API and returns the file_upload_id."""
        if not os.path.exists(file_path):
            print(f"  File not found: {file_path}")
            return None

        import mimetypes
        file_name = os.path.basename(file_path)
        res = requests.post(
            f"{NOTION_API_URL}/file_uploads",
            headers=self.headers,
            json={"file_name": file_name},
        )
        if res.status_code != 200:
            print(f"  Create file upload failed: {res.text}")
            return None

        data = res.json()
        upload_url = data.get("upload_url")
        file_id = data.get("id")

        content_type, _ = mimetypes.guess_type(file_path)
        if not content_type:
            content_type = "application/octet-stream"

        with open(file_path, "rb") as f:
            files = {"file": (file_name, f, content_type)}
            upload_headers = {
                "Authorization": self.headers["Authorization"],
                "Notion-Version": self.headers["Notion-Version"],
            }
            upload_res = requests.post(upload_url, headers=upload_headers, files=files)
            if upload_res.status_code != 200:
                print(f"  Upload failed: {upload_res.text}")
                return None

        return file_id

    def create_page(self, properties: dict, children: list | None = None) -> dict:
        """Create a Notion page. Returns the full page response dict."""
        payload: dict[str, Any] = {"parent": {"database_id": self.database_id}, "properties": properties}
        if children:
            payload["children"] = children
        resp = requests.post(f"{NOTION_API_URL}/pages", headers=self.headers, json=payload)
        if resp.status_code != 200:
            raise NotionAPIError(f"Failed to create page: {resp.text}")
        return resp.json()

    def update_page(self, page_id: str, properties: dict) -> dict:
        """Update page properties. Returns the full page response dict."""
        payload = {"properties": properties}
        resp = requests.patch(f"{NOTION_API_URL}/pages/{page_id}", headers=self.headers, json=payload)
        if resp.status_code != 200:
            raise NotionAPIError(f"Failed to update page {page_id}: {resp.text}")
        return resp.json()

    def get_page_info(self, page_id: str) -> dict | None:
        """Retrieve page metadata including last_edited_time."""
        resp = requests.get(f"{NOTION_API_URL}/pages/{page_id}", headers=self.headers)
        if resp.status_code != 200:
            return None
        data = resp.json()
        return {
            "last_edited_time": data.get("last_edited_time"),
            "archived": data.get("archived", False),
        }

    def clear_page_blocks(self, page_id: str) -> None:
        block_ids = []
        has_more = True
        next_cursor = None
        while has_more:
            url = f"{NOTION_API_URL}/blocks/{page_id}/children"
            if next_cursor:
                url += f"?start_cursor={next_cursor}"
            resp = requests.get(url, headers=self.headers)
            if resp.status_code != 200:
                print(f"  Failed to fetch blocks for {page_id}: {resp.text}")
                break
            data = resp.json()
            for block in data.get("results", []):
                block_ids.append(block["id"])
            has_more = data.get("has_more", False)
            next_cursor = data.get("next_cursor")

        for block_id in block_ids:
            del_resp = requests.delete(f"{NOTION_API_URL}/blocks/{block_id}", headers=self.headers)
            if del_resp.status_code != 200:
                print(f"  Failed to delete block {block_id}: {del_resp.text}")

    def append_page_blocks(self, page_id: str, children: list) -> bool:
        """Append blocks to a page. Returns True on success, False on failure."""
        if not children:
            return True
        payload = {"children": children[:100]}
        resp = requests.patch(
            f"{NOTION_API_URL}/blocks/{page_id}/children",
            headers=self.headers,
            json=payload,
        )
        if resp.status_code != 200:
            print(f"  Failed to append blocks to {page_id}: {resp.text}")
            return False
        return True


# ---------------------------------------------------------------------------
# Content hash
# ---------------------------------------------------------------------------

def get_content_hash(metadata: dict, content: str) -> str:
    meta_subset = {
        "title": metadata.get("title"),
        "slug": metadata.get("slug"),
        "summary": metadata.get("summary"),
        "date": str(metadata.get("date")),
        "categories": metadata.get("categories"),
        "tags": metadata.get("tags"),
        "series": metadata.get("series"),
    }
    raw = json.dumps(meta_subset, sort_keys=True) + "\n---\n" + content
    return hashlib.md5(raw.encode("utf-8")).hexdigest()


# ---------------------------------------------------------------------------
# Frontmatter migration
# ---------------------------------------------------------------------------

def migrate_frontmatter(post: frontmatter.Post, file_key: str, sync_state: NotionSyncState) -> bool:
    """Migrate old notion.synced_at and notion.content_hash from frontmatter to sidecar.

    Returns True if frontmatter was modified and needs rewriting.
    """
    notion_meta = post.metadata.get("notion", {})
    if not isinstance(notion_meta, dict):
        return False

    old_synced_at = notion_meta.pop("synced_at", None)
    old_content_hash = notion_meta.pop("content_hash", None)

    if old_synced_at is None and old_content_hash is None:
        return False

    # Migrate to sidecar (only if sidecar doesn't already have this entry)
    if not sync_state.has_state(file_key):
        migrate_data: dict[str, Any] = {}
        if old_synced_at:
            migrate_data["synced_at"] = old_synced_at
        if old_content_hash:
            migrate_data["content_hash"] = old_content_hash
        page_id = notion_meta.get("page_id")
        if page_id:
            migrate_data["page_id"] = page_id
        sync_state.update(file_key, **migrate_data)

    # Clean frontmatter: keep only page_id
    if notion_meta.get("page_id"):
        post.metadata["notion"] = {"page_id": notion_meta["page_id"]}
    else:
        post.metadata.pop("notion", None)

    return True


# ---------------------------------------------------------------------------
# Sync logic
# ---------------------------------------------------------------------------

def sync_local_to_notion(
    content_root: Path,
    token: str,
    database_id: str,
    force_overwrite: bool = False,
):
    service = NotionSyncService(token, database_id)
    image_cache = NotionImageCache(DATA_DIR / "notion_image_cache.json")
    sync_state = NotionSyncState(DATA_DIR / "notion_sync_state.json")

    files = list(content_root.glob("posts/*/index.md")) + list(content_root.glob("series/*/*/index.md"))

    for file_path in files:
        try:
            post = frontmatter.load(file_path)
            metadata = post.metadata
            file_key = str(file_path.relative_to(content_root))

            # Step 2: Migration check
            fm_modified = migrate_frontmatter(post, file_key, sync_state)

            # Step 3: Read sync state from sidecar
            state = sync_state.get(file_key)

            # Step 4: Compute current content hash
            current_hash = get_content_hash(metadata, post.content)
            saved_hash = state.get("content_hash")

            # Get page_id from frontmatter (canonical source)
            notion_meta = metadata.get("notion", {})
            if not isinstance(notion_meta, dict):
                notion_meta = {}
            page_id = notion_meta.get("page_id")

            # Step 5: Hash unchanged → skip
            if page_id and current_hash == saved_hash:
                if fm_modified:
                    _rewrite_frontmatter(post, file_path)
                print(f"Skipping {metadata.get('title')} (no changes detected)")
                continue

            title = metadata.get("title", "Untitled")

            # Step 6: Conflict / adopt check for existing pages
            do_body_sync = True
            if page_id:
                recorded_let = state.get("notion_last_edited_time")
                if recorded_let:
                    # Has sidecar record → conflict check
                    page_info = service.get_page_info(page_id)
                    if page_info:
                        current_let = page_info.get("last_edited_time")
                        if current_let != recorded_let:
                            if not force_overwrite:
                                print(
                                    f"CONFLICT: \"{title}\" has been edited in Notion since last sync.\n"
                                    f"  Notion last_edited_time: {current_let} (current)\n"
                                    f"  Recorded after sync:     {recorded_let}\n"
                                    f"  Use --force-overwrite to overwrite Notion changes.\n"
                                    f"  Skipping this article."
                                )
                                if fm_modified:
                                    _rewrite_frontmatter(post, file_path)
                                continue
                            else:
                                print(f"WARNING: Force-overwriting \"{title}\" (Notion edited since last sync)")
                else:
                    # No sidecar record → unknown remote state (adopt)
                    page_info = service.get_page_info(page_id)
                    if page_info:
                        notion_let = page_info.get("last_edited_time", "")
                        # Update properties only
                        props = service.build_properties(metadata)
                        service.update_page(page_id, props)
                        # Re-read last_edited_time after our property update
                        page_info_after = service.get_page_info(page_id)
                        new_let = page_info_after.get("last_edited_time", "") if page_info_after else notion_let
                        sync_state.record_adopt(file_key, notion_last_edited_time=new_let, page_id=page_id)

                        if not force_overwrite:
                            print(
                                f"ADOPT: \"{title}\" has page_id but no sync state recorded.\n"
                                f"  Adopting current Notion state. Properties updated, body sync skipped.\n"
                                f"  Use --force-overwrite to force full sync including body."
                            )
                            if fm_modified:
                                _rewrite_frontmatter(post, file_path)
                            sync_state.save()
                            continue
                        else:
                            print(f"WARNING: Force-overwriting \"{title}\" body (adopted state)")

            # Step 7: Build properties
            props = service.build_properties(metadata)

            # Step 8: Convert markdown → Notion blocks with image cache
            article_prefix = str(file_path.parent.relative_to(content_root)) + "/"

            def make_upload_callback():
                def handle_image_upload(src):
                    abs_path = file_path.parent / src
                    if not abs_path.exists():
                        print(f"  Image not found: {abs_path}")
                        return None
                    rel_path = str(abs_path.relative_to(content_root))
                    return image_cache.get_or_upload(rel_path, str(abs_path), service)
                return handle_image_upload

            content_blocks = convert_to_notion_blocks(post.content, upload_callback=make_upload_callback())

            # Step 9: Create or update
            if page_id:
                print(f"Updating Notion page for \"{title}\"")
                resp_data = service.update_page(page_id, props)
                service.clear_page_blocks(page_id)
                success = service.append_page_blocks(page_id, content_blocks)

                if not success:
                    # Retry: clear image cache for this article, re-convert, retry once
                    print(f"  Append failed, clearing image cache and retrying for \"{title}\"")
                    image_cache.clear_for_article(article_prefix)
                    content_blocks = convert_to_notion_blocks(
                        post.content, upload_callback=make_upload_callback()
                    )
                    success = service.append_page_blocks(page_id, content_blocks)
                    if not success:
                        print(f"  Retry also failed for \"{title}\", skipping.")
                        continue
            else:
                print(f"Creating Notion page for \"{title}\"")
                resp_data = service.create_page(props, children=content_blocks)
                page_id = resp_data["id"]
                notion_meta["page_id"] = page_id
                post.metadata["notion"] = {"page_id": page_id}
                fm_modified = True

            # Step 10: Record sync state
            notion_let = resp_data.get("last_edited_time", "")
            if not notion_let:
                # Fetch fresh if not in response
                page_info = service.get_page_info(page_id)
                notion_let = page_info.get("last_edited_time", "") if page_info else ""

            sync_state.record_sync(
                file_key,
                content_hash=current_hash,
                notion_last_edited_time=notion_let,
                page_id=page_id,
            )

            # Step 11: Rewrite frontmatter only if modified
            if fm_modified:
                _rewrite_frontmatter(post, file_path)

        except Exception as e:
            print(f"Error syncing {file_path}: {e}")

    # Step 12: Save caches to disk
    image_cache.save()
    sync_state.save()


def _rewrite_frontmatter(post: frontmatter.Post, file_path: Path) -> None:
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(frontmatter.dumps(post))


# ---------------------------------------------------------------------------
# Debounce / async entry point
# ---------------------------------------------------------------------------

_sync_lock = threading.Lock()
_sync_timer: threading.Timer | None = None
_sync_timer_lock = threading.Lock()


def _schedule_sync(delay: float, content_root: Path, token: str, database_id: str) -> None:
    """Unified timer scheduler. All debounce and retry go through the same
    global _sync_timer to avoid stacking multiple pending timers."""
    global _sync_timer
    with _sync_timer_lock:
        if _sync_timer is not None:
            _sync_timer.cancel()
        _sync_timer = threading.Timer(
            delay,
            _run_debounced_sync,
            args=(content_root, token, database_id),
        )
        _sync_timer.daemon = True
        _sync_timer.start()


def _run_debounced_sync(content_root: Path, token: str, database_id: str) -> None:
    """Executed when debounce timer fires. Retries with short delay if lock is busy."""
    if not _sync_lock.acquire(blocking=False):
        _schedule_sync(SYNC_RETRY_DELAY_SECONDS, content_root, token, database_id)
        return
    try:
        sync_local_to_notion(content_root, token, database_id)
    finally:
        _sync_lock.release()


def sync_local_to_notion_async(content_root: Path) -> None:
    """Debounced async sync entry point. Called by ContentIndex.reload().
    Each call resets the debounce timer."""
    token = os.environ.get("NOTION_API_TOKEN")
    database_id = os.environ.get("NOTION_DATABASE_ID")
    if not token or not database_id:
        return

    _schedule_sync(SYNC_DEBOUNCE_SECONDS, content_root, token, database_id)
```

- [ ] **Step 2: Verify it compiles**

Run:
```bash
cd server_flask && python3 -m compileall app/services/notion_sync.py
```
Expected: `Compiling ... OK`

- [ ] **Step 3: Commit**

```bash
git add server_flask/app/services/notion_sync.py
git commit -m "refactor: upgrade notion_sync to V2 with image cache, debounce, conflict protection

Summary:
- Image uploads now use NotionImageCache to skip unchanged images.
- Sync state (content_hash, synced_at, notion_last_edited_time) moved to sidecar JSON.
- Frontmatter cleaned to only store notion.page_id; old fields auto-migrated.
- Debounce via threading.Timer with unified _schedule_sync; lock-busy retry.
- Conflict protection via last_edited_time equality check before any writes.
- Sidecar-missing auto-adopt: properties-only update, body skipped unless --force-overwrite.
- Append failure triggers image cache clear + one retry.

Implementation:
- Integrates NotionImageCache and NotionSyncState modules.
- migrate_frontmatter() handles one-time cleanup of old notion.synced_at/content_hash.
- sync_local_to_notion() accepts force_overwrite parameter.
- sync_local_to_notion_async() resets debounce timer on each call.

Tests:
- python3 -m compileall passed.

Notes:
- Full integration tests in next task."
```

---

### Task 6: Write Tests for Sync Logic

**Files:**
- Create: `server_flask/test_notion_sync.py`

- [ ] **Step 1: Write test file**

```python
import json
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch, PropertyMock

import frontmatter

from app.services.notion_sync import (
    NotionSyncService,
    get_content_hash,
    migrate_frontmatter,
    sync_local_to_notion,
)
from app.services.notion_sync_state import NotionSyncState
from app.services.notion_image_cache import NotionImageCache


class TestGetContentHash(unittest.TestCase):
    def test_same_input_same_hash(self):
        meta = {"title": "Test", "slug": "test", "date": "2026-01-01"}
        h1 = get_content_hash(meta, "body text")
        h2 = get_content_hash(meta, "body text")
        self.assertEqual(h1, h2)

    def test_different_body_different_hash(self):
        meta = {"title": "Test", "slug": "test", "date": "2026-01-01"}
        h1 = get_content_hash(meta, "body v1")
        h2 = get_content_hash(meta, "body v2")
        self.assertNotEqual(h1, h2)

    def test_different_metadata_different_hash(self):
        body = "same body"
        h1 = get_content_hash({"title": "A", "slug": "a"}, body)
        h2 = get_content_hash({"title": "B", "slug": "b"}, body)
        self.assertNotEqual(h1, h2)


class TestMigrateFrontmatter(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.state = NotionSyncState(Path(self.temp_dir.name) / "state.json")

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_migrates_old_fields(self):
        post = frontmatter.Post("body", **{
            "title": "Test",
            "notion": {
                "page_id": "p1",
                "synced_at": "2026-01-01T00:00:00Z",
                "content_hash": "abc123",
            },
        })
        modified = migrate_frontmatter(post, "posts/test/index.md", self.state)
        self.assertTrue(modified)
        # Frontmatter cleaned
        self.assertEqual(post.metadata["notion"], {"page_id": "p1"})
        # Sidecar populated
        state = self.state.get("posts/test/index.md")
        self.assertEqual(state["synced_at"], "2026-01-01T00:00:00Z")
        self.assertEqual(state["content_hash"], "abc123")

    def test_no_migration_needed(self):
        post = frontmatter.Post("body", **{
            "title": "Test",
            "notion": {"page_id": "p1"},
        })
        modified = migrate_frontmatter(post, "posts/test/index.md", self.state)
        self.assertFalse(modified)

    def test_no_notion_metadata(self):
        post = frontmatter.Post("body", **{"title": "Test"})
        modified = migrate_frontmatter(post, "posts/test/index.md", self.state)
        self.assertFalse(modified)


class TestSyncLocalToNotion(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.content_root = Path(self.temp_dir.name)
        self.data_dir = Path(self.temp_dir.name) / "data"
        self.data_dir.mkdir()

    def tearDown(self):
        self.temp_dir.cleanup()

    def _write_post(self, slug, title="Test Post", body="Hello world", notion_page_id=None):
        post_dir = self.content_root / "posts" / slug
        post_dir.mkdir(parents=True, exist_ok=True)
        fm = {"title": title, "slug": slug, "date": "2026-01-01", "summary": "test",
              "categories": ["Test"], "tags": ["test"]}
        if notion_page_id:
            fm["notion"] = {"page_id": notion_page_id}
        post = frontmatter.Post(body, **fm)
        file_path = post_dir / "index.md"
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(frontmatter.dumps(post))
        return file_path

    @patch("app.services.notion_sync.DATA_DIR")
    @patch("app.services.notion_sync.requests")
    def test_create_new_page(self, mock_requests, mock_data_dir):
        mock_data_dir.__truediv__ = lambda self, x: self.parent / "data" / x
        mock_data_dir.parent = self.content_root

        self._write_post("new-post")

        # Mock create_page response
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "id": "new-page-id",
            "last_edited_time": "2026-01-01T00:00:00.000Z",
        }
        mock_requests.post.return_value = mock_resp
        mock_requests.patch.return_value = mock_resp

        with patch("app.services.notion_sync.DATA_DIR", self.data_dir):
            sync_local_to_notion(self.content_root, "token", "db-id")

        # Verify page was created (POST call made)
        post_calls = [c for c in mock_requests.post.call_args_list
                      if "pages" in str(c)]
        self.assertTrue(len(post_calls) > 0)

    @patch("app.services.notion_sync.requests")
    def test_skip_unchanged_hash(self, mock_requests):
        file_path = self._write_post("unchanged", notion_page_id="existing-page")

        # Pre-populate sync state with matching hash
        post = frontmatter.load(file_path)
        current_hash = get_content_hash(post.metadata, post.content)

        state = NotionSyncState(self.data_dir / "notion_sync_state.json")
        state.record_sync(
            "posts/unchanged/index.md",
            content_hash=current_hash,
            notion_last_edited_time="2026-01-01T00:00:00.000Z",
            page_id="existing-page",
        )
        state.save()

        with patch("app.services.notion_sync.DATA_DIR", self.data_dir):
            sync_local_to_notion(self.content_root, "token", "db-id")

        # No API calls should have been made
        mock_requests.post.assert_not_called()
        mock_requests.patch.assert_not_called()

    @patch("app.services.notion_sync.requests")
    def test_conflict_detection_skips(self, mock_requests):
        self._write_post("conflict", title="Conflict Post", body="changed body",
                         notion_page_id="conflict-page")

        # Sync state records one last_edited_time
        state = NotionSyncState(self.data_dir / "notion_sync_state.json")
        state.record_sync(
            "posts/conflict/index.md",
            content_hash="old-hash",
            notion_last_edited_time="2026-01-01T00:00:00.000Z",
            page_id="conflict-page",
        )
        state.save()

        # Notion returns a DIFFERENT last_edited_time (human edited)
        mock_get_resp = MagicMock()
        mock_get_resp.status_code = 200
        mock_get_resp.json.return_value = {
            "last_edited_time": "2026-01-02T00:00:00.000Z",
            "archived": False,
        }
        mock_requests.get.return_value = mock_get_resp

        with patch("app.services.notion_sync.DATA_DIR", self.data_dir):
            sync_local_to_notion(self.content_root, "token", "db-id")

        # No PATCH or POST (update/create) should have been made
        mock_requests.patch.assert_not_called()
        mock_requests.post.assert_not_called()

    @patch("app.services.notion_sync.requests")
    def test_force_overwrite_bypasses_conflict(self, mock_requests):
        self._write_post("force", title="Force Post", body="new body",
                         notion_page_id="force-page")

        state = NotionSyncState(self.data_dir / "notion_sync_state.json")
        state.record_sync(
            "posts/force/index.md",
            content_hash="old-hash",
            notion_last_edited_time="2026-01-01T00:00:00.000Z",
            page_id="force-page",
        )
        state.save()

        # Notion returns different last_edited_time
        mock_get_resp = MagicMock()
        mock_get_resp.status_code = 200
        mock_get_resp.json.return_value = {
            "last_edited_time": "2026-01-02T00:00:00.000Z",
            "archived": False,
        }
        mock_requests.get.return_value = mock_get_resp

        mock_patch_resp = MagicMock()
        mock_patch_resp.status_code = 200
        mock_patch_resp.json.return_value = {
            "id": "force-page",
            "last_edited_time": "2026-01-03T00:00:00.000Z",
        }
        mock_requests.patch.return_value = mock_patch_resp
        mock_requests.delete.return_value = MagicMock(status_code=200)

        with patch("app.services.notion_sync.DATA_DIR", self.data_dir):
            sync_local_to_notion(self.content_root, "token", "db-id", force_overwrite=True)

        # PATCH should have been called (update_page)
        self.assertTrue(mock_requests.patch.called)

    @patch("app.services.notion_sync.requests")
    def test_adopt_on_missing_sidecar(self, mock_requests):
        """Has page_id but no sidecar → adopt: properties only, no body."""
        self._write_post("adopt", title="Adopt Post", body="body",
                         notion_page_id="adopt-page")

        # No sync state exists (simulates VPS reinstall)

        mock_get_resp = MagicMock()
        mock_get_resp.status_code = 200
        mock_get_resp.json.return_value = {
            "last_edited_time": "2026-01-01T00:00:00.000Z",
            "archived": False,
        }
        mock_requests.get.return_value = mock_get_resp

        mock_patch_resp = MagicMock()
        mock_patch_resp.status_code = 200
        mock_patch_resp.json.return_value = {
            "id": "adopt-page",
            "last_edited_time": "2026-01-01T01:00:00.000Z",
        }
        mock_requests.patch.return_value = mock_patch_resp

        with patch("app.services.notion_sync.DATA_DIR", self.data_dir):
            sync_local_to_notion(self.content_root, "token", "db-id")

        # Should have called PATCH (update_page for properties) but NOT delete (no clear_blocks)
        patch_calls = mock_requests.patch.call_args_list
        delete_calls = mock_requests.delete.call_args_list
        self.assertTrue(len(patch_calls) > 0, "Should update properties")
        self.assertEqual(len(delete_calls), 0, "Should NOT clear blocks (adopt skips body)")

        # Sidecar should exist now with NO content_hash
        state = NotionSyncState(self.data_dir / "notion_sync_state.json")
        entry = state.get("posts/adopt/index.md")
        self.assertNotIn("content_hash", entry)
        self.assertIn("notion_last_edited_time", entry)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run tests**

Run:
```bash
cd server_flask && python3 -m unittest test_notion_sync.py -v
```
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add server_flask/test_notion_sync.py
git commit -m "test: add unit tests for notion sync V2 logic

Summary:
- Tests content hash consistency, frontmatter migration, conflict detection.
- Tests force-overwrite bypass, sidecar-missing adopt behavior.
- Tests hash-unchanged skip.

Implementation:
- Mock requests to avoid real Notion API calls.
- Patch DATA_DIR to use temp directories for isolation.

Tests:
- python3 -m unittest test_notion_sync.py: all passed.

Notes:
- None."
```

---

### Task 7: Update `manage.py` CLI

**Files:**
- Modify: `manage.py:27,40-41,108-116,178-192`

- [ ] **Step 1: Update import**

At line 27, change:
```python
from app.services.notion_sync import sync_local_to_notion
```

No change needed (import stays the same).

- [ ] **Step 2: Add CLI arguments and update handler**

In `build_parser()`, replace the `notion_sync` subparser block (lines 108-116) with:

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
    notion_sync.add_argument(
        "--no-cooldown",
        action="store_true",
        help="Skip debounce delay, sync immediately.",
    )
    notion_sync.add_argument(
        "--force-overwrite",
        action="store_true",
        help="Overwrite Notion pages even if edited since last sync.",
    )
```

Replace `handle_notion_sync` (lines 178-192) with:

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
    sync_local_to_notion(
        content_root,
        token,
        database_id,
        force_overwrite=args.force_overwrite,
    )
    print("Sync complete.")
    return 0
```

- [ ] **Step 3: Verify it compiles**

Run:
```bash
cd /Users/yun/code/MarkVault && python3 -m compileall manage.py
```
Expected: `Compiling ... OK`

- [ ] **Step 4: Commit**

```bash
git add manage.py
git commit -m "feat: add --no-cooldown and --force-overwrite to notion_sync CLI

Summary:
- Split old --force into two separate flags with distinct risk levels.
- --no-cooldown: skip debounce, sync immediately (low risk).
- --force-overwrite: overwrite Notion pages even if edited (high risk).

Implementation:
- manage.py passes force_overwrite to sync_local_to_notion().
- Manual CLI invocation always runs immediately (no debounce).

Tests:
- python3 -m compileall manage.py passed.

Notes:
- --no-cooldown is a no-op for manual CLI since it already runs immediately."
```

---

### Task 8: Full Regression and Integration Test

**Files:** None (verification only)

- [ ] **Step 1: Run all new tests**

```bash
cd server_flask
python3 -m unittest test_notion_image_cache.py test_notion_sync_state.py test_notion_sync.py -v
```
Expected: All tests PASS

- [ ] **Step 2: Run existing tests (regression)**

```bash
cd server_flask
python3 -m unittest test_content_index.py test_markdown_renderer.py test_post_template.py -v
```
Expected: All existing tests still PASS

- [ ] **Step 3: Compile check on all modified files**

```bash
cd server_flask
python3 -m compileall app/services/notion_image_cache.py app/services/notion_sync_state.py app/services/notion_sync.py
cd /Users/yun/code/MarkVault
python3 -m compileall manage.py
```
Expected: All files compile OK

- [ ] **Step 4: Commit (if any fixes were needed)**

Only if regression fixes were required. Otherwise, skip.
