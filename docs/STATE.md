# 项目状态（SESSION HANDOFF）

> 更新：2026-10-18

## 当前状态

- **版本**：v1.0.0，M1–M4 核心内容已完成，游戏可完整游玩。
- **阶段**：完成开发，待部署与真机 QA。
- **可运行**：双击 `index.html`；或 `python -m http.server 8765` 后访问 `http://127.0.0.1:8765/`。
- **测试**：`npm test` → 93 项全部通过。
- **性能**：Node 基准 300 僵尸 + 99 人类 + 100 投射物 → `avgStepMs ≈ 0.95`；浏览器单帧模拟 1.7ms、渲染+HUD 4.65ms。
- **Bot**：郊区公路 seed 1 严格经济跑到第 42 回合（R40 通关级，R42 被 BOSS 压死）；5 次 BOSS 击杀、15 名队长、4 名英雄。

## 已完成

- 3 张地图（郊区公路 / 医院广场 / 地铁站台），32px 网格 + 多源 BFS 流场，满建可达校验通过。
- 8 人类、6 普通僵尸 + 幼体 + BOSS、4 英雄、6 建筑、4 条科技线、队长/英雄/感染/转化/护盾/爆尸/母体/石块全部接入。
- 完整整备 → 战斗 → 清场 → 结算 → 晋升/英雄 → 整备循环；失败判定与 1 秒确认。
- HUD：招募/建筑/科技、波次预览、tooltip、战斗日志、BOSS 血条、结算/失败/图鉴/设置/新手引导。
- 零依赖 Canvas 2D + DOM HUD，`file://` 与静态服务器均可运行。
- PWA：manifest、Service Worker（Cache First）、192/512/maskable 图标、OG 图；离线可玩；`?dev=1` 跳过 SW 便于调试。
- 存档：最佳回合、设置、导出/导入 JSON（localStorage try/catch）。
- 响应式：桌面（战场 + 独立底部面板）、窄屏横屏、竖屏提示遮罩、触控 pointer 事件。

## 验证记录

- `npm test`：93/93 通过（2026-10-18）。
- `node tests/bench.js`：`avgStepMs=0.951 maxStepMs=8.729`。
- `node tests/bot.js --rounds 40 --seed 1`：42 回合，5 BOSS 击杀，15 队长，4 英雄。
- 浏览器：菜单/选图/放置/拖拽/建造/科技/tooltip/帮助/设置/暂停/加速/结算/失败/重开/离线均手动走过；console 0 error（file:// 与 http 均验证）。
- PWA：Service Worker activated，缓存 `zd-v1.0.0`，断网刷新仍可进入游戏。

## 下一步（建议顺序）

1. **部署**：在 `games/zombie-defense` 内 `git init` → 提交 → 推送到 `git@github.com:charanie/zombie-defense.git`（本机 `github.com:443` 被阻断，必须 SSH）→ Pages 分支 `main` / root。
2. **真机 QA**：iPhone Safari、Android Chrome、微信内置浏览器、QQ 浏览器；重点看横屏、触摸放置、安全区、帧率。
3. **平衡复测**：用真人试玩 R1–20；若 R20 太简单，优先微调精英比例而不是 HP 底数。
4. 可选：Electron/Tauri 桌面壳、二维码/分享图、更多地图与成就。

## 已知限制

- 手机横屏为保证 16:9 战场 + 底部面板不重叠，会有左右黑边；战场约 467×263（667×375 视口）。
- 音效为 Web Audio 程序生成，未在真机验收音量/延迟；首次点击后才初始化。
- 未实现中途存档、在线排行榜、成就。
