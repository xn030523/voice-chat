#!/usr/bin/env bash
# tt.lsaini.com 统一入口路由(47.77 上执行,幂等)——【整块替换】站点配置:
#   tt.lsaini.com {
#     handle_path /games*  → :3001   游戏服
#     handle /rtc*         → :7880   LiveKit 信令/校验(livekit-client 实际路径为 /rtc、/rtc/validate)
#     handle /twirp*       → :7880   LiveKit HTTP API(保险)
#     handle               → :3000   聊天室网页(主应用)
#   }
# 媒体流走 UDP 7882 / TCP 7881 直连,不经 Caddy,不受影响。
set -euo pipefail

CF=/etc/caddy/Caddyfile
DOMAIN=tt.lsaini.com
WEB_PORT=3000
GAMES_PORT=3001
LIVEKIT_PORT=7880

[ -f "$CF" ] || { echo "✗ 找不到 $CF"; exit 1; }
curl -s --max-time 4 "http://localhost:${WEB_PORT}/healthz" | grep -q '"ok":true' || {
  echo "✗ 主应用未在 ${WEB_PORT} 运行,先执行 install-webapp.sh"; exit 1; }

BAK="${CF}.bak.$(date +%s)"
cp "$CF" "$BAK"
echo "已备份:$BAK"

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

cat >> "$TMP" <<EOF

${DOMAIN} {
	handle_path /games* {
		reverse_proxy localhost:${GAMES_PORT}
	}
	handle /rtc* {
		reverse_proxy localhost:${LIVEKIT_PORT}
	}
	handle /twirp* {
		reverse_proxy localhost:${LIVEKIT_PORT}
	}
	handle {
		reverse_proxy localhost:${WEB_PORT}
	}
}
EOF

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

echo "=== 三路探活 ==="
ok=1
page=$(curl -s --max-time 8 "https://${DOMAIN}/" | grep -c "语音聊天" || true)
echo "网页 / → 含「语音聊天」:${page}"
[ "$page" -ge 1 ] || ok=0
rtc=$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 "https://${DOMAIN}/rtc/validate" || echo 000)
echo "LiveKit /rtc/validate → HTTP ${rtc}(非 000 即通,401/400 正常:缺 token)"
[ "$rtc" != "000" ] || ok=0
games=$(curl -s --max-time 8 "https://${DOMAIN}/games/healthz" || true)
echo "游戏服 /games/healthz → ${games}"
echo "$games" | grep -q '"ok":true' || ok=0
tok=$(curl -s --max-time 8 "https://${DOMAIN}/token?room=main&name=probe" | head -c 30)
echo "token 签发 → ${tok}…"
echo "$tok" | grep -q '"token"' || ok=0

if [ "$ok" = 1 ]; then
  echo
  echo "✓ ${DOMAIN} 统一入口就绪:网页 / 语音(/rtc) / 游戏(/games) 全部同域名"
else
  echo
  echo "✗ 有探活未通过!可回滚:cp $BAK $CF && systemctl reload caddy"
  exit 1
fi
