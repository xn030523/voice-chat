#!/usr/bin/env bash
set -euo pipefail

mkdir -p /opt/livekit
cd /opt/livekit

# 幂等：首次生成 key/secret，之后复用
if [ ! -f /opt/livekit/keys.env ]; then
  API_KEY="API$(openssl rand -hex 6)"
  SEC1="$(openssl rand -base64 32 | tr -d '\n/+=')"
  API_SECRET="${SEC1}$(openssl rand -hex 8)"
  cat > /opt/livekit/keys.env <<EOF
API_KEY=${API_KEY}
API_SECRET=${API_SECRET}
EOF
fi
. /opt/livekit/keys.env

cat > /opt/livekit/livekit.yaml <<EOF
port: 7880
rtc:
  tcp_port: 7881
  udp_port: 7882
  use_external_ip: true
keys:
  ${API_KEY}: ${API_SECRET}
logging:
  level: info
EOF

docker pull livekit/livekit-server:latest
docker rm -f livekit >/dev/null 2>&1 || true
docker run -d --name livekit --restart unless-stopped --network host \
  -v /opt/livekit/livekit.yaml:/etc/livekit.yaml \
  livekit/livekit-server:latest --config /etc/livekit.yaml

sleep 4
echo "=== container ==="
docker ps --filter name=livekit --format '{{.Names}} | {{.Status}}'
echo "=== logs ==="
docker logs --tail 25 livekit 2>&1 || true
echo "=== local http 7880 ==="
curl -s --max-time 5 http://localhost:7880/ || echo "(no root response)"
echo
echo "RESULT_LIVEKIT_API_KEY=${API_KEY}"
echo "RESULT_LIVEKIT_API_SECRET=${API_SECRET}"
