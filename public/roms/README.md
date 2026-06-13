# 经典模拟器 ROM 投放说明

「经典模拟器」街机柜已**预置了一份经典游戏目录**(见 `roms.json`),大厅按平台(FC/SFC/MD/街机)
分组展示。每个游戏是一个**卡带槽**:未放入 ROM 时显示「待投放」,把对应文件丢进本目录即变「可玩」。
模拟器(EmulatorJS)在独立 iframe 运行,**不影响语音、聊天与其他游戏**,自带原版画面与音乐,支持手柄。

## 怎么让一个游戏变「可玩」

1. 在大厅点该游戏,会显示它需要的**确切文件名**(也可直接查 `roms.json` 的 `file` 字段)
2. 把 ROM 文件按该名字放进 **本目录**(服务器上是 `/var/www/voice-chat/public/roms/`)
   - 例:坦克大战 → `battlecity.nes`;合金弹头 → `mslug.zip`(街机还需 BIOS `neogeo.zip`)
3. 刷新页面,该游戏即变「可玩」

> 文件已放在本地仓库目录时,执行部署(`install-webapp.sh` 的 rsync)会同步到服务器。
> ROM 二进制在 `.gitignore` 中排除,**不会进 GitHub**,只同步到你自己的服务器。

## 加目录里没有的游戏

编辑 `roms.json` 的 `games` 数组,加一项:

```json
{ "id": "唯一英文id", "name": "显示名", "core": "nes", "file": "文件名.nes", "system": "FC", "players": "1-2P" }
```

`bios` 字段可选(部分街机/世嘉系统需要)。

## 内核(core)对照

| 平台 | core | 文件后缀 |
|---|---|---|
| 任天堂 FC / NES | `nes` | `.nes` |
| 超任 SFC / SNES | `snes` | `.sfc` / `.smc` |
| 世嘉 MD / Genesis | `segaMD` | `.md` / `.bin` |
| GB / GBC | `gb` | `.gb` / `.gbc` |
| GBA | `gba` | `.gba` |
| 街机(FBNeo) | `arcade` | `.zip`(romset,部分需 BIOS) |

完整平台列表:https://emulatorjs.org/docs/systems

## 操作

方向键移动 · `X`/`Z` = A/B · `Enter` = Start · `Shift` = Select · **支持手柄**(自动识别)·
可在模拟器内「控制设置」改键。

## ⚠️ 版权提示

模拟器本身是合法开源软件,目录里的条目只是**标签**(不含任何游戏数据)。
但**商业游戏 ROM 属于版权方**(Namco/Konami/SNK/任天堂等),在公开域名上托管/分发受版权 ROM 属侵权,
法律风险由放置者自行承担。是否放置、放置什么,完全由你决定。
