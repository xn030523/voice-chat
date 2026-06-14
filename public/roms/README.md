# 经典模拟器 ROM 投放说明

「经典模拟器」街机柜已**预置了一份经典游戏目录**(见 `roms.json`),大厅按平台(FC/SFC/MD/街机)
分组展示。每个游戏是一个**卡带槽**:未放入 ROM 时显示「待投放」,把对应文件丢进本目录即变「可玩」。
模拟器(EmulatorJS)在独立 iframe 运行,**不影响语音、聊天与其他游戏**,自带原版画面与音乐,支持手柄。

## 怎么让一个游戏变「可玩」

**最省事:上传你自己的 ROM,自动上架(任意文件名,中文也行)**

1. 把你的 ROM 文件(`.nes`/`.sfc`/`.md`/`.gba`/`.zip` 等)上传到服务器的
   `/var/www/voice-chat/public/roms/` 目录(用面板/SFTP/scp 都行,文件名随意)
2. 等约 1 分钟(服务器每分钟自动扫描编目),或手动跑一次:
   `bash deploy/scan-roms.sh /var/www/voice-chat/public/roms`
3. 刷新页面 → 大厅「经典模拟器」就会按平台列出你上传的全部游戏,**均可玩**

> 无需改文件名、无需手动登记 —— `scan-roms.sh` 按扩展名自动识别平台(FC/SFC/MD/GBA/街机…)
> 并以文件名作为显示名。部署更新**不会删除**你上传的 ROM(`public/roms` 由你独占管理)。

**手动登记(可选):** 也可直接编辑 `roms.json` 的 `games` 数组自定义显示名/分组:

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
