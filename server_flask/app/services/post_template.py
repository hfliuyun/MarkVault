from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path


SLUG_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


class PostTemplateError(RuntimeError):
    pass


@dataclass(frozen=True)
class NewPostOptions:
    title: str
    slug: str
    summary: str = ""
    categories: tuple[str, ...] = ()
    tags: tuple[str, ...] = ()
    series_id: str | None = None
    series_title: str | None = None
    series_order: int | None = None
    date_text: str | None = None
    content_root: Path | None = None


@dataclass(frozen=True)
class GeneratedPost:
    post_dir: Path
    index_path: Path
    images_dir: Path


def default_content_root() -> Path:
    configured_root = os.environ.get("BLOG_CONTENT_ROOT")
    if configured_root:
        return Path(configured_root).expanduser().resolve()
    return Path(__file__).resolve().parents[3] / "content"


def create_post_template(options: NewPostOptions) -> GeneratedPost:
    title = options.title.strip()
    slug = options.slug.strip()
    if not title:
        raise PostTemplateError("Post title cannot be empty.")
    if not SLUG_PATTERN.fullmatch(slug):
        raise PostTemplateError(
            "Slug must use lowercase letters, numbers, and single hyphens, "
            "for example: logistic-regression."
        )

    if options.series_order is not None and options.series_id is None:
        raise PostTemplateError("--series-order requires --series-id.")

    content_root = (options.content_root or default_content_root()).expanduser().resolve()
    post_dir = content_root / "posts" / slug
    index_path = post_dir / "index.md"
    images_dir = post_dir / "images"

    if post_dir.exists() or index_path.exists():
        raise PostTemplateError(f"Post already exists for slug '{slug}': {post_dir}")

    frontmatter = _build_frontmatter(options, title, slug)
    body = f"{frontmatter}\n\n## {title}\n\n"

    post_dir.mkdir(parents=True, exist_ok=False)
    images_dir.mkdir()
    index_path.write_text(body, encoding="utf-8")

    return GeneratedPost(post_dir=post_dir, index_path=index_path, images_dir=images_dir)


def _build_frontmatter(options: NewPostOptions, title: str, slug: str) -> str:
    lines = [
        "---",
        f"title: {_yaml_scalar(title)}",
        f"slug: {_yaml_scalar(slug)}",
        f"date: {_yaml_scalar(options.date_text or _current_date_text())}",
        f"summary: {_yaml_scalar(options.summary.strip())}",
    ]
    lines.extend(_yaml_list_field("categories", options.categories))
    lines.extend(_yaml_list_field("tags", options.tags))

    if options.series_id:
        lines.extend(
            [
                "series:",
                f"  id: {_yaml_scalar(options.series_id.strip())}",
                f"  title: {_yaml_scalar((options.series_title or options.series_id).strip())}",
            ]
        )
        if options.series_order is not None:
            lines.append(f"  order: {options.series_order}")

    lines.append("---")
    return "\n".join(lines)


def _current_date_text() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _yaml_scalar(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


def _yaml_list_field(name: str, values: tuple[str, ...]) -> list[str]:
    normalized = [value.strip() for value in values if value.strip()]
    if not normalized:
        return [f"{name}: []"]
    return [f"{name}:", *[f"  - {_yaml_scalar(value)}" for value in normalized]]
