import re
from typing import Any

import bleach
import markdown
from bleach.css_sanitizer import CSSSanitizer


HEADING_RE = re.compile(r"^(#{1,6})\s+(.+?)\s*$")
DANGEROUS_BLOCK_RE = re.compile(
    r"<(script|style|iframe)\b[^>]*>.*?</\1\s*>",
    re.IGNORECASE | re.DOTALL,
)

ALLOWED_TAGS = [
    "a",
    "abbr",
    "b",
    "blockquote",
    "br",
    "code",
    "del",
    "div",
    "em",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "hr",
    "i",
    "img",
    "li",
    "ol",
    "p",
    "pre",
    "s",
    "span",
    "strong",
    "sup",
    "table",
    "tbody",
    "td",
    "th",
    "thead",
    "tr",
    "ul",
]

ALLOWED_ATTRIBUTES = {
    "*": ["class", "id", "title"],
    "a": ["href", "title"],
    "img": ["alt", "height", "src", "title", "width"],
    "li": ["value"],
    "ol": ["start"],
    "td": ["align", "colspan", "rowspan", "style"],
    "th": ["align", "colspan", "rowspan", "style"],
}

ALLOWED_PROTOCOLS = ["http", "https", "mailto"]
CSS_SANITIZER = CSSSanitizer(allowed_css_properties=["text-align"])


def render_markdown_to_html(markdown_text: str) -> str:
    """Render Markdown to an HTML fragment; math is rendered by the Vue client."""
    rendered_html = markdown.markdown(
        markdown_text,
        extensions=["tables", "footnotes", "fenced_code", "toc"],
        extension_configs={"toc": {"slugify": slugify_heading}},
    )
    return sanitize_html(rendered_html)


def sanitize_html(html: str) -> str:
    html = DANGEROUS_BLOCK_RE.sub("", html)
    return bleach.clean(
        html,
        tags=ALLOWED_TAGS,
        attributes=ALLOWED_ATTRIBUTES,
        protocols=ALLOWED_PROTOCOLS,
        css_sanitizer=CSS_SANITIZER,
        strip=True,
        strip_comments=True,
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
