# ADR-0001：引擎与运行时栈

- **状态**：已采纳（2026-10-18）
- **决策者**：用户 + 实现会话

## 背景

需求同时要求：

1. 双击 `index.html` 即玩，不装 Node、不构建；
2. 同屏 300 僵尸 + 99 人类 + 100 投射物，60 FPS；
3. 模拟层可无头测试、可确定性回放；
4. 后续可包装为 PWA / Electron / Tauri / Steam。

## 决策

- **语言**：原生 JavaScript（ES2017），经典 `<script>` 顺序加载，`window.ZG` 命名空间。
- **渲染**：Canvas 2D 双层（静态背景层 + 动态层）；HUD 与弹窗用 DOM/CSS，保证中文清晰。
- **模拟**：固定步长 1/60 秒，`src/sim` 纯逻辑、不接触 DOM、所有随机走种子流。
- **数据**：`src/data` 集中所有数值与公式；`src/sim` 只读。
- **测试**：Node 内置 `node:test` + `tests/load-sim.js` 解析 `index.html` 的脚本顺序；无运行时测试依赖。
- **存档**：`localStorage`（try/catch）经 `Platform` 抽象，预留给 Electron/Tauri/Steam。
- **PWA**：静态 manifest + Service Worker（Cache First），仅 HTTPS/localhost 注册。

## 备选与取舍

| 方案 | 拒绝原因 |
|---|---|
| Phaser / PixiJS | 需要构建或外部依赖，违背 `file://` 双击即玩 |
| ES module | `file://` 下模块 CORS 限制 |
| TypeScript + 打包器 | 增加工具链与发布复杂度；本项目逻辑规模可控 |
| WebGL | 300 个圆形 + 圆血条在 Canvas 2D 已满足预算；WebGL 增加复杂度 |
| quadtree | 64px 空间哈希对均匀圆形分布更便宜 |
| 状态快照回放 | 战斗全自动，只需 seed + 整备期命令 |

## 后果

- 正面：零安装、零构建、可离线、可无头回归、性能达标。
- 负面：无类型检查；加载顺序由 `index.html` 手工维护（测试会兜底）；DOM HUD 与 Canvas 坐标系需显式映射。

## 验证

`node tests/bench.js`、`npm test`、浏览器 DevTools 性能记录、PWA 离线刷新。
