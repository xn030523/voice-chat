# 经典模拟器 ROM 投放说明

这里是「经典模拟器」街机柜的卡带槽。把 ROM 文件放进本目录,在 `roms.json` 里登记,
刷新页面即可在大厅「经典模拟器」区看到并游玩。模拟器(EmulatorJS)在独立 iframe 中运行,
**不影响语音、聊天与其他游戏**;游戏自带原版画面与音乐。

## 怎么加一个游戏

1. 把 ROM 文件放进本目录,例如 `public/roms/battlecity.nes`
2. 编辑 `roms.json`,在 `games` 数组里加一项:

```json
{
  "games": [
    { "id": "battlecity", "name": "坦克大战", "core": "nes", "file": "battlecity.nes", "players": "1-2P" }
  ]
}
```

字段说明:
- `id` 唯一标识(英文)
- `name` 大厅显示名
- `core` 模拟器内核(见下表)
- `file` 本目录下的文件名
- `players` 显示用文字(可选)
- `bios` 部分内核需要 BIOS 文件名(可选,如某些街机/世嘉系统)

## 常用内核(core)对照

| 平台 | core |
|---|---|
| 任天堂 FC / NES(坦克大战、魂斗罗等)| `nes` |
| 超任 SNES | `snes` |
| GBA | `gba` |
| 世嘉 MD | `segaMD` |
| 街机(合金弹头、忍者神龟、雪人兄弟等)| `arcade`(基于 FBNeo;部分游戏需对应 romset 与 BIOS)|

完整列表见 https://emulatorjs.org/docs/systems

## ⚠️ 版权提示

模拟器本身是合法开源软件。但**商业游戏的 ROM 属于版权方**(Namco / Konami / SNK 等),
在公开域名上托管/分发受版权 ROM 属侵权行为,法律风险由放置者自行承担。
本目录下的 ROM 二进制文件已在 `.gitignore` 中排除,**不会提交到 GitHub**,
仅通过部署同步到你自己的服务器。是否放置、放置什么,完全由你决定。

街机操作:方向键移动,`X` / `Z` = A/B 键,`Enter` = Start,`Shift` = Select(EmulatorJS 默认,可在模拟器内设置里改键 / 接手柄)。
