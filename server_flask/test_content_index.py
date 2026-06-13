import tempfile
import unittest
from pathlib import Path

from app import create_app
from app.api import routes
from app.services.content_index import ContentIndex, ContentIndexError


class ContentIndexTestCase(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.content_root = Path(self.temp_dir.name)

    def tearDown(self):
        self.temp_dir.cleanup()

    def write_post(self, relative_dir, title, slug, date, body="", extra_frontmatter=""):
        post_dir = self.content_root / relative_dir
        post_dir.mkdir(parents=True, exist_ok=True)
        (post_dir / "images").mkdir(exist_ok=True)
        frontmatter = f"""---
title: {title}
slug: {slug}
date: {date}
summary: {title} summary
categories:
  - Notes
tags:
  - Test
{extra_frontmatter}---
"""
        (post_dir / "index.md").write_text(frontmatter + body, encoding="utf-8")
        return post_dir / "index.md"

    def test_loads_standalone_and_series_posts_into_one_index(self):
        self.write_post(
            "posts/git-basic",
            "Git Basic",
            "git-basic",
            "2024-01-01 10:00:00",
        )
        self.write_post(
            "series/ml-basic/logistic-regression",
            "Logistic Regression",
            "logistic-regression",
            "2024-01-02 10:00:00",
            extra_frontmatter="""series:
  id: ml-basic
  title: ML Basic
  order: 2
""",
        )
        self.write_post(
            "series/ml-basic/decision-tree",
            "Decision Tree",
            "decision-tree",
            "2024-01-03 10:00:00",
            extra_frontmatter="""series:
  id: ml-basic
  title: ML Basic
  order: 1
""",
        )

        index = ContentIndex(self.content_root)

        self.assertEqual(index.list_posts(page=1, size=10)["total"], 3)
        self.assertIn("git-basic", index.posts_by_slug)
        self.assertIn("logistic-regression", index.posts_by_slug)
        series = index.get_series("ml-basic")
        self.assertIsNotNone(series)
        self.assertEqual(
            [post["slug"] for post in series["posts"]],
            ["decision-tree", "logistic-regression"],
        )

    def test_duplicate_slug_is_detected_across_content_layouts(self):
        self.write_post("posts/git-basic", "Git Basic", "same-slug", "2024-01-01")
        self.write_post(
            "series/ml-basic/logistic-regression",
            "Logistic Regression",
            "same-slug",
            "2024-01-02",
        )

        with self.assertRaisesRegex(ContentIndexError, "Duplicate slug 'same-slug'"):
            ContentIndex(self.content_root)

    def test_series_post_image_dir_uses_actual_post_folder(self):
        self.write_post(
            "series/ml-basic/logistic-regression",
            "Logistic Regression",
            "logistic-regression",
            "2024-01-02",
        )

        index = ContentIndex(self.content_root)

        self.assertEqual(
            index.get_post_image_dir("logistic-regression"),
            self.content_root / "series/ml-basic/logistic-regression/images",
        )
        self.assertIsNone(index.get_post_image_dir("missing-post"))

    def test_media_route_serves_series_post_image(self):
        post_dir = self.write_post(
            "series/ml-basic/logistic-regression",
            "Logistic Regression",
            "logistic-regression",
            "2024-01-02",
        ).parent
        (post_dir / "images" / "sigmoid.txt").write_text("image data", encoding="utf-8")
        app = create_app()
        app.config["CONTENT_ROOT"] = self.content_root
        routes._content_index = None

        try:
            with app.test_client() as client:
                response = client.get(
                    "/api/media/posts/logistic-regression/images/sigmoid.txt"
                )
                response_data = response.data
                response.close()
        finally:
            routes._content_index = None

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response_data, b"image data")

    def test_content_signature_tracks_series_posts(self):
        self.write_post("posts/git-basic", "Git Basic", "git-basic", "2024-01-01")
        index = ContentIndex(self.content_root)
        original_signature = index.content_signature

        self.write_post(
            "series/ml-basic/logistic-regression",
            "Logistic Regression",
            "logistic-regression",
            "2024-01-02",
        )
        index.reload_if_changed()

        self.assertNotEqual(index.content_signature, original_signature)
        self.assertIn("logistic-regression", index.posts_by_slug)


if __name__ == "__main__":
    unittest.main()
