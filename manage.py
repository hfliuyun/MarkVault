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
from app.services.auth import (  # noqa: E402
    AUTH_DIR,
    TOTP_SECRET_PATH,
    generate_totp_secret,
    get_provisioning_uri,
)


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    if args.command == "new_post":
        return handle_new_post(args)
    if args.command == "setup_totp":
        return handle_setup_totp(account=args.account)
    if args.command == "reset_totp":
        return handle_reset_totp(account=args.account)

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

    setup_totp = subparsers.add_parser(
        "setup_totp",
        help="Generate a new TOTP secret and show a terminal QR code.",
    )
    setup_totp.add_argument(
        "--account",
        default="admin",
        help="Account name embedded in the provisioning URI.",
    )

    reset_totp = subparsers.add_parser(
        "reset_totp",
        help="Remove the current TOTP secret and generate a new one.",
    )
    reset_totp.add_argument(
        "--account",
        default="admin",
        help="Account name embedded in the provisioning URI.",
    )
    return parser


def print_qr_terminal(uri: str) -> None:
    import qrcode

    qr = qrcode.QRCode(border=1)
    qr.add_data(uri)
    qr.make(fit=True)
    matrix = qr.get_matrix()
    for row in matrix:
        print("".join("██" if cell else "  " for cell in row))


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


def handle_setup_totp(account: str = "admin") -> int:
    if TOTP_SECRET_PATH.exists():
        print(f"error: {TOTP_SECRET_PATH} already exists. Run `python manage.py reset_totp` first.", file=sys.stderr)
        return 2

    secret = generate_totp_secret()
    uri = get_provisioning_uri(account_name=account)
    print("TOTP secret:", secret)
    print("Provisioning URI:", uri)
    print("QR code:")
    print_qr_terminal(uri)
    print("Scan the QR code with your authenticator app, then verify the 6-digit code via /api/auth/verify.")
    return 0


def handle_reset_totp(account: str = "admin") -> int:
    if TOTP_SECRET_PATH.exists():
        TOTP_SECRET_PATH.unlink()
    AUTH_DIR.mkdir(parents=True, exist_ok=True)
    return handle_setup_totp(account=account)


if __name__ == "__main__":
    raise SystemExit(main())
