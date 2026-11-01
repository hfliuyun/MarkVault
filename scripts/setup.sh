#!/usr/bin/env bash
# MarkVault 发布环境一键配置（macOS / Linux）。可以重复运行，已配置的步骤会跳过。
#
#   bash scripts/setup.sh
#
# 做的事：检查 Node → 安装依赖 → 选择 vault → 登录 Cloudflare → 填写 Cloudinary
# 凭据和站点地址 → 检查可选的图片压缩工具 → 运行 markvault check。
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/markvault"
CONFIG_FILE="$CONFIG_DIR/config.json"
VAULT_REPO_DEFAULT="https://github.com/hfliuyun/blog-vault.git"

say() { printf '\n\033[1m▸ %s\033[0m\n' "$1"; }
ok() { printf '  ✓ %s\n' "$1"; }
warn() { printf '  ! %s\n' "$1"; }
ask() { local prompt="$1" default="${2:-}" answer; read -r -p "  $prompt${default:+ [$default]}：" answer; echo "${answer:-$default}"; }

cd "$REPO_ROOT"

# 1. Node -----------------------------------------------------------------
say "检查 Node.js"
if ! command -v node >/dev/null 2>&1; then
  warn "没有找到 node。macOS：brew install node；Linux：参考 https://nodejs.org/en/download"
  exit 1
fi
NODE_VERSION="$(node -p 'process.versions.node')"
if ! node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>22||(a===22&&b>=23)?0:1)'; then
  warn "Node $NODE_VERSION 太旧，需要 22.23 或更新（Astro 的要求）"
  exit 1
fi
ok "Node ${NODE_VERSION}（$(command -v node)）"

# 2. 依赖 ------------------------------------------------------------------
say "安装依赖"
npm ci --no-fund --no-audit
ok "依赖已安装"

# 3. 配置文件和 vault --------------------------------------------------------
mkdir -p "$CONFIG_DIR"
chmod 700 "$CONFIG_DIR"
[ -f "$CONFIG_FILE" ] || echo '{}' > "$CONFIG_FILE"
chmod 600 "$CONFIG_FILE"

config_get() { node -e 'const c=require(process.argv[1]);const v=process.argv[2].split(".").reduce((o,k)=>o?.[k],c);process.stdout.write(v==null?"":String(v))' "$CONFIG_FILE" "$1"; }
config_set() { node -e 'const fs=require("fs");const f=process.argv[1];const c=JSON.parse(fs.readFileSync(f,"utf8"));const keys=process.argv[2].split(".");let o=c;for(const k of keys.slice(0,-1))o=o[k]??={};o[keys.at(-1)]=process.argv[3];fs.writeFileSync(f,JSON.stringify(c,null,2)+"\n")' "$CONFIG_FILE" "$1" "$2"; }

say "vault（Obsidian 笔记库 / 内容仓库）"
VAULT="$(config_get vault)"
if [ -n "$VAULT" ] && [ -d "$VAULT" ]; then
  ok "已配置：$VAULT"
else
  VAULT="$(ask "vault 路径（已有的目录，或者要 clone 到的位置）" "$HOME/code/blog-content")"
  VAULT="${VAULT/#\~/$HOME}"
  if [ ! -d "$VAULT" ]; then
    URL="$(ask "目录不存在，从哪个 git 仓库 clone" "$VAULT_REPO_DEFAULT")"
    git clone "$URL" "$VAULT"
    warn "clone 下来的 vault 没有图片原件。已上传过的图片照常显示；新图片要在有原件的电脑上发布"
  fi
  config_set vault "$VAULT"
  ok "vault：$VAULT"
fi

# 4. Cloudflare ------------------------------------------------------------
say "Cloudflare 登录（wrangler）"
if (cd site && npx --no-install wrangler whoami 2>/dev/null | grep -q "associated with the email"); then
  ok "已登录"
else
  (cd site && npx --no-install wrangler login)
fi

# 5. Cloudinary ------------------------------------------------------------
say "Cloudinary 凭据（Dashboard → API Keys）"
if [ -n "$(config_get cloudinary.cloud_name)" ] && [ -n "$(config_get cloudinary.api_key)" ] && [ -n "$(config_get cloudinary.api_secret)" ]; then
  ok "已配置（cloud_name：$(config_get cloudinary.cloud_name)）"
else
  config_set cloudinary.cloud_name "$(ask "cloud_name")"
  config_set cloudinary.api_key "$(ask "api_key")"
  read -r -s -p "  api_secret（输入时不显示）：" SECRET; echo
  config_set cloudinary.api_secret "$SECRET"
  ok "已写入 ${CONFIG_FILE}（权限 600）"
fi

# 5b. 站点地址（paste-invite 生成链接、publish 打印文章链接时用）------------------
say "站点地址"
if [ -n "$(config_get site_url)" ]; then
  ok "已配置：$(config_get site_url)"
else
  config_set site_url "$(ask "站点地址" "https://blog.liuyun.ac.cn")"
  ok "site_url：$(config_get site_url)"
fi

# 6. 可选工具 ----------------------------------------------------------------
say "图片压缩工具（可选；PNG 和 SVG 不需要额外工具）"
command -v jpegtran >/dev/null 2>&1 && ok "jpegtran：$(command -v jpegtran)" || warn "没有 jpegtran，JPEG 会原样上传（macOS：brew install jpeg-turbo）"
command -v gifsicle >/dev/null 2>&1 && ok "gifsicle：$(command -v gifsicle)" || warn "没有 gifsicle，GIF 会原样上传（macOS：brew install gifsicle）"

# 7. 命令行入口和检查 ----------------------------------------------------------
say "markvault 命令"
if command -v markvault >/dev/null 2>&1; then
  ok "markvault 已在 PATH 中"
else
  warn "可以运行 npm link -w @markvault/cli 把 markvault 装到全局；否则在仓库里用 npm run markvault -- <命令>"
fi

say "检查内容"
node packages/cli/src/main.ts check
printf '\n完成。发布：npm run markvault -- publish <笔记路径>\n'
