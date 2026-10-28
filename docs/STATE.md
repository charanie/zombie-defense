# 项目状态（SESSION HANDOFF）

> 更新：2026-10-27

## 当前状态

- **版本**：v1.6.0。v1.5（三地图细化 / 地铁双通道 / 技能特效）已并入 `main`，v1.6 在其上重做开始流程。
- **阶段**：开发完成；自动化验证全绿，浏览器 QA 已走查（桌面五档 + 键盘 + reduced motion），**待真机/线上缓存复测**。
- **在线地址**：<https://charanie.github.io/zombie-defense/>（`main` 已推送到 v1.6.0）。
- **安卓包**：`dist/zombie-defense-v1.6.0.apk`（0.57 MB，minSdk 24，自签名 v2+v3，零权限，自定义图标），线上直链 <https://charanie.github.io/zombie-defense/dist/zombie-defense-v1.6.0.apk>；构建脚本 `tools/android-build/build_apk.py`（aapt2 标准流程）。**真机已验证**：Xiaomi / Android 16 / arm64-v8a 安装、启动、完整开始流程、招募开战、localStorage 存档均正常。
- **可运行**：双击 `index.html`；或 `python -m http.server 8765` 后访问 `http://127.0.0.1:8765/`。
- **测试**：`npm test` → **293 项全部通过**。
- **性能**：300 僵尸 + 99 人类 + 100 投射物 → `avgStepMs ≈ 1.81`（预算 2.5）、`maxStepMs ≈ 15.9`。
- **Bot**：`--rounds 42 --seed 1` 跑满 R44（`over=false`），与 v1.5 基线逐行一致。

## v1.6.0 已完成

- **主菜单**：左侧 4 项纵向导航（无尽 / 剧情 / 图鉴 / 设置）+ 右侧“战区监视”动态画面 + 底部工具条；纯 DOM 原生 `<button>`，`↑↓` / `Enter` / `Esc` 全程可用。
- **背景场景**：`ZG.MenuScene` 程序化绘制城市剪影、透视网格、雾带、雨、余烬、远处僵尸剪影、扫描光；固定种子；`prefers-reduced-motion` 冻结为静帧；DPR 上限桌面 1.5 / 移动 1.25。
- **选图页**：三张战区卡（缩略图复用 `ZG.MapLayer.drawMinimap`、`AO-0N`、威胁条、标签、最佳/上次）+ 悬停/聚焦更新“行动简报”（推荐开局 / 威胁构成估计 / 个人记录 / 场地提示）；400ms 防抖、触控横滑抑制、窄屏横滑 snap。
- **剧情模式占位**：主菜单入口 + “封存档案”弹窗（z 60），三章锁定、`待解锁`，不做预约/通知；`ZG.Data.menu.story` 为后续章节留接口。
- **开场演出**：`ZG.Intro` 五套时间轴（full 4.2s / skip 0.55s / quick 1.0s / reduced 1.4s / off 0.25s）；Canvas 程序化咬痕 + 6 条主裂纹 + 支裂纹 + 碎片 / 血点 / 尘土；黑幕、地图名、曝光、HUD 错峰入场；0.35s 后可跳过；建局固定在全黑 1.90s。
- **层级与输入锁**：统一 z-index 表（HUD 3 / 结算 40 / 菜单 50 / 弹窗 60 / Toast 70 / Tooltip 80 / 开场 90）；`state.ui.showMenu` 与 `state.ui.inputLocked` 分离，`input.js` 统一 `gameplayBlocked()`；菜单里 `Tab` 恢复浏览器原生焦点顺序。
- **修掉的旧 bug**：菜单里“图鉴/设置”死按钮；弹窗被菜单盖住；菜单中 `Space/H/T/Tab` 触发游戏操作。
- **记录**：新增 `zd_last_<id>`（上次抵达，只增不减）；选图页与简报显示 `最佳 / 上次抵达`，为空显示 `—`。
- **设置**：新增“开场动画”开关（关闭后 0.25s 淡入）；`prefers-reduced-motion` 运行时优先。
- **安卓 APK**：`apps/zombie-defense-android/`（单 Activity + WebView，`https://appassets.local/` 虚拟源拦截 `assets/www`，5 档 mipmap 图标）；`tools/android-build/build_apk.py` 用 aapt2 + javac + d8 + zipalign + apksigner 的零 Gradle 流程构建，产物 `dist/zombie-defense-v1.6.0.apk`；WebView 调试只在 `--debug` 构建开启。

