#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sys
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parent
SERVER_DIR = ROOT_DIR / "server_flask"
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))

from app.services.post_template import (  # noqa: E402
    NewPostOptions,
    PostTemplateError,
    create_post_template,
)


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    if args.command == "new_post":
        return handle_new_post(args)

    parser.print_help()
    return 1


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Blog maintenance commands.")
    subparsers = parser.add_subparsers(dest="command")

    new_post = subparsers.add_parser(
        "new_post",
        help="Create content/posts/<slug>/index.md and an images directory.",
    )
    new_post.add_argument("title", help="Post title.")
    new_post.add_argument(
        "--slug",
        required=True,
        help="Stable URL slug, for example: logistic-regression.",
    )
    new_post.add_argument("--summary", default="", help="Short post summary.")
    new_post.add_argument(
        "--category",
        action="append",
        default=[],
        help="Category name. Repeat this option for multiple categories.",
    )
    new_post.add_argument(
        "--tag",
        action="append",
        default=[],
        help="Tag name. Repeat this option for multiple tags.",
    )
    new_post.add_argument("--series-id", help="Optional series id.")
    new_post.add_argument("--series-title", help="Optional series title.")
    new_post.add_argument("--series-order", type=int, help="Optional series order.")
    new_post.add_argument(
        "--date",
        dest="date_text",
        help="Publish date. Defaults to current local time.",
    )
    new_post.add_argument(
        "--content-root",
        type=Path,
        help="Content root. Defaults to BLOG_CONTENT_ROOT or ./content.",
    )
    return parser


def handle_new_post(args: argparse.Namespace) -> int:
    try:
        generated = create_post_template(
            NewPostOptions(
                title=args.title,
                slug=args.slug,
                summary=args.summary,
                categories=tuple(args.category),
                tags=tuple(args.tag),
                series_id=args.series_id,
                series_title=args.series_title,
                series_order=args.series_order,
                date_text=args.date_text,
                content_root=args.content_root,
            )
        )
    except PostTemplateError as error:
        print(f"error: {error}", file=sys.stderr)
        return 2

    print(f"Created post: {generated.index_path}")
    print(f"Images directory: {generated.images_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
