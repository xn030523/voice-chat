#!/usr/bin/env bash
DOMAIN=tt.lsaini.com
for i in 1 2 3 4 5 6 7 8 9 10; do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 "https://${DOMAIN}/" 2>/dev/null || echo 000)
  echo "try $i -> $code"
  [ "$code" != "000" ] && [ "$code" != "" ] && break
  sleep 4
done
echo "=== body ==="
curl -s --max-time 8 "https://${DOMAIN}/" 2>/dev/null | head -c 120 || true
echo
echo "=== caddy acme/cert logs ==="
journalctl -u caddy --since '5 min ago' --no-pager 2>/dev/null | grep -iE "tt\.lsaini|certificate|acme|obtain|error|tls" | tail -25