## v1.5.0 已完成（并入本版）

- **地图数据分层**：`zones / spawns / decor / terrain / obstacles`；`obstacles` 仍是唯一碰撞真相，`decor` 纯视觉且用固定种子 LCG 生成噪声。
- **地铁双通道**：U 形活动区（北通道 `y 160..300`、南通道 `y 420..560`、末端大厅 `x 1000..1240`）；中央设备带与上下轨道不可通行；只从西侧两个隧道口 `(-20, 230)` / `(-20, 490)` 出怪。
- **区域约束**：`ZG.MapZone` 统一回答 contains / containsCircle / clamp / center / mask；放置、建筑、人类移动、小队阵位、拖拽、僵尸移动、BOSS 召唤与冲刺全部走同一套活动区；区域外放置返回 `outside-zone`。
- **流场**：有 zones 的地图把区域外格子写进 `blocked`，并使用水平优先加权最短路（水平 10 / 垂直 12）；无 zones 的两图保持 v1.4 BFS、RNG 与移动钳制不变。
- **视觉与特效**：`src/view/maplayer.js` 静态地图层（道路 / 装饰 / 障碍 / 活动区 / 缩略图）；`src/view/fx.js` 分层特效（英雄技能、BOSS 特殊攻击预警与命中）；粒子形态扩展与移动端预算。

## 验证记录

- `npm test`：293/293 通过（2026-10-27，含 v1.6 的 menu/intro/shell/smoke 测试）。
- `node tests/bench.js`：`avgStepMs≈1.807 maxStepMs≈15.9`（v1.5 基线 1.727/17.3）。
- `node tests/bot.js --rounds 42 --seed 1`：跑满 R44、`over=false`，与 v1.5 基线输出逐行一致（模拟层未被开始流程改动影响）。
- 确定性：`state.rng` 未被菜单/过场触碰；`State.hash` 不包含 `ui/settings`；同种子回放测试仍绿。
- **v1.6 浏览器 QA（Edge headless + DevTools 协议，`tools/qa-shot.js`，本地 `file://`）**：
  - 主菜单 1440×900 / 1366×768 / 1024×768 / 844×390 / 390×844 五档构图正常，无溢出；截图为 `shots/menu.png`、`shots/menu-390-844.png`、`shots/menu-maps.png`、`shots/menu-story.png`。
  - 键盘：`↑↓` 移动导航、`Enter` 进入选图、`←→` 切卡、`Esc` 逐层返回；菜单内 `Tab` 的 `defaultPrevented=false`。
  - 全流程：主菜单 → 选图 → 点“地铁站台” → 开场（`onBuild` 1.90s 建局、`onDone` 解锁）→ 整备；过场中按 `2` 无效，结束后恢复。
  - 跳过：0.5s 触发，584ms 内结束且 `onBuild`/`onDone` 各一次；`onBuild` 后菜单隐藏、输入仍锁。
  - 游戏结束 →“返回选图”回到 maps；重开走 quick（实测 1046ms）。
  - 菜单 → 设置：弹窗 z 60 高于菜单 z 50，可切“开场动画”，`Esc` 只关弹窗；菜单 → 图鉴同理。
  - 剧情 teaser：z 60、三章 `disabled`、`Esc`/遮罩/返回均可关闭，焦点回到“剧情模式”。
  - `prefers-reduced-motion`：场景静帧、开场 1469ms、无震屏、流程可完成。
  - 触控尺寸：窄屏/横屏下导航 58/48、工具与返回按钮 44、跳过 44、弹窗关闭 ≥44。
  - 记录回填：`saveBest/saveLast` 后卡片与简报显示 `最佳 12 回合 / 上次抵达 9 回合`，`aria-label` 同步。
  - 开场四帧截图为 `shots/intro-crack.png`（0.4s 破口）与 `shots/intro.png`（2.6s 地图名）。
  - console 0 error，`file://` 双击可玩。
