#!/usr/bin/env bash
# 拉取「免费/开源」可合法托管的 ROM 到 public/roms/(在服务器或本地运行,幂等)。
# 只收录明确允许自由转载的开源/免费作品;商业 ROM 一律不收(用户自备)。
# 许可与来源见 public/roms/CREDITS.md。
set -euo pipefail
DEST="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/public/roms"
mkdir -p "$DEST"

dl() { # dl <文件名> <url>
  if curl -fsSL --max-time 120 -o "$DEST/$1" "$2"; then
    echo "  ✓ $1 ($(du -h "$DEST/$1" | cut -f1))"
  else
    echo "  ✗ $1 (跳过)"; rm -f "$DEST/$1"
  fi
}

echo "=== 免费/开源 ROM ==="
# Nova the Squirrel(GPLv3 代码 / CC-BY-NC-SA 素材;非商用+署名可转载)
dl "nova.nes" "https://github.com/NovaSquirrel/NovaTheSquirrel/releases/download/v1.0.6a/nova.nes"

echo "✓ 完成。许可记录见 public/roms/CREDITS.md"
