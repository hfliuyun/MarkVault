# MarkVault

[English](README.md)

MarkVault 是一个 Markdown 优先的个人博客。文章就是 Obsidian vault 里的普通笔记。`markvault` 命令在本机把它们构建成静态站点，部署到 Cloudflare Workers（免费套餐），不需要自己运行服务器。

## 工作方式

- **内容**放在 vault 里，vault 可以是单独的私有 Git 仓库。frontmatter 写了 `publish: true` 的笔记才会发布，放在哪个文件夹都可以。
- **页面**在构建时由 Astro 预渲染：文章、系列、分类、标签、搜索（Pagefind）和关于页。代码高亮（Shiki）和公式（KaTeX）也在构建时生成。
- **图片**在发布时无损压缩并上传到 Cloudinary。站点通过 Worker 的 `/img/*` 提供图片，在边缘缓存，并且防盗链。
- **Paste** 是一个跨设备剪贴板，数据存在 D1。设备用一年有效的 cookie 信任，通过二维码或 6 位配对码添加。
- **发布**只需要一条命令：`markvault publish` 会校验、上传新图片、构建、部署，并提交 vault。Obsidian 插件调用的也是这条命令。

## 仓库结构

```text
packages/content/   扫描 vault、校验 frontmatter、渲染 Markdown
packages/cli/       markvault 命令
site/               Astro 站点、Worker（图片、Paste 接口、Cron）、wrangler.jsonc
obsidian-plugin/    薄插件，调用 markvault publish / check / unpublish
scripts/            新电脑配置脚本 setup.sh、本地测试脚本
docs/               架构、接口、写作和开发指南
```

## 环境要求

- Node.js 22.23 以上
- Cloudflare 账号（Workers 免费套餐）和一个 D1 数据库
- Cloudinary 账号（存放图片）
- macOS 或 Linux

## 配置

```sh
git clone https://github.com/hfliuyun/MarkVault.git
cd MarkVault
bash scripts/setup.sh
```

`setup.sh` 会安装依赖、询问 vault 路径、执行 `wrangler login`、把 Cloudinary 凭据写入 `~/.config/markvault/config.json`（权限 600），最后运行 `markvault check`。

## 使用

```sh
npm run markvault -- check            # 校验全部内容
npm run markvault -- preview          # 本地预览，改动后自动刷新
npm run markvault -- publish [笔记]    # 发布全部内容，或者发布指定笔记
npm run markvault -- unpublish <笔记>  # 改成 publish: false 并重新发布
npm run markvault -- deploy           # 只构建和部署（代码改动用）
npm run markvault -- paste-invite     # 生成一次性链接，信任第一台设备
npm run typecheck
```

## 文档

- [docs/architecture.md](docs/architecture.md)：组件和请求流程
- [docs/content-guide.md](docs/content-guide.md)：vault 结构、frontmatter 和支持的语法
- [docs/api.md](docs/api.md)：Worker 路由和 Paste 接口
- [docs/development-guide.md](docs/development-guide.md)：本地开发和测试
- [docs/changelog.md](docs/changelog.md)：主要变更
- [docs/specs/](docs/specs/)：设计文档，包括 [Cloudflare 迁移设计](docs/specs/2026-11-01-cloudflare-migration-design.md)

## 许可证

MarkVault 使用 MIT 许可证，详见 `LICENSE`。
