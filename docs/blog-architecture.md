# Blog Architecture

## Principle

Markdown files are the source of truth for the blog. Databases, generated JSON files, caches, search indexes, and Notion pages are derived data and must be rebuildable from `content/`.

In day-to-day development, the repository in this workspace only owns the blog code. The content tree can live in a separate Git repository and be mounted into the codebase via `BLOG_CONTENT_ROOT` or a local `content/` symlink.

## Content Layout

```text
content/
  posts/
    post-slug/
      index.md
      images/
  series/
    series-id/
      post-slug/
        index.md
        images/
  legacy/
    old-posts/
```

The new blog APIs index `content/posts/*/index.md` and `content/series/*/*/index.md`. The `series/` folder is only an organization aid; post URLs still come from frontmatter `slug`, and series membership still comes from frontmatter `series`. `content/legacy/` is a file backup area and is not scanned.

## Backend Layers

The Flask API is split into route handlers and services:

- `server_flask/app/api/routes.py` exposes HTTP routes and keeps old compatibility routes.
- `server_flask/app/services/content_index.py` scans Markdown posts, validates metadata, and builds in-memory indexes.
- `server_flask/app/services/markdown_renderer.py` renders Markdown to HTML and builds the table of contents.
- `server_flask/app/services/media.py` rewrites local image links and serves post images.
- `server_flask/app/models/post.py` defines the internal post model.

The content root is configured in `server_flask/app/__init__.py`. It uses `BLOG_CONTENT_ROOT` when set, otherwise falls back to the repository-level `content/` directory.

## Data Flow

```text
content/posts/*/index.md
content/series/*/*/index.md
  -> ContentIndex
  -> Flask API
  -> Vue routes and views
```

For post detail pages, the backend returns metadata, rendered HTML, table of contents, and series neighbors. The Vue page then applies KaTeX rendering, syntax highlighting, and copy buttons.

## Frontend Routes

- `/` lists posts from `GET /api/posts`.
- `/posts/:slug` renders post detail from `GET /api/posts/:slug`.
- `/series` lists all series from `GET /api/series`.
- `/series/:series_id` lists posts in a series from `GET /api/series/:series_id`.
- `/p/:abbrlink` remains as a legacy compatibility route.

## Extension Points

Future derived stores can be added without changing Markdown ownership:

- Generated `index.json`
- SQLite
- Search index
- Markdown to Notion sync
