#!/usr/bin/env bash
set -euo pipefail
CF=/etc/caddy/Caddyfile
DOMAIN=tt.lsaini.com

echo "=== DNS resolve check ==="
dig +short "$DOMAIN" @1.1.1.1 2>/dev/null || getent hosts "$DOMAIN" || echo "(no resolve)"

if grep -q "$DOMAIN" "$CF"; then
  echo "already configured"
else
  cp "$CF" "${CF}.bak.$(date +%s)"
  cat >> "$CF" <<EOF

${DOMAIN} {
	reverse_proxy localhost:7880
}
EOF
  echo "appended"
fi

caddy validate --config "$CF" --adapter caddyfile
systemctl reload caddy
sleep 2
echo "caddy: $(systemctl is-active caddy)"

echo "=== TLS test (首次签证书可能要十几秒) ==="
for i in 1 2 3 4 5 6 7 8; do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 "https://${DOMAIN}/" 2>/dev/null || echo 000)
  echo "attempt $i -> HTTP $code"
  if [ "$code" != "000" ]; then break; fi
  sleep 5
done
echo "=== body ==="
curl -s --max-time 8 "https://${DOMAIN}/" | head -c 200; echo
