# Blog API

All routes are mounted under `/api`.

The public blog APIs read Markdown content from `BLOG_CONTENT_ROOT` when that environment variable is set. If it is unset, the backend falls back to the local `content/` path.

## Authentication

Admin-only APIs use TOTP verification to issue a short-lived JWT. Runtime auth data is stored under `server_flask/data/`, which must not be committed.

Initial setup:

```sh
python manage.py setup_totp --account admin
```

Scan the terminal QR code with an authenticator app, or manually enter the printed secret. Use `reset_totp` to replace the secret.

Authenticated requests must include:

```text
Authorization: Bearer <jwt-token>
```

### `POST /api/auth/verify`

Verifies a 6-digit TOTP code and returns a JWT.

Request:

```json
{
  "code": "123456"
}
```

Success response:

```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "expires_in": 7200
}
```

Error responses:

- `400`: TOTP has not been configured
- `401`: invalid code

### `GET /api/auth/status`

Checks whether the current bearer token is valid.

Success response:

```json
{
  "authenticated": true
}
```

Invalid or missing token:

```json
{
  "authenticated": false
}
```

### `GET /api/auth/provisioning-uri`

Returns the configured `otpauth://` URI for manual authenticator import. This endpoint is intended to help first-time binding after the server-side secret has already been generated.

## Pastebin

Paste data is stored as JSON files under `server_flask/data/pastes/`.

### `POST /api/paste`

Creates a paste. Requires authentication.

Request:

```json
{
  "content": "print('hello world')",
  "title": "Example",
  "language": "python",
  "expires_in": "1d"
}
```

`expires_in` supports `1h`, `1d`, `1w`, and `never`. The default is `1d`.

Success response:

```json
{
  "id": "a1b2c3d4",
  "title": "Example",
  "content": "print('hello world')",
  "language": "python",
  "created_at": "2026-06-16T23:00:00+08:00",
  "expires_at": "2026-06-17T23:00:00+08:00",
  "url": "/paste/a1b2c3d4"
}
```

### `GET /api/paste/:id`

Returns one public paste, or `404` when it does not exist or has expired.

### `GET /api/pastes`

Lists non-expired pastes. Requires authentication. List items omit `content`.

### `DELETE /api/paste/:id`

Deletes a paste. Requires authentication.

## `GET /api/posts`

Returns a paginated post list sorted by `date` descending.

Query parameters:

- `page`: optional, default `1`
- `size`: optional, default `10`

Example response:

```json
{
  "total": 1,
  "page": 1,
  "size": 1,
  "articles": [
    {
      "title": "逻辑回归",
      "slug": "logistic-regression",
      "date": "2022-01-29 14:40:13",
      "summary": "逻辑回归的基本原理、损失函数和梯度推导。",
      "categories": ["机器学习"],
      "tags": ["算法", "逻辑回归", "监督学习"],
      "series": {
        "id": "machine-learning-basic",
        "title": "机器学习基础",
        "order": 1
      }
    }
  ]
}
```

## `GET /api/posts/:slug`

Returns a rendered post detail.

Example response:

```json
{
  "title": "逻辑回归",
  "slug": "logistic-regression",
  "date": "2022-01-29 14:40:13",
  "summary": "逻辑回归的基本原理、损失函数和梯度推导。",
  "categories": ["机器学习"],
  "tags": ["算法", "逻辑回归", "监督学习"],
  "series": {
    "id": "machine-learning-basic",
    "title": "机器学习基础",
    "order": 1
  },
  "content": "<h2 id=\"...\">...</h2>",
  "toc": [
    {
      "level": 2,
      "title": "逻辑回归是什么",
      "id": "逻辑回归是什么"
    }
  ],
  "series_posts": []
}
```

Error responses:

- `404`: post not found
- `500`: content index error, such as duplicate slug or invalid metadata

## `GET /api/series`

Returns all series sorted by latest update time descending.

Example response:

```json
{
  "series": [
    {
      "id": "machine-learning-basic",
      "title": "机器学习基础",
      "count": 1,
      "updated_at": "2022-01-29 14:40:13",
      "description_html": "<p>...</p>"
    }
  ]
}
```

## `GET /api/series/:series_id`

Returns one series and its posts. Posts are sorted by `series.order`; posts without an order fall back after ordered posts and then sort by `date`.

Example response:

```json
{
  "id": "machine-learning-basic",
  "title": "机器学习基础",
  "count": 1,
  "updated_at": "2022-01-29 14:40:13",
  "description_html": "<p>...</p>",
  "posts": [
    {
      "title": "逻辑回归",
      "slug": "logistic-regression",
      "date": "2022-01-29 14:40:13",
      "summary": "逻辑回归的基本原理、损失函数和梯度推导。",
      "categories": ["机器学习"],
      "tags": ["算法", "逻辑回归", "监督学习"]
    }
  ]
}
```

Error responses:

- `404`: series not found
- `500`: content index error

Series description behavior:

- `content/series/<series-id>/README.md` may contain optional frontmatter and Markdown body.
- If the README frontmatter includes `title`, it overrides the series title in API responses.
- If the README does not exist, `description_html` is an empty string.
- The README body is rendered as sanitized HTML and returned in full.

## `GET /api/search`

Searches posts by title, summary, Markdown body, categories, and tags.

Query parameters:

- `q`: search keyword

Empty keywords return an empty result instead of an error.

Example response:

```json
{
  "query": "逻辑回归",
  "total": 1,
  "articles": [
    {
      "title": "逻辑回归",
      "slug": "logistic-regression",
      "date": "2022-01-29 14:40:13",
      "summary": "逻辑回归的基本原理、损失函数和梯度推导。",
      "categories": ["机器学习"],
      "tags": ["算法", "逻辑回归", "监督学习"]
    }
  ]
}
```

Error responses:

- `500`: content index error

## Media

Post-local images are served through:

```text
GET /api/media/posts/:slug/images/:filename
```

Markdown image references should use:

```md
![alt](images/file.png)
```

The backend rewrites those paths when rendering post detail HTML.

## Legacy Routes

These routes remain available for compatibility but should not be used by new frontend code.

`GET /api/p/:abbrlink` now resolves migrated legacy links through explicit mappings:

- `legacy.abbrlinks` in post frontmatter
- `content/legacy/abbrlink-map.json`

When a mapping exists, the route returns a permanent redirect:

```text
308 Location: /api/posts/:slug
```

When a legacy link has not been migrated, the response is:

```json
{
  "error": "Legacy post not migrated"
}
```

Example `content/legacy/abbrlink-map.json`:

```json
{
  "f9b01ad8": "logistic-regression"
}
```

Frontmatter mapping example:

```yaml
legacy:
  abbrlinks:
    - f9b01ad8
```

Other legacy routes:

- `GET /api/posts_list_metadata`
- `GET /api/md/:abbrlink`
- `POST /api/upload_image`
- `POST /api/save_post`
