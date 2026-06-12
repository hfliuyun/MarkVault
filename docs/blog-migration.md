# Blog Migration

## Current State

The old backend reads Markdown files directly from `server_flask/posts/*.md`. The old frontend reads:

- `GET /api/posts_list_metadata`
- `GET /api/p/:abbrlink`

The new implementation reads `content/posts/*/index.md` through the content index service. In a split-repo setup, `content/` in the code repository is a mount point or symlink to an external content repository.

## Migration Steps

1. Create the new content tree:

   ```text
   content/posts/
   content/legacy/old-posts/
   ```

2. Add or migrate posts into:

   ```text
   content/posts/<slug>/index.md
   ```

3. Put post images under:

   ```text
   content/posts/<slug>/images/
   ```

4. Keep old posts in `content/legacy/old-posts/` if they should remain as file backups only.

5. Verify the backend APIs:

   ```text
   GET /api/posts
   GET /api/posts/:slug
   GET /api/series
   GET /api/series/:series_id
   ```

6. Verify the Vue routes:

   ```text
   /
   /posts/:slug
   /series
   /series/:series_id
   ```

7. Configure the runtime content path:

   ```sh
   export BLOG_CONTENT_ROOT=/home/aa/code/blog-content
   ```

## Acceptance Checklist

- `content/posts/` exists.
- At least one post has valid frontmatter and renders through `/api/posts/:slug`.
- `content/legacy/` is not included in `/api/posts`.
- Duplicate slugs fail with a content index error.
- The homepage links to `/posts/:slug`.
- Series pages show grouped series posts.
- Code highlighting, math rendering, and code copy still work in post detail pages.
- The backend can read the content tree from either `BLOG_CONTENT_ROOT` or the local `content/` mount.

## Rollback Notes

Old routes remain available while the migration is in progress:

- `GET /api/posts_list_metadata`
- `GET /api/p/:abbrlink`
- `GET /api/md/:abbrlink`
- `POST /api/upload_image`
- `POST /api/save_post`

Do not delete `server_flask/posts/` until all desired posts have been reviewed and migrated.
