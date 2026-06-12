import re
from typing import Any

import markdown


HEADING_RE = re.compile(r"^(#{1,6})\s+(.+?)\s*$")


def render_markdown_to_html(markdown_text: str) -> str:
    """Render Markdown to an HTML fragment; math is rendered by the Vue client."""
    return markdown.markdown(
        markdown_text,
        extensions=["tables", "footnotes", "fenced_code", "toc"],
        extension_configs={"toc": {"slugify": slugify_heading}},
    )


def build_toc(markdown_text: str) -> list[dict[str, Any]]:
    toc = []
    used_ids: dict[str, int] = {}

    for line in markdown_text.splitlines():
        match = HEADING_RE.match(line)
        if not match:
            continue

        level = len(match.group(1))
        title = re.sub(r"[`*_~\[\]()>#]", "", match.group(2)).strip()
        if not title:
            continue

        base_id = slugify_heading(title)
        count = used_ids.get(base_id, 0)
        used_ids[base_id] = count + 1
        heading_id = base_id if count == 0 else f"{base_id}-{count + 1}"

        toc.append({"level": level, "title": title, "id": heading_id})

    return toc


def slugify_heading(title: str, separator: str = "-") -> str:
    slug = re.sub(r"\s+", "-", title.strip().lower())
    slug = re.sub(r"[^a-z0-9\-\u4e00-\u9fff]", "", slug)
    return slug or "section"
