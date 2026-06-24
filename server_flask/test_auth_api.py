import os
import tempfile
import unittest
from pathlib import Path

from app import create_app
from app.services import auth
from app.services.auth import create_jwt


JWT_SECRET = "test-jwt-secret-key-0123456789abcdef"


class AuthApiTestCase(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.auth_dir = Path(self.temp_dir.name)
        self.totp_secret_path = self.auth_dir / "totp_secret.key"
        self.totp_secret_path.write_text("JBSWY3DPEHPK3PXP", encoding="utf-8")

        self.previous_auth_dir = auth.AUTH_DIR
        self.previous_totp_secret_path = auth.TOTP_SECRET_PATH
        auth.AUTH_DIR = self.auth_dir
        auth.TOTP_SECRET_PATH = self.totp_secret_path

        self.previous_jwt_secret = os.environ.get("JWT_SECRET")
        os.environ["JWT_SECRET"] = JWT_SECRET

        self.app = create_app()
        self.client = self.app.test_client()
        self.auth_headers = {"Authorization": f"Bearer {create_jwt()}"}

    def tearDown(self):
        auth.AUTH_DIR = self.previous_auth_dir
        auth.TOTP_SECRET_PATH = self.previous_totp_secret_path
        if self.previous_jwt_secret is None:
            os.environ.pop("JWT_SECRET", None)
        else:
            os.environ["JWT_SECRET"] = self.previous_jwt_secret
        self.temp_dir.cleanup()

    def test_provisioning_uri_requires_authentication(self):
        response = self.client.get("/api/auth/provisioning-uri")

        self.assertEqual(response.status_code, 401)
        self.assertNotIn("uri", response.get_json())

    def test_authenticated_admin_can_fetch_provisioning_uri(self):
        response = self.client.get("/api/auth/provisioning-uri", headers=self.auth_headers)

        self.assertEqual(response.status_code, 200)
        self.assertIn("otpauth://totp/MarkVault:admin", response.get_json()["uri"])


if __name__ == "__main__":
    unittest.main()
