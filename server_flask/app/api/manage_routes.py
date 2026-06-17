from __future__ import annotations

from flask import current_app, jsonify, request, send_file

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
    if "file" not in request.files:
        return jsonify({"error": "No file provided."}), 400
    overwrite = request.form.get("overwrite", "false").lower() == "true"

    try:
        result = post_manager.process_upload(
            request.files["file"], overwrite, current_app.config["CONTENT_ROOT"]
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


def _coerce_order(value):
    if value in (None, ""):
        return None
    try:
        return int(value)
    except (TypeError, ValueError) as error:
        raise post_manager.PostManagerError("series_order must be an integer.") from error
