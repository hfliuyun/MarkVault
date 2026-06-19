# MarkVault 内容写作指南

本文档说明文章目录、frontmatter、系列简介、旧链接、图片和 slug 规范。架构说明参见 [architecture.md](architecture.md)，接口说明参见 [api.md](api.md)。

## 内容目录

独立文章放在 `content/posts/` 下：

```text
content/posts/logistic-regression/
  index.md
  images/
    sigmoid.png
```

系列文章可以按系列分组：

```text
content/series/machine-learning-basic/logistic-regression/
  index.md
  images/
    sigmoid.png
```

系列目录可以添加简介文件：

```text
content/series/machine-learning-basic/README.md
```

目录路径只用于本地组织。公开文章 URL 仍然来自 frontmatter 中的 `slug`，系列归属仍然来自 frontmatter 中的 `series` 字段。

如果内容在单独仓库中，可以把外部仓库挂载到代码仓库的 `content/`，也可以通过 `BLOG_CONTENT_ROOT` 指向外部路径。

## 创建文章

在仓库根目录使用模板生成器：

```sh
python3 manage.py new_post "文章标题" --slug example-post
```

命令会创建：

```text
content/posts/example-post/
  index.md
  images/
```

可以提供摘要、分类和标签：

```sh
python3 manage.py new_post "逻辑回归" \
  --slug logistic-regression \
  --summary "逻辑回归学习笔记。" \
  --category 机器学习 \
  --tag 算法 \
  --tag 监督学习
```

也可以生成带系列 metadata 的文章：

```sh
python3 manage.py new_post "博客内容索引" \
  --slug blog-content-index \
  --series-id blog-system \
  --series-title 博客系统重构 \
  --series-order 2
```

生成器会拒绝覆盖已有 `content/posts/<slug>/` 目录。如果设置了 `BLOG_CONTENT_ROOT`，会写入该路径；否则写入仓库级 `content/`。

## Frontmatter

必填字段：

- `title`：文章标题
- `slug`：稳定 URL 标识
- `date`：发布时间，支持 `YYYY-MM-DD HH:mm:ss` 或 `YYYY-MM-DD`

推荐字段：

- `summary`：文章摘要
- `categories`：分类列表
- `tags`：标签列表

可选字段：

- `series`：系列信息
- `legacy`：旧链接映射
- `notion`：未来 Notion 同步信息

独立文章示例：

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

系列文章示例：

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

## 系列简介

系列简介文件位于：

```text
content/series/<series-id>/README.md
```

README 可以包含可选 frontmatter：

```yaml
---
title: 机器学习基础
---
```

正文使用 Markdown 编写，会在系列列表页和系列详情页完整展示。若 README frontmatter 提供 `title`，它会优先作为系列显示标题；否则使用文章 metadata 中的 `series.title`。

系列规则：

- 拥有相同 `series.id` 的文章属于同一系列。
- 系列详情页优先按 `series.order` 排序。
- 没有 `series.order` 的文章排在有序文章之后。
- 没有 README 的系列仍然正常显示，简介为空。

## 旧链接

旧 `/p/:abbrlink` 链接只通过显式映射跳转，不再使用 Python `hash(title)` 生成长期链接。

推荐在新文章 frontmatter 中添加：

```yaml
legacy:
  abbrlinks:
    - f9b01ad8
```

批量映射可以写入：

```text
content/legacy/abbrlink-map.json
```

示例：

```json
{
  "f9b01ad8": "logistic-regression"
}
```

JSON 的值必须是新文章 `slug`。

## 图片

图片应放在文章自己的 `images/` 目录：

```text
content/posts/logistic-regression/images/sigmoid.png
content/series/machine-learning-basic/logistic-regression/images/sigmoid.png
```

Markdown 中使用相对路径：

```md
![sigmoid](images/sigmoid.png)
```

后端会在渲染文章详情时把本地图片路径改写成浏览器可访问的媒体 API 地址。

## Slug 规范

- 使用小写英文、数字和连字符。
- 发布后保持稳定。
- 不要从可变标题自动生成最终 slug。
- 规范文章 URL 为 `/posts/:slug`。

## 7. 同步到 Notion (Notion Sync)
系统提供了单向同步工具，将本地 Markdown 文章发布到 Notion 数据库以供阅读。
- **增量更新**: 基于正文和元数据的 MD5 Hash 指纹，跳过未修改的文章。
- **自动图片上传**: 检测到本地图片时，自动调用 Notion File Upload API 将二进制上传到 Notion 并在页面内呈现为原生 Image 区块。
- **命令执行**: 
  ```bash
  python3 manage.py notion_sync
  ```
