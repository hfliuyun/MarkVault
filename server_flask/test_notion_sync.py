import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

import frontmatter

from app.services.notion_sync import (
    get_content_hash,
    migrate_frontmatter,
    sync_local_to_notion,
)
from app.services.notion_sync_state import NotionSyncState


class TestGetContentHash(unittest.TestCase):
    def test_same_input_same_hash(self):
        meta = {"title": "Test", "slug": "test", "date": "2026-01-01"}
        h1 = get_content_hash(meta, "body text")
        h2 = get_content_hash(meta, "body text")
        self.assertEqual(h1, h2)

    def test_different_body_different_hash(self):
        meta = {"title": "Test", "slug": "test", "date": "2026-01-01"}
        h1 = get_content_hash(meta, "body v1")
        h2 = get_content_hash(meta, "body v2")
        self.assertNotEqual(h1, h2)

    def test_different_metadata_different_hash(self):
        body = "same body"
        h1 = get_content_hash({"title": "A", "slug": "a"}, body)
        h2 = get_content_hash({"title": "B", "slug": "b"}, body)
        self.assertNotEqual(h1, h2)


class TestMigrateFrontmatter(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.state = NotionSyncState(Path(self.temp_dir.name) / "state.json")

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_migrates_old_fields(self):
        post = frontmatter.Post("body", **{
            "title": "Test",
            "notion": {
                "page_id": "p1",
                "synced_at": "2026-01-01T00:00:00Z",
                "content_hash": "abc123",
            },
        })
        modified = migrate_frontmatter(post, "posts/test/index.md", self.state)
        self.assertTrue(modified)
        # Frontmatter cleaned
        self.assertEqual(post.metadata["notion"], {"page_id": "p1"})
        # Sidecar populated
        state = self.state.get("posts/test/index.md")
        self.assertEqual(state["synced_at"], "2026-01-01T00:00:00Z")
        self.assertEqual(state["content_hash"], "abc123")

    def test_no_migration_needed(self):
        post = frontmatter.Post("body", **{
            "title": "Test",
            "notion": {"page_id": "p1"},
        })
        modified = migrate_frontmatter(post, "posts/test/index.md", self.state)
        self.assertFalse(modified)

    def test_no_notion_metadata(self):
        post = frontmatter.Post("body", **{"title": "Test"})
        modified = migrate_frontmatter(post, "posts/test/index.md", self.state)
        self.assertFalse(modified)


class TestSyncLocalToNotion(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.content_root = Path(self.temp_dir.name)
        self.data_dir = Path(self.temp_dir.name) / "data"
        self.data_dir.mkdir()

    def tearDown(self):
        self.temp_dir.cleanup()

    def _write_post(self, slug, title="Test Post", body="Hello world", notion_page_id=None):
        post_dir = self.content_root / "posts" / slug
        post_dir.mkdir(parents=True, exist_ok=True)
        fm = {"title": title, "slug": slug, "date": "2026-01-01", "summary": "test",
              "categories": ["Test"], "tags": ["test"]}
        if notion_page_id:
            fm["notion"] = {"page_id": notion_page_id}
        post = frontmatter.Post(body, **fm)
        file_path = post_dir / "index.md"
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(frontmatter.dumps(post))
        return file_path

    @patch("app.services.notion_sync.DATA_DIR")
    @patch("app.services.notion_sync.requests")
    def test_create_new_page(self, mock_requests, mock_data_dir):
        mock_data_dir.__truediv__ = lambda self, x: self.parent / "data" / x
        mock_data_dir.parent = self.content_root

        self._write_post("new-post")

        # Mock create_page response
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "id": "new-page-id",
            "last_edited_time": "2026-01-01T00:00:00.000Z",
        }
        mock_requests.post.return_value = mock_resp
        mock_requests.patch.return_value = mock_resp

        with patch("app.services.notion_sync.DATA_DIR", self.data_dir):
            sync_local_to_notion(self.content_root, "token", "db-id")

        # Verify page was created (POST call made)
        post_calls = [c for c in mock_requests.post.call_args_list
                      if "pages" in str(c)]
        self.assertTrue(len(post_calls) > 0)

    @patch("app.services.notion_sync.requests")
    def test_skip_unchanged_hash(self, mock_requests):
        file_path = self._write_post("unchanged", notion_page_id="existing-page")

        # Pre-populate sync state with matching hash
        post = frontmatter.load(file_path)
        current_hash = get_content_hash(post.metadata, post.content)

        state = NotionSyncState(self.data_dir / "notion_sync_state.json")
        state.record_sync(
            "posts/unchanged/index.md",
            content_hash=current_hash,
            notion_last_edited_time="2026-01-01T00:00:00.000Z",
            page_id="existing-page",
        )
        state.save()

        with patch("app.services.notion_sync.DATA_DIR", self.data_dir):
            sync_local_to_notion(self.content_root, "token", "db-id")

        # No API calls should have been made
        mock_requests.post.assert_not_called()
        mock_requests.patch.assert_not_called()

    @patch("app.services.notion_sync.requests")
    def test_conflict_detection_skips(self, mock_requests):
        self._write_post("conflict", title="Conflict Post", body="changed body",
                         notion_page_id="conflict-page")

        # Sync state records one last_edited_time
        state = NotionSyncState(self.data_dir / "notion_sync_state.json")
        state.record_sync(
            "posts/conflict/index.md",
            content_hash="old-hash",
            notion_last_edited_time="2026-01-01T00:00:00.000Z",
            page_id="conflict-page",
        )
        state.save()

        # Notion returns a DIFFERENT last_edited_time (human edited)
        mock_get_resp = MagicMock()
        mock_get_resp.status_code = 200
        mock_get_resp.json.return_value = {
            "last_edited_time": "2026-01-02T00:00:00.000Z",
            "archived": False,
        }
        mock_requests.get.return_value = mock_get_resp

        with patch("app.services.notion_sync.DATA_DIR", self.data_dir):
            sync_local_to_notion(self.content_root, "token", "db-id")

        # No PATCH or POST (update/create) should have been made
        mock_requests.patch.assert_not_called()
        mock_requests.post.assert_not_called()

    @patch("app.services.notion_sync.requests")
    def test_force_overwrite_bypasses_conflict(self, mock_requests):
        self._write_post("force", title="Force Post", body="new body",
                         notion_page_id="force-page")

        state = NotionSyncState(self.data_dir / "notion_sync_state.json")
        state.record_sync(
            "posts/force/index.md",
            content_hash="old-hash",
            notion_last_edited_time="2026-01-01T00:00:00.000Z",
            page_id="force-page",
        )
        state.save()

        # Notion returns different last_edited_time
        mock_get_resp = MagicMock()
        mock_get_resp.status_code = 200
        mock_get_resp.json.return_value = {
            "last_edited_time": "2026-01-02T00:00:00.000Z",
            "archived": False,
        }
        mock_requests.get.return_value = mock_get_resp

        mock_patch_resp = MagicMock()
        mock_patch_resp.status_code = 200
        mock_patch_resp.json.return_value = {
            "id": "force-page",
            "last_edited_time": "2026-01-03T00:00:00.000Z",
        }
        mock_requests.patch.return_value = mock_patch_resp
        mock_requests.delete.return_value = MagicMock(status_code=200)

        with patch("app.services.notion_sync.DATA_DIR", self.data_dir):
            sync_local_to_notion(self.content_root, "token", "db-id", force_overwrite=True)

        # PATCH should have been called (update_page)
        self.assertTrue(mock_requests.patch.called)

    @patch("app.services.notion_sync.requests")
    def test_adopt_on_missing_sidecar(self, mock_requests):
        """Has page_id but no sidecar → adopt: properties only, no body."""
        self._write_post("adopt", title="Adopt Post", body="body",
                         notion_page_id="adopt-page")

        # No sync state exists (simulates VPS reinstall)

        mock_get_resp = MagicMock()
        mock_get_resp.status_code = 200
        mock_get_resp.json.return_value = {
            "last_edited_time": "2026-01-01T00:00:00.000Z",
            "archived": False,
        }
        mock_requests.get.return_value = mock_get_resp

        mock_patch_resp = MagicMock()
        mock_patch_resp.status_code = 200
        mock_patch_resp.json.return_value = {
            "id": "adopt-page",
            "last_edited_time": "2026-01-01T01:00:00.000Z",
        }
        mock_requests.patch.return_value = mock_patch_resp

        with patch("app.services.notion_sync.DATA_DIR", self.data_dir):
            sync_local_to_notion(self.content_root, "token", "db-id")

        # Should have called PATCH (update_page for properties) but NOT delete (no clear_blocks)
        patch_calls = mock_requests.patch.call_args_list
        delete_calls = mock_requests.delete.call_args_list
        self.assertTrue(len(patch_calls) > 0, "Should update properties")
        self.assertEqual(len(delete_calls), 0, "Should NOT clear blocks (adopt skips body)")

        # Sidecar should exist now with NO content_hash
        state = NotionSyncState(self.data_dir / "notion_sync_state.json")
        entry = state.get("posts/adopt/index.md")
        self.assertNotIn("content_hash", entry)
        self.assertIn("notion_last_edited_time", entry)

    @patch("app.services.notion_sync.requests")
    def test_records_post_write_last_edited_time(self, mock_requests):
        """Step 10 records the last_edited_time fetched AFTER writes (via
        get_page_info), not the create/update response value which predates
        the block writes. Regression test for the false-conflict bug."""
        self._write_post("postwrite", title="PostWrite", body="hello world")

        # create_page (POST /pages) returns an EARLY timestamp (T1)
        mock_post_resp = MagicMock()
        mock_post_resp.status_code = 200
        mock_post_resp.json.return_value = {
            "id": "pw-page",
            "last_edited_time": "2026-01-01T00:00:00.000Z",
        }
        mock_requests.post.return_value = mock_post_resp

        # get_page_info (GET /pages/{id}) AFTER writes returns a LATER time (T2)
        mock_get_resp = MagicMock()
        mock_get_resp.status_code = 200
        mock_get_resp.json.return_value = {
            "last_edited_time": "2026-01-02T00:00:00.000Z",
            "archived": False,
        }
        mock_requests.get.return_value = mock_get_resp

        with patch("app.services.notion_sync.DATA_DIR", self.data_dir):
            sync_local_to_notion(self.content_root, "token", "db-id")

        state = NotionSyncState(self.data_dir / "notion_sync_state.json")
        entry = state.get("posts/postwrite/index.md")
        self.assertEqual(
            entry["notion_last_edited_time"], "2026-01-02T00:00:00.000Z"
        )


if __name__ == "__main__":
    unittest.main()
