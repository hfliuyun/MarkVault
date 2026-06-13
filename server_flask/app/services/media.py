import re
from pathlib import Path

from flask import send_from_directory
from werkzeug.exceptions import NotFound


LOCAL_IMAGE_RE = re.compile(r"(!\[[^\]]*\]\()images/([^)]+)(\))")


def rewrite_local_image_paths(markdown_text: str, slug: str) -> str:
    def replace(match: re.Match[str]) -> str:
        filename = match.group(2).strip()
        return f"{match.group(1)}/api/media/posts/{slug}/images/{filename}{match.group(3)}"

    return LOCAL_IMAGE_RE.sub(replace, markdown_text)


def send_post_image(image_dir: Path | None, filename: str):
    if image_dir is None:
        raise NotFound()

    image_path = image_dir / filename
    try:
        image_path.resolve().relative_to(image_dir.resolve())
    except ValueError as exc:
        raise NotFound() from exc
    return send_from_directory(image_dir, filename)
