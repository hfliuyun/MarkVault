import io
import os
import tempfile
import unittest
import zipfile
from pathlib import Path

from werkzeug.datastructures import FileStorage

from app import create_app
from app.api import routes
from app.services import post_manager
from app.services.auth import create_jwt
from app.services.content_index import ContentIndex
from app.services.post_manager import (
    PostConflictError,
    PostManagerError,
    PostNotFoundError,
    build_template_zip,
    delete_post,
    determine_target_dir,
    process_upload,
)
from app.services.post_template import NewPostOptions

JWT_SECRET = "test-jwt-secret-key-0123456789abcdef"


def index_md(title, slug, date="2022-01-29 14:40:13", series=None, categories=None, tags=None):
    """Build an index.md frontmatter document for fixtures."""
    lines = [
        "---",
        f"title: {title}",
        f"slug: {slug}",
        f"date: {date}",
        f"summary: {title} summary",
    ]
    lines.append("categories:")
    for category in categories or []:
        lines.append(f"  - {category}")
    lines.append("tags:")
    for tag in tags or []:
        lines.append(f"  - {tag}")
    if series:
        lines.append("series:")
        lines.append(f"  id: {series['id']}")
        if series.get("title"):
            lines.append(f"  title: {series['title']}")
        if series.get("order") is not None:
            lines.append(f"  order: {series['order']}")
    lines += ["---", "", f"## {title}", ""]
    return "\n".join(lines)


