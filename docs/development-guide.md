# MarkVault 开发指南

仓库约定和提交规范见 [AGENTS.md](../AGENTS.md)，架构见 [architecture.md](architecture.md)。

## 原则

- **Markdown 是唯一数据源。** 页面、搜索索引、`images.json` 都能从 vault 重建。线上没有需要备份的文章数据，只有 Paste 存在 D1。
- **内容和代码分开。** vault 是单独的仓库，代码仓库只放程序。代码仓库是公开的，本机路径和凭据放在 `~/.config/markvault/config.json`。
- **只有一条部署路径。** 文章和代码改动都通过 `markvault publish` 或 `markvault deploy` 从本机部署。推送代码仓库不会触发任何构建。
- **校验不过就不部署。** `check` 和构建用的是同一套校验，有错误时线上保持上一个版本。
- **slug 稳定。** 文章 URL 只由 `slug` 决定，改了就要写 `redirect_from`。

## 环境

需要 Node 22.23 以上。CLI 和测试脚本直接用 Node 运行 TypeScript（原生类型擦除），不需要编译。

```sh
npm ci
npm run typecheck                                        # packages/
node_modules/.bin/tsc --noEmit -p site/tsconfig.json         # Astro 页面和脚本
node_modules/.bin/tsc --noEmit -p site/worker/tsconfig.json  # Worker
npm run markvault -- check
```

不碰真实 vault 的测试方法：复制一份到 `.tmp/`（已被 gitignore），再用 `--vault` 指过去。

```sh
rm -rf .tmp/vault-copy && cp -R content/ .tmp/vault-copy
npm run markvault -- check --vault .tmp/vault-copy
```

## 站点

- `npm run markvault -- preview`：Astro 开发模式，http://localhost:4321 。vault 有改动时页面自动刷新，`/img/*` 直接读 vault 里的原图。开发模式下没有搜索索引。
- `npm run markvault -- build`：构建到 `site/dist`，包含 Pagefind 索引和 `_redirects`。
- `zsh scripts/dev/serve-run.sh <命令>`：在 8787 端口用 `wrangler dev` 托管 `site/dist`，执行完命令后关闭。
- `node scripts/dev/cdp.mjs <url> <等待毫秒> <JS 表达式>`：用 headless Chrome 打开页面并求值，用来检查页面状态。环境变量 `WIDTH`、`HEIGHT`、`SCHEME=light|dark`、`SHOT=文件.png` 用于截图。

本机设置了 HTTP 代理时，用 curl 访问 localhost 要加 `--noproxy "*"`。Node 的 `fetch` 默认不读代理环境变量，访问线上地址时加 `NODE_USE_ENV_PROXY=1`。

## Worker 和 Paste

本地准备（数据在 `site/.wrangler/`）：

```sh
cd site
../node_modules/.bin/wrangler d1 migrations apply markvault --local
cd .. && npm run markvault -- build && cd site
../node_modules/.bin/wrangler dev --port 8787 --local --test-scheduled --var CLOUDINARY_CLOUD:<cloud_name>
```

- 访问 http://localhost:8787/__scheduled 手动触发 Cron。
- `npm run markvault -- paste-invite --local` 生成本地邀请链接。
- `node scripts/dev/paste-smoke.mjs <邀请链接>` 跑 44 项接口检查，只删除它自己创建的数据。去掉 `--local` 生成线上链接，就能对线上跑同样的检查。

新的表结构改动加在 `site/worker/migrations/` 下的新文件里，用 `wrangler d1 migrations apply markvault --remote` 应用到线上。

## 部署

```sh
npm run markvault -- deploy     # 只改了代码时
npm run markvault -- publish    # 内容有变化时（还会上传图片、提交 vault）
```

两者都会用 `--var CLOUDINARY_CLOUD:<cloud_name>` 调用 `wrangler deploy`，`cloud_name` 来自本机配置。域名写在 `site/wrangler.jsonc` 的 `routes` 里：`blog.<域名>` 是访客地址，`origin.<域名>` 是 CDN 的回源地址。`vars.SITE_ORIGIN` 要和访客地址一致，否则 Paste 的写操作和图片防盗链会误判。`workers.dev` 地址已关闭。

如果站点前面有 EdgeOne，在 `~/.config/markvault/config.json` 里加一段 `edgeone`，`deploy` 和 `publish` 成功后会自动清除它的缓存：

```json
{
  "edgeone": {
    "zone_id": "zone-xxxxxxxx",
    "secret_id": "……",
    "secret_key": "……",
    "endpoint": "teo.intl.tencentcloudapi.com"
  }
}
```

`endpoint` 只在国际站以外需要改。密钥建议用只有 EdgeOne 清除缓存权限的子账号。没配这一段时清除缓存这步直接跳过；清除失败只打印警告，不影响部署结果。

## Obsidian 插件

在 `obsidian-plugin/` 下构建，方法见它的 README。插件只调用 CLI，不保存任何凭据。
