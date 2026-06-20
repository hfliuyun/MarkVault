import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


class NotionImageCache:
    def __init__(self, cache_path: Path):
        self.cache_path = Path(cache_path)
        self._cache: dict[str, dict[str, Any]] = {}
        self._load()

    def _load(self) -> None:
        if not self.cache_path.exists():
            self._cache = {}
            return

        try:
            with self.cache_path.open("r", encoding="utf-8") as f:
                data = json.load(f)
        except (OSError, json.JSONDecodeError):
            self._cache = {}
            return

        if isinstance(data, dict):
            self._cache = {str(key): value for key, value in data.items() if isinstance(value, dict)}
        else:
            self._cache = {}

    def save(self) -> None:
        self.cache_path.parent.mkdir(parents=True, exist_ok=True)
        with self.cache_path.open("w", encoding="utf-8") as f:
            json.dump(self._cache, f, ensure_ascii=True, indent=2, sort_keys=True)
            f.write("\n")

    def file_hash(self, file_path: str) -> str | None:
        path = Path(file_path)
        if not path.exists() or not path.is_file():
            return None

        md5 = hashlib.md5()
        try:
            with path.open("rb") as f:
                for chunk in iter(lambda: f.read(8192), b""):
                    md5.update(chunk)
        except OSError:
            return None
        return md5.hexdigest()

    def get_cached_upload_id(self, rel_path: str, abs_path: str) -> str | None:
        entry = self._cache.get(rel_path)
        if not isinstance(entry, dict):
            return None

        current_hash = self.file_hash(abs_path)
        if not current_hash:
            return None

        if entry.get("content_hash") != current_hash:
            return None

        upload_id = entry.get("file_upload_id")
        return upload_id if isinstance(upload_id, str) and upload_id else None

    def update(self, rel_path: str, abs_path: str, file_upload_id: str) -> None:
        content_hash = self.file_hash(abs_path)
        if not content_hash:
            return

        self._cache[rel_path] = {
            "content_hash": content_hash,
            "file_upload_id": file_upload_id,
            "uploaded_at": datetime.now(timezone.utc).isoformat(),
        }

    def clear_for_article(self, path_prefix: str) -> None:
        keys_to_remove = [key for key in self._cache if key.startswith(path_prefix)]
        for key in keys_to_remove:
            self._cache.pop(key, None)

    def get_or_upload(self, rel_path: str, abs_path: str, service: Any) -> str | None:
        cached_upload_id = self.get_cached_upload_id(rel_path, abs_path)
        if cached_upload_id:
            return cached_upload_id

        upload_id = service.upload_local_file(abs_path)
        if not upload_id:
            return None

        self.update(rel_path, abs_path, upload_id)
        return upload_id
