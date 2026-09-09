from __future__ import annotations

import io

from flask import current_app, jsonify, request, send_file
from werkzeug.datastructures import FileStorage

from . import api_bp
from app.api.routes import content_error_response, get_content_index
from app.services import post_manager
from app.services.auth import require_auth
from app.services.content_index import ContentIndexError
from app.services.post_template import NewPostOptions


def _location_for(post, index) -> str:
    try:
        post.source_path.relative_to(index.series_root)
        return "series"
    except ValueError:
        return "posts"


@api_bp.route('/manage/posts', methods=['GET'])
@require_auth
def list_managed_posts():
    try:
        index = get_content_index()
    except ContentIndexError as error:
        return content_error_response(error)

    articles = []
    for post in index.posts:
        metadata = post.to_metadata_dict()
        metadata["location"] = _location_for(post, index)
        articles.append(metadata)
    return jsonify({"total": len(articles), "articles": articles})


@api_bp.route('/posts/template', methods=['POST'])
@require_auth
def download_template():
    payload = request.get_json(silent=True) or {}
    slug = str(payload.get("slug", "")).strip()

    try:
        if slug and slug in get_content_index().posts_by_slug:
            return jsonify({"error": f"A post already exists for slug '{slug}'."}), 409
    except ContentIndexError as error:
        return content_error_response(error)

    try:
        options = NewPostOptions(
            title=str(payload.get("title", "")),
            slug=str(payload.get("slug", "")),
            summary=str(payload.get("summary", "") or ""),
            categories=tuple(str(item) for item in (payload.get("categories") or [])),
            tags=tuple(str(item) for item in (payload.get("tags") or [])),
            series_id=(payload.get("series_id") or None),
            series_title=(payload.get("series_title") or None),
            series_order=_coerce_order(payload.get("series_order")),
        )
        buf = post_manager.build_template_zip(options)
    except post_manager.PostManagerError as error:
        return jsonify({"error": str(error)}), error.status_code

    return send_file(
        buf,
        mimetype="application/zip",
        as_attachment=True,
        download_name=f"{options.slug.strip()}.zip",
    )


@api_bp.route('/posts/upload', methods=['POST'])
@require_auth
def upload_post():
    # Multipart form (browser) or raw application/zip body (script/plugin).
    if request.content_type and request.content_type.startswith("application/zip"):
        raw = request.get_data()
        if not raw:
            return jsonify({"error": "No file provided."}), 400
        file_storage = FileStorage(
            stream=io.BytesIO(raw), filename="post.zip", content_type="application/zip"
        )
        overwrite = request.args.get("overwrite", "false").lower() == "true"
    elif "file" in request.files:
        file_storage = request.files["file"]
        overwrite = request.form.get("overwrite", "false").lower() == "true"
    else:
        return jsonify({"error": "No file provided."}), 400

    try:
        result = post_manager.process_upload(
            file_storage, overwrite, current_app.config["CONTENT_ROOT"]
        )
    except post_manager.PostManagerError as error:
        return jsonify({"error": str(error)}), error.status_code

    return jsonify({"message": "Post published successfully", **result}), 201


@api_bp.route('/posts/<slug>', methods=['DELETE'])
@require_auth
def delete_post_route(slug):
    try:
        result = post_manager.delete_post(slug, get_content_index())
    except ContentIndexError as error:
        return content_error_response(error)
    except post_manager.PostManagerError as error:
        return jsonify({"error": str(error)}), error.status_code

    return jsonify({"message": "Post deleted", **result})


@api_bp.route('/manage/posts/<slug>/raw', methods=['GET'])
@require_auth
def get_post_raw(slug):
    try:
        index = get_content_index()
    except ContentIndexError as error:
        return content_error_response(error)

    post = index.posts_by_slug.get(slug)
    if not post:
        return jsonify({"error": f"Post '{slug}' not found."}), 404

    raw = post.source_path.read_text(encoding="utf-8")
    try:
        frontmatter_text, body = post_manager.split_raw_post(raw)
    except post_manager.PostManagerError as error:
        return jsonify({"error": str(error)}), 400

    return jsonify({
        "slug": slug,
        "path": post.source_path.relative_to(index.content_root).as_posix(),
        "frontmatter": frontmatter_text,
        "body": body,
        "raw": raw,
    })


@api_bp.route('/manage/posts/<slug>/content', methods=['PUT'])
@require_auth
def update_post_content(slug):
    payload = request.get_json(silent=True) or {}
    body = payload.get("body")
    if not isinstance(body, str):
        return jsonify({"error": "body must be a string."}), 400

    try:
        index = get_content_index()
    except ContentIndexError as error:
        return content_error_response(error)

    post = index.posts_by_slug.get(slug)
    if not post:
        return jsonify({"error": f"Post '{slug}' not found."}), 404

    try:
        post_manager.update_post_body(post.source_path, body)
    except post_manager.PostManagerError as error:
        return jsonify({"error": str(error)}), error.status_code

    return jsonify({
        "path": post.source_path.relative_to(index.content_root).as_posix(),
        "message": "Post updated",
    })


def _coerce_order(value):
    if value in (None, ""):
        return None
    try:
        return int(value)
    except (TypeError, ValueError) as error:
        raise post_manager.PostManagerError("series_order must be an integer.") from error
