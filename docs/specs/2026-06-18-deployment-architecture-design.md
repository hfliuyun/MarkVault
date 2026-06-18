# MarkVault 部署与内容架构设计

## 目标

以最低的成本（利用现有的 1GB 内存 DMIT VPS）、最安全的配置（全量 HTTPS）、且最优雅的方式（前后端分离部署）来托管 MarkVault 项目。
同时，满足用户“**本地 Markdown + 图片作为唯一数据源（Single Source of Truth）**”的需求，使其能完美兼容 Obsidian 等本地知识库软件的管理。

## 架构方案详情

### 1. 核心存储与内容同步 (Obsidian 友好工作流)

- **唯一数据源**：用户本地电脑的 `content/` 文件夹（可以作为 Obsidian 的 Vault）。所有的 `.md` 文章和配套图片都存放在这里，不分离。
- **版本控制**：整个项目代码与 `content` 文件夹全部推送到 **GitHub 私有仓库**（免费且安全）。
- **图片后期扩展性**：未来如果 VPS 带宽或存储吃紧，我们可以在 GitHub Actions 部署阶段写一个脚本，**在云端构建时**自动将图片上传到 Cloudflare R2，并替换云端的 Markdown 图片链接。**这个过程对本地完全透明**，你本地的 Obsidian 依然看到的是本地图片，完美保证本地数据完整性。

### 2. 前端部署 (托管于 Cloudflare Pages)

- **自动构建**：Cloudflare Pages 绑定 GitHub 私有仓库。每次有代码推送时，自动进入 `blog_by_vue` 目录执行 `npm run build`。
- **性能与资源**：构建和全球 CDN 分发由 Cloudflare 提供，**完全不占用你的 VPS 内存**。
- **环境变量**：在 Cloudflare 后台配置 `VITE_API_BASE_URL=https://api.yourdomain.com`，前端 Axios 请求会自动指向后端。
- **HTTPS**：Cloudflare 自动颁发前端 SSL 证书。

### 3. 后端部署 (托管于 DMIT VPS)

- **进程运行**：通过 `Gunicorn` 和 `systemd` 在 DMIT VPS 上常驻运行 Flask，内存占用极小（约 50-100MB），不会影响现有的 v2ray。
- **反向代理与安全**：在 VPS 上配置 Nginx，拦截并转发对 `api.yourdomain.com` 的请求至 Flask。
- **HTTPS**：使用 `Certbot`（Let's Encrypt）自动为 Nginx 申请和续签后端接口的免费 SSL 证书。

### 4. 自动化 CI/CD (GitHub Actions)

- **流程**：当你在本地写完文章或修改完代码，执行 `git push` 后：
  1. Cloudflare 开始构建最新的前端。
  2. GitHub Actions 自动通过 SSH 登录到你的 DMIT VPS。
  3. 执行 `git pull` 拉取最新的代码和文章。
  4. 如果有后端代码更新，自动 `systemctl restart markvault-backend`。
- **体验**：全程 0 手动干预。本地 Push，几十秒后线上即刻生效。

## 需要用户审核的内容

这是本次上云的终极架构。它同时满足了：
1. 规避 1G VPS 编译前端导致 OOM 的风险。
2. 规避国内服务器域名备案问题。
3. 满足了 Markdown + 图片作为本地唯一数据源的需求。

请检查上述设计。如果确认该方案符合你的最终预期，请予以批准，随后我们将转入具体的**执行计划规划（Implementation Plan）**。
