# 仓库协作指南

## 项目结构与模块组织

MarkVault 是一个 Markdown 优先的个人博客 / 知识库系统，由 Vue 3 前端和 Flask 后端组成。

- `blog_by_vue/`：Vue 3 + Vite 前端。页面位于 `src/views/`，共享组件位于 `src/components/`，API 封装位于 `src/api/`，组合式逻辑位于 `src/composables/`，路由位于 `src/router/`。
- `server_flask/`：Flask 后端 API。公开博客路由位于 `app/api/routes.py`，认证路由位于 `app/api/auth_routes.py`，Pastebin 路由位于 `app/api/paste_routes.py`，应用初始化位于 `app/__init__.py`。
- `docs/`：架构、API、内容写作、开发规范、需求和变更记录。
- `docs/specs/`：功能设计和重构设计存档。
- `manage.py`：仓库级维护命令入口。

内容目录由 `BLOG_CONTENT_ROOT` 指定；未设置时默认读取仓库级 `content/`。当前索引会扫描 `content/posts/*/index.md` 和 `content/series/*/*/index.md`。系列简介可写在 `content/series/<series-id>/README.md`。

运行时数据保存在 `server_flask/data/`，包括 TOTP 密钥和 Pastebin JSON 文件，不应提交到 Git。

## 后端服务职责

- `content_index.py`：扫描 Markdown、解析 frontmatter、校验 metadata、构建文章/系列/分类/标签索引。
- `markdown_renderer.py`：Markdown 转 HTML、目录生成、HTML 白名单清洗。
- `media.py`：重写文章本地图片路径，并提供图片访问。
- `auth.py`：TOTP 验证、JWT 签发和认证校验。
- `paste.py`：Pastebin 文本/代码片段存储、读取、列表和过期清理。
- `post_template.py`：文章模板和 frontmatter 生成。
- `post_manager.py`：文章模板 ZIP 生成、上传解析、发布写入和文章删除。

## 开发、构建和测试命令

前端命令在 `blog_by_vue/` 下执行：

```sh
cd blog_by_vue
npm install
npm run dev
npm run build
npm run preview
```

后端本地环境：

```sh
cd server_flask
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python3 run.py
```

仓库级维护命令：

```sh
python3 manage.py new_post "文章标题" --slug post-slug
python3 manage.py setup_totp --account admin
python3 manage.py reset_totp --account admin
```

后端检查：

```sh
cd server_flask
python3 -m unittest test_content_index.py test_markdown_renderer.py test_post_template.py
python3 -m compileall app test_content_index.py test_markdown_renderer.py test_post_template.py
```

## 当前前端路由

- `/`：首页文章列表
- `/posts/:slug`：文章详情
- `/p/:abbrlink`：旧链接兼容跳转
- `/series`、`/series/:seriesId`：系列列表和详情
- `/categories`、`/categories/:category`：分类列表和详情
- `/tags`、`/tags/:tag`：标签列表和详情
- `/search`：搜索结果
- `/paste`、`/paste/:id`：Paste 创建/管理和公开查看
- `/manage`：文章管理页面，支持文章列表、模板下载、上传发布和删除

## 编码风格

Vue 模板、脚本和 CSS 使用 2 空格缩进。组件使用 PascalCase，例如 `PageHeader.vue`。页面文件按页面角色命名，例如 `Home.vue`、`Post.vue`、`PasteHome.vue`。优先使用 ES modules 和顶层 import。

Python 使用 4 空格缩进，函数和变量使用描述性 snake_case。文件读写明确使用 UTF-8。Markdown 文章 slug 要保持稳定，因为公开 URL 和旧链接映射依赖它。

## 安全和配置

不要提交虚拟环境、`node_modules/`、生成的 `dist/`、`server_flask/data/` 或本地密钥。涉及上传、删除、认证和保存的接口必须校验输入与权限。前端使用 `v-html` 时只渲染后端清洗过的 Markdown HTML。

依赖更新应限制在实际使用该依赖的子项目内。

## 提交规范

提交时要遵守仓库现有的 `.gitmessage` 模板，提交内容尽量按下面结构组织：

- `type: <short imperative summary>`
- `Summary`
- `Implementation`
- `Tests`
- `Notes`

提交信息要简短、祈使句、格式统一；不要把提交写成随意的一行说明。优先复用仓库配置的 commit template，保证每次提交的格式一致。
