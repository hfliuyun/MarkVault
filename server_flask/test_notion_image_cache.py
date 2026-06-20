import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock

from app.services.notion_image_cache import NotionImageCache


class TestNotionImageCache(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.cache_path = Path(self.temp_dir.name) / "image_cache.json"
        self.cache = NotionImageCache(self.cache_path)

        # Create a test image file
        self.image_dir = Path(self.temp_dir.name) / "images"
        self.image_dir.mkdir()
        self.image_path = self.image_dir / "test.png"
        self.image_path.write_bytes(b"fake-image-content")

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_cache_miss_first_upload(self):
        """First encounter: no cache entry, returns None."""
        result = self.cache.get_cached_upload_id("posts/test/images/test.png", str(self.image_path))
        self.assertIsNone(result)

    def test_cache_hit_after_update(self):
        """After caching, same file returns cached ID."""
        self.cache.update("posts/test/images/test.png", str(self.image_path), "file-upload-123")
        result = self.cache.get_cached_upload_id("posts/test/images/test.png", str(self.image_path))
        self.assertEqual(result, "file-upload-123")

    def test_cache_miss_after_content_change(self):
        """If file content changes, cache returns None."""
        self.cache.update("posts/test/images/test.png", str(self.image_path), "file-upload-123")
        # Change image content
        self.image_path.write_bytes(b"new-image-content")
        result = self.cache.get_cached_upload_id("posts/test/images/test.png", str(self.image_path))
        self.assertIsNone(result)

    def test_cache_miss_file_not_found(self):
        """If file doesn't exist, returns None."""
        result = self.cache.get_cached_upload_id("posts/test/images/missing.png", "/nonexistent/path.png")
        self.assertIsNone(result)

    def test_clear_for_article(self):
        """clear_for_article removes all entries with matching prefix."""
        self.cache.update("posts/test/images/a.png", str(self.image_path), "id-a")
        self.cache.update("posts/test/images/b.png", str(self.image_path), "id-b")
        self.cache.update("posts/other/images/c.png", str(self.image_path), "id-c")
        self.cache.clear_for_article("posts/test/")
        self.assertIsNone(self.cache.get_cached_upload_id("posts/test/images/a.png", str(self.image_path)))
        self.assertIsNone(self.cache.get_cached_upload_id("posts/test/images/b.png", str(self.image_path)))
        # Other article's cache is untouched
        self.assertEqual(
            self.cache.get_cached_upload_id("posts/other/images/c.png", str(self.image_path)),
            "id-c",
        )

    def test_save_and_reload(self):
        """Cache persists to disk and reloads correctly."""
        self.cache.update("posts/test/images/test.png", str(self.image_path), "file-upload-456")
        self.cache.save()
        # Reload from same path
        cache2 = NotionImageCache(self.cache_path)
        result = cache2.get_cached_upload_id("posts/test/images/test.png", str(self.image_path))
        self.assertEqual(result, "file-upload-456")

    def test_empty_cache_file_not_exist(self):
        """No cache file → empty cache, no error."""
        cache = NotionImageCache(Path(self.temp_dir.name) / "nonexistent.json")
        self.assertIsNone(cache.get_cached_upload_id("any", str(self.image_path)))

    def test_get_or_upload_cache_hit(self):
        """get_or_upload returns cached ID without calling service."""
        self.cache.update("posts/test/images/test.png", str(self.image_path), "cached-id")
        mock_service = MagicMock()
        result = self.cache.get_or_upload("posts/test/images/test.png", str(self.image_path), mock_service)
        self.assertEqual(result, "cached-id")
        mock_service.upload_local_file.assert_not_called()

    def test_get_or_upload_cache_miss(self):
        """get_or_upload calls service on cache miss and caches result."""
        mock_service = MagicMock()
        mock_service.upload_local_file.return_value = "new-upload-id"
        result = self.cache.get_or_upload("posts/test/images/test.png", str(self.image_path), mock_service)
        self.assertEqual(result, "new-upload-id")
        mock_service.upload_local_file.assert_called_once_with(str(self.image_path))
        # Should now be cached
        cached = self.cache.get_cached_upload_id("posts/test/images/test.png", str(self.image_path))
        self.assertEqual(cached, "new-upload-id")


if __name__ == "__main__":
    unittest.main()
