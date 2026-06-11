#!/usr/bin/env bash
# 为 voice-games 配置 Caddy 路由(在 47.77 服务器上执行,幂等)
# ⚠️ 与 config-caddy.sh 的"追加"方式不同:本脚本【整块替换】tt.lsaini.com 站点块——
#    同名块追加两次会导致 caddy validate 失败(duplicate site)。
# 结果:
#   tt.lsaini.com {
#     handle_path /games* { reverse_proxy localhost:3001 }   # 游戏服(WS 自动升级)
#     handle       { reverse_proxy localhost:7880 }          # LiveKit(原路由保持)
#   }
set -euo pipefail

CF=/etc/caddy/Caddyfile
DOMAIN=tt.lsaini.com
GAMES_PORT=3001
LIVEKIT_PORT=7880

[ -f "$CF" ] || { echo "✗ 找不到 $CF"; exit 1; }

BAK="${CF}.bak.$(date +%s)"
cp "$CF" "$BAK"
echo "已备份:$BAK"

# 1) 删除现有 DOMAIN 站点块(花括号深度计数,容忍嵌套)
TMP=$(mktemp)
awk -v dom="$DOMAIN" '
  BEGIN { skip = 0; depth = 0 }
  skip == 0 && $0 ~ "^[ \t]*" dom "[ \t]*{" {
    skip = 1; depth = 0
    n = gsub(/{/, "{"); m = gsub(/}/, "}"); depth += n - m
    if (depth <= 0) skip = 0
    next
  }
  skip == 1 {
    n = gsub(/{/, "{"); m = gsub(/}/, "}"); depth += n - m
    if (depth <= 0) skip = 0
    next
  }
  { print }
' "$CF" > "$TMP"

# 2) 追加新块(games 路由在前,LiveKit 兜底)
cat >> "$TMP" <<EOF

${DOMAIN} {
	handle_path /games* {
		reverse_proxy localhost:${GAMES_PORT}
	}
	handle {
		reverse_proxy localhost:${LIVEKIT_PORT}
	}
}
EOF

# 3) 校验通过才落盘 + 热载(失败自动回滚,LiveKit 路由零风险)
if ! caddy validate --config "$TMP" --adapter caddyfile; then
  echo "✗ caddy validate 失败,保持原配置不变"
  rm -f "$TMP"
  exit 1
fi
cp "$TMP" "$CF"
rm -f "$TMP"
systemctl reload caddy
sleep 2
echo "caddy: $(systemctl is-active caddy)"

# 4) 端到端探活:游戏服路由 + LiveKit 回归
echo "=== 探活 https://${DOMAIN}/games/healthz(游戏服) ==="
ok=0
for i in 1 2 3 4 5; do
  out=$(curl -s --max-time 8 "https://${DOMAIN}/games/healthz" || true)
  echo "attempt $i -> ${out:-((no response))}"
  if echo "$out" | grep -q '"ok":true'; then ok=1; break; fi
  sleep 3
done
[ "$ok" = 1 ] || { echo "✗ 游戏服探活失败(检查 voice-games 是否运行)"; exit 1; }

echo "=== 回归探测 https://${DOMAIN}/(LiveKit 原路由) ==="
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 "https://${DOMAIN}/" || echo 000)
echo "LiveKit HTTP $code"
[ "$code" != "000" ] || { echo "✗ LiveKit 路由异常!可回滚:cp $BAK $CF && systemctl reload caddy"; exit 1; }

echo
echo "✓ Caddy 配置完成:wss://${DOMAIN}/games → :${GAMES_PORT},wss://${DOMAIN} → :${LIVEKIT_PORT}(不变)"
