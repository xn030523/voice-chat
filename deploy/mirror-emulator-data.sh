#!/usr/bin/env bash
# 镜像 EmulatorJS 运行时数据到本地(同源自托管,摆脱 CDN 运行时依赖)。
# 在「能访问 cdn.emulatorjs.org 的机器」上运行(如本地开发机走代理),
# 产物 public/emulator/data/ 通过部署 rsync 同步到服务器 → 客户端同源加载,国内更稳。
# 镜像的是 EmulatorJS 开源运行时文件(非游戏 ROM)。幂等,可重复执行。
set -euo pipefail

CDN="https://cdn.emulatorjs.org/stable/data"
DEST="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/public/emulator/data"
mkdir -p "$DEST/cores/reports" "$DEST/compression" "$DEST/localization"

dl() { # dl <相对路径>
  local rel="$1"
  local out="$DEST/$rel"
  mkdir -p "$(dirname "$out")"
  if curl -fsSL --max-time 120 -A "Mozilla/5.0" -o "$out" "$CDN/$rel"; then
    echo "  ✓ $rel ($(du -h "$out" | cut -f1))"
  else
    echo "  ✗ $rel (跳过)"
    rm -f "$out"
  fi
}

echo "=== 基础运行时 ==="
for f in loader.js emulator.min.js emulator.min.css version.json \
         compression/extract7z.js compression/extractzip.js \
         localization/zh-CN.json localization/en.json; do
  dl "$f"
done

echo "=== 模拟器内核(FC/SFC/MD/GB/GBA/街机)==="
for c in fceumm nestopia snes9x genesis_plus_gx gambatte mgba fbneo mame2003_plus; do
  dl "cores/$c-wasm.data"
  dl "cores/reports/$c.json"
done

echo
echo "✓ 镜像完成:$DEST"
echo "  体积:$(du -sh "$DEST" | cut -f1)"
echo "  部署时 rsync 会同步到服务器;index.html 本地优先、缺失自动回退 CDN。"
