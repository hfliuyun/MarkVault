"""Notion sync service for uploading local Markdown posts to Notion."""

from __future__ import annotations

import hashlib
import json
import mimetypes
import os
import threading
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

SYNC_DEBOUNCE_SECONDS = 30 * 60
SYNC_RETRY_DELAY_SECONDS = 60

DATA_DIR = Path(__file__).resolve().parents[2] / "data"


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
        if not os.path.exists(file_path):
            print(f"  File not found: {file_path}")
            return None

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
        if not upload_url or not file_id:
            print(f"  Create file upload returned incomplete response: {data}")
            return None

        content_type, _ = mimetypes.guess_type(file_path)
        if not content_type:
            content_type = "application/octet-stream"

        with open(file_path, "rb") as file_obj:
            files = {"file": (file_name, file_obj, content_type)}
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
        payload: dict[str, Any] = {"parent": {"database_id": self.database_id}, "properties": properties}
        if children:
            payload["children"] = children
        resp = requests.post(f"{NOTION_API_URL}/pages", headers=self.headers, json=payload)
        if resp.status_code != 200:
            raise NotionAPIError(f"Failed to create page: {resp.text}")
        return resp.json()

    def update_page(self, page_id: str, properties: dict) -> dict:
        payload = {"properties": properties}
        resp = requests.patch(f"{NOTION_API_URL}/pages/{page_id}", headers=self.headers, json=payload)
        if resp.status_code != 200:
            raise NotionAPIError(f"Failed to update page {page_id}: {resp.text}")
        return resp.json()

    def get_page_info(self, page_id: str) -> dict | None:
        resp = requests.get(f"{NOTION_API_URL}/pages/{page_id}", headers=self.headers)
        if resp.status_code != 200:
            print(f"  Failed to retrieve page {page_id}: {resp.text}")
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
        if not children:
            return True
        for start in range(0, len(children), 100):
            payload = {"children": children[start:start + 100]}
            resp = requests.patch(
                f"{NOTION_API_URL}/blocks/{page_id}/children",
                headers=self.headers,
                json=payload,
            )
            if resp.status_code != 200:
                print(f"  Failed to append blocks to {page_id}: {resp.text}")
                return False
        return True


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


def migrate_frontmatter(post: frontmatter.Post, file_key: str, sync_state: NotionSyncState) -> bool:
    notion_meta = post.metadata.get("notion", {})
    if not isinstance(notion_meta, dict):
        return False

    old_synced_at = notion_meta.pop("synced_at", None)
    old_content_hash = notion_meta.pop("content_hash", None)
    if old_synced_at is None and old_content_hash is None:
        return False

    if not sync_state.has_state(file_key):
        migrated: dict[str, Any] = {}
        if old_synced_at:
            migrated["synced_at"] = old_synced_at
        if old_content_hash:
            migrated["content_hash"] = old_content_hash
        if notion_meta.get("page_id"):
            migrated["page_id"] = notion_meta["page_id"]
        if migrated:
            sync_state.update(file_key, **migrated)

    page_id = notion_meta.get("page_id")
    if page_id:
        post.metadata["notion"] = {"page_id": page_id}
    else:
        post.metadata.pop("notion", None)
    return True


def sync_local_to_notion(
    content_root: Path,
    token: str,
    database_id: str,
    force_overwrite: bool = False,
) -> None:
    service = NotionSyncService(token, database_id)
    image_cache = NotionImageCache(DATA_DIR / "notion_image_cache.json")
    sync_state = NotionSyncState(DATA_DIR / "notion_sync_state.json")

    files = list(content_root.glob("posts/*/index.md")) + list(content_root.glob("series/*/*/index.md"))
    for file_path in files:
        try:
            _sync_file(file_path, content_root, service, image_cache, sync_state, force_overwrite)
        except Exception as error:
            print(f"Error syncing {file_path}: {error}")

    image_cache.save()
    sync_state.save()


