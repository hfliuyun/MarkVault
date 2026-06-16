from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Any

import frontmatter

from app.models.post import Post
from app.services.markdown_renderer import build_toc, render_markdown_to_html
from app.services.media import rewrite_local_image_paths


class ContentIndexError(RuntimeError):
    pass


@dataclass(frozen=True)
class RenderedPost:
    metadata: dict[str, Any]
    content: str
    toc: list[dict[str, Any]]
    series_posts: list[dict[str, Any]]

    def to_dict(self) -> dict[str, Any]:
        payload = dict(self.metadata)
        payload["content"] = self.content
        payload["toc"] = self.toc
        payload["series_posts"] = self.series_posts
        return payload


class ContentIndex:
    def __init__(self, content_root: Path):
        self.content_root = content_root
        self.posts_root = content_root / "posts"
        self.series_root = content_root / "series"
        self.legacy_map_path = content_root / "legacy" / "abbrlink-map.json"
        self.posts_by_slug: dict[str, Post] = {}
        self.posts: list[Post] = []
        self.series_by_id: dict[str, dict[str, Any]] = {}
        self.categories: dict[str, list[Post]] = {}
        self.tags: dict[str, list[Post]] = {}
        self.legacy_redirects: dict[str, str] = {}
        self.content_signature: tuple[tuple[str, int, int], ...] = ()
        self.reload()

    def reload(self) -> None:
        content_signature = self._build_content_signature()
        posts = self._load_posts()
        self.posts_by_slug = {post.slug: post for post in posts}
        self.posts = sorted(posts, key=lambda post: post.date, reverse=True)
        self.series_by_id = self._build_series_index(posts)
        self.categories = self._build_taxonomy_index(posts, "categories")
        self.tags = self._build_taxonomy_index(posts, "tags")
        self.legacy_redirects = self._build_legacy_redirects(posts)
        self.content_signature = content_signature

    def reload_if_changed(self) -> None:
        if self._build_content_signature() != self.content_signature:
            self.reload()

    def list_posts(self, page: int = 1, size: int = 10) -> dict[str, Any]:
        page = max(page, 1)
        size = max(size, 1)
        start = (page - 1) * size
        end = start + size
        items = self.posts[start:end]
        return {
            "total": len(self.posts),
            "page": page,
            "size": len(items),
            "articles": [post.to_metadata_dict() for post in items],
        }

    def get_post(self, slug: str) -> RenderedPost | None:
        post = self.posts_by_slug.get(slug)
        if not post:
            return None

        markdown_text = rewrite_local_image_paths(post.body, post.slug)
        metadata = post.to_metadata_dict()
        series_posts = []
        if post.series and post.series.get("id"):
            series = self.series_by_id.get(str(post.series["id"]))
            if series:
                series_posts = series["posts"]

        return RenderedPost(
            metadata=metadata,
            content=render_markdown_to_html(markdown_text),
            toc=build_toc(post.body),
            series_posts=series_posts,
        )

    def list_series(self) -> dict[str, Any]:
        return {
            "series": [
                {
                    "id": series["id"],
                    "title": series["title"],
                    "count": len(series["posts"]),
                    "updated_at": series["updated_at"],
                    "description_html": series["description_html"],
                }
                for series in sorted(
                    self.series_by_id.values(),
                    key=lambda item: item["updated_at"],
                    reverse=True,
                )
            ]
        }

    def get_series(self, series_id: str) -> dict[str, Any] | None:
        series = self.series_by_id.get(series_id)
        if not series:
            return None
        return {
            "id": series["id"],
            "title": series["title"],
            "count": len(series["posts"]),
            "updated_at": series["updated_at"],
            "description_html": series["description_html"],
            "posts": series["posts"],
        }

    def list_categories(self) -> dict[str, Any]:
        return {"categories": self._serialize_taxonomy(self.categories)}

    def list_tags(self) -> dict[str, Any]:
        return {"tags": self._serialize_taxonomy(self.tags)}

    def search_posts(self, query: str) -> dict[str, Any]:
        normalized_query = query.strip()
        if not normalized_query:
            return {"query": "", "total": 0, "articles": []}

        lowered_query = normalized_query.casefold()
        articles = [
            post.to_metadata_dict()
            for post in self.posts
            if lowered_query in self._search_text(post)
        ]
        return {
            "query": normalized_query,
            "total": len(articles),
            "articles": articles,
        }

    def resolve_legacy_abbrlink(self, abbrlink: str) -> str | None:
        return self.legacy_redirects.get(str(abbrlink))

    def get_post_image_dir(self, slug: str) -> Path | None:
        post = self.posts_by_slug.get(slug)
        if not post:
            return None
        return post.source_path.parent / "images"

    def _load_posts(self) -> list[Post]:
        posts: list[Post] = []
        seen_slugs: dict[str, Path] = {}
        for index_path in self._iter_post_index_paths():
            post = self._load_post(index_path)
            if post.slug in seen_slugs:
                first_path = seen_slugs[post.slug]
                raise ContentIndexError(
                    f"Duplicate slug '{post.slug}' in {first_path} and {index_path}"
                )
            seen_slugs[post.slug] = index_path
            posts.append(post)
        return posts

    def _build_content_signature(self) -> tuple[tuple[str, int, int], ...]:
        signature = []
        for index_path in self._iter_post_index_paths():
            stat = index_path.stat()
            signature.append(
                (
                    index_path.relative_to(self.content_root).as_posix(),
                    stat.st_mtime_ns,
                    stat.st_size,
                )
            )
        for readme_path in self._iter_series_readme_paths():
            stat = readme_path.stat()
            signature.append(
                (
                    readme_path.relative_to(self.content_root).as_posix(),
                    stat.st_mtime_ns,
                    stat.st_size,
                )
            )
        legacy_map_signature = self._build_file_signature(self.legacy_map_path)
        if legacy_map_signature:
            signature.append(legacy_map_signature)
        return tuple(signature)

    def _build_file_signature(self, file_path: Path) -> tuple[str, int, int] | None:
        if not file_path.exists():
            return None
        stat = file_path.stat()
        return (
            file_path.relative_to(self.content_root).as_posix(),
            stat.st_mtime_ns,
            stat.st_size,
        )

    def _iter_post_index_paths(self) -> list[Path]:
        paths = [
            *self.posts_root.glob("*/index.md"),
            *self.series_root.glob("*/*/index.md"),
        ]
        return sorted(paths, key=lambda path: path.relative_to(self.content_root).as_posix())

    def _iter_series_readme_paths(self) -> list[Path]:
        paths = [*self.series_root.glob("*/README.md")]
        return sorted(paths, key=lambda path: path.relative_to(self.content_root).as_posix())

    def _load_post(self, index_path: Path) -> Post:
        parsed = frontmatter.load(index_path)
        metadata = dict(parsed.metadata)

        missing = [field for field in ("title", "slug", "date") if not metadata.get(field)]
        if missing:
            raise ContentIndexError(
                f"{index_path} is missing required metadata: {', '.join(missing)}"
            )

        title = str(metadata.pop("title"))
        slug = str(metadata.pop("slug"))
        date_value = self._parse_date(metadata.pop("date"), index_path)
        summary = str(metadata.pop("summary", "") or "")
        categories = self._normalize_list(metadata.pop("categories", []))
        tags = self._normalize_list(metadata.pop("tags", []))
        series = metadata.pop("series", None)
        notion = metadata.pop("notion", None)
        legacy = metadata.pop("legacy", None)

        if series is not None and not isinstance(series, dict):
            raise ContentIndexError(f"{index_path} field 'series' must be an object")
        if legacy is not None and not isinstance(legacy, dict):
            raise ContentIndexError(f"{index_path} field 'legacy' must be an object")

        return Post(
            title=title,
            slug=slug,
            date=date_value,
            summary=summary,
            categories=categories,
            tags=tags,
            series=series,
            notion=notion,
            legacy=legacy,
            source_path=index_path,
            body=parsed.content,
            extra=metadata,
        )

    def _build_series_index(self, posts: list[Post]) -> dict[str, dict[str, Any]]:
        grouped: dict[str, dict[str, Any]] = {}
        for post in posts:
            if not post.series or not post.series.get("id"):
                continue
            series_id = str(post.series["id"])
            series_title = str(post.series.get("title") or series_id)
            grouped.setdefault(
                series_id,
                {
                    "id": series_id,
                    "title": series_title,
                    "posts": [],
                    "updated_at": "",
                    "description_md": "",
                    "description_html": "",
                },
            )
            grouped[series_id]["posts"].append(post)

        for series in grouped.values():
            readme_path = self.series_root / series["id"] / "README.md"
            if readme_path.exists():
                description_md, readme_title = self._load_series_readme(readme_path)
                series["description_md"] = description_md
                series["description_html"] = (
                    render_markdown_to_html(description_md)
                    if description_md.strip()
                    else ""
                )
                if readme_title:
                    series["title"] = readme_title

            ordered_posts = sorted(
                series["posts"],
                key=lambda post: (
                    self._series_order(post),
                    post.date,
                ),
            )
            series["posts"] = [post.to_metadata_dict() for post in ordered_posts]
            series["updated_at"] = max(post.date for post in ordered_posts).strftime(
                "%Y-%m-%d %H:%M:%S"
            )

        return grouped

    def _load_series_readme(self, readme_path: Path) -> tuple[str, str]:
        try:
            parsed = frontmatter.load(readme_path)
        except Exception as error:  # noqa: BLE001
            raise ContentIndexError(
                f"{readme_path} has invalid frontmatter or Markdown: {error}"
            ) from error

        description_md = parsed.content
        title = str(parsed.metadata.get("title") or "").strip()
        return description_md, title

    def _build_legacy_redirects(self, posts: list[Post]) -> dict[str, str]:
        redirects: dict[str, str] = {}
        for post in posts:
            for abbrlink in self._legacy_abbrlinks(post):
                self._add_legacy_redirect(redirects, abbrlink, post.slug, post.source_path)

        file_redirects = self._load_legacy_map_file()
        for abbrlink, slug in file_redirects.items():
            if slug not in self.posts_by_slug:
                raise ContentIndexError(
                    f"{self.legacy_map_path} maps abbrlink '{abbrlink}' "
                    f"to unknown slug '{slug}'"
                )
            self._add_legacy_redirect(redirects, abbrlink, slug, self.legacy_map_path)

        return redirects

    def _legacy_abbrlinks(self, post: Post) -> list[str]:
        if not post.legacy:
            return []
        return self._normalize_list(post.legacy.get("abbrlinks"))

    def _load_legacy_map_file(self) -> dict[str, str]:
        if not self.legacy_map_path.exists():
            return {}
        try:
            data = json.loads(self.legacy_map_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as error:
            raise ContentIndexError(
                f"{self.legacy_map_path} has invalid JSON: {error}"
            ) from error

        if not isinstance(data, dict):
            raise ContentIndexError(f"{self.legacy_map_path} must contain a JSON object")

        return {str(abbrlink): str(slug) for abbrlink, slug in data.items()}

    def _add_legacy_redirect(
        self,
        redirects: dict[str, str],
        abbrlink: str,
        slug: str,
        source_path: Path,
    ) -> None:
        existing_slug = redirects.get(abbrlink)
        if existing_slug and existing_slug != slug:
            raise ContentIndexError(
                f"Legacy abbrlink '{abbrlink}' maps to both "
                f"'{existing_slug}' and '{slug}' in {source_path}"
            )
        redirects[abbrlink] = slug

    def _build_taxonomy_index(
        self, posts: list[Post], field_name: str
    ) -> dict[str, list[Post]]:
        grouped: dict[str, list[Post]] = {}
        for post in posts:
            for value in getattr(post, field_name):
                grouped.setdefault(value, []).append(post)
        return grouped

    def _serialize_taxonomy(self, taxonomy: dict[str, list[Post]]) -> list[dict[str, Any]]:
        return [
            {
                "name": name,
                "count": len(posts),
                "posts": [post.to_metadata_dict() for post in posts],
            }
            for name, posts in sorted(taxonomy.items(), key=lambda item: item[0])
        ]

    def _search_text(self, post: Post) -> str:
        return "\n".join(
            [
                post.title,
                post.summary,
                post.body,
                *post.categories,
                *post.tags,
            ]
        ).casefold()

    def _parse_date(self, value: Any, path: Path) -> datetime:
        if isinstance(value, datetime):
            return value
        if isinstance(value, date):
            return datetime.combine(value, datetime.min.time())
        if isinstance(value, str):
            for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
                try:
                    return datetime.strptime(value, fmt)
                except ValueError:
                    continue
        raise ContentIndexError(f"{path} has invalid date metadata: {value!r}")

    def _normalize_list(self, value: Any) -> list[str]:
        if value is None:
            return []
        if isinstance(value, list):
            return [str(item) for item in value if str(item).strip()]
        return [str(value)]

    def _series_order(self, post: Post) -> int:
        if not post.series:
            return 10**9
        value = post.series.get("order")
        try:
            return int(value)
        except (TypeError, ValueError):
            return 10**9
