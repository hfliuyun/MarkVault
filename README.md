# MarkNest

MarkNest is a Markdown-first personal blog system. It keeps article content in a
plain file tree, serves it through a Flask API, and renders the public site with
a Vue 3 frontend.

The code repository and the content repository are intentionally separated:
Markdown files are the source of truth for posts, while generated indexes,
caches, search data, and future sync targets should be rebuildable from the
content tree.

## Features

- Markdown post index built from `content/posts/*/index.md`
- Series support through `content/series/*/*/index.md`
- Stable article URLs based on frontmatter `slug`
- Category, tag, series, search, and legacy-link APIs
- Markdown rendering with table-of-contents data
- Local post images served from each post's `images/` directory
- Vue 3 frontend with post pages, taxonomy pages, search, and series pages
- Lightweight post template generator via `manage.py`

## Project Structure

```text
.
├── blog_by_vue/       # Vue 3 + Vite frontend
├── server_flask/      # Flask backend API
├── docs/              # Architecture, API, migration, and content guides
├── manage.py          # Blog maintenance commands
└── content -> ...     # Optional local symlink to an external content repo
```

The expected content layout is:

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
    abbrlink-map.json
```

## Requirements

- Python 3.10+
- Node.js 20+
- npm

## Setup

Clone the code repository:

```sh
git clone <repo-url> marknest
cd marknest
```

Prepare a content directory. You can either create a local `content/` directory,
mount an external content repository at `content/`, or point the backend to an
external path with `BLOG_CONTENT_ROOT`.

Example using an external content path:

```sh
export BLOG_CONTENT_ROOT=/path/to/blog-content
```

Install backend dependencies:

```sh
cd server_flask
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Install frontend dependencies:

```sh
cd ../blog_by_vue
npm install
```

## Development

Start the Flask API:

```sh
cd server_flask
source .venv/bin/activate
python3 run.py
```

Start the Vue dev server in another terminal:

```sh
cd blog_by_vue
npm run dev
```

The frontend calls the backend under `/api`. In local development, use the Vite
dev server together with the Flask server.

## Create A Post

From the repository root:

```sh
python3 manage.py new_post "My First Post" --slug my-first-post
```

With metadata:

```sh
python3 manage.py new_post "Logistic Regression" \
  --slug logistic-regression \
  --summary "Notes about logistic regression." \
  --category "Machine Learning" \
  --tag "Algorithm"
```

The generator writes to `BLOG_CONTENT_ROOT` when it is set. Otherwise it writes
to the repository-level `content/` path.

## Build And Test

Backend tests:

```sh
cd server_flask
python3 -m unittest test_content_index.py test_markdown_renderer.py test_post_template.py
python3 -m compileall app test_content_index.py test_markdown_renderer.py test_post_template.py
```

Frontend production build:

```sh
cd blog_by_vue
npm run build
```

## Documentation

- `docs/blog-architecture.md`: architecture and data flow
- `docs/blog-api.md`: public API shape
- `docs/blog-content-guide.md`: content layout and frontmatter guide
- `docs/blog-migration.md`: migration notes

## License

MarkNest is released under the MIT License. See `LICENSE` for details.