def _sync_file(
    file_path: Path,
    content_root: Path,
    service: NotionSyncService,
    image_cache: NotionImageCache,
    sync_state: NotionSyncState,
    force_overwrite: bool,
) -> None:
    post = frontmatter.load(file_path)
    metadata = post.metadata
    file_key = str(file_path.relative_to(content_root))
    title = metadata.get("title", "Untitled")

    fm_modified = migrate_frontmatter(post, file_key, sync_state)
    state = sync_state.get(file_key)
    current_hash = get_content_hash(metadata, post.content)
    saved_hash = state.get("content_hash")

    notion_meta = metadata.get("notion", {})
    if not isinstance(notion_meta, dict):
        notion_meta = {}
    page_id = notion_meta.get("page_id")

    if page_id and current_hash == saved_hash:
        if fm_modified:
            _rewrite_frontmatter(post, file_path)
        print(f"Skipping {title} (no changes detected)")
        return

    if page_id and not _prepare_existing_page(
        file_key,
        page_id,
        title,
        metadata,
        service,
        sync_state,
        force_overwrite,
    ):
        if fm_modified:
            _rewrite_frontmatter(post, file_path)
        sync_state.save()
        return

    props = service.build_properties(metadata)
    content_blocks = _convert_blocks_with_cache(file_path, content_root, post.content, image_cache, service)

    if page_id:
        print(f"Updating Notion page for {title}")
        response = service.update_page(page_id, props)
        service.clear_page_blocks(page_id)
        if not service.append_page_blocks(page_id, content_blocks):
            article_prefix = str(file_path.parent.relative_to(content_root)) + "/"
            print(f"  Append failed, clearing image cache and retrying for {title}")
            image_cache.clear_for_article(article_prefix)
            content_blocks = _convert_blocks_with_cache(file_path, content_root, post.content, image_cache, service)
            if not service.append_page_blocks(page_id, content_blocks):
                print(f"  Retry also failed for {title}, skipping.")
                return
    else:
        print(f"Creating Notion page for {title}")
        response = service.create_page(props, children=content_blocks)
        page_id = response["id"]
        post.metadata["notion"] = {"page_id": page_id}
        fm_modified = True

    page_info = service.get_page_info(page_id)
    notion_last_edited_time = (
        page_info.get("last_edited_time", "")
        if page_info
        else response.get("last_edited_time", "")
    )

    sync_state.record_sync(
        file_key,
        content_hash=current_hash,
        notion_last_edited_time=notion_last_edited_time,
        page_id=page_id,
    )

    if fm_modified:
        _rewrite_frontmatter(post, file_path)


def _prepare_existing_page(
    file_key: str,
    page_id: str,
    title: str,
    metadata: dict,
    service: NotionSyncService,
    sync_state: NotionSyncState,
    force_overwrite: bool,
) -> bool:
    state = sync_state.get(file_key)
    recorded_edited_time = state.get("notion_last_edited_time")
    page_info = service.get_page_info(page_id)
    current_edited_time = page_info.get("last_edited_time") if page_info else None

    if recorded_edited_time:
        if page_info is None and not force_overwrite:
            print(
                f'CONFLICT: "{title}" could not be checked because Notion page metadata was unavailable.\n'
                f"  Use --force-overwrite to sync anyway.\n"
                f"  Skipping this article."
            )
            return False
        if current_edited_time and current_edited_time != recorded_edited_time and not force_overwrite:
            print(
                f'CONFLICT: "{title}" has been edited in Notion since last sync.\n'
                f"  Notion last_edited_time: {current_edited_time} (current)\n"
                f"  Recorded after sync:     {recorded_edited_time}\n"
                f"  Use --force-overwrite to overwrite Notion changes.\n"
                f"  Skipping this article."
            )
            return False
        if current_edited_time and current_edited_time != recorded_edited_time:
            print(f'WARNING: Force-overwriting "{title}" (Notion edited since last sync)')
        return True

    props = service.build_properties(metadata)
    response = service.update_page(page_id, props)
    page_info_after_update = service.get_page_info(page_id)
    adopted_edited_time = (
        page_info_after_update.get("last_edited_time", "")
        if page_info_after_update
        else response.get("last_edited_time") or current_edited_time or ""
    )
    sync_state.record_adopt(file_key, notion_last_edited_time=adopted_edited_time, page_id=page_id)
    if not force_overwrite:
        print(
            f'ADOPT: "{title}" has page_id but no sync state recorded.\n'
            f"  Adopting current Notion state. Properties updated, body sync skipped.\n"
            f"  Use --force-overwrite to force full sync including body."
        )
        return False

    print(f'WARNING: Force-overwriting "{title}" body (adopted state)')
    return True


def _convert_blocks_with_cache(
    file_path: Path,
    content_root: Path,
    content: str,
    image_cache: NotionImageCache,
    service: NotionSyncService,
) -> list:
    def handle_image_upload(src: str) -> str | None:
        abs_path = file_path.parent / src
        if not abs_path.exists():
            print(f"  Image not found: {abs_path}")
            return None
        rel_path = str(abs_path.relative_to(content_root))
        return image_cache.get_or_upload(rel_path, str(abs_path), service)

    return convert_to_notion_blocks(content, upload_callback=handle_image_upload)


def _rewrite_frontmatter(post: frontmatter.Post, file_path: Path) -> None:
    with open(file_path, "w", encoding="utf-8") as file_obj:
        file_obj.write(frontmatter.dumps(post))


_sync_lock = threading.Lock()
_sync_timer: threading.Timer | None = None
_sync_timer_lock = threading.Lock()


def _schedule_sync(delay: float, content_root: Path, token: str, database_id: str) -> None:
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
    if not _sync_lock.acquire(blocking=False):
        _schedule_sync(SYNC_RETRY_DELAY_SECONDS, content_root, token, database_id)
        return
    try:
        sync_local_to_notion(content_root, token, database_id)
    finally:
        _sync_lock.release()


def sync_local_to_notion_async(content_root: Path) -> None:
    token = os.environ.get("NOTION_API_TOKEN")
    database_id = os.environ.get("NOTION_DATABASE_ID")
    if not token or not database_id:
        return

    _schedule_sync(SYNC_DEBOUNCE_SECONDS, content_root, token, database_id)
