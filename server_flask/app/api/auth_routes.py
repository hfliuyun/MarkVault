from __future__ import annotations

from flask import jsonify, request

from . import api_bp
from app.services.auth import (
    AuthSetupError,
    create_jwt,
    extract_bearer_token,
    get_provisioning_uri,
    require_auth,
    verify_jwt,
    verify_totp,
)


@api_bp.route('/auth/verify', methods=['POST'])
def verify_auth():
    payload = request.get_json(silent=True) or {}
    code = payload.get("code", "")
    try:
        if not verify_totp(code):
            return jsonify({"error": "Invalid code"}), 401
        token = create_jwt()
        return jsonify({"token": token, "expires_in": 7200})
    except AuthSetupError as error:
        return jsonify({"error": str(error)}), 400


@api_bp.route('/auth/status', methods=['GET'])
def auth_status():
    token = extract_bearer_token()
    if not verify_jwt(token):
        return jsonify({"authenticated": False}), 401
    return jsonify({"authenticated": True})


@api_bp.route('/auth/provisioning-uri', methods=['GET'])
@require_auth
def auth_provisioning_uri():
    try:
        return jsonify({"uri": get_provisioning_uri()})
    except AuthSetupError as error:
        return jsonify({"error": str(error)}), 400