- v1.5 补充验收（无头 Edge + CDP，桌面 1366×768）：
  - v1.5 阶段 `node --test "tests/*.test.js"` 为 272 项；新增 `maps / zones / zombie-zone / fx` 四组测试，覆盖地图数据、活动区、放置拒绝、双方越界、出生口、接缝通行、死亡幼体、特效 KINDS/describe/stub 绘制/移动端降级。
  - 三图整备期截图 `shots/map-suburban.png` / `shots/map-hospital.png` / `shots/map-subway.png`；英雄与 BOSS 特效 `shots/fx-hero.png` / `shots/fx-boss.png`。
  - 手机 390×844（触控模拟）：无横向滚动（`scrollWidth=390`）；BOSS 战 600 帧 `avg 16.6ms / p95 16.8ms / max 33.3ms / >50ms 帧 0`；截图 `shots/mobile-subway.png`、`shots/mobile-boss.png`。
  - 分图 bot：医院 seed 1 到 R7（v1.4 R6）；地铁 seed 1 到 R6（v1.4 旧图 R7）；开局资金 500 作为补偿。
- **安卓 APK 验证（2026-10-27）**：
  - `aapt2 dump badging`：package `com.charanie.zombiedefense`、versionCode 10600 / versionName 1.6.0、minSdk 24、targetSdk 34、`launchable-activity: MainActivity`、`application label='尸潮防线'`。
  - `aapt2 dump xmltree`：`versionCode(0x0101021b)=10600`、`label(0x01010001)="尸潮防线"`、`icon=@0x01080093`、`theme=@0x01030007`、activity `name/exported/configChanges=8096/screenOrientation=6/launchMode=2`、`MAIN` + `LAUNCHER` 全部正确 —— 手写 AXML 被官方解析器完整接受。
  - `apksigner verify -v`：v2 `true`、v3 `true`；`dexdump`：3 个类（`MainActivity`、`MainActivity$LocalAssetClient`、`MainActivity$1`）。
  - APK 共 61 个条目：`AndroidManifest.xml`、`classes.dex`、`assets/www/**`（56 个游戏文件）。
  - **未做**：真机安装 / 启动验证（本机无 Android 设备，也未装模拟器）。
- 旧记录（v1.4）：231/231、`avgStepMs≈1.5`、线上 `zd-v1.4.0` 缓存验证通过。

## 下一步（建议顺序）

1. **线上复测**：部署后确认 `ZG.Const.VERSION === 'v1.6.0'`、SW 缓存名 `zd-v1.6.0` 且包含 `menu.css` 与三个新脚本；强制刷新确认新菜单。
2. **真机 QA**：按 `qa/checklist.md` 的 v1.6 段走查手机竖屏/横屏的开场演出与触控尺寸；确认开场音效（glass/bite/impact/stinger/heartbeat/reveal/whoosh）音量合适。
3. **平衡复测**：真人试玩 R1–20，重点看“开始流程变长后是否愿意连续重开”（快速重开 1.0s）。
4. 可选：剧情模式章节内容（数据形状已留好）、Electron/Tauri 桌面壳。

## 已知限制

- 宽屏手机左右区域由背景填充（世界等比居中）；极窄竖屏视野较小。
- 音效为 Web Audio 程序生成，未在真机验收音量/延迟；首次点击后才初始化。
- bot 对种子较敏感：单 seed 停在 R42 但跑到 R44 上限，真人平衡以试玩为准。
- 剧情模式只有入口与封存档案占位，无章节/对话/目标判定。
- 桌面 Electron 版未随 v1.6 重打包。
- 未实现中途存档、在线排行榜、成就。
