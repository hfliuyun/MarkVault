import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

import frontmatter

from app.services.notion_sync import (
    NotionSyncService,
    get_content_hash,
    migrate_frontmatter,
    sync_local_to_notion,
)
from app.services.notion_sync_state import NotionSyncState


class ContentHashTestCase(unittest.TestCase):
    def test_same_input_has_same_hash(self):
        metadata = {"title": "Test", "slug": "test", "date": "2026-01-01"}

        self.assertEqual(
            get_content_hash(metadata, "body text"),
            get_content_hash(metadata, "body text"),
        )

    def test_body_change_changes_hash(self):
        metadata = {"title": "Test", "slug": "test", "date": "2026-01-01"}

        self.assertNotEqual(
            get_content_hash(metadata, "body one"),
            get_content_hash(metadata, "body two"),
        )

    def test_metadata_change_changes_hash(self):
        self.assertNotEqual(
            get_content_hash({"title": "One", "slug": "one"}, "body"),
            get_content_hash({"title": "Two", "slug": "two"}, "body"),
        )


class FrontmatterMigrationTestCase(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.state = NotionSyncState(Path(self.temp_dir.name) / "state.json")

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_migrates_old_notion_fields_to_sidecar(self):
        post = frontmatter.Post(
            "body",
            title="Test",
            notion={
                "page_id": "page-1",
                "synced_at": "2026-01-01T00:00:00Z",
                "content_hash": "hash-1",
            },
        )

        modified = migrate_frontmatter(post, "posts/test/index.md", self.state)

        self.assertTrue(modified)
        self.assertEqual(post.metadata["notion"], {"page_id": "page-1"})
        state = self.state.get("posts/test/index.md")
        self.assertEqual(state["synced_at"], "2026-01-01T00:00:00Z")
        self.assertEqual(state["content_hash"], "hash-1")
        self.assertEqual(state["page_id"], "page-1")

    def test_clean_notion_frontmatter_needs_no_migration(self):
        post = frontmatter.Post("body", title="Test", notion={"page_id": "page-1"})

        self.assertFalse(migrate_frontmatter(post, "posts/test/index.md", self.state))


class NotionSyncServiceTestCase(unittest.TestCase):
    @patch("app.services.notion_sync.requests")
    def test_append_page_blocks_uploads_in_chunks_of_one_hundred(self, requests_mock):
        requests_mock.patch.return_value = MagicMock(status_code=200)
        service = NotionSyncService("token", "db")
        children = [{"type": "paragraph", "paragraph": {}} for _ in range(205)]

        self.assertTrue(service.append_page_blocks("page-1", children))

        self.assertEqual(requests_mock.patch.call_count, 3)
        self.assertEqual(len(requests_mock.patch.call_args_list[0].kwargs["json"]["children"]), 100)
        self.assertEqual(len(requests_mock.patch.call_args_list[1].kwargs["json"]["children"]), 100)
        self.assertEqual(len(requests_mock.patch.call_args_list[2].kwargs["json"]["children"]), 5)


class SyncLocalToNotionTestCase(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.content_root = Path(self.temp_dir.name) / "content"
        self.data_dir = Path(self.temp_dir.name) / "data"
        self.content_root.mkdir()
        self.data_dir.mkdir()

    def tearDown(self):
        self.temp_dir.cleanup()

    def write_post(self, slug, body="Hello world", page_id=None):
        post_dir = self.content_root / "posts" / slug
        post_dir.mkdir(parents=True)
        metadata = {
            "title": f"Post {slug}",
            "slug": slug,
            "date": "2026-01-01",
            "summary": "Summary",
            "categories": ["Notes"],
            "tags": ["Test"],
        }
        if page_id:
            metadata["notion"] = {"page_id": page_id}
        post = frontmatter.Post(body, **metadata)
        file_path = post_dir / "index.md"
        file_path.write_text(frontmatter.dumps(post), encoding="utf-8")
        return file_path

    def make_response(self, status_code=200, payload=None, text=""):
        response = MagicMock()
        response.status_code = status_code
        response.text = text
        response.json.return_value = payload or {}
        return response

    @patch("app.services.notion_sync.requests")
    def test_create_new_page_writes_page_id_and_state(self, requests_mock):
        file_path = self.write_post("new")
        requests_mock.post.return_value = self.make_response(
            payload={"id": "page-new", "last_edited_time": "2026-01-01T00:00:00.000Z"}
        )
        requests_mock.get.return_value = self.make_response(
            payload={"last_edited_time": "2026-01-01T00:00:00.000Z", "archived": False}
        )

        with patch("app.services.notion_sync.DATA_DIR", self.data_dir):
            sync_local_to_notion(self.content_root, "token", "db")

        post = frontmatter.load(file_path)
        self.assertEqual(post.metadata["notion"], {"page_id": "page-new"})
        state = NotionSyncState(self.data_dir / "notion_sync_state.json")
        self.assertEqual(state.get("posts/new/index.md")["page_id"], "page-new")
        requests_mock.post.assert_called()

    @patch("app.services.notion_sync.requests")
    def test_skip_unchanged_hash_makes_no_api_calls(self, requests_mock):
        file_path = self.write_post("same", page_id="page-same")
        post = frontmatter.load(file_path)
        state = NotionSyncState(self.data_dir / "notion_sync_state.json")
        state.record_sync(
            "posts/same/index.md",
            content_hash=get_content_hash(post.metadata, post.content),
            notion_last_edited_time="2026-01-01T00:00:00.000Z",
            page_id="page-same",
        )
        state.save()

        with patch("app.services.notion_sync.DATA_DIR", self.data_dir):
            sync_local_to_notion(self.content_root, "token", "db")

        requests_mock.get.assert_not_called()
        requests_mock.post.assert_not_called()
        requests_mock.patch.assert_not_called()

    @patch("app.services.notion_sync.requests")
    def test_conflict_skips_without_force(self, requests_mock):
        self.write_post("conflict", body="Changed", page_id="page-conflict")
        state = NotionSyncState(self.data_dir / "notion_sync_state.json")
        state.record_sync(
            "posts/conflict/index.md",
            content_hash="old-hash",
            notion_last_edited_time="2026-01-01T00:00:00.000Z",
            page_id="page-conflict",
        )
        state.save()
        requests_mock.get.return_value = self.make_response(
            payload={"last_edited_time": "2026-01-02T00:00:00.000Z", "archived": False}
        )

        with patch("app.services.notion_sync.DATA_DIR", self.data_dir):
            sync_local_to_notion(self.content_root, "token", "db")

        requests_mock.patch.assert_not_called()
        requests_mock.post.assert_not_called()

    @patch("app.services.notion_sync.requests")
    def test_force_overwrite_bypasses_conflict(self, requests_mock):
        self.write_post("force", body="Changed", page_id="page-force")
        state = NotionSyncState(self.data_dir / "notion_sync_state.json")
        state.record_sync(
            "posts/force/index.md",
            content_hash="old-hash",
            notion_last_edited_time="2026-01-01T00:00:00.000Z",
            page_id="page-force",
        )
        state.save()
        requests_mock.get.side_effect = [
            self.make_response(payload={"last_edited_time": "2026-01-02T00:00:00.000Z", "archived": False}),
            self.make_response(payload={"results": [], "has_more": False, "next_cursor": None}),
            self.make_response(payload={"last_edited_time": "2026-01-03T00:00:00.000Z", "archived": False}),
        ]
        requests_mock.patch.return_value = self.make_response(
            payload={"id": "page-force", "last_edited_time": "2026-01-03T00:00:00.000Z"}
        )

        with patch("app.services.notion_sync.DATA_DIR", self.data_dir):
            sync_local_to_notion(self.content_root, "token", "db", force_overwrite=True)

        self.assertTrue(requests_mock.patch.called)
        updated = NotionSyncState(self.data_dir / "notion_sync_state.json").get("posts/force/index.md")
        self.assertEqual(updated["notion_last_edited_time"], "2026-01-03T00:00:00.000Z")

    @patch("app.services.notion_sync.requests")
    def test_adopt_missing_sidecar_updates_properties_only(self, requests_mock):
        self.write_post("adopt", page_id="page-adopt")
        requests_mock.get.side_effect = [
            self.make_response(payload={"last_edited_time": "2026-01-01T00:00:00.000Z", "archived": False}),
            self.make_response(payload={"last_edited_time": "2026-01-01T02:00:00.000Z", "archived": False}),
        ]
        requests_mock.patch.return_value = self.make_response(
            payload={"id": "page-adopt", "last_edited_time": "2026-01-01T01:00:00.000Z"}
        )

        with patch("app.services.notion_sync.DATA_DIR", self.data_dir):
            sync_local_to_notion(self.content_root, "token", "db")

        requests_mock.patch.assert_called_once()
        requests_mock.delete.assert_not_called()
        entry = NotionSyncState(self.data_dir / "notion_sync_state.json").get("posts/adopt/index.md")
        self.assertEqual(entry["page_id"], "page-adopt")
        self.assertEqual(entry["notion_last_edited_time"], "2026-01-01T02:00:00.000Z")
        self.assertNotIn("content_hash", entry)

    @patch("app.services.notion_sync.requests")
    def test_records_post_write_last_edited_time(self, requests_mock):
        self.write_post("postwrite", body="Hello world")
        requests_mock.post.return_value = self.make_response(
            payload={
                "id": "page-postwrite",
                "last_edited_time": "2026-01-01T00:00:00.000Z",
            }
        )
        requests_mock.get.return_value = self.make_response(
            payload={
                "last_edited_time": "2026-01-02T00:00:00.000Z",
                "archived": False,
            }
        )

        with patch("app.services.notion_sync.DATA_DIR", self.data_dir):
            sync_local_to_notion(self.content_root, "token", "db")

        entry = NotionSyncState(self.data_dir / "notion_sync_state.json").get("posts/postwrite/index.md")
        self.assertEqual(entry["notion_last_edited_time"], "2026-01-02T00:00:00.000Z")


if __name__ == "__main__":
    unittest.main()
