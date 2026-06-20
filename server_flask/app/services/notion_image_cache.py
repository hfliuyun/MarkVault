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
