# Blog Content Guide

## Directory Structure

New posts live under `content/posts/`:

```text
content/posts/logistic-regression/
  index.md
  images/
    sigmoid.png
```

Legacy posts can be backed up under `content/legacy/old-posts/`. They are not indexed by the new APIs.

## Frontmatter Schema

Required fields:

- `title`: post title
- `slug`: stable URL identifier
- `date`: publish date, using `YYYY-MM-DD HH:mm:ss` or `YYYY-MM-DD`

Recommended fields:

- `summary`: short list-page description
- `categories`: list of category names
- `tags`: list of tag names

Optional fields:

- `series`: structured series metadata
- `notion`: future Notion sync metadata

## Standalone Post

```yaml
---
title: Git 基本操作
slug: git-basic
date: 2022-01-20 10:00:00
summary: 常用 Git 命令和基本工作流记录。
categories:
  - 工具
tags:
  - Git
---
```

## Series Post

```yaml
---
title: 逻辑回归
slug: logistic-regression
date: 2022-01-29 14:40:13
summary: 逻辑回归的基本原理、损失函数和梯度推导。
categories:
  - 机器学习
tags:
  - 算法
  - 逻辑回归
series:
  id: machine-learning-basic
  title: 机器学习基础
  order: 1
---
```

Series rules:

- Posts with the same `series.id` belong to the same series.
- The display name comes from `series.title`.
- Series detail pages sort by `series.order`.
- Posts without `series.order` are placed after ordered posts.

## Images

Put images in the post folder:

```text
content/posts/logistic-regression/images/sigmoid.png
```

Reference images with a relative path:

```md
![sigmoid](images/sigmoid.png)
```

The backend rewrites local image paths into browser-accessible API media URLs.

## Slug Rules

- Use lowercase English words and hyphens.
- Keep slugs stable after publishing.
- Do not generate final slugs from mutable titles.
- Use `/posts/:slug` as the canonical URL.
