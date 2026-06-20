import tempfile
import unittest
from pathlib import Path

from app.services.notion_sync_state import NotionSyncState


class NotionSyncStateTestCase(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.state_path = Path(self.temp_dir.name) / "notion-sync-state.json"

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_empty_state_returns_false_and_empty_mapping(self):
        state = NotionSyncState(self.state_path)

        self.assertFalse(state.has_state("missing.md"))
        self.assertEqual(state.get("missing.md"), {})

    def test_record_sync_stores_sync_metadata(self):
        state = NotionSyncState(self.state_path)

        state.record_sync(
            "post.md",
            content_hash="abc123",
            notion_last_edited_time="2026-06-20T10:00:00Z",
            page_id="page-1",
        )

        saved = state.get("post.md")
        self.assertTrue(state.has_state("post.md"))
        self.assertEqual(
            saved,
            {
                "content_hash": "abc123",
                "synced_at": saved["synced_at"],
                "notion_last_edited_time": "2026-06-20T10:00:00Z",
                "page_id": "page-1",
            },
        )
        self.assertIsInstance(saved["synced_at"], str)

    def test_record_adopt_omits_content_hash(self):
        state = NotionSyncState(self.state_path)

        state.record_sync(
            "post.md",
            content_hash="abc123",
            notion_last_edited_time="2026-06-20T09:00:00Z",
            page_id="old-page",
        )
        state.record_adopt(
            "post.md",
            notion_last_edited_time="2026-06-20T10:00:00Z",
            page_id="page-2",
        )

        adopted = state.get("post.md")
        self.assertTrue(state.has_state("post.md"))
        self.assertNotIn("content_hash", adopted)
        self.assertEqual(adopted["notion_last_edited_time"], "2026-06-20T10:00:00Z")
        self.assertEqual(adopted["page_id"], "page-2")
        self.assertIn("synced_at", adopted)

    def test_save_and_reload_round_trip(self):
        state = NotionSyncState(self.state_path)

        state.record_sync(
            "post.md",
            content_hash="abc123",
            notion_last_edited_time="2026-06-20T10:00:00Z",
            page_id="page-3",
        )
        state.save()

        reloaded = NotionSyncState(self.state_path)

        self.assertTrue(reloaded.has_state("post.md"))
        self.assertEqual(reloaded.get("post.md"), state.get("post.md"))

    def test_update_merges_partial_fields_without_overwriting_existing_values(self):
        state = NotionSyncState(self.state_path)

        state.record_sync(
            "post.md",
            content_hash="abc123",
            notion_last_edited_time="2026-06-20T10:00:00Z",
            page_id="page-4",
        )
        original = state.get("post.md")

        state.update("post.md", page_id="page-5")

        updated = state.get("post.md")
        self.assertEqual(updated["content_hash"], original["content_hash"])
        self.assertEqual(updated["synced_at"], original["synced_at"])
        self.assertEqual(updated["notion_last_edited_time"], original["notion_last_edited_time"])
        self.assertEqual(updated["page_id"], "page-5")


if __name__ == "__main__":
    unittest.main()
