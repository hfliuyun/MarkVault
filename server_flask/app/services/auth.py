from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from functools import wraps
from pathlib import Path

import jwt
import pyotp
from flask import jsonify, request


SERVER_ROOT = Path(__file__).resolve().parents[2]
AUTH_DIR = SERVER_ROOT / "data" / "auth"
TOTP_SECRET_PATH = AUTH_DIR / "totp_secret.key"
JWT_ALGORITHM = "HS256"
JWT_EXPIRES_SECONDS = 7200


class AuthSetupError(RuntimeError):
    pass


def generate_totp_secret() -> str:
    AUTH_DIR.mkdir(parents=True, exist_ok=True)
    secret = pyotp.random_base32()
    TOTP_SECRET_PATH.write_text(secret, encoding="utf-8")
    return secret


def get_totp_secret() -> str:
    if not TOTP_SECRET_PATH.exists():
        raise AuthSetupError("TOTP secret is not configured. Run `python manage.py setup_totp`.")
    return TOTP_SECRET_PATH.read_text(encoding="utf-8").strip()


def get_jwt_secret() -> str:
    return os.environ.get("JWT_SECRET") or get_totp_secret()


def verify_totp(code: str) -> bool:
    normalized = str(code or "").strip()
    if len(normalized) != 6 or not normalized.isdigit():
        return False
    return pyotp.TOTP(get_totp_secret()).verify(normalized, valid_window=1)


def create_jwt(expires_hours: int = 2) -> str:
    expires_at = datetime.now(timezone.utc) + timedelta(hours=expires_hours)
    payload = {
        "role": "admin",
        "exp": expires_at,
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def verify_jwt(token: str) -> bool:
    if not token:
        return False
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
    except (jwt.InvalidTokenError, AuthSetupError):
        return False
    return payload.get("role") == "admin"


def get_provisioning_uri(account_name: str = "admin") -> str:
    return pyotp.TOTP(get_totp_secret()).provisioning_uri(
        name=account_name,
        issuer_name="MarkVault",
    )


def extract_bearer_token() -> str:
    authorization = request.headers.get("Authorization", "")
    prefix = "Bearer "
    if authorization.startswith(prefix):
        return authorization[len(prefix):].strip()
    return ""


def require_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not verify_jwt(extract_bearer_token()):
            return jsonify({"error": "Authentication required"}), 401
        return f(*args, **kwargs)

    return decorated
