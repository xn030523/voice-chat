#!/usr/bin/env bash
# 自动扫描 public/roms/ 下的 ROM 文件,生成 roms.json 目录 —— 任意文件名都能识别上架。
# 用法(在服务器或本地仓库根目录):bash deploy/scan-roms.sh
# 你只需把自己的 ROM 文件丢进 public/roms/(文件名随意,中文也行),跑一次本脚本即可。
# 本脚本不下载/不内置任何 ROM,只整理「已存在的文件」。商业 ROM 由你自行放置并自担版权责任。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIR="${1:-$ROOT/public/roms}"   # 可传入目标 roms 目录(部署时指向 /var/www/.../public/roms)
OUT="$DIR/roms.json"
[ -d "$DIR" ] || { echo "✗ 找不到 $DIR"; exit 1; }

python3 - "$DIR" "$OUT" << 'PY'
import os, sys, json, re

DIR, OUT = sys.argv[1], sys.argv[2]

# 扩展名 → (内核, 平台标签)
EXT = {
    'nes': ('nes', 'FC'), 'fds': ('nes', 'FC'), 'unf': ('nes', 'FC'),
    'sfc': ('snes', 'SFC'), 'smc': ('snes', 'SFC'),
    'md': ('segaMD', 'MD'), 'gen': ('segaMD', 'MD'), 'bin': ('segaMD', 'MD'), 'smd': ('segaMD', 'MD'),
    'gb': ('gb', 'GB'), 'gbc': ('gb', 'GB'),
    'gba': ('gba', 'GBA'),
    'sms': ('segaMS', 'SMS'), 'gg': ('segaGG', 'GG'),
    'n64': ('n64', 'N64'), 'z64': ('n64', 'N64'), 'v64': ('n64', 'N64'),
    'pce': ('pce', 'PCE'),
    'a26': ('atari2600', 'Atari'),
    'zip': ('arcade', '街机'),
}

# 开源/免费白名单:这些保留特殊分组与显示名
KNOWN = {
    'nova.nes': ('松鼠诺娃(开源)', '免费开源'),
}

# 排除:目录里的非 ROM 文件(.md 既是世嘉 MD 又是 Markdown,需显式排除文档)
EXCLUDE = {'roms.json', 'README.md', 'CREDITS.md', '.gitignore'}

games = []
used_ids = set()
for fn in sorted(os.listdir(DIR)):
    if fn in EXCLUDE:
        continue
    path = os.path.join(DIR, fn)
    if not os.path.isfile(path):
        continue
    ext = fn.rsplit('.', 1)[-1].lower() if '.' in fn else ''
    if ext not in EXT:
        continue  # 跳过 roms.json / README / CREDITS / .gitignore 等
    core, syslabel = EXT[ext]
    name = fn.rsplit('.', 1)[0]
    if fn in KNOWN:
        name, syslabel = KNOWN[fn]
    # 生成稳定且唯一的 ascii id(供 React key / 探测用)
    base = re.sub(r'[^a-zA-Z0-9]+', '-', fn.rsplit('.', 1)[0]).strip('-').lower() or 'rom'
    gid = base
    i = 2
    while gid in used_ids:
        gid = f'{base}-{i}'; i += 1
    used_ids.add(gid)
    games.append({'id': gid, 'name': name, 'core': core, 'file': fn, 'system': syslabel, 'players': ''})

# 免费开源分组排最前,街机其次按平台,其余按平台名
order = {'免费开源': 0, 'FC': 1, 'SFC': 2, 'MD': 3, 'GB': 4, 'GBA': 5, 'SMS': 6, 'GG': 7, 'PCE': 8, 'N64': 9, 'Atari': 10, '街机': 11}
games.sort(key=lambda g: (order.get(g['system'], 99), g['name']))

json.dump({'_comment': '由 deploy/scan-roms.sh 自动生成:扫描 public/roms/ 下已存在的 ROM。任意文件名自动识别上架。',
           'scanned': True, 'games': games}, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
print(f'✓ 已扫描 {len(games)} 个 ROM,写入 roms.json')
by = {}
for g in games:
    by[g['system']] = by.get(g['system'], 0) + 1
for s, n in by.items():
    print(f'   {s}: {n}')
PY
echo "刷新页面即可在「经典模拟器」看到全部已放入的游戏(均为可玩)。"
