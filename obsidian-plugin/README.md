# MarkVault Publisher（Obsidian 插件）

在 Obsidian 里调用本机的 `markvault` 命令行工具发布笔记。发布逻辑全部在命令行工具里（`packages/cli`），所以不打开 Obsidian 也能用 `npm run markvault -- publish <笔记>` 发布，两边的结果完全一样。

只支持桌面端（需要在本机运行 Node）。

## 命令

| 命令 | 作用 |
|---|---|
| 发布当前笔记（也可以点左侧栏的上传图标） | 第一次发布时弹窗确认 slug，然后执行 `markvault publish <当前笔记>`：补 `publish`、`slug`、`date` → 校验 → 压缩并上传新图片 → 构建 → 部署 → 提交 vault |
| 重新发布整个站点（不修改笔记） | `markvault publish` |
| 检查全部内容 | `markvault check`，只校验，不上传、不部署 |
| 取消发布当前笔记 | `markvault unpublish <当前笔记>`：把 `publish` 改成 `false` 后重新发布，笔记本身不删除 |

运行时会弹出一个窗口显示命令行输出，出错时可以直接复制。

## 设置

| 设置 | 说明 |
|---|---|
| MarkVault 仓库路径 | 代码仓库的绝对路径，里面要有 `packages/cli` |
| Node 路径 | macOS 的图形界面程序拿不到终端里的 PATH；留空时会依次查找 `/opt/homebrew/bin/node`、`/usr/local/bin/node` |
| 代理（可选） | `git push` 和部署需要走代理时填写，例如 `http://127.0.0.1:7890` |
| 站点地址（可选） | 发布完成后显示文章链接 |

Cloudinary 和 Cloudflare 的凭据不保存在插件里，由仓库里的 `scripts/setup.sh` 配置在本机（`~/.config/markvault/config.json` 和 `wrangler login`）。

## 构建和安装

```sh
cd obsidian-plugin
npm install
npm run build
```

把 `main.js` 和 `manifest.json` 复制到 vault 的 `.obsidian/plugins/markvault-publisher/` 目录，然后在 Obsidian 的「第三方插件」里启用。

## 0.1 → 0.2 的变化

- 去掉了 TOTP 登录、设备令牌、ZIP 上传、拉取服务器版本和自动发布。后端已经换成 Cloudflare 上的静态站点，不再接收上传。
- 改为调用 `markvault` 命令行工具。
- 只支持桌面端。
