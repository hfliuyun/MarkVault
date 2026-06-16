from __future__ import annotations

import json
import secrets
import string
from datetime import datetime, timedelta
from pathlib import Path


SERVER_ROOT = Path(__file__).resolve().parents[2]
PASTE_DIR = SERVER_ROOT / "data" / "pastes"
EXPIRY_MAP = {
    "1h": timedelta(hours=1),
    "1d": timedelta(days=1),
    "1w": timedelta(weeks=1),
    "never": None,
}


class PasteError(ValueError):
    pass


def ensure_paste_dir() -> None:
    PASTE_DIR.mkdir(parents=True, exist_ok=True)


def generate_paste_id(length: int = 8) -> str:
    alphabet = string.ascii_lowercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


def parse_expiry(expires_in: str | None):
    value = expires_in or "1d"
    if value not in EXPIRY_MAP:
        raise PasteError("Invalid expires_in")
    delta = EXPIRY_MAP[value]
    return datetime.now().astimezone() + delta if delta else None


def paste_path(paste_id: str) -> Path:
    if not paste_id or any(char not in string.ascii_lowercase + string.digits for char in paste_id):
        raise PasteError("Invalid paste id")
    return PASTE_DIR / f"{paste_id}.json"


def is_expired(paste: dict) -> bool:
    expires_at = paste.get("expires_at")
    if not expires_at:
        return False
    try:
        return datetime.fromisoformat(expires_at) <= datetime.now().astimezone()
    except ValueError:
        return True


def read_paste_file(path: Path) -> dict | None:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def create_paste(content: str, title: str = "", language: str = "text", expires_in: str = "1d") -> dict:
    if not str(content or "").strip():
        raise PasteError("Content is required")

    ensure_paste_dir()
    paste_id = generate_paste_id()
    while paste_path(paste_id).exists():
        paste_id = generate_paste_id()

    created_at = datetime.now().astimezone()
    expires_at = parse_expiry(expires_in)
    paste = {
        "id": paste_id,
        "title": str(title or "").strip(),
        "content": str(content),
        "language": str(language or "text").strip() or "text",
        "created_at": created_at.isoformat(timespec="seconds"),
        "expires_at": expires_at.isoformat(timespec="seconds") if expires_at else None,
    }
    paste_path(paste_id).write_text(
        json.dumps(paste, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return paste


def get_paste(paste_id: str) -> dict | None:
    ensure_paste_dir()
    path = paste_path(paste_id)
    if not path.exists():
        return None
    paste = read_paste_file(path)
    if not paste or is_expired(paste):
        path.unlink(missing_ok=True)
        return None
    return paste


def list_pastes() -> list[dict]:
    ensure_paste_dir()
    cleanup_expired()
    pastes = []
    for path in PASTE_DIR.glob("*.json"):
        paste = read_paste_file(path)
        if not paste:
            continue
        summary = {key: value for key, value in paste.items() if key != "content"}
        pastes.append(summary)
    return sorted(pastes, key=lambda item: item.get("created_at", ""), reverse=True)


def delete_paste(paste_id: str) -> bool:
    ensure_paste_dir()
    path = paste_path(paste_id)
    if not path.exists():
        return False
    path.unlink()
    return True


def cleanup_expired() -> int:
    ensure_paste_dir()
    deleted = 0
    for path in PASTE_DIR.glob("*.json"):
        paste = read_paste_file(path)
        if not paste or is_expired(paste):
            path.unlink(missing_ok=True)
            deleted += 1
    return deleted
