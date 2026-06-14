from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class Post:
    title: str
    slug: str
    date: datetime
    summary: str
    categories: list[str]
    tags: list[str]
    source_path: Path
    body: str
    series: dict[str, Any] | None = None
    notion: dict[str, Any] | None = None
    legacy: dict[str, Any] | None = None
    extra: dict[str, Any] = field(default_factory=dict)

    @property
    def date_text(self) -> str:
        return self.date.strftime("%Y-%m-%d %H:%M:%S")

    def to_metadata_dict(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "title": self.title,
            "slug": self.slug,
            "date": self.date_text,
            "summary": self.summary,
            "categories": self.categories,
            "tags": self.tags,
        }
        if self.series:
            payload["series"] = self.series
        if self.notion:
            payload["notion"] = self.notion
        payload.update(self.extra)
        return payload
