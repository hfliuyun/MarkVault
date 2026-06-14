import json
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

    def write_post(
        self,
        relative_dir,
        title,
        slug,
        date,
        body="",
        extra_frontmatter="",
        categories=None,
        tags=None,
    ):
        post_dir = self.content_root / relative_dir
        post_dir.mkdir(parents=True, exist_ok=True)
        (post_dir / "images").mkdir(exist_ok=True)
        category_lines = "\n".join(f"  - {category}" for category in (categories or ["Notes"]))
        tag_lines = "\n".join(f"  - {tag}" for tag in (tags or ["Test"]))
        frontmatter = f"""---
title: {title}
slug: {slug}
date: {date}
summary: {title} summary
categories:
{category_lines}
tags:
{tag_lines}
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

    def test_search_matches_title_summary_body_categories_and_tags(self):
        self.write_post(
            "posts/title-hit",
            "Neural Search",
            "title-hit",
            "2024-01-01",
        )
        self.write_post(
            "posts/summary-hit",
            "alpha summary match",
            "summary-hit",
            "2024-01-02",
        )
        self.write_post(
            "posts/body-hit",
            "Body Hit",
            "body-hit",
            "2024-01-03",
            body="The body contains VECTOR search notes.",
        )
        self.write_post(
            "posts/category-hit",
            "Category Hit",
            "category-hit",
            "2024-01-04",
            categories=["SearchCategory"],
        )
        self.write_post(
            "posts/tag-hit",
            "Tag Hit",
            "tag-hit",
            "2024-01-05",
            tags=["SearchTag"],
        )

        index = ContentIndex(self.content_root)

        self.assertEqual(
            [post["slug"] for post in index.search_posts("neural")["articles"]],
            ["title-hit"],
        )
        self.assertEqual(
            [post["slug"] for post in index.search_posts("alpha summary")["articles"]],
            ["summary-hit"],
        )
        self.assertEqual(
            [post["slug"] for post in index.search_posts("vector")["articles"]],
            ["body-hit"],
        )
        self.assertEqual(
            [post["slug"] for post in index.search_posts("searchcategory")["articles"]],
            ["category-hit"],
        )
        self.assertEqual(
            [post["slug"] for post in index.search_posts("searchtag")["articles"]],
            ["tag-hit"],
        )

    def test_search_empty_query_returns_empty_result(self):
        self.write_post("posts/git-basic", "Git Basic", "git-basic", "2024-01-01")
        index = ContentIndex(self.content_root)

        self.assertEqual(index.search_posts("   "), {"query": "", "total": 0, "articles": []})

    def test_search_route_returns_results_and_reload_if_changed(self):
        self.write_post("posts/git-basic", "Git Basic", "git-basic", "2024-01-01")
        app = create_app()
        app.config["CONTENT_ROOT"] = self.content_root
        routes._content_index = None

        try:
            with app.test_client() as client:
                initial_response = client.get("/api/search?q=hotload")
                self.assertEqual(initial_response.get_json()["total"], 0)

                self.write_post(
                    "posts/hotload",
                    "Hotload Search",
                    "hotload",
                    "2024-01-02",
                    body="Visible on the next search request.",
                )

                response = client.get("/api/search?q=visible")
                data = response.get_json()
        finally:
            routes._content_index = None

        self.assertEqual(response.status_code, 200)
        self.assertEqual(data["query"], "visible")
        self.assertEqual(data["total"], 1)
        self.assertEqual(data["articles"][0]["slug"], "hotload")

    def test_post_route_returns_sanitized_rendered_content(self):
        self.write_post(
            "posts/security",
            "Security",
            "security",
            "2024-01-01",
            body="""# Safe Heading

<script>alert("xss")</script>

[bad](javascript:alert(1))

![safe](images/example.png)
""",
        )
        app = create_app()
        app.config["CONTENT_ROOT"] = self.content_root
        routes._content_index = None

        try:
            with app.test_client() as client:
                response = client.get("/api/posts/security")
                data = response.get_json()
        finally:
            routes._content_index = None

        self.assertEqual(response.status_code, 200)
        content = data["content"]
        lower_content = content.lower()
        self.assertIn('id="safe-heading"', content)
        self.assertIn('src="/api/media/posts/security/images/example.png"', content)
        self.assertNotIn("<script", lower_content)
        self.assertNotIn("alert(", lower_content)
        self.assertNotIn("javascript:", lower_content)

    def test_legacy_abbrlink_map_can_be_read_from_post_frontmatter(self):
        self.write_post(
            "posts/git-basic",
            "Git Basic",
            "git-basic",
            "2024-01-01",
            extra_frontmatter="""legacy:
  abbrlinks:
    - ab9e1965
