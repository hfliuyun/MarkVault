import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock

from app.services.notion_image_cache import NotionImageCache


class NotionImageCacheTestCase(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.cache_path = self.root / "notion-image-cache.json"
        self.file_path = self.root / "image.png"

    def tearDown(self):
        self.temp_dir.cleanup()

    def write_file(self, content: bytes = b"first version") -> str:
        self.file_path.write_bytes(content)
        return str(self.file_path)

    def test_empty_cache_file_starts_empty(self):
        self.cache_path.write_text("")

        cache = NotionImageCache(self.cache_path)

        self.assertEqual(cache._cache, {})

    def test_nonexistent_cache_file_starts_empty(self):
        cache = NotionImageCache(self.cache_path)

        self.assertEqual(cache._cache, {})

    def test_cache_miss_on_first_lookup(self):
        cache = NotionImageCache(self.cache_path)
        abs_path = self.write_file()

        self.assertIsNone(cache.get_cached_upload_id("posts/demo/image.png", abs_path))

    def test_cache_hit_after_update(self):
        cache = NotionImageCache(self.cache_path)
        abs_path = self.write_file()

        cache.update("posts/demo/image.png", abs_path, "upload-123")

        self.assertEqual(
            cache.get_cached_upload_id("posts/demo/image.png", abs_path),
            "upload-123",
        )

    def test_cache_miss_after_file_content_change(self):
        cache = NotionImageCache(self.cache_path)
        abs_path = self.write_file()
        cache.update("posts/demo/image.png", abs_path, "upload-123")
        self.write_file(b"second version")

        self.assertIsNone(cache.get_cached_upload_id("posts/demo/image.png", abs_path))

    def test_cache_miss_when_file_does_not_exist(self):
        cache = NotionImageCache(self.cache_path)
        abs_path = str(self.file_path)

        self.assertIsNone(cache.get_cached_upload_id("posts/demo/image.png", abs_path))

    def test_clear_for_article_removes_matching_prefix_only(self):
        cache = NotionImageCache(self.cache_path)
        cache._cache = {
            "posts/demo/image.png": {"content_hash": "a", "file_upload_id": "1"},
            "posts/demo/cover.jpg": {"content_hash": "b", "file_upload_id": "2"},
            "posts/other/image.png": {"content_hash": "c", "file_upload_id": "3"},
            "series/demo/image.png": {"content_hash": "d", "file_upload_id": "4"},
        }

        cache.clear_for_article("posts/demo/")

        self.assertNotIn("posts/demo/image.png", cache._cache)
        self.assertNotIn("posts/demo/cover.jpg", cache._cache)
        self.assertIn("posts/other/image.png", cache._cache)
        self.assertIn("series/demo/image.png", cache._cache)

    def test_save_reload_round_trip_works(self):
        abs_path = self.write_file()
        cache = NotionImageCache(self.cache_path)
        cache.update("posts/demo/image.png", abs_path, "upload-123")
        cache.save()

        reloaded = NotionImageCache(self.cache_path)

        self.assertEqual(
            reloaded.get_cached_upload_id("posts/demo/image.png", abs_path),
            "upload-123",
        )

    def test_get_or_upload_cache_hit_does_not_call_upload_local_file(self):
        abs_path = self.write_file()
        cache = NotionImageCache(self.cache_path)
        cache.update("posts/demo/image.png", abs_path, "upload-123")
        service = MagicMock()

        result = cache.get_or_upload("posts/demo/image.png", abs_path, service)

        self.assertEqual(result, "upload-123")
        service.upload_local_file.assert_not_called()

    def test_get_or_upload_cache_miss_calls_upload_local_file_and_stores_result(self):
        abs_path = self.write_file()
        cache = NotionImageCache(self.cache_path)
        service = MagicMock()
        service.upload_local_file.return_value = "upload-456"

        result = cache.get_or_upload("posts/demo/image.png", abs_path, service)

        self.assertEqual(result, "upload-456")
        service.upload_local_file.assert_called_once_with(abs_path)
        self.assertEqual(
            cache.get_cached_upload_id("posts/demo/image.png", abs_path),
            "upload-456",
        )


if __name__ == "__main__":
    unittest.main()
