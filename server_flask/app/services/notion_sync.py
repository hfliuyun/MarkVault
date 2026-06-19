import os
import requests
import mimetypes
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

    def upload_local_file(self, file_path: str) -> str:
        """Uploads a local file to Notion API and returns the file_id"""
        import os
        if not os.path.exists(file_path):
            print(f"File not found: {file_path}")
            return None
            
        file_name = os.path.basename(file_path)
        res = requests.post(
            f"{NOTION_API_URL}/file_uploads",
            headers=self.headers,
            json={"file_name": file_name}
        )
        if res.status_code != 200:
            print(f"Create file upload failed: {res.text}")
            return None
            
        data = res.json()
        upload_url = data.get("upload_url")
        file_id = data.get("id")
        
        content_type, _ = mimetypes.guess_type(file_path)
        if not content_type:
            content_type = "application/octet-stream"
            
        with open(file_path, "rb") as f:
            files = {"file": (file_name, f, content_type)}
            upload_headers = {"Authorization": self.headers["Authorization"], "Notion-Version": self.headers["Notion-Version"]}
            upload_res = requests.post(
                upload_url,
                headers=upload_headers,
                files=files
            )
            if upload_res.status_code != 200:
                print(f"Upload failed: {upload_res.text}")
                return None
                
        return file_id

    def create_page(self, properties: dict, children: list = None) -> str:
        payload = {"parent": {"database_id": self.database_id}, "properties": properties}
        if children:
            payload["children"] = children
        resp = requests.post(f"{NOTION_API_URL}/pages", headers=self.headers, json=payload)
        if resp.status_code != 200:
            raise NotionAPIError(f"Failed to create page: {resp.text}")
        return resp.json()["id"]

    def update_page(self, page_id: str, properties: dict) -> None:
        payload = {"properties": properties}
        resp = requests.patch(f"{NOTION_API_URL}/pages/{page_id}", headers=self.headers, json=payload)
        if resp.status_code != 200:
            raise NotionAPIError(f"Failed to update page {page_id}: {resp.text}")

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
                print(f"Failed to fetch blocks for {page_id}: {resp.text}")
                break
            data = resp.json()
            for block in data.get("results", []):
                block_ids.append(block["id"])
            has_more = data.get("has_more", False)
            next_cursor = data.get("next_cursor")
            
        for block_id in block_ids:
            del_resp = requests.delete(f"{NOTION_API_URL}/blocks/{block_id}", headers=self.headers)
            if del_resp.status_code != 200:
                print(f"Failed to delete block {block_id}: {del_resp.text}")

    def append_page_blocks(self, page_id: str, children: list) -> None:
        if not children:
            return
        # Append up to 100 blocks at once (Notion API limit)
        payload = {"children": children[:100]}
        resp = requests.patch(f"{NOTION_API_URL}/blocks/{page_id}/children", headers=self.headers, json=payload)
        if resp.status_code != 200:
            print(f"Failed to append blocks to {page_id}: {resp.text}")

import frontmatter
from pathlib import Path

from .mistletoe_notion import convert_to_notion_blocks

import hashlib
import json

def get_content_hash(metadata: dict, content: str) -> str:
    meta_subset = {
        "title": metadata.get("title"),
        "slug": metadata.get("slug"),
        "summary": metadata.get("summary"),
        "date": str(metadata.get("date")),
        "categories": metadata.get("categories"),
        "tags": metadata.get("tags"),
        "series": metadata.get("series")
    }
    raw = json.dumps(meta_subset, sort_keys=True) + "\n---\n" + content
    return hashlib.md5(raw.encode("utf-8")).hexdigest()


import threading
import os

_sync_lock = threading.Lock()

def sync_local_to_notion_async(content_root: Path):
    token = os.environ.get("NOTION_API_TOKEN")
    database_id = os.environ.get("NOTION_DATABASE_ID")
    if not token or not database_id:
        return

    def _run_sync():
        if not _sync_lock.acquire(blocking=False):
            # A sync is already running, skip this trigger.
            # Next time mtime changes, it will trigger again.
            return
        try:
            sync_local_to_notion(content_root, token, database_id)
        finally:
            _sync_lock.release()

    thread = threading.Thread(target=_run_sync)
    thread.daemon = True
    thread.start()

def sync_local_to_notion(content_root: Path, token: str, database_id: str):

    service = NotionSyncService(token, database_id)
    
    files = list(content_root.glob("posts/*/index.md")) + list(content_root.glob("series/*/*/index.md"))
    
    for file_path in files:
        try:
            post = frontmatter.load(file_path)
            metadata = post.metadata
            
            def handle_image_upload(src):
                import os
                # resolve path relative to the post directory
                abs_path = os.path.join(file_path.parent, src)
                return service.upload_local_file(abs_path)
                
            content_blocks = convert_to_notion_blocks(post.content, upload_callback=handle_image_upload)
            
            notion_meta = metadata.get("notion", {})
            if not isinstance(notion_meta, dict):
                notion_meta = {}
                
            page_id = notion_meta.get("page_id")
            current_hash = get_content_hash(metadata, post.content)
            saved_hash = notion_meta.get("content_hash")
            
            if page_id and current_hash == saved_hash:
                print(f"Skipping {metadata.get('title')} (no changes detected)")
                continue
                
            props = service.build_properties(metadata)
            
            if page_id:
                print(f"Updating Notion page for {metadata.get('title')}")
                service.update_page(page_id, props)
                service.clear_page_blocks(page_id)
                service.append_page_blocks(page_id, content_blocks)
            else:
                print(f"Creating Notion page for {metadata.get('title')}")
                page_id = service.create_page(props, children=content_blocks)
                notion_meta["page_id"] = page_id
                
            notion_meta["synced_at"] = datetime.now(timezone.utc).isoformat()
            notion_meta["content_hash"] = current_hash
            post.metadata["notion"] = notion_meta
            
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(frontmatter.dumps(post))
        except Exception as e:
            print(f"Error syncing {file_path}: {e}")

