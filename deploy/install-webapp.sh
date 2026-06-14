#!/usr/bin/env bash
# 部署/更新 voice-chat 主应用(聊天室网页)到本机(47.77 上执行)
# 用法:把仓库同步到服务器后,在仓库根目录执行:bash deploy/install-webapp.sh
# 幂等可重复执行。不触碰 LiveKit 容器 / voice-games / Caddy(Caddy 由 config-caddy-full.sh 管)。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DEST_DIR=/var/www/voice-chat
ENV_FILE=/opt/voice-chat.env
KEYS_ENV=/opt/livekit/keys.env
UNIT_DEST=/etc/systemd/system/voice-chat.service

[ -f "$KEYS_ENV" ] || { echo "✗ 缺少 $KEYS_ENV(先运行 install-livekit.sh)"; exit 1; }
command -v node >/dev/null || { echo "✗ 缺少 node(先运行 install-games.sh 或手动安装)"; exit 1; }

echo "=== 1/5 生成环境文件 $ENV_FILE(变量名映射,server.js 零改动) ==="
# keys.env 用 API_KEY/API_SECRET;server.js 需要 LIVEKIT_ 前缀
# shellcheck disable=SC1090
. "$KEYS_ENV"
cat > "$ENV_FILE" <<EOF
NODE_ENV=production
PORT=3000
LIVEKIT_URL=wss://tt.lsaini.com
LIVEKIT_API_KEY=${API_KEY}
LIVEKIT_API_SECRET=${API_SECRET}
EOF
chmod 600 "$ENV_FILE"

echo "=== 2/5 同步代码到 $DEST_DIR ==="
mkdir -p "$DEST_DIR"
# 注意:games-server/engines 是前端同构依赖(webpack 打包),必须保留;只排除其依赖目录。
# 关键:排除 public/roms —— 该目录由用户管理(上传自己的 ROM),部署绝不删除/覆盖它。
rsync -a --delete \
  --exclude node_modules --exclude .next --exclude .git \
  --exclude games-server/node_modules \
  --exclude /public/roms/ \
  "$SRC_DIR/" "$DEST_DIR/"

echo "=== 2.5/5 整理 ROM 目录(用户自管,自动编目)==="
ROMS_DIR="$DEST_DIR/public/roms"
mkdir -p "$ROMS_DIR"
# 首次/缺失时补齐文档与开源示例游戏(不覆盖用户已有文件)
cp -n "$SRC_DIR/public/roms/README.md" "$ROMS_DIR/" 2>/dev/null || true
cp -n "$SRC_DIR/public/roms/CREDITS.md" "$ROMS_DIR/" 2>/dev/null || true
[ -f "$SRC_DIR/public/roms/nova.nes" ] && cp -n "$SRC_DIR/public/roms/nova.nes" "$ROMS_DIR/" 2>/dev/null || true
# 扫描目录里所有 ROM(任意文件名)→ 生成 roms.json
bash "$SCRIPT_DIR/scan-roms.sh" "$ROMS_DIR" || true
# 安装定时自动扫描:用户上传 ROM 后约 1 分钟内自动上架(无需手动跑命令)
CRON_LINE="* * * * * bash $SCRIPT_DIR/scan-roms.sh $ROMS_DIR >/dev/null 2>&1"
( crontab -l 2>/dev/null | grep -v 'scan-roms.sh'; echo "$CRON_LINE" ) | crontab - 2>/dev/null || true

echo "=== 3/5 安装依赖 + 构建(npm ci && next build) ==="
cd "$DEST_DIR"
npm ci 2>&1 | tail -1
npm run build 2>&1 | grep -E "✓|✗|Error" | head -5 || true
[ -d "$DEST_DIR/.next" ] || { echo "✗ 构建失败(.next 不存在)"; exit 1; }

echo "=== 4/5 安装 systemd 单元并启动 ==="
cat > "$UNIT_DEST" <<'EOF'
[Unit]
Description=Voice Chat 主应用(聊天室网页 + LiveKit token 签发)
After=network.target

[Service]
Type=simple
WorkingDirectory=/var/www/voice-chat
EnvironmentFile=/opt/voice-chat.env
ExecStart=/usr/bin/env node /var/www/voice-chat/server.js
Restart=always
RestartSec=2
MemoryMax=768M

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now voice-chat
sleep 1
systemctl restart voice-chat
sleep 3

echo "=== 5/5 健康检查 ==="
systemctl is-active voice-chat || { echo "✗ 服务未运行"; journalctl -u voice-chat --no-pager -n 30; exit 1; }
out=$(curl -s --max-time 6 http://localhost:3000/healthz || true)
echo "healthz: $out"
echo "$out" | grep -q '"ok":true' || { echo "✗ healthz 异常"; journalctl -u voice-chat --no-pager -n 30; exit 1; }
tok=$(curl -s --max-time 6 "http://localhost:3000/token?room=main&name=probe" | head -c 40)
echo "token 签发: ${tok}…"
echo "$tok" | grep -q '"token"' || { echo "✗ token 签发异常"; exit 1; }
echo
echo "✓ 主应用部署完成(端口 3000)。下一步:bash deploy/config-caddy-full.sh 切换 Caddy 路由"
