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
