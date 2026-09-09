import os
import tempfile
import unittest
from pathlib import Path

import jwt as pyjwt
import pyotp

from app import create_app
from app.api import routes
from app.services import auth as auth_service

JWT_SECRET = "test-jwt-secret-key-0123456789abcdef"


class AuthRoutesTestCase(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.content_root = Path(self.temp_dir.name) / "content"
        self.content_root.mkdir()

        self.totp_secret = pyotp.random_base32()
        secret_path = Path(self.temp_dir.name) / "totp_secret.key"
        secret_path.write_text(self.totp_secret, encoding="utf-8")
        self._original_secret_path = auth_service.TOTP_SECRET_PATH
        auth_service.TOTP_SECRET_PATH = secret_path

        self._previous_jwt_secret = os.environ.get("JWT_SECRET")
        os.environ["JWT_SECRET"] = JWT_SECRET

        self.app = create_app()
        self.app.config["CONTENT_ROOT"] = self.content_root
        routes._content_index = None
        self.client = self.app.test_client()

    def tearDown(self):
        routes._content_index = None
        auth_service.TOTP_SECRET_PATH = self._original_secret_path
        if self._previous_jwt_secret is None:
            os.environ.pop("JWT_SECRET", None)
        else:
            os.environ["JWT_SECRET"] = self._previous_jwt_secret
        self.temp_dir.cleanup()

    def valid_code(self) -> str:
        return pyotp.TOTP(self.totp_secret).now()

    def test_device_token_rejects_non_numeric_code(self):
        response = self.client.post("/api/auth/device_token", json={"code": "abcdef"})
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.get_json()["error"], "Invalid code")

    def test_device_token_issues_thirty_day_jwt(self):
        response = self.client.post(
            "/api/auth/device_token", json={"code": self.valid_code()}
        )
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data["expires_in"], 30 * 24 * 3600)

        payload = pyjwt.decode(data["token"], JWT_SECRET, algorithms=["HS256"])
        self.assertEqual(payload["role"], "admin")
        self.assertEqual(payload["exp"] - payload["iat"], 30 * 24 * 3600)

    def test_device_token_grants_access_to_protected_routes(self):
        token = self.client.post(
            "/api/auth/device_token", json={"code": self.valid_code()}
        ).get_json()["token"]

        response = self.client.get(
            "/api/manage/posts", headers={"Authorization": f"Bearer {token}"}
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["total"], 0)

    def test_verify_endpoint_still_issues_short_lived_token(self):
        response = self.client.post("/api/auth/verify", json={"code": self.valid_code()})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["expires_in"], 7200)


if __name__ == "__main__":
    unittest.main()
