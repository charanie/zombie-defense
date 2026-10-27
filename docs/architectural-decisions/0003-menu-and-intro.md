# ADR-0003：主菜单 DOM + Canvas 场景 + 开场演出（v1.6）

- **状态**：已采纳（2026-10-27）
- **决策者**：用户 + 实现会话
- **关联计划**：`docs/superpowers/plans/2026-10-27-menu-and-intro-overhaul.md`（设计稿）、`docs/superpowers/plans/2026-10-27-menu-and-intro-implementation.md`（工程方案）
- **设计资产**：`docs/design/menu-mockup.html`、`docs/design/intro-storyboard.html`

## 背景

v1.4 的开始页是“标题 + 三张地图卡 + 四个按钮”，全部由 `HUD.buildMenu()` 每帧渲染：点地图立即 `startGame`，没有转场；菜单里的“图鉴/设置”按钮实际是死的（`HUD.render` 在 `ui.showMenu` 时提前 return）；即便修好，弹窗（z 40）也会被菜单（z 60）盖住；菜单打开时 `Space/H/T/Tab` 仍会触发游戏操作，`Tab` 还被全局劫持为切换招募/建筑。

v1.6 要把开始流程拆成三层——主菜单（选择模式）、无尽选图（选择战区）、开场演出（进入仪式）——同时给剧情模式留入口。这需要新的模块边界、新的层级约定和“输入锁”概念，因此记录为 ADR。

## 决策

1. **DOM 负责结构，Canvas 负责画面**。菜单的导航、卡片、文字、弹窗全部是原生 `<button>` + DOM 文本；只有背景场景（城市剪影/雨/余烬）、地图缩略图、监视画面用 Canvas。地图名用 DOM 而不是 canvas 文本，避免中文糊、也保留可访问性。
2. **四个互不反向依赖的新模块**：`src/data/menu.js`（纯数据）、`src/view/menuScene.js`（纯绘制，可读 `ZG.MapLayer`）、`src/view/menu.js`（菜单 DOM/页面/键盘/弹窗）、`src/view/intro.js`（时间轴 + 裂纹几何 + 标题层）。`MenuScene` 不引用 `Menu`，`Menu` 不引用 `Intro`，`Intro` 不引用 `Menu`；编排只在 `main.js`。四个模块顶层都不碰 `document`/`window`/`localStorage`，否则 `tests/load-sim.js` 在 Node 里加载即失败。
3. **建局放在黑场（1.90s）**。`Intro.play()` 通过 `onBuild` 回调在完全黑屏时创建新 state 并隐藏菜单；曝光阶段只做输入解锁（`onDone`）。这样玩家永远看不到“菜单残影”或“旧战场闪一下”，建局与视觉切换解耦。
4. **输入锁双标志**。`state.ui.showMenu` 管“菜单正在挡住游戏”，`state.ui.inputLocked` 管“过场正在播放”。`input.js` 统一用 `gameplayBlocked(s) = !s || s.ui.showMenu || s.ui.inputLocked` 拦截 pointer/keydown；`Tab` 只在 `!blocked` 时才 `preventDefault`，菜单内 Tab 保持浏览器原生焦点顺序。两标志分离，跳过/重开/回菜单不会互相污染。
5. **层级表一次定死**（菜单与弹窗必须是 `#hud` 的直接子元素，否则父级 stacking context 会把 z 60 压进 z 50 的子树）：

   | 层 | z-index | 元素 | 父级 |
   |---|---|---|---|
   | 游戏背景 | 1 | `#game-bg` | `#stage` |
   | 游戏动态 | 2 | `#game` | `#stage` |
   | HUD | 3 | `#hud` | `#stage` |
   | 结算/失败 | 40 | `.overlay.settlement` / `.overlay.gameover` | `#hud` |
   | 菜单 | 50 | `.menu-root` | `#hud` |
   | 弹窗 | 60 | `.overlay.modal`、`.menu-modal` | `#hud` |
   | Toast | 70 | `.toast-stack` | `#hud` |
   | Tooltip | 80 | `.tooltip` | `#hud` |
   | 开场 | 90 | `.intro-root` | `#hud` |

   `#hud` 保持 `pointer-events: none`；`.menu-root`/`.intro-root`/`.menu-modal`/`.overlay` 自己设 `pointer-events: auto`；`.menu-scene` 设 `pointer-events: none`，否则全屏画布会吞掉导航点击。
6. **跳过语义是“切到 0.55s 短版”，不是“跳到 3.35s”**。0.35s 前忽略；`reveal`/`settle` 阶段直接完成；否则重置为 `skip` 时间轴并从当前时刻继续播。这样验收标准（跳过 ≤ 0.6s）成立，也避免“跳过之后还要等 0.85s”。
7. **不各自起 RAF**。`Menu` 与 `Intro` 只暴露 `tick(nowMs)`，由 `main.loop` 驱动；菜单隐藏或过场冻结时停止绘制。全屏场景 canvas 的 DPR 上限：桌面 1.5、移动 1.25；缩略图/监视画面因为是小区块可取 2。
8. **响应式由 JS 算断点**。`Menu.menuLayout(w, h, coarse)` 返回 `{mode, showFeed, cardFlow}` 并写到 `root.dataset.layout`，CSS 只认 `data-layout`（外加 `prefers-reduced-motion`）。断点因此可单测，不靠媒体查询猜。
9. **记录只增不减**。`Platform.saveBest/saveLast` 都是 `max(旧值, 新值)`；选图页显示“最佳 N 回合 / 上次抵达 N 回合”，`0` 显示 `—`。

## 后果

- **正面**：开始流程有明确层级与仪式感；旧 bug（死按钮、层级错乱、键盘穿透）一次性修掉；剧情模式有稳定入口，后续加章节不需要推翻主菜单；菜单/过场与模拟层完全解耦，`State.hash` 与确定性不受影响。
- **代价**：新增 4 个模块 + `menu.css`，开始流程的代码量明显增加；`hud.js` 需要删除旧菜单代码并重排渲染顺序；`input.js` 所有入口都要先过 `gameplayBlocked`；开场每个变体（full/skip/quick/reduced/off）都要各自验收。
- **确定性**：菜单与过场不调用 `state.rng`，裂纹/城市剪影用固定种子 LCG，不用 `Math.random()`；因此同种子回放与 `hash` 不变。

## 备选与取舍

| 方案 | 拒绝原因 |
|---|---|
| 继续用 `HUD.buildMenu()` 每帧渲染 DOM | 与 HUD 渲染节奏耦合，无法做页面过渡/焦点管理，旧 bug 会继续存在 |
| 菜单整个画在 Canvas 上 | 中文标题糊、无原生焦点、读屏不可用 |
| 过场用 CSS 动画 + 预生成图片 | 违背零外部素材；裂纹无法按屏幕尺寸重算 |
| 点击地图后先弹二次确认再开始 | 多一次点击；误触由 400ms 防抖兜底 |
| 过场跳过后回退到菜单 | 违反“已点地图 = 已确认”，且会让输入锁状态变复杂 |
| 菜单挂在 `#stage` 外层 | 父级 z-index 形成 stacking context，弹窗无法压过菜单 |
