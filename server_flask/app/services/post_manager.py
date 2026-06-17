from __future__ import annotations

import io
import os
import shutil
import tempfile
import zipfile
from datetime import date, datetime
from pathlib import Path
from typing import Any

import frontmatter

from app.services.post_template import (
    NewPostOptions,
    SLUG_PATTERN,
    _build_frontmatter,
)


MAX_UPLOAD_BYTES = 50 * 1024 * 1024
ALLOWED_EXT = {".md", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp"}
DATE_FORMATS = ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d")


class PostManagerError(RuntimeError):
    status_code = 400


class PostConflictError(PostManagerError):
    status_code = 409


class PostNotFoundError(PostManagerError):
    status_code = 404


def build_template_zip(options: NewPostOptions) -> io.BytesIO:
    """Build an in-memory template ZIP containing <slug>/index.md and an empty
    <slug>/images/ directory. Mirrors create_post_template() validation without
    writing to disk."""
    title = options.title.strip()
    slug = options.slug.strip()
    if not title:
        raise PostManagerError("Post title cannot be empty.")
    if not SLUG_PATTERN.fullmatch(slug):
        raise PostManagerError(
            "Slug must use lowercase letters, numbers, and single hyphens, "
            "for example: logistic-regression."
        )
    if options.series_order is not None and not options.series_id:
        raise PostManagerError("series_order requires series_id.")

    frontmatter_text = _build_frontmatter(options, title, slug)
    body = f"{frontmatter_text}\n\n## {title}\n\n"

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(f"{slug}/index.md", body)
        # Empty images/ directory. zf.mkdir() is Python 3.11+, so add a
        # trailing-slash ZipInfo entry which all unzip tools treat as a folder.
        zf.writestr(zipfile.ZipInfo(f"{slug}/images/"), "")
    buf.seek(0)
    return buf


def determine_target_dir(content_root: Path, metadata: dict[str, Any]) -> Path:
    """Resolve the destination directory for a post from its frontmatter."""
    slug = str(metadata["slug"])
    series = metadata.get("series")
    if isinstance(series, dict) and series.get("id"):
        return content_root / "series" / str(series["id"]) / slug
    return content_root / "posts" / slug


def process_upload(file_storage, overwrite: bool, content_root: Path) -> dict[str, Any]:
    """Validate and publish an uploaded post ZIP into the content directory."""
    filename = (getattr(file_storage, "filename", "") or "").strip()
    if not filename:
        raise PostManagerError("No file provided.")
    if not filename.lower().endswith(".zip"):
        raise PostManagerError("Upload must be a .zip file.")

    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        zip_path = tmp_path / "upload.zip"
        file_storage.save(str(zip_path))

        if zip_path.stat().st_size > MAX_UPLOAD_BYTES:
            raise PostManagerError("ZIP file exceeds the 50MB limit.")
        if not zipfile.is_zipfile(zip_path):
            raise PostManagerError("Uploaded file is not a valid ZIP archive.")

        extract_root = tmp_path / "extracted"
        extract_root.mkdir()
        _safe_extract(zip_path, extract_root)

        post_dir = _locate_post_dir(extract_root)
        index_path = post_dir / "index.md"
        metadata = _parse_and_validate(index_path)

        target_dir = determine_target_dir(content_root, metadata)
        if target_dir.exists() and not overwrite:
            raise PostConflictError(
                f"A post already exists for slug '{metadata['slug']}'."
            )

        _publish(post_dir, target_dir)

    slug = str(metadata["slug"])
    series = metadata.get("series")
    location = "series" if isinstance(series, dict) and series.get("id") else "posts"
    rel = target_dir.relative_to(content_root.parent).as_posix()
    return {"slug": slug, "location": location, "path": f"{rel}/"}


def delete_post(slug: str, content_index) -> dict[str, str]:
    """Delete an entire post directory (posts/ or series/) by slug."""
    post = content_index.posts_by_slug.get(slug)
    if not post:
        raise PostNotFoundError(f"Post '{slug}' not found.")
    shutil.rmtree(post.source_path.parent)
    return {"slug": slug}


def _safe_extract(zip_path: Path, extract_root: Path) -> None:
    """Extract a ZIP, guarding against path traversal and skipping files whose
    extension is not in ALLOWED_EXT (and macOS metadata junk)."""
    with zipfile.ZipFile(zip_path) as zf:
        for info in zf.infolist():
            name = info.filename
            if name.endswith("/"):
                continue  # directory entry
            parts = Path(name).parts
            if os.path.isabs(name) or any(part == ".." for part in parts):
                raise PostManagerError("ZIP entry has an illegal path (path traversal).")
            base = os.path.basename(name)
            if "__MACOSX" in parts or base.startswith("._") or base == ".DS_Store":
                continue
            if Path(name).suffix.lower() not in ALLOWED_EXT:
                continue  # skip disallowed file types
            dest = extract_root / name
            dest.parent.mkdir(parents=True, exist_ok=True)
            with zf.open(info) as src, open(dest, "wb") as out:
                shutil.copyfileobj(src, out)


def _locate_post_dir(extract_root: Path) -> Path:
    """Find the directory containing index.md. Supports structure B (index.md at
    the top level) and structure A (a single <slug>/index.md subdirectory)."""
    if (extract_root / "index.md").is_file():
        return extract_root
    candidates = [p.parent for p in extract_root.glob("*/index.md") if p.is_file()]
    if len(candidates) == 1:
        return candidates[0]
    if not candidates:
        raise PostManagerError("ZIP does not contain an index.md file.")
    raise PostManagerError("ZIP contains multiple index.md files; cannot determine the post.")


def _parse_and_validate(index_path: Path) -> dict[str, Any]:
    """Parse index.md frontmatter and validate required fields. Mirrors the
    relevant checks in ContentIndex._load_post()."""
    try:
        parsed = frontmatter.load(index_path)
    except Exception as error:  # noqa: BLE001
        raise PostManagerError(f"index.md has invalid frontmatter: {error}") from error
    metadata = dict(parsed.metadata)

    missing = [field for field in ("title", "slug", "date") if not metadata.get(field)]
    if missing:
        raise PostManagerError(f"Missing required metadata: {', '.join(missing)}.")

    slug = str(metadata["slug"])
    if not SLUG_PATTERN.fullmatch(slug):
        raise PostManagerError(
            "Slug must use lowercase letters, numbers, and single hyphens."
        )

    date_value = metadata["date"]
    if isinstance(date_value, str):
        if not any(_parses_with(date_value, fmt) for fmt in DATE_FORMATS):
            raise PostManagerError(
                "date must be 'YYYY-MM-DD HH:mm:ss' or 'YYYY-MM-DD'."
            )
    elif not isinstance(date_value, (datetime, date)):
        raise PostManagerError("date metadata is invalid.")

    series = metadata.get("series")
    if series is not None:
        if not isinstance(series, dict):
            raise PostManagerError("'series' must be an object.")
        if series.get("order") is not None and not series.get("id"):
            raise PostManagerError("series.order requires series.id.")

    return metadata


def _parses_with(value: str, fmt: str) -> bool:
    try:
        datetime.strptime(value, fmt)
        return True
    except ValueError:
        return False


def _publish(post_dir: Path, target_dir: Path) -> None:
    """Copy post_dir into target_dir. On overwrite, back up the existing
    directory and restore it if the copy fails (spec 5.4)."""
    backup: Path | None = None
    if target_dir.exists():
        backup = target_dir.with_name(target_dir.name + ".bak")
        if backup.exists():
            shutil.rmtree(backup)
        target_dir.rename(backup)
    try:
        target_dir.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(post_dir, target_dir)
    except Exception:
        if backup is not None:
            if target_dir.exists():
                shutil.rmtree(target_dir)
            backup.rename(target_dir)
        raise
    else:
        if backup is not None:
            shutil.rmtree(backup)
