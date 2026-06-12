# Repository Guidelines

## Project Structure & Module Organization

This repository contains JavaScript learning examples plus two web apps. `blog_by_vue/` is the main Vue 3 blog frontend, with views in `src/views/`, shared components in `src/components/`, routing in `src/router/`, and assets in `src/assets/` or `public/`. `server_flask/` is the Flask backend; API routes live in `app/api/routes.py`, setup in `app/__init__.py`, helpers in `utils/`, and Markdown articles in `posts/`. `vite-project/` is a separate starter Vue/Vite app. Root files such as `test.js` and `内容大纲.md` are standalone learning/reference files.

## Build, Test, and Development Commands

Run frontend commands from the app directory:

```sh
cd blog_by_vue
npm install
npm run dev      # start Vite dev server
npm run build    # create production build in dist/
npm run preview  # preview the production build
```

`vite-project/` uses the same `npm run dev`, `npm run build`, and `npm run preview` commands. For the backend:

```sh
cd server_flask
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python3 run.py
```

Run backend commands from `server_flask/` because routes use `posts` as a relative path.

## Coding Style & Naming Conventions

Use 2-space indentation for Vue templates, scripts, and CSS. Keep Vue components in PascalCase, for example `PageHeader.vue`, and route/view files named by page role, such as `Home.vue` or `Post.vue`. Prefer ES modules and top-level imports. Python code should use 4-space indentation, UTF-8 file handling, and descriptive snake_case function names. Markdown post filenames may be Chinese or English; keep slugs stable because API routes expose them.

## Testing Guidelines

There is no formal test runner configured yet. Existing backend scripts include `server_flask/test_markdown_render.py` and `server_flask/test.py`; run them directly with Python when changing Markdown rendering or save logic. For new backend tests, prefer `pytest` files named `test_*.py`. For frontend changes, run `npm run build` in the affected Vite app and manually verify key routes.

## Commit & Pull Request Guidelines

This workspace has no Git history, so no project-specific commit convention is available. Use short, imperative commit messages such as `Add blog post editor validation` or `Fix Markdown render route`. Pull requests should describe the change, list manual or automated checks run, link related issues when available, and include screenshots for visible UI changes.

## Security & Configuration Tips

Do not commit virtual environments, `node_modules/`, generated `dist/` output, or local secrets. Validate uploaded images and post data in Flask routes before saving files. Keep dependency updates scoped to the app that uses them.
