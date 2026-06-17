# MarkVault

[English](README.md)

MarkVault 是一个 Markdown 优先的个人知识库系统。它把内容保存在普通的 Markdown 文件树中，通过 Flask API 提供数据，并使用 Vue 3 前端渲染公开站点。

代码仓库和内容仓库有意分离：Markdown 文件是文章的唯一主数据源，生成索引、缓存、搜索数据以及未来可能的同步目标都应该可以从内容目录重新构建。

## 功能

- 从 `content/posts/*/index.md` 构建 Markdown 文章索引
- 支持 `content/series/*/*/index.md` 形式的系列文章
- 支持 `content/series/<series-id>/README.md` 形式的系列简介
- 文章访问地址基于 frontmatter 中稳定的 `slug`
- 提供分类、标签、系列、搜索和旧链接兼容 API
- 渲染 Markdown，并返回目录数据
- 支持从每篇文章的 `images/` 目录提供本地图片
- TOTP 管理员认证，使用短期 JWT 保护管理接口
- Pastebin 跨设备剪贴板，支持文本/代码片段、语法高亮和过期时间
- 文章管理页面，支持模板下载、上传发布、文章列表和删除
- Vue 3 前端包含文章页、分类页、标签页、搜索页、系列页、Paste 页面和管理页面
- 通过 `manage.py` 提供轻量文章模板生成命令

## 项目结构

```text
.
├── blog_by_vue/       # Vue 3 + Vite 前端
├── server_flask/      # Flask 后端 API
├── docs/              # 架构、API、需求和内容写作文档
├── manage.py          # 博客维护命令
├── server_flask/data/ # 运行时认证和 paste 数据，不提交
└── content -> ...     # 可选：指向外部内容仓库的本地软链接
```

期望的内容目录结构：

```text
content/
  posts/
    post-slug/
      index.md
      images/
  series/
    series-id/
      README.md
      post-slug/
        index.md
        images/
  legacy/
    abbrlink-map.json
```

## 环境要求

- Python 3.10+
- Node.js 20+
- npm

## 安装

克隆代码仓库：

```sh
git clone https://github.com/hfliuyun/MarkVault.git markvault
cd markvault
```

准备内容目录。你可以在仓库内创建本地 `content/` 目录，把外部内容仓库挂载到 `content/`，也可以通过 `BLOG_CONTENT_ROOT` 让后端读取外部路径。

使用外部内容路径的示例：

```sh
export BLOG_CONTENT_ROOT=/path/to/blog-content
```

安装后端依赖：

```sh
cd server_flask
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

需要使用管理功能时，先创建 TOTP 管理员密钥：

```sh
cd ..
python3 manage.py setup_totp --account admin
```

安装前端依赖：

```sh
cd blog_by_vue
npm install
```

## 本地开发

启动 Flask API：

```sh
cd server_flask
source .venv/bin/activate
python3 run.py
```

在另一个终端启动 Vue 开发服务器：

```sh
cd blog_by_vue
npm run dev
```

前端会通过 `/api` 调用后端。本地开发时同时运行 Vite 开发服务器和 Flask 服务。

## 创建文章

在仓库根目录执行：

```sh
python3 manage.py new_post "我的第一篇文章" --slug my-first-post
```

带元数据的示例：

```sh
python3 manage.py new_post "逻辑回归" \
  --slug logistic-regression \
  --summary "逻辑回归学习笔记。" \
  --category "机器学习" \
  --tag "算法"
```

如果设置了 `BLOG_CONTENT_ROOT`，生成器会写入该路径；否则会写入仓库级 `content/` 路径。

## 构建与测试

后端测试：

```sh
cd server_flask
python3 -m unittest test_content_index.py test_markdown_renderer.py test_post_template.py
python3 -m compileall app test_content_index.py test_markdown_renderer.py test_post_template.py
```

前端生产构建：

```sh
cd blog_by_vue
npm run build
```

## 文档

- [docs/architecture.md](docs/architecture.md)：架构和数据流
- [docs/api.md](docs/api.md)：公开 API 参考
- [docs/content-guide.md](docs/content-guide.md)：内容目录和 frontmatter 指南
- [docs/development-guide.md](docs/development-guide.md)：架构决策和开发规范
- [docs/changelog.md](docs/changelog.md)：已完成功能和变更记录
- [docs/requirements.md](docs/requirements.md)：待实现需求
- [docs/specs/](docs/specs/)：功能设计和重构规格存档

## 开源协议

MarkVault 使用 MIT 协议开源。详见 [LICENSE](LICENSE)。