def make_zip(entries):
    """Build an in-memory ZIP. ``entries`` maps arcname -> str/bytes content."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        for name, content in entries.items():
            zf.writestr(name, content.encode("utf-8") if isinstance(content, str) else content)
    buf.seek(0)
    return buf


def zip_storage(entries, filename="post.zip"):
    """Wrap a ZIP as a Werkzeug FileStorage for direct service calls."""
    return FileStorage(stream=make_zip(entries), filename=filename)


def write_post_on_disk(content_root, relative_dir, title, slug, date="2022-01-01 09:00:00", series=None):
    post_dir = content_root / relative_dir
    post_dir.mkdir(parents=True, exist_ok=True)
    (post_dir / "index.md").write_text(
        index_md(title, slug, date=date, series=series), encoding="utf-8"
    )
    return post_dir


class PostManagerServiceTestCase(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.content_root = Path(self.temp_dir.name)

    def tearDown(self):
        self.temp_dir.cleanup()

    # --- build_template_zip ---

    def test_build_template_zip_contains_index_and_images_dir(self):
        buf = build_template_zip(
            NewPostOptions(title="Logistic Regression", slug="logistic-regression", tags=("algo",))
        )
        with zipfile.ZipFile(buf) as zf:
            names = zf.namelist()
            body = zf.read("logistic-regression/index.md").decode("utf-8")

        self.assertIn("logistic-regression/index.md", names)
        self.assertIn("logistic-regression/images/", names)
        self.assertIn("title:", body)
        self.assertIn("slug:", body)
        self.assertIn("## Logistic Regression", body)

    def test_build_template_zip_rejects_empty_title(self):
        with self.assertRaisesRegex(PostManagerError, "title"):
            build_template_zip(NewPostOptions(title="  ", slug="x"))

    def test_build_template_zip_rejects_invalid_slug(self):
        with self.assertRaisesRegex(PostManagerError, "Slug"):
            build_template_zip(NewPostOptions(title="Title", slug="Bad Slug"))

    def test_build_template_zip_series_order_requires_id(self):
        with self.assertRaisesRegex(PostManagerError, "series_id"):
            build_template_zip(NewPostOptions(title="Title", slug="ok", series_order=2))

    # --- determine_target_dir ---

    def test_determine_target_dir_standalone_vs_series(self):
        self.assertEqual(
            determine_target_dir(self.content_root, {"slug": "a"}),
            self.content_root / "posts" / "a",
        )
        self.assertEqual(
            determine_target_dir(self.content_root, {"slug": "b", "series": {"id": "s1"}}),
            self.content_root / "series" / "s1" / "b",
        )

    # --- process_upload ---

    def test_process_upload_publishes_standalone_post(self):
        result = process_upload(
            zip_storage({"logistic-regression/index.md": index_md("Logistic", "logistic-regression")}),
            overwrite=False,
            content_root=self.content_root,
        )
        self.assertEqual(result["slug"], "logistic-regression")
        self.assertEqual(result["location"], "posts")
        self.assertTrue((self.content_root / "posts" / "logistic-regression" / "index.md").is_file())

    def test_process_upload_publishes_series_post_and_copies_images(self):
        entries = {
            "series-post/index.md": index_md(
                "Series Post", "series-post", series={"id": "ml-basic", "title": "ML", "order": 1}
            ),
            "series-post/images/diagram.png": b"\x89PNG\r\n\x1a\n",
        }
        result = process_upload(zip_storage(entries), overwrite=False, content_root=self.content_root)
        self.assertEqual(result["location"], "series")
        base = self.content_root / "series" / "ml-basic" / "series-post"
        self.assertTrue((base / "index.md").is_file())
        self.assertTrue((base / "images" / "diagram.png").is_file())

    def test_process_upload_supports_flat_zip_without_outer_dir(self):
        result = process_upload(
            zip_storage({"index.md": index_md("Flat", "flat-post")}),
            overwrite=False,
            content_root=self.content_root,
        )
        self.assertEqual(result["slug"], "flat-post")
        self.assertTrue((self.content_root / "posts" / "flat-post" / "index.md").is_file())

    def test_process_upload_rejects_non_zip(self):
        with self.assertRaisesRegex(PostManagerError, "zip"):
            process_upload(
                FileStorage(stream=io.BytesIO(b"hello"), filename="notes.txt"),
                overwrite=False,
                content_root=self.content_root,
            )

    def test_process_upload_rejects_zip_without_index(self):
        with self.assertRaisesRegex(PostManagerError, "index.md"):
            process_upload(
                zip_storage({"notes.md": "no frontmatter here"}),
                overwrite=False,
                content_root=self.content_root,
            )

    def test_process_upload_rejects_path_traversal(self):
        with self.assertRaisesRegex(PostManagerError, "illegal path"):
            process_upload(
                zip_storage({"../evil.md": "pwned"}),
                overwrite=False,
                content_root=self.content_root,
            )
        # Nothing should have been written outside the content root.
        self.assertFalse((self.content_root.parent / "evil.md").exists())

    def test_process_upload_rejects_missing_required_frontmatter(self):
        body = "---\ntitle: No Date\nslug: no-date\n---\n\n## body\n"
        with self.assertRaisesRegex(PostManagerError, "required metadata"):
            process_upload(
                zip_storage({"no-date/index.md": body}),
                overwrite=False,
                content_root=self.content_root,
            )

    def test_process_upload_rejects_invalid_slug_in_frontmatter(self):
        body = "---\ntitle: Bad\nslug: Bad_Slug\ndate: 2022-01-01\n---\n\n## body\n"
        with self.assertRaisesRegex(PostManagerError, "Slug"):
            process_upload(
                zip_storage({"bad/index.md": body}),
                overwrite=False,
                content_root=self.content_root,
            )

    def test_process_upload_conflict_without_overwrite(self):
        entries = {"dup/index.md": index_md("Dup", "dup")}
        process_upload(zip_storage(entries), overwrite=False, content_root=self.content_root)
        with self.assertRaises(PostConflictError):
            process_upload(zip_storage(entries), overwrite=False, content_root=self.content_root)

    def test_process_upload_overwrite_replaces_content_and_clears_backup(self):
        process_upload(
            zip_storage({"post/index.md": index_md("First", "post") + "\noriginal body\n"}),
            overwrite=False,
            content_root=self.content_root,
        )
        process_upload(
            zip_storage({"post/index.md": index_md("Second", "post") + "\nupdated body\n"}),
            overwrite=True,
            content_root=self.content_root,
        )
        target = self.content_root / "posts" / "post"
        self.assertIn("updated body", (target / "index.md").read_text(encoding="utf-8"))
        self.assertFalse(target.with_name("post.bak").exists())

    def test_process_upload_skips_disallowed_file_types(self):
        entries = {
            "mypost/index.md": index_md("My Post", "mypost"),
            "mypost/payload.exe": b"MZ\x00\x00",
        }
        process_upload(zip_storage(entries), overwrite=False, content_root=self.content_root)
        target = self.content_root / "posts" / "mypost"
        self.assertTrue((target / "index.md").is_file())
        self.assertFalse((target / "payload.exe").exists())

    # --- delete_post ---

    def test_delete_post_removes_directory(self):
        write_post_on_disk(self.content_root, "posts/git-basic", "Git Basic", "git-basic")
        index = ContentIndex(self.content_root)
        result = delete_post("git-basic", index)
        self.assertEqual(result["slug"], "git-basic")
        self.assertFalse((self.content_root / "posts" / "git-basic").exists())

    def test_delete_post_missing_raises_not_found(self):
        index = ContentIndex(self.content_root)
        with self.assertRaises(PostNotFoundError):
            delete_post("nope", index)


class ManageRoutesTestCase(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.content_root = Path(self.temp_dir.name)
        self._previous_jwt_secret = os.environ.get("JWT_SECRET")
        os.environ["JWT_SECRET"] = JWT_SECRET

        self.app = create_app()
        self.app.config["CONTENT_ROOT"] = self.content_root
        routes._content_index = None
        self.client = self.app.test_client()
        with self.app.app_context():
            self.auth = {"Authorization": f"Bearer {create_jwt()}"}

    def tearDown(self):
        routes._content_index = None
        if self._previous_jwt_secret is None:
            os.environ.pop("JWT_SECRET", None)
        else:
            os.environ["JWT_SECRET"] = self._previous_jwt_secret
        self.temp_dir.cleanup()

    def upload(self, entries, overwrite="false", filename="post.zip"):
        return self.client.post(
            "/api/posts/upload",
            data={"file": (make_zip(entries), filename), "overwrite": overwrite},
            content_type="multipart/form-data",
            headers=self.auth,
        )

    def test_all_manage_endpoints_require_auth(self):
        self.assertEqual(self.client.get("/api/manage/posts").status_code, 401)
        self.assertEqual(
            self.client.post("/api/posts/template", json={"title": "T", "slug": "t"}).status_code, 401
        )
        self.assertEqual(self.client.post("/api/posts/upload").status_code, 401)
        self.assertEqual(self.client.delete("/api/posts/anything").status_code, 401)

    def test_list_managed_posts_reports_location(self):
        write_post_on_disk(self.content_root, "posts/git-basic", "Git Basic", "git-basic")
        write_post_on_disk(
            self.content_root,
            "series/ml-basic/logistic-regression",
            "Logistic Regression",
            "logistic-regression",
            series={"id": "ml-basic", "title": "ML Basic", "order": 1},
        )

        response = self.client.get("/api/manage/posts", headers=self.auth)
        data = response.get_json()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(data["total"], 2)
        locations = {article["slug"]: article["location"] for article in data["articles"]}
        self.assertEqual(locations["git-basic"], "posts")
        self.assertEqual(locations["logistic-regression"], "series")

    def test_download_template_returns_zip_attachment(self):
        response = self.client.post(
            "/api/posts/template",
            json={"title": "测试", "slug": "test-post", "tags": ["a", "b"]},
            headers=self.auth,
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.mimetype, "application/zip")
        self.assertIn("test-post.zip", response.headers.get("Content-Disposition", ""))
        with zipfile.ZipFile(io.BytesIO(response.data)) as zf:
            self.assertIn("test-post/index.md", zf.namelist())

    def test_download_template_rejects_missing_slug(self):
        response = self.client.post("/api/posts/template", json={"title": "X"}, headers=self.auth)
        self.assertEqual(response.status_code, 400)

    def test_download_template_conflicts_with_existing_slug(self):
        write_post_on_disk(self.content_root, "posts/test-post", "Test Post", "test-post")
        response = self.client.post(
            "/api/posts/template", json={"title": "Test Post", "slug": "test-post"}, headers=self.auth
        )
        self.assertEqual(response.status_code, 409)

    def test_upload_publishes_and_appears_in_list(self):
        response = self.upload({"my-post/index.md": index_md("My Post", "my-post")})
        body = response.get_json()
        self.assertEqual(response.status_code, 201)
        self.assertEqual(body["slug"], "my-post")
        self.assertEqual(body["location"], "posts")

        listed = self.client.get("/api/manage/posts", headers=self.auth).get_json()
        self.assertEqual([a["slug"] for a in listed["articles"]], ["my-post"])

    def test_upload_conflict_then_overwrite(self):
        entries = {"my-post/index.md": index_md("My Post", "my-post")}
        self.assertEqual(self.upload(entries).status_code, 201)
        self.assertEqual(self.upload(entries, overwrite="false").status_code, 409)
        self.assertEqual(self.upload(entries, overwrite="true").status_code, 201)

    def test_upload_rejects_zip_slip(self):
        response = self.upload({"../evil.md": "pwned"})
        self.assertEqual(response.status_code, 400)

    def test_upload_rejects_non_zip(self):
        response = self.client.post(
            "/api/posts/upload",
            data={"file": (io.BytesIO(b"plain text"), "notes.txt")},
            content_type="multipart/form-data",
            headers=self.auth,
        )
        self.assertEqual(response.status_code, 400)

    def test_delete_removes_post_and_reports_missing(self):
        write_post_on_disk(self.content_root, "posts/git-basic", "Git Basic", "git-basic")

        deleted = self.client.delete("/api/posts/git-basic", headers=self.auth)
        self.assertEqual(deleted.status_code, 200)
        self.assertEqual(deleted.get_json()["slug"], "git-basic")
        self.assertFalse((self.content_root / "posts" / "git-basic").exists())

        listed = self.client.get("/api/manage/posts", headers=self.auth).get_json()
        self.assertEqual(listed["total"], 0)

        self.assertEqual(self.client.delete("/api/posts/git-basic", headers=self.auth).status_code, 404)


if __name__ == "__main__":
    unittest.main()
