from __future__ import annotations

from flask import jsonify, request

from . import api_bp
from app.services.auth import require_auth
from app.services.paste import PasteError, create_paste, delete_paste, get_paste, list_pastes


@api_bp.route('/paste', methods=['POST'])
@require_auth
def create_paste_route():
    payload = request.get_json(silent=True) or {}
    try:
        paste = create_paste(
            content=payload.get("content", ""),
            title=payload.get("title", ""),
            language=payload.get("language", "text"),
            expires_in=payload.get("expires_in", "1d"),
        )
    except PasteError as error:
        return jsonify({"error": str(error)}), 400
    response = dict(paste)
    response["url"] = f"/paste/{paste['id']}"
    return jsonify(response), 201


@api_bp.route('/paste/<string:paste_id>', methods=['GET'])
def get_paste_route(paste_id):
    paste = get_paste(paste_id)
    if not paste:
        return jsonify({"error": "Paste not found or expired"}), 404
    return jsonify(paste)


@api_bp.route('/pastes', methods=['GET'])
@require_auth
def list_pastes_route():
    return jsonify({"pastes": list_pastes()})


@api_bp.route('/paste/<string:paste_id>', methods=['DELETE'])
@require_auth
def delete_paste_route(paste_id):
    if not delete_paste(paste_id):
        return jsonify({"error": "Paste not found"}), 404
    return jsonify({"message": "Paste deleted"})