""",
        )

        index = ContentIndex(self.content_root)

        self.assertEqual(index.resolve_legacy_abbrlink("ab9e1965"), "git-basic")

    def test_legacy_abbrlink_map_can_be_read_from_json_file(self):
        self.write_post("posts/git-basic", "Git Basic", "git-basic", "2024-01-01")
        legacy_dir = self.content_root / "legacy"
        legacy_dir.mkdir()
        (legacy_dir / "abbrlink-map.json").write_text(
            json.dumps({"ab9e1965": "git-basic"}),
            encoding="utf-8",
        )

        index = ContentIndex(self.content_root)

        self.assertEqual(index.resolve_legacy_abbrlink("ab9e1965"), "git-basic")

    def test_legacy_map_rejects_unknown_slug(self):
        self.write_post("posts/git-basic", "Git Basic", "git-basic", "2024-01-01")
        legacy_dir = self.content_root / "legacy"
        legacy_dir.mkdir()
        (legacy_dir / "abbrlink-map.json").write_text(
            json.dumps({"ab9e1965": "missing-post"}),
            encoding="utf-8",
        )

        with self.assertRaisesRegex(ContentIndexError, "unknown slug 'missing-post'"):
            ContentIndex(self.content_root)

    def test_legacy_map_rejects_conflicting_abbrlink(self):
        self.write_post(
            "posts/git-basic",
            "Git Basic",
            "git-basic",
            "2024-01-01",
            extra_frontmatter="""legacy:
  abbrlinks:
    - same-link
""",
        )
        self.write_post(
            "posts/linux-swap",
            "Linux Swap",
            "linux-swap",
            "2024-01-02",
            extra_frontmatter="""legacy:
  abbrlinks:
    - same-link
""",
        )

        with self.assertRaisesRegex(ContentIndexError, "same-link"):
            ContentIndex(self.content_root)

    def test_legacy_route_redirects_mapped_abbrlink(self):
        self.write_post("posts/git-basic", "Git Basic", "git-basic", "2024-01-01")
        legacy_dir = self.content_root / "legacy"
        legacy_dir.mkdir()
        (legacy_dir / "abbrlink-map.json").write_text(
            json.dumps({"ab9e1965": "git-basic"}),
            encoding="utf-8",
        )
        app = create_app()
        app.config["CONTENT_ROOT"] = self.content_root
        routes._content_index = None

        try:
            with app.test_client() as client:
                response = client.get("/api/p/ab9e1965")
        finally:
            routes._content_index = None

        self.assertEqual(response.status_code, 308)
        self.assertEqual(response.headers["Location"], "/api/posts/git-basic")

    def test_legacy_route_returns_clear_404_for_unmapped_abbrlink(self):
        self.write_post("posts/git-basic", "Git Basic", "git-basic", "2024-01-01")
        app = create_app()
        app.config["CONTENT_ROOT"] = self.content_root
        routes._content_index = None

        try:
            with app.test_client() as client:
                response = client.get("/api/p/missing-link")
                data = response.get_json()
        finally:
            routes._content_index = None

        self.assertEqual(response.status_code, 404)
        self.assertEqual(data["error"], "Legacy post not migrated")

    def test_legacy_map_file_changes_reload_on_next_request(self):
        self.write_post("posts/git-basic", "Git Basic", "git-basic", "2024-01-01")
        legacy_dir = self.content_root / "legacy"
        legacy_dir.mkdir()
        map_path = legacy_dir / "abbrlink-map.json"
        map_path.write_text(json.dumps({}), encoding="utf-8")
        app = create_app()
        app.config["CONTENT_ROOT"] = self.content_root
        routes._content_index = None

        try:
            with app.test_client() as client:
                initial_response = client.get("/api/p/ab9e1965")
                self.assertEqual(initial_response.status_code, 404)

                map_path.write_text(
                    json.dumps({"ab9e1965": "git-basic"}),
                    encoding="utf-8",
                )

                response = client.get("/api/p/ab9e1965")
        finally:
            routes._content_index = None

        self.assertEqual(response.status_code, 308)
        self.assertEqual(response.headers["Location"], "/api/posts/git-basic")


if __name__ == "__main__":
    unittest.main()
