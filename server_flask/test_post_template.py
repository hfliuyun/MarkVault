import os
import tempfile
import unittest
from pathlib import Path

from app import create_app
from app.api import routes
from app.services.content_index import ContentIndex
from app.services.post_template import (
    NewPostOptions,
    PostTemplateError,
    create_post_template,
    default_content_root,
)


class PostTemplateTestCase(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.content_root = Path(self.temp_dir.name)

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_creates_valid_standalone_post_template(self):
        generated = create_post_template(
            NewPostOptions(
                title="New Post",
                slug="new-post",
                summary="A generated post.",
                categories=("Notes",),
                tags=("Python", "Markdown"),
                date_text="2026-06-14 10:00:00",
                content_root=self.content_root,
            )
        )

        self.assertEqual(generated.index_path, self.content_root / "posts/new-post/index.md")
        self.assertTrue(generated.images_dir.is_dir())

        index = ContentIndex(self.content_root)
        post = index.posts_by_slug["new-post"]
        self.assertEqual(post.title, "New Post")
        self.assertEqual(post.summary, "A generated post.")
        self.assertEqual(post.categories, ["Notes"])
        self.assertEqual(post.tags, ["Python", "Markdown"])

    def test_refuses_to_overwrite_existing_slug(self):
        options = NewPostOptions(
            title="New Post",
            slug="new-post",
            date_text="2026-06-14",
            content_root=self.content_root,
        )
        create_post_template(options)

        with self.assertRaisesRegex(PostTemplateError, "already exists"):
            create_post_template(options)

    def test_default_taxonomy_fields_are_valid_empty_lists(self):
        create_post_template(
            NewPostOptions(
                title="Empty Taxonomy",
                slug="empty-taxonomy",
                date_text="2026-06-14",
                content_root=self.content_root,
            )
        )

        post = ContentIndex(self.content_root).posts_by_slug["empty-taxonomy"]

        self.assertEqual(post.categories, [])
        self.assertEqual(post.tags, [])

    def test_generated_post_is_visible_to_posts_api_without_restart(self):
        app = create_app()
        app.config["CONTENT_ROOT"] = self.content_root
        routes._content_index = None

        try:
            with app.test_client() as client:
                empty_response = client.get("/api/posts")
                self.assertEqual(empty_response.get_json()["total"], 0)

                create_post_template(
                    NewPostOptions(
                        title="API Visible",
                        slug="api-visible",
                        date_text="2026-06-14",
                        content_root=self.content_root,
                    )
                )

                response = client.get("/api/posts")
                data = response.get_json()
        finally:
            routes._content_index = None

        self.assertEqual(response.status_code, 200)
        self.assertEqual(data["total"], 1)
        self.assertEqual(data["articles"][0]["slug"], "api-visible")

    def test_default_content_root_uses_blog_content_root_env(self):
        previous_value = os.environ.get("BLOG_CONTENT_ROOT")
        os.environ["BLOG_CONTENT_ROOT"] = str(self.content_root)
        try:
            self.assertEqual(default_content_root(), self.content_root.resolve())
        finally:
            if previous_value is None:
                os.environ.pop("BLOG_CONTENT_ROOT", None)
            else:
                os.environ["BLOG_CONTENT_ROOT"] = previous_value

    def test_rejects_slug_with_path_segments(self):
        with self.assertRaisesRegex(PostTemplateError, "Slug must"):
            create_post_template(
                NewPostOptions(
                    title="Bad Slug",
                    slug="../bad",
                    content_root=self.content_root,
                )
            )


if __name__ == "__main__":
    unittest.main()
