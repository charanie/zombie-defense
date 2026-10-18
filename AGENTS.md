# AGENTS.md — 尸潮防线

本文件是给所有编码代理的强制约束。项目是**零依赖、零构建、经典 `<script>`** 的静态网页游戏，双击 `index.html` 即玩。

## 开始前

1. 读 `docs/STATE.md`（上次会话的交接）。
2. 读 `docs/game-plan.md`（玩法与数值的唯一真相）。
3. 读 `docs/superpowers/plans/2026-10-18-zombie-defense-implementation.md`（任务、接口、裁决）。
4. 读 `docs/tech.md`（如存在）或 `docs/architectural-decisions/0001-engine-and-stack.md`。

## 硬约束

- **运行时零依赖、零构建**：不引入 npm 包、打包器、ES module、外部字体/图片/音频。所有资源本地静态。
- **`file://` 必须可玩**：不能用 ES module / fetch 加载游戏代码 / Service Worker 作为必需路径。
- **加载顺序唯一真相**：所有脚本只在 `index.html` 中按顺序声明。测试用 `tests/load-sim.js` 解析它。
- **分层**：`src/core` ← `src/data` ← `src/sim` ← `src/view` / `src/main.js`。
  `src/sim/**`、`src/data/**`、`src/core/**` 不得访问 `document`、`window`、`localStorage`、`Math.random()`、`Date.now()`、`performance.now()`。
- **确定性**：模拟随机一律走 `state.rng.*`；同种子 + 同整备期命令必须得到相同 `ZG.State.hash()`。
- **固定步长**：`ZG.Const.STEP_SEC = 1/60`，不得用帧数当时间。
- **数值集中**：单位/僵尸/英雄/建筑/地图/波次/公式只写在 `src/data/**`；`src/sim/**` 不写魔法数字。
- **中文文案**：所有玩家可见文字为简体中文；代码标识符用英文。
- **可访问性**：颜色之外有符号/文字/形状；伤害数字与震屏可关；暂停随时可用。

## 运行与验证

```bash
npm test                 # Node 内置测试，93 项
node tests/bench.js      # 300 僵尸 + 99 人类 + 100 投射物
node tests/bot.js --rounds 40 --seed 1
python -m http.server 8765   # 然后打开 http://127.0.0.1:8765/
```

浏览器快速自检：打开页面 → 选图 → 放兵 → 开始回合 → 暂停/加速 → 清场结算 → 图鉴/设置 → 刷新后设置保留。

## 何时更新文档

- 玩法/数值改变：先改 `docs/game-plan.md`，再改代码。
- 顶层架构改变：新增 `docs/architectural-decisions/000N-*.md`。
- 每次有进展的会话结束：更新 `docs/STATE.md`。
- 数值调整：更新 `docs/balance-notes.md` 的基准表。

## 不要做

- 不要把游戏改成需要 `npm install` 才能跑。
- 不要引入 `import` / `export` 语法。
- 不要在 `src/sim/**` 里读 DOM 或使用非确定性随机。
- 不要删除/绕过 `tests/load-sim.js` 的加载顺序校验。
- 不要在没有运行测试与浏览器验收的情况下声称完成。
