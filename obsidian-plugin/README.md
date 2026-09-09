# MarkVault Publisher

Obsidian 插件：把笔记连同 `images/` 目录一键发布到自建 MarkVault 博客服务器。不需要 git，不需要常驻同步软件。

## 安装

```sh
cd obsidian-plugin
npm install
npm run build
```

把构建产物 `main.js`、`manifest.json`（以及可选 `styles.css`）拷贝到 vault 的
`.obsidian/plugins/markvault-publisher/` 目录，重启 Obsidian 并在
「设置 → 第三方插件」中启用。

## 使用

1. 设置 → MarkVault Publisher → 填写服务器地址（`https://` 开头）
2. 命令面板执行 **MarkVault: 登录 MarkVault**，输入 Authenticator 的 6 位验证码，
   换取 30 天有效期的设备令牌（对应后端 `POST /api/auth/device_token`）
3. 打开一篇 frontmatter 带 `slug` 的笔记，点击侧栏上传图标，或执行
   **MarkVault: 发布当前文章**
4. 可选：开启「自动发布」，笔记停止修改 N 分钟后自动上传（仅限带 slug 的笔记）

## 发布规则

- 只有 frontmatter 含 `slug` 的 `.md` 视为文章；系列 README、草稿自动跳过
- 笔记所在文件夹内的 `images/`（含子目录）一并打包上传
- 内容未变化时跳过上传；首次发布若 slug 冲突会询问是否覆盖，再次发布自动覆盖
- 本地删除笔记**不会**删除服务器文章，删除请走 `/manage` 页面

## 已知限制

- 系列 `README.md` 与 `legacy/abbrlink-map.json` 不随笔记发布（现有 API 仅支持
  发布文章目录）；这部分目前仍依赖原有同步通道或手动上传
- 关闭 Obsidian 后不会推送
- 设备令牌明文保存在插件 `data.json` 中，与网页端 localStorage 的安全等级一致
