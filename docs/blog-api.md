# Blog API

All routes are mounted under `/api`.

The public blog APIs read Markdown content from `BLOG_CONTENT_ROOT` when that environment variable is set. If it is unset, the backend falls back to the local `content/` path.

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
      "updated_at": "2022-01-29 14:40:13"
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

These routes remain available for compatibility but should not be used by new frontend code:

- `GET /api/posts_list_metadata`
- `GET /api/p/:abbrlink`
- `GET /api/md/:abbrlink`
- `POST /api/upload_image`
- `POST /api/save_post`
