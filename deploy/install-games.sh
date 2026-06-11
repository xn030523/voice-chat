#!/usr/bin/env bash
# 部署/更新 voice-games 独立游戏服务(在 47.77 服务器上执行)
# 用法:把仓库(或至少 games-server/ + deploy/)同步到服务器后,在仓库根目录执行:
#   bash deploy/install-games.sh
# 幂等:可重复执行用于更新。绝不触碰 voice-chat.service / LiveKit 容器 / Caddy。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_DIR="${SRC_DIR:-$SCRIPT_DIR/../games-server}"
DEST_DIR=/opt/voice-games
UNIT_SRC="$SCRIPT_DIR/voice-games.service"
UNIT_DEST=/etc/systemd/system/voice-games.service
KEYS_ENV=/opt/livekit/keys.env

[ -d "$SRC_DIR" ] || { echo "✗ 找不到 games-server 源目录:$SRC_DIR"; exit 1; }
[ -f "$KEYS_ENV" ] || { echo "✗ 缺少 $KEYS_ENV(先运行 install-livekit.sh)"; exit 1; }

echo "=== 1/5 Node.js >= 18 检测 ==="
need_node=1
if command -v node >/dev/null 2>&1; then
  major=$(node -v | sed 's/^v\([0-9]*\).*/\1/')
  if [ "${major:-0}" -ge 18 ]; then
    echo "node $(node -v) ✓"
    need_node=0
  else
    echo "node $(node -v) 过旧,需要 >= 18"
  fi
else
  echo "未安装 node"
fi
if [ "$need_node" = 1 ]; then
  echo "安装 NodeSource Node 20 LTS…"
  if command -v apt-get >/dev/null 2>&1; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
  elif command -v yum >/dev/null 2>&1 || command -v dnf >/dev/null 2>&1; then
    curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
    (command -v dnf >/dev/null 2>&1 && dnf install -y nodejs) || yum install -y nodejs
  else
    echo "✗ 未识别的包管理器,请手动安装 Node >= 18"; exit 1
  fi
  echo "node $(node -v) ✓"
fi

echo "=== 2/5 同步代码到 $DEST_DIR ==="
mkdir -p "$DEST_DIR"
if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete --exclude node_modules "$SRC_DIR/" "$DEST_DIR/"
else
  find "$DEST_DIR" -mindepth 1 -maxdepth 1 ! -name node_modules -exec rm -rf {} +
  (cd "$SRC_DIR" && tar cf - --exclude node_modules .) | (cd "$DEST_DIR" && tar xf -)
fi

echo "=== 3/5 安装依赖(npm ci --omit=dev) ==="
cd "$DEST_DIR"
npm ci --omit=dev 2>&1 | tail -2

echo "=== 4/5 安装 systemd 单元并启动 ==="
cp "$UNIT_SRC" "$UNIT_DEST"
systemctl daemon-reload
systemctl enable --now voice-games
sleep 1
systemctl restart voice-games   # 更新部署时强制加载新代码
sleep 2

echo "=== 5/5 健康检查 ==="
systemctl is-active voice-games || { echo "✗ 服务未运行"; journalctl -u voice-games --no-pager -n 30; exit 1; }
out=$(curl -s --max-time 5 http://localhost:3001/healthz || true)
echo "healthz: $out"
echo "$out" | grep -q '"ok":true' || { echo "✗ healthz 异常"; journalctl -u voice-games --no-pager -n 30; exit 1; }
echo
echo "✓ voice-games 部署完成(端口 3001)。"
echo "  下一步(仅首次):bash deploy/config-caddy-games.sh 把 wss://tt.lsaini.com/games 路由到本服务"
echo "  日志:journalctl -u voice-games -f"
