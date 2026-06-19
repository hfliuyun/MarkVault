# MarkVault 后端 VPS (Fedora) 部署指南

这是一份为你准备的 DMIT VPS (Fedora 发行版) 一键/分布执行脚本指南。假设你已经 SSH 登录到了你的 VPS 上（建议使用 `root` 或带有 `sudo` 权限的用户）。

## 1. 基础环境安装
首先更新系统并安装必备软件：Python 3、Nginx、Git。

```bash
sudo dnf update -y
sudo dnf install -y python3 python3-pip nginx git
```

## 2. 克隆代码仓库

为了让 GitHub Actions 能够顺利 SSH 并拉取代码，我们使用 HTTPS 结合 GitHub Personal Access Token (PAT) 或是配置 VPS 的 SSH 密钥。推荐配置 SSH 密钥：

```bash
# 在 VPS 上生成 SSH 密钥，一路回车
ssh-keygen -t ed25519 -C "your_email@example.com"

# 查看公钥，将其复制并添加到你 GitHub 账号的 SSH Keys 中
cat ~/.ssh/id_ed25519.pub
```

确保添加公钥后，克隆仓库：

```bash
# 进入主目录
cd ~

# 1. 克隆后端公开代码仓库
git clone git@github.com:你的用户名/MarkVault.git

# 2. 克隆你的私有内容仓库（存放在 MarkVault 的 content 目录下）
# 先确保把原来的 symlink 删掉或者直接 clone 进去
cd ~/MarkVault
rm -rf content
git clone git@github.com:你的用户名/blog-content.git content
```

## 3. Python 虚拟环境与依赖

```bash
cd ~/MarkVault
python3 -m venv .venv  # 或者使用你的 uv: uv venv .venv
source .venv/bin/activate
cd server_flask
pip install -r requirements.txt
pip install gunicorn  # 安装生产环境的 WSGI 服务器
```

## 4. 配置 Systemd 守护进程 (用户级，免 sudo)

为了让你当前的非 root 用户（比如 `aa`）能够安全地在自动化部署时管理进程，并且不需要输入 `sudo` 密码，我们采用**用户级 systemd**。

首先，开启该用户的驻留权限，确保即使退出 SSH 后进程也能一直在后台跑（这一步需要用到 sudo）：
```bash
sudo loginctl enable-linger $USER
```

接着，创建用户级别的 systemd 目录和服务文件：
```bash
mkdir -p ~/.config/systemd/user
nano ~/.config/systemd/user/markvault-backend.service
```

将以下内容粘贴进去（注意如果你启用了自动清理 Cloudflare 缓存，请把你的 API 配置写进去）：
```ini
[Unit]
Description=Gunicorn instance to serve MarkVault Backend
After=network.target

[Service]
# 注意：用户级 systemd 默认就是以当前用户运行，所以无需配置 User 和 Group
WorkingDirectory=%h/MarkVault/server_flask
Environment="PATH=%h/MarkVault/.venv/bin"

# 如果你希望后端在文章更新时自动清理 Cloudflare 缓存，请取消下面两行的注释并填入你的配置：
# Environment="CLOUDFLARE_ZONE_ID=你的_Zone_ID"
# Environment="CLOUDFLARE_API_TOKEN=你的_API_Token"

# 为了方便 Nginx 代理，绑定到本地的 8000 端口
ExecStart=%h/MarkVault/.venv/bin/gunicorn --workers 3 --bind 127.0.0.1:8000 run:app

[Install]
WantedBy=default.target
```

加载配置、启动并激活服务（注意不要加 `sudo`）：
```bash
systemctl --user daemon-reload
systemctl --user start markvault-backend
systemctl --user enable markvault-backend
```

## 5. 配置 Nginx 反向代理

接下来配置 Nginx，拦截 `api.yourdomain.com` 并转给 Flask。
Fedora 的 Nginx 配置文件默认放在 `/etc/nginx/conf.d/` 下。

```bash
sudo nano /etc/nginx/conf.d/markvault-api.conf
```

粘贴以下内容：
```nginx
server {
    listen 80;
    server_name api.yourdomain.com; # 替换为你的真实 API 域名

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

测试配置并启动 Nginx：
```bash
sudo nginx -t
sudo systemctl start nginx
sudo systemctl enable nginx
```

## 6. 申请免费 SSL 证书 (HTTPS)

安装 Certbot：
```bash
sudo dnf install -y certbot python3-certbot-nginx
```

申请证书（Certbot 会自动修改 Nginx 配置文件添加 SSL）：
```bash
sudo certbot --nginx -d api.yourdomain.com
```

## 🎉 完成！

至此，你的 VPS 已经完美就绪：
- 后端跑在 `127.0.0.1:8000`。
- Nginx 监听公网 HTTPS 并安全转发。
- Cloudflare Pages 上的前端通过配置 `VITE_API_BASE_URL=https://api.yourdomain.com` 即可连通！
- 每次你在本地推送代码或文章，GitHub Actions 会自动执行 `git pull` 和 `sudo systemctl restart markvault-backend`！

## 7. 配置 Cloudflare API 边缘缓存 (极致加速)

为了让前端的分类、标签和文章列表响应速度达到毫秒级，建议在 Cloudflare 层面配置静态 API 的缓存（拦截向 VPS 的动态请求）。

1. 登录 Cloudflare，进入你的前端域名管理页面。
2. 左侧菜单找到 **Cache (缓存)** -> **Cache Rules (缓存规则)**。
3. 点击 **Create rule (创建规则)**，命名为 `API Cache`。
4. **匹配条件 (When incoming requests match)**：
   * Field (字段): `URI Path`
   * Operator (运算符): `starts with`
   * Value (值): `/api/`
5. **缓存设置 (Cache eligibility)**：
   * 选择 **Eligible for cache (符合缓存条件)**。
   * **Edge TTL (边缘 TTL)**: 选择 `Override origin`，并设置为 `2 hours`（此时间内全球请求全部命中边缘节点，彻底屏蔽回源请求）。
   * **Browser TTL (浏览器 TTL)**: 选择 `Override origin`，设置为 `10 minutes`。
6. 点击 **Deploy (部署)**，完成！此时访问页面的 API 请求延迟将大幅下降至 ~10ms。
