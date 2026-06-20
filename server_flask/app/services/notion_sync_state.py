import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


class NotionSyncState:
    def __init__(self, state_path: Path):
        self.state_path = Path(state_path)
        self._state: dict[str, dict[str, Any]] = {}
        self._load()

    def _load(self) -> None:
        if not self.state_path.exists():
            self._state = {}
            return

        try:
            with self.state_path.open("r", encoding="utf-8") as f:
                data = json.load(f)
        except (OSError, json.JSONDecodeError):
            self._state = {}
            return

        if isinstance(data, dict):
            self._state = {
                str(file_key): value
                for file_key, value in data.items()
                if isinstance(value, dict)
            }
        else:
            self._state = {}

    def save(self) -> None:
        self.state_path.parent.mkdir(parents=True, exist_ok=True)
        with self.state_path.open("w", encoding="utf-8") as f:
            json.dump(self._state, f, ensure_ascii=True, indent=2, sort_keys=True)
            f.write("\n")

    def get(self, file_key: str) -> dict[str, Any]:
        state = self._state.get(file_key)
        if not isinstance(state, dict):
            return {}
        return dict(state)

    def update(self, file_key: str, **kwargs: Any) -> None:
        current_state = self._state.get(file_key)
        if not isinstance(current_state, dict):
            current_state = {}
        current_state.update(kwargs)
        self._state[file_key] = current_state

    def has_state(self, file_key: str) -> bool:
        return file_key in self._state and isinstance(self._state[file_key], dict)

    def record_sync(self, file_key: str, content_hash: str, notion_last_edited_time: str, page_id: str) -> None:
        self.update(
            file_key,
            content_hash=content_hash,
            synced_at=datetime.now(timezone.utc).isoformat(),
            notion_last_edited_time=notion_last_edited_time,
            page_id=page_id,
        )

    def record_adopt(self, file_key: str, notion_last_edited_time: str, page_id: str) -> None:
        self.update(
            file_key,
            synced_at=datetime.now(timezone.utc).isoformat(),
            notion_last_edited_time=notion_last_edited_time,
            page_id=page_id,
        )
        self._state[file_key].pop("content_hash", None)
