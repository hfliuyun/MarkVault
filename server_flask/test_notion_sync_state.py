import tempfile
import unittest
from pathlib import Path

from app.services.notion_sync_state import NotionSyncState


class TestNotionSyncState(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.state_path = Path(self.temp_dir.name) / "sync_state.json"
        self.state = NotionSyncState(self.state_path)

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_empty_state(self):
        """No state file → empty state, no error."""
        self.assertFalse(self.state.has_state("posts/test/index.md"))
        self.assertEqual(self.state.get("posts/test/index.md"), {})

    def test_record_sync(self):
        """record_sync stores all fields."""
        self.state.record_sync(
            "posts/test/index.md",
            content_hash="abc123",
            notion_last_edited_time="2026-06-20T12:00:00.000Z",
            page_id="page-xxx",
        )
        state = self.state.get("posts/test/index.md")
        self.assertEqual(state["content_hash"], "abc123")
        self.assertEqual(state["notion_last_edited_time"], "2026-06-20T12:00:00.000Z")
        self.assertEqual(state["page_id"], "page-xxx")
        self.assertIn("synced_at", state)
        self.assertTrue(self.state.has_state("posts/test/index.md"))

    def test_record_adopt_omits_content_hash(self):
        """record_adopt intentionally omits content_hash."""
        self.state.record_adopt(
            "posts/test/index.md",
            notion_last_edited_time="2026-06-20T12:00:00.000Z",
            page_id="page-xxx",
        )
        state = self.state.get("posts/test/index.md")
        self.assertNotIn("content_hash", state)
        self.assertEqual(state["notion_last_edited_time"], "2026-06-20T12:00:00.000Z")
        self.assertEqual(state["page_id"], "page-xxx")

    def test_save_and_reload(self):
        """State persists to disk and reloads correctly."""
        self.state.record_sync(
            "posts/test/index.md",
            content_hash="abc123",
            notion_last_edited_time="2026-06-20T12:00:00.000Z",
            page_id="page-xxx",
        )
        self.state.save()
        state2 = NotionSyncState(self.state_path)
        reloaded = state2.get("posts/test/index.md")
        self.assertEqual(reloaded["content_hash"], "abc123")

    def test_update_partial_fields(self):
        """update() merges fields without overwriting others."""
        self.state.update("posts/test/index.md", content_hash="abc", page_id="p1")
        self.state.update("posts/test/index.md", content_hash="def")
        state = self.state.get("posts/test/index.md")
        self.assertEqual(state["content_hash"], "def")
        self.assertEqual(state["page_id"], "p1")


if __name__ == "__main__":
    unittest.main()
