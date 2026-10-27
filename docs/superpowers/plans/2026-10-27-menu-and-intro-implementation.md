# 开始界面 · 无尽选图 · 开场演出 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> 本文件把 `docs/superpowers/plans/2026-10-27-menu-and-intro-overhaul.md`（下称“设计稿”）转成可执行的工程方案：文件、签名、DOM/CSS 结构、测试断言、提交顺序。设计稿负责“长什么样、为什么”，本文件负责“写哪些文件、函数叫什么、测试断言是什么”。

**Goal:** 把“标题 + 三张卡”的开始页换成“主菜单 → 无尽选图 → 4.2s 开场 → 整备”的完整流程，同时修掉死按钮、层级错乱、键盘穿透三个旧 bug。

**Architecture:** 新增四个互不反向依赖的模块：`menuScene.js`（纯 Canvas 绘制）、`menu.js`（菜单 DOM/页面/键盘）、`intro.js`（时间轴 + Canvas 裂纹 + DOM 标题）、`data/menu.js`（纯数据）。`main.js` 只做编排：选图 → 冻结菜单 → 播放过场 → 黑场建局 → 曝光解锁。菜单与过场都挂在 `#hud` 内，靠统一 z-index 表分层；`state.ui.showMenu` 管菜单，`state.ui.inputLocked` 管过场，`input.js` 用 `gameplayBlocked()` 统一拦截。

**Tech Stack:** 原生 HTML/CSS/JS（IIFE + `ZG` 全局命名空间）、Canvas 2D、Web Audio、Node `node:test`、无构建、无依赖。

**Spec:** `docs/superpowers/plans/2026-10-27-menu-and-intro-overhaul.md`

---

## 0. 决策锁定

设计稿第 14 节留了 4 个选择，这里按推荐值全部锁定；另外补 6 个工程决策，执行时不再讨论。

| # | 决策 | 取值 | 理由 |
|---|---|---|---|
| 1 | 开场频率 | 从选图进入播 `full`（4.2s，可跳）；重开播 `quick`（1.0s） | 设计稿推荐；重开已看过一次 |
| 2 | 地图点击 | 点卡即进入，无二次确认 | 少一次点击；误触由 400ms 防抖兜底 |
| 3 | 剧情模式 | 只做“封存档案”占位弹窗 | 不引入关卡/对话/目标数据 |
| 4 | v1.5 | 先合并 `feat/v1.5-map-fx`，再拉 `feat/v1.6-menu-intro`；版本 v1.6.0 | 缩略图直接复用 `ZG.MapLayer.drawMinimap`；主分支线性 |
| 5 | 模块驱动 | `Menu`/`Intro` 不各自起 RAF，只暴露 `tick(nowMs)`，由 `main.loop` 驱动 | 避免第二/第三条 RAF；隐藏即停 |
| 6 | 过场 canvas | 只画裂纹/碎片/黑幕；地图名、跳过按钮、进度线用 DOM | 中文清晰；可访问性 |
| 7 | 跳过语义 | 0.35s 后按 Esc/Space/Enter/点击 → **切换到 0.55s 的 `skip` 时间轴**，不是跳到 3.35s | 设计稿第 6.3 节“跳到 3.35s”会剩 0.85s，违反“≤0.6s”验收；以变体表 + 验收标准为准 |
| 8 | 楼层归属 | `.menu-root` 与 `.menu-modal` 都是 `#hud` 的直接子元素；`intro-root` 也是 | 父级 z-index 会形成 stacking context，不能把 60 层塞进 50 层的子树 |
| 9 | 响应式 | `Menu.menuLayout(w,h,coarse)` 算断点并写 `root.dataset.layout`，CSS 只认 `data-layout`（`prefers-reduced-motion` 除外） | 断点可单测，不靠 CSS 媒体查询猜 |
| 10 | 视觉稿 | CSS/结构直接以 `docs/design/menu-mockup.html` 的 `<style>` 与标记为蓝本，只做作用域化与类名适配 | 设计稿已有 1440 基准样式，避免重画一套数值 |

**任务与设计稿编号映射**（设计稿 Task 6 与 Task 8 在本计划合并为 Task 8，避免中间提交“开始页不可用”）：

| 本计划 | 设计稿 |
|---|---|
| Task 0–5 | Task 0–5 |
| Task 6 | Task 9（剧情弹窗） |
| Task 7 | Task 7（开场演出） |
| Task 8 | Task 6 + Task 8（HUD/Input 重构 + 主流程接线） |
| Task 9 | Task 10（响应式/可访问性） |
| Task 10 | Task 11（发布） |

---

## 1. 全局约束（每个任务都隐含遵守）

- **零依赖、零构建**：不新增 npm 依赖、打包器、ES module、`import`/`export`；所有文件用 IIFE 挂到 `ZG`。
- **`file://` 可玩**：不得靠 `fetch`/Service Worker 加载代码；双击 `index.html` 必须能进主菜单。
- **加载顺序唯一真相**：新脚本只加到 `index.html`，并同步 `sw.js` 的 `SHELL`；`tests/load-sim.js` 会按 HTML 顺序在 Node 里执行除 `main.js`/`test-hooks.js` 外的所有脚本。
- **顶层不碰 DOM**：`src/data/menu.js`、`src/view/menuScene.js`、`src/view/menu.js`、`src/view/intro.js` 在模块顶层不得访问 `document`、`window`、`localStorage`、`matchMedia`；这些只能出现在 `init()`/`play()`/`resize()`/`tick()` 内。否则 231 项 Node 测试全红。
- **分层**：`src/core` ← `src/data` ← `src/sim` ← `src/view`/`src/main.js`。`data/menu.js` 不引用 view；`menuScene.js` 不引用 `menu.js`；`menu.js` 不引用 `intro.js`；`intro.js` 不引用 `menu.js`。编排只在 `main.js`。
- **确定性**：模拟层与 `state.rng` 完全不动；菜单/过场不得调用 `state.rng`。裂纹、城市剪影、雨、余烬用固定种子 LCG，不用 `Math.random()`。
- **版本号三处一致**：`package.json`、`ZG.Const.VERSION`、`sw.js` 的 `CACHE`，发布时统一为 `1.6.0`/`v1.6.0`/`zd-v1.6.0`。
- **文案**：所有玩家可见文字为简体中文（英文代号除外）；不出现“预约/购买/登录”。
- **可访问性**：所有可点项是原生 `<button>`；`focus-visible` 可见；触控目标 ≥ 44px；颜色之外有文字/形状；`prefers-reduced-motion` 降级。
- **性能**：菜单场景 ≤ 2ms/帧（1440×900）；菜单隐藏或过场冻结时停止场景绘制；开场无 >50ms 长帧；移动端碎片 18、血点 6、关闭震屏。
- **每个任务结束**：`npm test` 全绿；涉及浏览器可见改动的任务按该任务的浏览器走查项验证后再提交。

---

## 2. Review Focus（设计稿没写、但最容易被真实用户撞到的五件事）

1. **无网络 / `file://` 首启**：主菜单必须只靠本地脚本渲染，没有任何请求；缩略图缺少 `ZG.MapLayer` 时回退路径也要能画。归属：Task 3 的 `drawThumb` 回退测试 + Task 10 的 `file://` 手测。
2. **过场/菜单中改窗口尺寸或转屏**：裂纹必须在新的 `w×h` 内重新生成且不出界；菜单不能出现横向滚动条或卡片压底。归属：Task 7 的多尺寸 `crackPaths` 测试 + Task 9 的截图矩阵。
3. **输入锁卡死**：跳过、重开、返回选图、再次开图之后，Space/1/2/3/T/H/Esc 必须恢复；不能出现“能看不能操作”。归属：Task 8 的 `gameplayBlocked` 手测清单 + Task 8 的 skip/restart 流程走查。
4. **从菜单打开图鉴/设置**：弹窗必须在菜单之上，Esc 只关弹窗、不误触菜单导航；菜单内 Tab 走原生焦点、不再被游戏劫持。归属：Task 8 的层级/Esc 手测 + Task 9 的键盘全程走查。
5. **连点/双击地图卡、连点重开**：只允许建一局；不能重复 `subscribe`、不能在一次过场上叠两次 `play`。归属：Task 5 的 `acceptsSelect` 单测 + Task 8 的连点手测。

---

## 3. 文件结构与模块契约

### 3.1 文件清单

| 文件 | 责任 | 层级 |
|---|---|---|
| `src/data/menu.js` | 模式/动作、地图简报、剧情占位、菜单与过场文案；纯数据 | data |
| `src/view/menuScene.js` | `ZG.MenuScene`：背景场景、缩略图、监视画面；只读 `ZG.Data`，可选 `ZG.MapLayer` | view |
| `src/view/menu.js` | `ZG.Menu`：DOM、页面切换、导航/键盘/焦点、卡片、简报、剧情弹窗、记录刷新 | view |
| `src/view/intro.js` | `ZG.Intro`：时间轴、裂纹几何、黑幕、曝光、跳过、音效触发 | view |
| `menu.css` | 菜单 + 开场 + HUD 入场的全部样式；token 与 `styles.css` 同色系 | 样式 |
| `tests/menu.test.js` | 数据、记录、布局/卡片纯函数、场景 stub 绘制 | test |
| `tests/intro.test.js` | 时间轴、变体优先级、跳过判定、裂纹几何、复制文案、音效名 | test |
| `docs/architectural-decisions/0003-menu-and-intro.md` | 架构裁决 | docs |

修改：`index.html`、`sw.js`、`styles.css`、`src/view/hud.js`、`src/view/input.js`、`src/main.js`、`src/core/state.js`、`src/core/platform.js`、`src/view/audio.js`、`src/core/constants.js`、`package.json`、`tests/shell.test.js`、`tests/smoke.test.js`、`docs/game-plan.md`、`docs/tech.md`、`docs/STATE.md`、`qa/checklist.md`、`README.md`。

### 3.2 `ZG.Data.menu`（唯一形状）

```js
ZG.Data.menu = {
  topBadge: { zone: 'QUARANTINE ZONE 07', signal: 'SIGNAL LOST', clock: '03:47:12', temp: '17°C' },
  hero: { title: '尸潮防线', en: 'ZOMBIE DEFENSE', tagline: '最后一道防线，由你决定它倒下的方式。' },
  feed: { title: '战区监视', en: 'SECTOR FEED', cam: 'CAM-03', mode: 'THERMAL', uplink: 93 },
  modes: [
    { id: 'endless', name: '无尽模式', en: 'ENDLESS DEFENSE', sub: '3 个作战区域', badge: '3 MAPS', available: true },
    { id: 'story', name: '剧情模式', en: 'STORY MODE', sub: 'CHAPTER 00', badge: 'LOCKED', available: false, soon: '即将开放' }
  ],
  actions: [
    { id: 'codex', name: '战地图鉴', en: 'CODEX', sub: '单位 / 威胁 / 操作', badge: 'ARCHIVE', action: 'help' },
    { id: 'settings', name: '系统设置', en: 'SETTINGS', sub: '音效 / 画面 / 存档', badge: 'CONFIG', action: 'settings' }
  ],
  mapBriefs: {
    suburban: {
      codename: 'SUBURBAN HIGHWAY', tags: ['开阔', '四向', '教学'],
      loadout: '2 手枪兵 · 1 盾兵 · 1 机枪兵',
      note: '先占住公路中线，盾兵朝向来袭方向。',
      tip: '开阔地形，优先拉开射界；不要堆在一个角落。',
      mix: [62, 22, 16], hostiles: '四面来袭'
    },
    hospital: {
      codename: 'HOSPITAL PLAZA', tags: ['感染', '广场', '中距'],
      loadout: '2 手枪兵 · 1 霰弹兵 · 1 治疗兵',
      note: '治疗兵放在消毒池边缘，优先点感染单位。',
      tip: '掩体少，用建筑制造拐角，别让喷火兵贴脸。',
      mix: [48, 18, 34], hostiles: '四面来袭'
    },
    subway: {
      codename: 'SUBWAY PLATFORM', tags: ['狭窄', '双通道', '高危'],
      loadout: '1 盾兵 · 2 喷火兵（第 2 回合补导弹兵）',
      note: '盾兵堵北通道，喷火覆盖南通道，导弹兵留到第 2 回合处理巨人。',
      tip: '窄口是优势也是陷阱，两只盾兵不要叠在同一格。',
      mix: [35, 15, 50], hostiles: '2 通道 · 西侧'
    }
  },
  copy: {
    selectBack: '← 返回主菜单', selectCrumb: '无尽模式 / 选择战场',
    selectTitle: '选择战场', selectSub: '三条防线。三份遗书。选择你的死法。',
    selectFootLeft: '所有战区已解锁 · 记录自动保存',
    selectFootRight: '选择后播放开场 · 可跳过',
    keys: '↑↓ 选择　ENTER 确认　ESC 返回',
    skip: '跳过 ▸', enter: '进入 →'
  },
  story: {
    id: 'story', title: '剧情模式', chapterTitle: '序章：撤离命令',
    blurb: '指挥链已经断了。你是最后一支还能收到命令的小队。',
    chapters: [
      { id: 'ch01', name: '撤离命令', mapId: 'suburban', locked: true },
      { id: 'ch02', name: '隔离区', mapId: 'hospital', locked: true },
      { id: 'ch03', name: '巢穴', mapId: 'subway', locked: true }
    ]
  }
};
```

约束：`mapBriefs[id].mix` 三项之和恒为 100（测试兜底）；文案只描述倾向，不参与公式；地铁文案按 v1.5 的“双通道、只从西侧出怪”写。

### 3.3 `ZG.Menu`

```js
ZG.Menu = {
  init(callbacks),          // callbacks: { onSelectMap, onHelp, onSettings, onShare, onInstall, onFullscreen, isOverlayOpen, isBusy }
  show(page),               // 'main' | 'maps'
  hide(),
  page(),                   // 'main' | 'maps' | 'hidden'
  isVisible(),
  freeze(),                 // 过场开始：停场景、禁指针/键盘、保留最后一帧
  unfreeze(),
  resize(),                 // 读 #stage 尺寸，重设 canvas/缩略图，写 root.dataset.layout
  tick(nowMs),
  refreshRecords(),         // 读 Platform.loadAllBest/loadAllLast，刷新监视、卡片、简报
  refreshInstall(),         // 读 ZG.__installPrompt 显隐“安装”
  // 纯函数（测试用，不碰 DOM）
  menuLayout(w, h, coarse), // => { mode:'wide'|'compact'|'mid'|'narrow'|'short', showFeed, cardFlow:'grid'|'snap' }
  navItems(),               // => [{ id, index:'01', name, en, sub, badge, locked, action }] × 4
  mapCardModel(mapId, best, last), // => { id, code:'AO-01', name, codename, tags, desc, stars, bestText, lastText, ariaLabel }
  acceptsSelect(nowMs, lastMs, busy) // 400ms 防抖 + busy（main 传 Intro.active）
};
```

`Menu.init` 负责创建：`.menu-root`（z 50，含 scene canvas、`.fx` 叠层、两个 `.menu-page`、`.menu-feed`、`.menu-bottom`）+ `.menu-modal`（z 60，剧情弹窗）。**不覆盖** `#hud` 的其它子元素，也不改 `#hud.innerHTML`。

页面状态机：`main → maps → (选图) hidden`；`Esc` 从 maps 回 main；任何 `show()` 都 `frozen=false`。`hide()` 把页面切到 `hidden`、移除焦点、关闭弹窗。

### 3.4 `ZG.MenuScene`

```js
ZG.MenuScene = {
  draw(ctx, w, h, nowMs, opts),        // opts: { reduced }
  drawFeed(ctx, map, w, h, nowMs, opts),
  drawThumb(ctx, map, w, h),           // 有 ZG.MapLayer + ZG.MapZone 时用 drawMinimap，再叠网格/扫描/暗角
  drawFallbackThumb(ctx, map, w, h)
};
```

绘制约束：只用 `fillRect/beginPath/arc/moveTo/lineTo/stroke/fill/createLinearGradient/createRadialGradient/save/restore/translate/scale/globalAlpha`；**不用** `ctx.filter`、`ctx.roundRect`、`ctx.createPattern`（`tests/stub-ctx.js` 不实现，旧 Safari 也不稳）。场景装饰数组按 `${w}x${h}` 缓存在模块内，不每帧新建。固定种子 `LCG(0x5EED)`。

### 3.5 `ZG.Intro`

```js
ZG.Intro = {
  play(mapId, opts),   // opts: { variant:'full'|'quick', settings, onBuild, onDone }
  tick(nowMs),
  skip(),
  resize(),
  active(),
  // 纯函数
  timeline(variant, reduced),                  // => { total, phases:[{id,start,end}], buildAt, skipAfter, cues:[{at,name}] }
  crackPaths(seed, w, h),                      // => [{ pts:[{x,y}], width, branches:[{pts,width}] }]
  variantFor(requested, settings, reduced),    // => 'full'|'quick'|'reduced'|'off'
  skipDecision(elapsedMs, phaseId, variant),   // => 'ignore'|'shorten'|'finish'
  copyFor(mapId)                               // => { sector, name, en, stars, threatText, desc }
};
```

`play()` 的 `onBuild` 只在“尚未建局”时调用一次；`onDone` 只在结束时调用一次。`Intro` 不调用 `Menu`，只通过回调解耦；震屏通过给 `#stage` 加 `.intro-shake` 类实现（120ms 后自己移除），HUD 入场通过给 `#hud` 加 `.intro-reveal` 类实现（结束移除）。

### 3.6 时间轴（唯一数值表）

`timeline(variant, reduced)`；`reduced=true` 时除 `off` 外一律返回 `reduced` 表。

| variant | phases（id, start, end，ms） | total | buildAt | skipAfter |
|---|---|---|---|---|
| full | windup 0–250, impact 250–350, spread 350–1300, blackout 1300–1950, hold 1950–2300, title 2300–3100, hold2 3100–3350, reveal 3350–4050, settle 4050–4200 | 4200 | 1900 | 350 |
| skip | blackout 0–80, title 80–330, reveal 330–550 | 550 | 0 | ∞ |
| quick | blackout 0–150, title 150–600, reveal 600–1000 | 1000 | 0 | ∞ |
| reduced | blackout 0–200, title 200–1000, reveal 1000–1400 | 1400 | 0 | 350 |
| off | reveal 0–250 | 250 | 0 | ∞ |

音效 cues：

- full：`[{0,'impact'},{250,'glass'},{350,'bite'},{1950,'heartbeat'},{2300,'stinger'},{3350,'reveal'},{3350,'whoosh'}]`
- skip：`[{0,'impact'},{80,'glass'},{330,'reveal'}]`
- quick：`[{0,'impact'},{600,'reveal'}]`
- reduced：`[{0,'impact'},{200,'reveal'}]`
- off：`[]`

`skipDecision`：`variant` 不是 `full`/`reduced` → `'finish'`；`elapsed < 350` → `'ignore'`；`phaseId` 是 `reveal`/`settle` → `'finish'`；否则 `'shorten'`。

`variantFor`：`reduced` 优先 → `'reduced'`；`settings.intro === false` → `'off'`；`requested === 'quick'` → `'quick'`；否则 `'full'`。

### 3.7 其他新增契约

**`src/core/platform.js`**

```js
saveLast(mapId, round)   // 写 'zd_last_<id>'，只增不减，返回是否写入
loadLast(mapId)          // 异常/缺省返回 0
loadAllLast()            // 按 ZG.Data.mapOrder 返回 { [id]: number }
```

**`src/core/state.js`**：`ui.showMenu: false`、`ui.inputLocked: false`；`settings.intro: true`。不新增模拟字段，`snapshot()`/`hash()` 不变。

**`src/main.js` 新增内部函数**（不导出，`ZG.Game` 保持现有形状）：

```js
function createRun(mapId)        // 只建 state、教程初值、hideTip；showMenu/inputLocked 由调用方定
function selectMap(mapId)        // 冻结菜单 → Intro.play(full) → onBuild=createRun+Menu.hide → onDone=解锁
function restartGame()           // createRun(同图) → Intro.play(quick, 无 onBuild) → onDone=解锁
function openMenu(page)          // showMenu=true、inputLocked=true、Menu.show(page)、refreshRecords、hideTip
```

**`src/view/audio.js`**：`NAMES` 增加 `glass`、`bite`、`impact`、`stinger`、`heartbeat`、`reveal`、`whoosh`；`play()` 内新增同名分支，全部复用 `noise`/`sweep`/`tone`，只在时间轴 cue 上触发。

### 3.8 层级与 DOM 归属（一次定死）

| 层 | z-index | 元素 | 父级 |
|---|---|---|---|
| 游戏背景 | 1 | `#game-bg` | `#stage` |
| 游戏动态 | 2 | `#game` | `#stage` |
| HUD | 3 | `#hud` | `#stage` |
| 结算/失败 | 40 | `.overlay.settlement` / `.overlay.gameover` | `#hud` |
| 菜单 | 50 | `.menu-root` | `#hud` |
| 弹窗 | 60 | `.overlay.modal`（图鉴/设置）、`.menu-modal`（剧情） | `#hud` |
| Toast | 70 | `.toast-stack` | `#hud` |
| Tooltip | 80 | `.tooltip` | `#hud` |
| 开场 | 90 | `.intro-root` | `#hud` |

关键写法：

- `#hud { pointer-events: none }` 保留；`.menu-root`、`.intro-root`、`.menu-modal`、`.overlay` 自己 `pointer-events: auto`。
- `.menu-scene { pointer-events: none }`，否则全屏 canvas 吞掉导航点击；`.menu-page` 内容层正常接收。
- 菜单与弹窗必须是 `#hud` 直接子元素（见决策 8），不要挂到 `#stage`。
- `styles.css`：`.overlay` 的 40 保留；新增 `.overlay.modal { z-index: 60 }`；删除 `.menu`/`.menu-box`/`.game-title`/`.game-sub`/`.menu-how`/`.map-grid`/`.map-card`/`.map-name`/`.map-stars`/`.map-desc`/`.map-best`/`.menu-actions` 整段（约 394–452 行）与 `.version`；`#hud button, #hud .unit-card, #hud .map-card ...` 选择器里的 `.map-card` 删掉。
- HUD 入场：`#hud.intro-reveal .hud-top{animation:...}`、`.hud-bottom`、`.hud-tabs`、启动按钮按 80ms 错峰；动画结束由 `Intro` 移除类，避免影响战斗动画。
- 教程：`showTut = tutorialStep >= 0 && !ui.showMenu && !ui.inputLocked && status === 'prep'`。

---

## 4. 任务

### Task 0：基线、合并 v1.5、拉分支

**Files:** 无代码改动（只读/分支）

**Interfaces:**
- Consumes: 无
- Produces: 干净的 `feat/v1.6-menu-intro` 分支；`docs/design/` 与两份计划进入版本库；基线数字写进 `docs/STATE.md` 草稿。

- [ ] **Step 1: 确认工作区状态**

```powershell
cd 'games\zombie-defense'
git status --short
git log --oneline -3
```

期望：只有 `docs/design/`、两份 2026-10-27 计划是未跟踪文件；没有已修改的源码。

- [ ] **Step 2: 记录基线**

```powershell
npm test
node tests/bench.js
node tests/bot.js --rounds 42 --seed 1
```

记录：测试数（应为 231）、`avgStepMs`/`maxStepMs`、bot 回合/BOSS/击杀。若 v1.5 已合并，则以 v1.5 的 267 项为基线。

- [ ] **Step 3: 合并 v1.5**

```powershell
git switch main
git merge --no-ff feat/v1.5-map-fx -m "merge: v1.5 map detail, subway arena and fx"
npm test
```

说明：`feat/v1.5-map-fx` 被 `.agents/worktrees/feat/v1.5-map-fx` 占用，**不要** `git switch` 到它，直接按 ref 合并；合并前先在该 worktree 里 `git status`，若有未提交改动，先 review 并提交到 v1.5 分支再回来合并。期望 267 项全绿。若冲突，只允许在 `docs/STATE.md`、`sw.js`、`tests/shell.test.js` 这类收尾文件上按“保留 v1.5 内容 + 版本号”解决；`src/**` 冲突说明分支不是从当前 main 拉的，停下来报告。

- [ ] **Step 4: 拉 v1.6 分支并把设计资产入库**

```powershell
git switch -c feat/v1.6-menu-intro
git add docs/design docs/superpowers/plans/2026-10-27-menu-and-intro-overhaul.md docs/superpowers/plans/2026-10-27-menu-and-intro-implementation.md
git commit -m "docs(v1.6): add menu and intro design assets and plans"
```

**Acceptance:** 分支就绪；`npm test` 全绿；`docs/STATE.md` 的“验证记录”里有基线草稿；`git status` 干净。

---

### Task 1：先写文档真相与 ADR

**Files:**
- Modify: `docs/game-plan.md` §1.4 / §2.2 / §8.5 / §11 / §13（按实际章节号；若 v1.5 已改动，按内容定位）
- Create: `docs/architectural-decisions/0003-menu-and-intro.md`

**Interfaces:**
- Consumes: Task 0 的分支
- Produces: 后续任务可引用的 ADR 编号与文档口径；不再出现“选图页只有三张卡”“剧情模式不在范围”的旧描述。

- [ ] **Step 1: 改 `docs/game-plan.md`**

- §1.4 非目标改为：“剧情战役/关卡叙事仍不在本次范围；开场演出与主菜单骨架本次加入。”
- §2.2 阶段表增加三行：`主菜单`（进入游戏前）、`选图`（无尽模式 → 三张战区）、`开场演出`（最多 4.2s，可跳过；黑场建局）。
- §8.5 改写为“主菜单 → 无尽模式 → 选图 → 开场 → 整备”；保留三图全解锁、记录规则；写明“上次抵达”只增不减。
- §11 增加菜单/过场视觉与音效表：标题 78px/字距 .12em、地图名 `clamp(34px,7.2vw,86px)`、威胁星级 + 数字、开场音效名。
- §13 把“剧情模式”从“非目标”移到“后续版本”。

- [ ] **Step 2: 写 ADR-0003**

固定条目：为什么用 DOM 菜单 + Canvas 场景/裂纹；为什么建局放在黑场 1.90s；层级表（复制 3.8）；输入锁双标志（`showMenu` / `inputLocked`）；跳过语义（决策 7）；`Menu`/`Intro` 不互相依赖。格式照 `0002-free-placement-and-squads.md`。

- [ ] **Step 3: 提交**

```powershell
git add docs/game-plan.md docs/architectural-decisions/0003-menu-and-intro.md
git commit -m "docs(v1.6): document menu and intro architecture"
```

**Acceptance:** 文档与第 3 节契约一致；ADR 能让没参与讨论的代理直接照做。

---

### Task 2：菜单数据、状态字段与记录存储

**Files:**
- Create: `src/data/menu.js`
- Modify: `src/core/state.js`（`ui` 46–54 行附近、`settings` 55–58 行）、`src/core/platform.js`（`loadAllBest` 之后）、`src/main.js`（`ROUND_SETTLED`/`GAME_OVER` 订阅）、`index.html`、`sw.js`
- Test: `tests/menu.test.js`

**Interfaces:**
- Consumes: `ZG.Data.mapOrder`、`ZG.Const`
- Produces: `ZG.Data.menu`（3.2 形状）、`Platform.saveLast/loadLast/loadAllLast`、`state.ui.showMenu/inputLocked`、`state.settings.intro`

- [ ] **Step 1: 写失败测试**

```js
// tests/menu.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const ZG = require('./load-sim.js')();

function memStorage() {
  const m = {};
  return {
    getItem: k => (Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
    removeItem: k => { delete m[k]; }
  };
}

test('模式顺序与可用性', () => {
  assert.deepEqual(ZG.Data.menu.modes.map(m => m.id), ['endless', 'story']);
  assert.equal(ZG.Data.menu.modes[0].available, true);
  assert.equal(ZG.Data.menu.modes[1].available, false);
});

test('三张地图都有简报，且构成合计 100', () => {
  for (const id of ZG.Data.mapOrder) {
    const b = ZG.Data.menu.mapBriefs[id];
    assert.ok(b, id);
    assert.equal(b.mix.length, 3);
    assert.equal(b.mix.reduce((a, v) => a + v, 0), 100, id);
    assert.ok(b.loadout && b.note && b.tip && b.codename, id);
  }
});

test('剧情占位三章都锁定', () => {
  const s = ZG.Data.menu.story;
  assert.equal(s.chapters.length, 3);
  assert.ok(s.chapters.every(c => c.locked));
});

test('last 记录只增不减', () => {
  const P = ZG.Platform.create({ storage: memStorage() });
  P.saveLast('suburban', 8);
  P.saveLast('suburban', 5);
  assert.equal(P.loadLast('suburban'), 8);
  assert.equal(P.loadAllLast().suburban, 8);
  assert.equal(P.loadLast('nope'), 0);
});

test('state 默认值不影响快照', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 42 });
  assert.equal(s.ui.showMenu, false);
  assert.equal(s.ui.inputLocked, false);
  assert.equal(s.settings.intro, true);
  const before = ZG.State.hash(s);
  s.ui.showMenu = true; s.ui.inputLocked = true; s.settings.intro = false;
  assert.equal(ZG.State.hash(s), before);
});
```

- [ ] **Step 2: 跑测试确认失败**

```powershell
node --test tests/menu.test.js
```

期望：`Cannot read properties of undefined (reading 'modes')` 或 `P.saveLast is not a function`。

- [ ] **Step 3: 实现**

- 新建 `src/data/menu.js`，IIFE 内 `ZG.Data = ZG.Data || {}; ZG.Data.menu = {...}`，内容照 3.2；不引用 DOM、不引用 view。
- `state.js`：在 `ui` 里加 `showMenu: false, inputLocked: false`；在 `settings` 里加 `intro: true`。
- `platform.js`：在 `api` 上实现 `saveLast/loadLast/loadAllLast`，模式照 `saveBest/loadBest/loadAllBest`。
- `main.js`：`ROUND_SETTLED` 里 `ZP.saveBest` 之后加 `ZG.Platform.saveLast(s.mapId, p.round)`；`GAME_OVER` 里 `saveBest` 之后加 `ZG.Platform.saveLast(s.mapId, s.round)`。
- **加载顺序**：`index.html` 在 `src/data/maps.js` 之后加 `<script src="src/data/menu.js"></script>`；`sw.js` 的 `SHELL` 同步加 `./src/data/menu.js`。不先加进 HTML，`tests/load-sim.js` 就看不到这个文件，测试必红。

- [ ] **Step 4: 跑测试**

```powershell
node --test tests/menu.test.js
npm test
```

期望：全绿（v1.5 基线 + 5 项）。

- [ ] **Step 5: 提交**

```powershell
git add src/data/menu.js src/core/state.js src/core/platform.js src/main.js tests/menu.test.js index.html sw.js
git commit -m "feat(v1.6): add menu data and last-round records"
```

**Acceptance:** 数据层无 DOM；`State.hash` 在 ui/settings 变化前后一致；`npm test` 全绿。

---

### Task 3：`MenuScene` 背景、缩略图与监视画面

**Files:**
- Create: `src/view/menuScene.js`
- Create（若 v1.5 已有则跳过）: `tests/stub-ctx.js`
- Modify: `tests/menu.test.js`（追加场景测试）、`index.html`、`sw.js`

**Interfaces:**
- Consumes: `ZG.Data.maps`、`ZG.Const.W/H`、可选 `ZG.MapLayer.drawMinimap` + `ZG.MapZone`
- Produces: `ZG.MenuScene.draw/drawFeed/drawThumb/drawFallbackThumb`（3.4）

- [ ] **Step 1: 确保 stub ctx 存在**

```js
// tests/stub-ctx.js（v1.5 已存在时不要重写）
module.exports.stubCtx = function () {
  const calls = { fillRect: 0, stroke: 0, fill: 0, arc: 0, fillText: 0, strokeRect: 0 };
  const grad = { addColorStop() {} };
  return {
    calls, globalAlpha: 1, globalCompositeOperation: 'source-over',
    fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '', textBaseline: '',
    canvas: { width: 1280, height: 720 },
    save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, beginPath() {},
    closePath() {}, moveTo() {}, lineTo() {}, arc() { calls.arc++; }, ellipse() {},
    rect() {}, fill() { calls.fill++; }, stroke() { calls.stroke++; },
    fillRect() { calls.fillRect++; }, strokeRect() { calls.strokeRect++; },
    setLineDash() {}, fillText() { calls.fillText++; }, clearRect() {},
    createRadialGradient: () => grad, createLinearGradient: () => grad,
    measureText: () => ({ width: 10 })
  };
};
```

- [ ] **Step 2: 追加失败测试**

```js
const { stubCtx } = require('./stub-ctx.js');

test('三张地图缩略图都能画', () => {
  for (const id of ZG.Data.mapOrder) {
    const ctx = stubCtx();
    ZG.MenuScene.drawThumb(ctx, ZG.Data.maps[id], 384, 216);
    assert.ok(ctx.calls.fillRect + ctx.calls.arc + ctx.calls.stroke > 8, id);
  }
});

test('背景场景与监视画面不抛错', () => {
  const ctx = stubCtx();
  ZG.MenuScene.draw(ctx, 1440, 900, 0, { reduced: false });
  ZG.MenuScene.draw(ctx, 1440, 900, 1000, { reduced: true });
  ZG.MenuScene.drawFeed(ctx, ZG.Data.maps.subway, 376, 212, 0);
  assert.ok(ctx.calls.fillRect > 10);
});

test('缩略图优先 MapLayer，缺失时回退', () => {
  const savedLayer = ZG.MapLayer;
  const savedZone = ZG.MapZone;
  ZG.MapLayer = { drawMinimap: (ctx, map, w, h) => { ctx.fillRect(0, 0, w, h); } };
  ZG.MapZone = { has: () => false };
  const a = stubCtx();
  ZG.MenuScene.drawThumb(a, ZG.Data.maps.suburban, 384, 216);
  assert.ok(a.calls.fillRect > 1);
  delete ZG.MapLayer; delete ZG.MapZone;
  const b = stubCtx();
  ZG.MenuScene.drawThumb(b, ZG.Data.maps.hospital, 384, 216);
  assert.ok(b.calls.fillRect > 4);
  if (savedLayer) ZG.MapLayer = savedLayer;
  if (savedZone) ZG.MapZone = savedZone;
});
```

- [ ] **Step 3: 跑测试确认失败**

```powershell
node --test tests/menu.test.js
```

期望：`ZG.MenuScene is undefined`。

- [ ] **Step 4: 实现**

1. `styleOf(map)` 取 `map.theme`，`rgba(hex,a)` 小工具；模块级 `rgbaCache`。
2. `drawFallbackThumb`：`ctx.save()` → 按 `w/1280, h/720` 缩放 → `theme.ground` 铺底 → `theme.road` 画 `map.roads` → `map.terrain`/`map.obstacles` 画圆/矩形 → 四面入口红点（v1.4 无 `map.spawns` 时用四边中点）→ `restore()`；再叠 64px 网格（青色 7%）、每 6px 扫描线（白 1.8%）、底部渐变。所有坐标 clamp 到画布。
3. `drawThumb`：`if (ZG.MapLayer && ZG.MapZone && ZG.MapLayer.drawMinimap) try { drawMinimap(...) } catch { fallback } else fallback`，然后叠网格/扫描线/暗角。
4. `draw`：照 `docs/design/menu-mockup.html` 的 `drawScene`（约 600–780 行）移植：夜空三段渐变 → 远/近两层剪影（固定 seed，窗灯青/极少数红）→ 透视网格（地平线 70%，横线幂次加密）→ 三层雾带（sin 漂移）→ 95 条雨（900px/s，10%）→ 26 个余烬 → 5 个僵尸剪影 → 每 30s 扫描光。`opts.reduced` 时全部按 `t=0` 画一帧，不漂移。
5. `drawFeed`：`drawThumb` 铺底 → 移动扫描线 → 四角细线框 → 入口红色箭头（`map.spawns` 或四边中点）→ 不画任何文字。
6. 所有数组按尺寸缓存：`cacheKey = w + 'x' + h`；时间只影响位置。

- [ ] **Step 5: 接入加载顺序**

`index.html`：`<script src="src/view/menuScene.js"></script>` 放在 `audio.js` 之后、`hud.js` 之前（`data/menu.js` 已在 Task 2 加过）。`sw.js` 的 `SHELL` 同步加 `./src/view/menuScene.js`。

- [ ] **Step 6: 跑测试 + 浏览器抽查**

```powershell
node --test tests/menu.test.js
npm test
```

浏览器：在旧开始页控制台执行

```js
const c = document.createElement('canvas'); c.width = 384; c.height = 216;
ZG.MenuScene.drawThumb(c.getContext('2d'), ZG.Data.maps.subway, 384, 216);
document.body.appendChild(c);
```

截图确认三张缩略图布局差异肉眼可辨（地铁能看到两条通道 + 纵向大厅）；再对 `draw` 传 `{reduced:true}` 确认无漂移。

- [ ] **Step 7: 提交**

```powershell
git add src/view/menuScene.js tests/stub-ctx.js tests/menu.test.js index.html sw.js
git commit -m "feat(v1.6): add menu scene, thumbnails and sector feed renderer"
```

**Acceptance:** stub 测试通过；三张缩略图布局差异肉眼可辨；`draw` 在 reduced 下无漂移；加载顺序与 SW 同步。

---

### Task 4：主菜单 DOM、导航与场景驱动

**Files:**
- Create: `src/view/menu.js`、`menu.css`
- Modify: `index.html`（引入 `menu.css`、`menu.js`）、`sw.js`、`tests/menu.test.js`

**Interfaces:**
- Consumes: `ZG.Data.menu`、`ZG.MenuScene`、`ZG.Const.VERSION`、`ZG.Platform.loadAllBest/loadAllLast`、`ZG.Audio.play`
- Produces: `ZG.Menu.init/show/hide/page/isVisible/freeze/unfreeze/resize/tick/refreshRecords/refreshInstall` + 3 个纯函数（3.3）

- [ ] **Step 1: 写纯函数失败测试**

```js
test('导航项顺序与锁定态', () => {
  const nav = ZG.Menu.navItems();
  assert.deepEqual(nav.map(n => n.id), ['endless', 'story', 'codex', 'settings']);
  assert.deepEqual(nav.map(n => n.index), ['01', '02', '03', '04']);
  assert.equal(nav[1].locked, true);
  assert.equal(nav[2].action, 'help');
  assert.equal(nav[3].action, 'settings');
});

test('布局断点：宽屏显示监视，窄屏横滑', () => {
  assert.deepEqual(ZG.Menu.menuLayout(1440, 900, false),
    { mode: 'wide', showFeed: true, cardFlow: 'grid' });
  assert.deepEqual(ZG.Menu.menuLayout(1366, 768, false),
    { mode: 'compact', showFeed: true, cardFlow: 'grid' });
  assert.equal(ZG.Menu.menuLayout(1024, 768, false).mode, 'mid');
  assert.equal(ZG.Menu.menuLayout(1024, 768, false).showFeed, false);
  assert.equal(ZG.Menu.menuLayout(1024, 768, false).cardFlow, 'snap');
  assert.equal(ZG.Menu.menuLayout(390, 844, true).cardFlow, 'snap');
  assert.equal(ZG.Menu.menuLayout(844, 390, true).mode, 'short');
  assert.equal(ZG.Menu.menuLayout(700, 800, false).mode, 'narrow');
});

test('选卡防抖与过场互斥', () => {
  assert.equal(ZG.Menu.acceptsSelect(1000, 0, false), true);
  assert.equal(ZG.Menu.acceptsSelect(1200, 1000, false), false);
  assert.equal(ZG.Menu.acceptsSelect(1500, 1000, false), true);
  assert.equal(ZG.Menu.acceptsSelect(1500, 1000, true), false);
});
```

- [ ] **Step 2: 跑测试确认失败**

```powershell
node --test tests/menu.test.js
```

期望：`ZG.Menu is undefined`。

- [ ] **Step 3: 实现 `menu.js` 骨架**

- 模块状态：`{ root, modal, sceneCtx, sceneCanvas, feedCanvas, pages, navEls, cardEls, briefEls, cb, page: 'hidden', visible: false, frozen: false, w: 0, h: 0, reduced: false, sceneT0: null, feedIndex: 2, feedSwitchAt: 0, lastSelectAt: -1e9, teaserOpen: false }`（`feedIndex` 初值取 `mapOrder.length - 1`，首屏显示地铁站台，与设计稿一致）。不引用 `ZG.Intro`。
- `menuLayout(w,h,coarse)`：`h < 520 → 'short'`；否则 `w < 900 || coarse → 'narrow'`；否则 `w < 1100 → 'mid'`；否则 `h < 800 → 'compact'`；否则 `'wide'`。`showFeed = mode === 'wide' || mode === 'compact'`；`cardFlow = showFeed ? 'grid' : 'snap'`（900–1100 设计稿要求横滑）。
- `navItems()`：`modes[0]` → `01/endless`，`modes[1]` → `02/story`（`locked:true`），`actions` → `03/codex`、`04/settings`；每项 `{id,index,name,en,sub,badge,locked,action}`。
- `init(cb)`：只在这里 `document.createElement`（`M.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches`，包 try/catch）；按 `docs/design/menu-mockup.html` 的标记建：
  - `.menu-root[data-page="main"][data-layout="wide"]`，内含 `<canvas class="menu-scene">`、`.fx.vignette`、`.fx.scanlines`、`.fx.grain`；
  - `.menu-page.page-main`：`.corner-brand`、`.hero`（标题/英文/tagline/74px 红线）、`nav.nav`（4 个 `button.nav-item`）、`aside.feed`（canvas + 4 格遥测 + UPLINK）、`footer.menu-bottom`（左键位提示；右 分享/安装/全屏/版本）；
  - `.menu-page.page-maps`：返回、面包屑、标题、副标题、`.cards`、`.brief`（4 格）、`.maps-foot`；
  - `.menu-modal.teaser`（Task 6 填充内容，先建空壳）。
  - 所有文案来自 `ZG.Data.menu`，版本用 `'尸潮防线 ' + ZG.Const.VERSION`。
  - **`.menu-root` 与 `.menu-modal` 都直接 `appendChild` 到 `#hud`**（两个兄弟节点，不要互相嵌套），否则 z 60 会被 50 的 stacking context 吃掉。
  - `init` 末尾调 `refreshInstall()`（`ZG.__installPrompt` 可能已经存在）。
- `show(page)`：`root.classList.remove('hidden')`、`root.dataset.page = page`、`visible=true`、`frozen=false`、移除 `.frozen`；两个 page 容器切 `inert` + `aria-hidden`；`if (page === 'main') focus(navEls[0]) else focus(firstCard)`；`refreshRecords()`；`sceneT0 = null`；首帧前若 `w` 为 0 调 `resize()`。
- `hide()`：`root.classList.add('hidden')`、`visible=false`、`page='hidden'`、`frozen=false`、关闭 teaser、`document.activeElement.blur()`（仅当焦点在 root 内）。
- `freeze()`：`frozen=true`、`root.classList.add('frozen')`；`unfreeze()` 反向。
- `resize()`：读 `#stage.getBoundingClientRect()`；`root.dataset.layout = menuLayout(w, h, ZG.Platform.isMobile).mode`；scene canvas 尺寸 `round(w*dpr)×round(h*dpr)`，DPR `min(devicePixelRatio||1, Platform.isMobile ? 1.25 : 1.5)`，随后 `sceneCtx.setTransform(dpr,0,0,dpr,0,0)`（所有绘制仍用 CSS 像素）；feed canvas DPR 2、`setTransform(2,0,0,2,0,0)`；三张卡片 canvas 用 `clientWidth*dpr × clientWidth*dpr*9/16` 并同样 `setTransform`；逐张 `drawThumb`；`draw` 一帧静态场景。
- `tick(now)`：`if (!visible || frozen) return;`；`sceneT0 ??= now`；`MenuScene.draw(sceneCtx, w, h, now - sceneT0, { reduced })`；`page==='main'` 时每 7000ms 切一次 feed 地图（`feedIndex = (2 + Math.floor(elapsed/7000)) % mapOrder.length`），切换时给 `.feed-canvas-wrap` 加 `.glitch` 280ms 并重画。
- `refreshRecords()`：`best = Platform.loadAllBest()`、`last = Platform.loadAllLast()`；主菜单 feed 写当前地图的 `best`，并同时写遥测四格（当前战区名、`威胁等级 ★` 按 `difficulty`、`personal best`、`hostiles`）；选图页调 `mapCardModel` 更新 `bestText/lastText/aria-label`；简报第 3 格写当前 hover 地图的 best/last。feed 每 7 秒切图时也重跑这四格。
- `refreshInstall()`：`installBtn.classList.toggle('hidden', !ZG.__installPrompt)`。
- 键盘监听（`document`，`init` 时注册一次）：`if (!visible || frozen) return;`；`if (cb.isOverlayOpen && cb.isOverlayOpen()) return;`；`if (teaserOpen)` 时只处理 Esc；main 页 `ArrowUp/ArrowDown` 在 4 个 nav 间 `focus()`；maps 页 `ArrowLeft/ArrowRight` 在卡片间 `focus()`、`Escape` → `show('main')`；**不处理 Enter**（交给原生 button）。
- 点击：nav 用 `click`；`data.action==='help'` → `cb.onHelp()`，`'settings'` → `cb.onSettings()`，`story` → 打开 teaser（Task 6），`endless` → `show('maps')`。
- 声音：每次导航/选图调用 `ZG.Audio.play('click')`（玩家手势内，允许惰性初始化）。

- [ ] **Step 4: 写 `menu.css`**

1. 把 `docs/design/menu-mockup.html` 的 `<style>` 整段拷进 `menu.css`；
2. 作用域化：`body`/`#stage`/`#scene`/`.screen` 改成 `.menu-root` 内选择器，`#scene` → `.menu-scene`；`.screen` → `.menu-page`；`.screen.hidden` 改为 `.menu-root.hidden` + page 的 `opacity/visibility` 过渡；
3. 页面过渡 280ms `cubic-bezier(.2,.7,.2,1)`：`[data-page="maps"] .page-main{opacity:0;transform:translateX(-24px);visibility:hidden}`、`[data-page="main"] .page-maps{opacity:0;transform:translateX(24px);visibility:hidden}`；
4. 关键 token 照设计稿 9.1；标题/页面标题字号 clamp 照 9.2；
5. `.menu-root{position:absolute;inset:0;z-index:50;pointer-events:auto;overflow:hidden;background:#05080D}`；`.menu-scene{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}`；
6. `.menu-root.frozen .menu-page{pointer-events:none}`；`.frozen` 不改变透明度（过场要保留静帧）；`.menu-root.frozen .menu-scene{transform:scale(1.015);transition:transform .25s}`；`.menu-root.frozen{animation:menu-freeze .95s ease-out .35s both}`，`@keyframes menu-freeze{0%{filter:saturate(.85)}100%{filter:saturate(.7) brightness(.78) blur(2px)}}`（对应开场 0.00–1.30s 的降饱和/压暗/模糊）；
7. `:focus-visible{outline:2px solid var(--cyan);outline-offset:2px}`；
8. 主菜单 1440 基准绝对定位照 mockup：`corner-brand 64/44`、`hero 96/132`、`nav 96/388/474`、`feed right 88/top 128/404`、`bottom 64/30`；≥1100 才显示 feed；
9. `.menu-root[data-layout="mid"] .feed{display:none}`、`[data-layout="mid"] .nav{width:420px}`；`[data-layout="compact"]` 先只压主菜单：`hero{top:96px}`、`title{font-size:52px}`、`nav{top:320px;width:440px}`、`nav-item{height:62px}`、`feed{top:96px;width:360px}`（选图页压缩放 Task 9）；
10. `[data-layout="narrow"]`、`[data-layout="short"]` 的覆盖放 Task 9，先留空注释。

- [ ] **Step 5: 接入加载顺序（仅声明，不接主流程）**

`index.html`：`<link rel="stylesheet" href="menu.css">` 紧跟 `styles.css`；`<script src="src/view/menu.js"></script>` 放在 `menuScene.js` 之后、`intro.js`/`hud.js` 之前。`sw.js` 的 `SHELL` 加 `./menu.css`、`./src/view/menu.js`。

- [ ] **Step 6: 跑测试 + 临时浏览器验证**

```powershell
node --test tests/menu.test.js
npm test
```

浏览器临时验证（新菜单还没接主流程）：

```js
// 控制台
ZG.Menu.init({ onSelectMap: id => console.log('map', id), onHelp(){}, onSettings(){}, onShare(){}, onInstall(){}, onFullscreen(){}, isOverlayOpen: () => false });
ZG.Game.state.ui.showMenu = false;                         // 让旧 HUD 不要每帧把旧菜单显示回来
document.querySelector('#hud .menu').classList.add('hidden'); // 隐藏旧开始页
ZG.Menu.show('main');
```

对照 `docs/design/menu-main.png` 检查：左上角标、标题/英文/tagline、4 行导航、右侧监视、底部工具条；`↑↓` 能移动焦点、`Enter` 能触发“无尽模式”。

- [ ] **Step 7: 提交**

```powershell
git add src/view/menu.js menu.css index.html sw.js tests/menu.test.js
git commit -m "feat(v1.6): add main menu shell with navigation and sector feed"
```

**Acceptance:** 纯函数测试通过；临时引导下主菜单构图与设计稿一致；菜单内 Tab 不被游戏截获（此时游戏输入仍读 `showMenu=false`，但 Menu 不 preventDefault Tab）；场景只在可见且未冻结时绘制。

---

### Task 5：选图页、三张卡与行动简报

**Files:**
- Modify: `src/view/menu.js`、`menu.css`、`tests/menu.test.js`

**Interfaces:**
- Consumes: Task 4 的 `Menu` 内部 refs、`ZG.MenuScene.drawThumb`、`Platform.loadAllBest/loadAllLast`
- Produces: `Menu.mapCardModel`（3.3）、`callbacks.onSelectMap(id)` 唯一入口、卡片 400ms 防抖 + 触控横滑抑制

- [ ] **Step 1: 写卡片模型失败测试**

```js
test('地图卡：AO 编号、最佳/上次为空显示破折号', () => {
  const a = ZG.Menu.mapCardModel('suburban', 23, 12);
  assert.equal(a.code, 'AO-01');
  assert.equal(a.name, '郊区公路');
  assert.equal(a.codename, 'SUBURBAN HIGHWAY');
  assert.equal(a.bestText, '最佳 23 回合');
  assert.equal(a.lastText, '上次抵达 12 回合');
  assert.equal(a.stars, 1);
  assert.ok(a.ariaLabel.includes('最佳 23 回合'));

  const b = ZG.Menu.mapCardModel('hospital', 0, 0);
  assert.equal(b.code, 'AO-02');
  assert.equal(b.bestText, '最佳 —');
  assert.equal(b.lastText, '上次抵达 —');
});

test('卡片顺序来自 mapOrder', () => {
  const ids = ZG.Data.mapOrder.map((id, i) =>
    ZG.Menu.mapCardModel(id, 0, 0).code);
  assert.deepEqual(ids, ['AO-01', 'AO-02', 'AO-03']);
});
```

- [ ] **Step 2: 跑测试确认失败**

```powershell
node --test tests/menu.test.js
```

- [ ] **Step 3: 实现选图页**

- `buildMaps()`（`init` 中调用一次）：对 `ZG.Data.mapOrder` 生成
  `<button class="map-card" data-id="..."><canvas></canvas><div class="card-head">AO-0N + 威胁条(3 格)</div><div class="card-tags">…</div><div class="card-body"><div class="card-name">…</div><div class="card-en">…</div><div class="card-desc">…</div><div class="card-foot"><span class="best">…</span><span class="enter">进入 →</span></div></div></button>`。
- `mapCardModel(mapId, best, last)` 严格按 3.3 返回；`bestText = best > 0 ? '最佳 ' + best + ' 回合' : '最佳 —'`，`lastText` 同理；`ariaLabel = name + '，难度 ' + stars + ' 星' + (best>0 ? '，最佳 ' + best + ' 回合' : '') + '，进入'`。
- 悬停/聚焦卡片：更新 `.brief` 四格（简报/构成/记录/提示）；`briefEls` 容器 `aria-live="polite"`；同一地图不重复写 DOM（记录 `briefMapId`）。
- 点击：
  ```js
  function onCardActivate(card) {
    const id = card.dataset.id;
    const busy = cb.isBusy ? !!cb.isBusy() : false;
    if (!Menu.acceptsSelect(performance.now(), M.lastSelectAt, busy)) return;
    M.lastSelectAt = performance.now();
    card.classList.add('flash');
    setTimeout(() => card.classList.remove('flash'), 120);
    ZG.Audio.play('click');
    cb.onSelectMap && cb.onSelectMap(id);
  }
  ```
- 触控横滑：`.cards` 上 `pointerdown` 记录 `{x,y,pointerType}`；容器捕获阶段 `click`：若 `Math.hypot(dx,dy) > 8` 则 `preventDefault()` + `stopPropagation()` 并清空记录，否则正常放行。
- 触控端（`data-layout` 为 `narrow`/`short`）：简报面板隐藏；卡片 body 追加一行 `.card-loadout`（`loadout` 10px 小字），保证信息不丢。
- `resize()` 里对每张卡 canvas 重绘；`show('maps')` 首帧再保证一次（防止 hidden 时 `clientWidth=0`）。
- 键盘：`←/→` 在卡片间 focus；`Esc` 回 main；`Enter` 原生 click。

- [ ] **Step 4: 写选图页 CSS**

基于 mockup 的 `.maps-head/.back/.crumb/.maps-title/.maps-sub/.cards/.map-card/.card-*/.brief/.maps-foot`；桌面三列 `grid-template-columns: repeat(3,1fr); gap:24px`，卡片 16:9 缩略图 + 固定 body；`top:258px`、brief `top:656px`、foot `bottom:34px` 照设计稿 5.1；卡片 hover `translateY(-6px)`、边框用 `map.theme.accent` 提亮（在 JS 里写 `card.style.setProperty('--accent', map.theme.accent)`）、缩略图 `filter: brightness(1.12)`、`.enter` 变亮；`.map-card.flash{filter:brightness(2.2);transition:none}`（120ms 后由 JS 移除）；`[data-layout="narrow"] .cards` 改 `display:flex; overflow-x:auto; scroll-snap-type:x mandatory; touch-action:pan-x`，`.map-card{flex:0 0 82vw; scroll-snap-align:center}`；`.brief{display:none}`。

- [ ] **Step 5: 跑测试 + 临时浏览器验证**

```powershell
node --test tests/menu.test.js
npm test
```

控制台继续用 Task 4 的引导片段 + `ZG.Menu.show('maps')`，对照 `docs/design/menu-maps.png`；确认 hover/focus 改简报、点卡只触发一次、横滑不误触。

- [ ] **Step 6: 提交**

```powershell
git add src/view/menu.js menu.css tests/menu.test.js
git commit -m "feat(v1.6): add endless map select with operation brief"
```

**Acceptance:** 卡片数据来自 `ZG.Data` 与 localStorage；空记录显示 `—`；连点只回调一次；触控横滑不触发点击；六种缩略图信息可辨。

---

### Task 6：剧情“封存档案”占位弹窗

**Files:**
- Modify: `src/view/menu.js`、`menu.css`、`tests/menu.test.js`

**Interfaces:**
- Consumes: `ZG.Data.menu.story`、Task 4 的 `.menu-modal`（`#hud` 直接子元素，z 60）
- Produces: `Menu.openTeaser()/closeTeaser()`（内部）、`aria-modal` 弹窗、锁定章节列表

- [ ] **Step 1: 写数据/文案失败测试**

```js
test('剧情弹窗内容完整且不承诺后端能力', () => {
  const s = ZG.Data.menu.story;
  const text = [s.title, s.chapterTitle, s.blurb, ...s.chapters.map(c => c.name)].join(' ');
  assert.ok(text.includes('撤离命令'));
  assert.ok(!/预约|购买|登录|通知/.test(text));
  assert.deepEqual(s.chapters.map(c => c.mapId), ['suburban', 'hospital', 'subway']);
});
```

- [ ] **Step 2: 实现弹窗**

- 结构：`.menu-modal`（`role="dialog" aria-modal="true" aria-label="档案封存"`）→ `.teaser-box` → 标题行（`档案封存 / CLASSIFIED` + 红色斜章）、`剧情模式 · 序章`、`s.chapterTitle`、`s.blurb`、三行章节（`01 撤离命令 …… 待解锁 🔒`，`aria-disabled="true"`，`<button disabled>`）、底部说明 `剧情模式将在后续版本开放。` + `返回` 按钮。
- `.menu-modal { position:absolute; inset:0; z-index:60; pointer-events:auto; display:flex; align-items:center; justify-content:center; background:rgba(3,7,13,.72) }`；`.menu-modal.hidden` 隐藏。
- 内容全部由 `ZG.Data.menu.story` 生成；不写死中文段落。
- 打开：`modall.classList.remove('hidden')`、`teaserOpen=true`、焦点到“返回”；关闭：Esc、点遮罩（仅当 `event.target === modal`）、返回按钮；关闭后焦点回“剧情模式”nav。
- `Menu.hide()`、`show()` 都要先 `closeTeaser()`；`Menu` 的 document 键盘监听在 `teaserOpen` 时只处理 Escape。
- 样式：480–560px 宽、暗色档案纸（细横线 `repeating-linear-gradient`）、红色 `CLASSIFIED` 斜章、锁定态 62% 透明度 + “待解锁”文字 + 锁图标（不只靠颜色）。

- [ ] **Step 3: 浏览器验证**

用 Task 4 引导片段，点“剧情模式”：弹窗在菜单之上，Esc/遮罩/返回都能关，焦点回到原 nav；读屏名称包含“档案封存”。

- [ ] **Step 4: 提交**

```powershell
git add src/view/menu.js menu.css tests/menu.test.js
git commit -m "feat(v1.6): add classified story teaser modal"
```

**Acceptance:** 弹窗 z 60 高于菜单 50；三章均锁定、不可点；无“预约/通知”按钮；键盘可关闭。

---

### Task 7：`Intro` 时间轴、裂纹与播放

**Files:**
- Create: `src/view/intro.js`
- Modify: `src/view/audio.js`、`menu.css`、`index.html`、`sw.js`
- Test: `tests/intro.test.js`

**Interfaces:**
- Consumes: `ZG.Data.menu`、`ZG.Data.maps`、`ZG.Const`、`ZG.Audio`、`ZG.Platform.quality`
- Produces: `ZG.Intro.play/tick/skip/resize/active/timeline/crackPaths/variantFor/skipDecision/copyFor`（3.5）

- [ ] **Step 1: 写纯函数失败测试**

```js
// tests/intro.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const ZG = require('./load-sim.js')();

test('full 时间轴单调且总长 4200ms', () => {
  const t = ZG.Intro.timeline('full', false);
  assert.equal(t.total, 4200);
  for (let i = 1; i < t.phases.length; i++) {
    assert.ok(t.phases[i].start >= t.phases[i - 1].end - 0.01);
  }
  assert.equal(t.phases[0].id, 'windup');
  assert.equal(t.phases[t.phases.length - 1].id, 'settle');
  assert.equal(t.buildAt, 1900);
  assert.equal(t.skipAfter, 350);
});

test('skip ≤ 600ms，reduced ≤ 1500ms，quick ≤ 1100ms，off ≤ 300ms', () => {
  assert.ok(ZG.Intro.timeline('skip', false).total <= 600);
  assert.ok(ZG.Intro.timeline('full', true).total <= 1500);
  assert.ok(ZG.Intro.timeline('quick', false).total <= 1100);
  assert.ok(ZG.Intro.timeline('off', false).total <= 300);
});

test('变体优先级：reduced > intro=false > requested', () => {
  assert.equal(ZG.Intro.variantFor('full', { intro: false }, true), 'reduced');
  assert.equal(ZG.Intro.variantFor('full', { intro: false }, false), 'off');
  assert.equal(ZG.Intro.variantFor('quick', { intro: true }, false), 'quick');
  assert.equal(ZG.Intro.variantFor('full', { intro: true }, false), 'full');
});

test('跳过判定：0.35s 前忽略，曝光/收尾直接完成', () => {
  assert.equal(ZG.Intro.skipDecision(200, 'impact', 'full'), 'ignore');
  assert.equal(ZG.Intro.skipDecision(500, 'spread', 'full'), 'shorten');
  assert.equal(ZG.Intro.skipDecision(3400, 'reveal', 'full'), 'finish');
  assert.equal(ZG.Intro.skipDecision(500, 'spread', 'quick'), 'finish');
});

test('裂纹点可复现且都在画布内', () => {
  for (const [w, h] of [[1440, 900], [390, 844], [844, 390]]) {
    const a = ZG.Intro.crackPaths(20261027, w, h);
    const b = ZG.Intro.crackPaths(20261027, w, h);
    assert.deepEqual(a, b);
    assert.ok(a.length >= 6);
    assert.ok(a.some(p => p.pts[1].x < p.pts[0].x && p.pts[1].y < p.pts[0].y), '至少一条向左上');
    assert.ok(a.some(p => p.pts[p.pts.length - 1].y > p.pts[0].y), '至少一条向下');
    for (const path of a) {
      for (const p of path.pts) {
        assert.ok(p.x >= 0 && p.x <= w && p.y >= 0 && p.y <= h);
      }
      for (const br of path.branches) for (const p of br.pts) {
        assert.ok(p.x >= 0 && p.x <= w && p.y >= 0 && p.y <= h);
      }
    }
  }
});

test('开场文案与音效名', () => {
  const c = ZG.Intro.copyFor('subway');
  assert.equal(c.sector, '第 03 号战区 / SECTOR 03');
  assert.equal(c.name, '地铁站台');
  assert.equal(c.en, 'SUBWAY PLATFORM');
  assert.equal(c.stars, 3);
  assert.ok(c.threatText.includes('★★★'));
  for (const n of ['glass', 'bite', 'impact', 'stinger', 'heartbeat', 'reveal', 'whoosh']) {
    assert.ok(ZG.Audio.names.includes(n), n);
  }
});
```

- [ ] **Step 2: 跑测试确认失败**

```powershell
node --test tests/intro.test.js
```

- [ ] **Step 3: 实现纯函数**

- `timeline` 按 3.6 表格返回，`phases` 连续；cues 照表。
- `variantFor`、`skipDecision` 按 3.6。
- `copyFor(mapId)`：`sector = '第 ' + (idx+1 两位) + ' 号战区 / SECTOR ' + 两位`；`stars = map.difficulty`；`threatText = '威胁等级 ' + '★'.repeat(stars) + '☆'.repeat(3-stars)`；`desc = map.desc`。
- `crackPaths`：照 `docs/design/intro-storyboard.html` 的 `crackPaths`（159–193 行）移植到像素坐标：
  - 起点 `(0.14w, 0.09h)`，`len = (0.38 + rnd*0.55) * min(w,h)`（像素），11 段，方向 `base + (rnd-0.5)*0.35`，段长 `len/11 * (1 - f*0.25)`；
  - 6 条主裂纹，`base = -0.35 + i*0.62`，但强制 `i===0` 为 `-2.45`（左上）、`i===5` 为 `1.35`（向下）；
  - 支裂纹概率 0.28（`rnd() > .72`），6 段，长度为主裂纹 20%–45%；
  - 所有点 `clamp` 到 `[0,w]×[0,h]`（测试硬要求）；
  - 固定 seed `20261027` 由调用方传入；主裂纹 `width 4.4`，支裂纹 `width 0.8`。

- [ ] **Step 4: 实现 `play/tick/skip/resize/active`**

- `play(mapId, opts)`：若 `active()` 直接 return；读 `matchMedia('(prefers-reduced-motion: reduce)')`（try/catch）；`variant = variantFor(opts.variant, opts.settings, reduced)`；建/复用 `.intro-root`（`role="dialog" aria-label="进入战场"`，z 90）：
  - `<canvas class="intro-crack">`、`.intro-flash`、`.intro-veil`、`.intro-title`（sector/name/en/threat/desc/red line）、`<button class="intro-skip">跳过 ▸</button>`、`.intro-progress > i`；
  - 文案来自 `copyFor(mapId)`；`root.dataset.phase=''`；初始 CSS 变量：`full` 为 `--veil:0; --reveal:0`，`skip/quick/reduced/off` 为 `--veil:1; --reveal:0`；
  - `I = { mapId, variant, tl, start: null, last: null, built: false, done: false, cueIndex: 0, cbs, settings, cracks: [] }`；
  - `resize()`；append 到 `#hud`；绑定 `pointerdown`（root → skip；若 `event.target.closest('.intro-skip')` 直接 return，避免按钮的 pointerdown 与 click 触发两次）与 `keydown`（Esc/Space/Enter → skip，`preventDefault`）；`Audio.init` 不在这里调。
- `skip()`：`if (!active || done || last === null) return;`；`if (variant === 'skip') return;`（短版已经在播，忽略再次跳过）；`decision = skipDecision(last - start, phaseIdOf(last - start), variant)`；`ignore` 直接返回；`finish` 调 `finish()`；`shorten`：若未建局先 `built = true; cbs.onBuild()`，然后 `variant='skip'; tl=timeline('skip'); start=last; cueIndex=0;` 并把 `data-phase` 重置到 `blackout`。跳过按钮只绑 `click`，不做 `pointerdown`。
- `tick(now)`：
  - `if (!active) return; if (start === null) start = now; last = now;`
  - `t = now - start`；`if (!built && t >= tl.buildAt) { built = true; cbs.onBuild && cbs.onBuild(); }`；
  - 音效：从 `cueIndex` 起，`cue.at <= t` 的逐个 `Audio.play(cue.name)`；
  - `t >= tl.total` → `finish()`（移除 root、移除 `#hud.intro-reveal`、移除 `#stage.intro-shake`、`onDone` 一次）；
  - 更新 `data-phase`（按当前 phase id）；黑幕：`.intro-veil` 用 `--veil`（0→1）控制整体不透明度，full 在 `spread` 内 0→0.6、`blackout` 内 0.6→1、`t>=buildAt` 强制 1；`reveal` 内 `--reveal` 0→1（中心向外透明的径向渐变），其他变体起步 `--veil:1`，`reveal` 内同样推 `--reveal`；
  - 重画 canvas（`impact` 咬痕 + 白闪；`spread/blackout` 裂纹按进度生长、碎片/血点/尘土；`reduced` 跳过裂纹/碎片）；
  - 跳过按钮：`t >= tl.skipAfter && phase in (windup/impact/spread/blackout)` 时显示；进度线宽度 `min(1, t/tl.total)*100%`；  - `reveal` 开始时给 `#hud` 加 `intro-reveal`；`impact` 时若 `settings.shake !== false && Platform.quality.shake` 给 `#stage` 加 `intro-shake`，120ms 后移除。
- `resize()`：读 `#stage` 尺寸；canvas 尺寸 ×DPR（1.5/移动 1.25）并 `ctx.setTransform(dpr,0,0,dpr,0,0)`；`cracks = crackPaths(20261027, w, h)`；若 active 重画当前帧。

- [ ] **Step 5: 音频配方**

`audio.js`：`NAMES` 加 7 个名字；`play()` 分支：

```js
else if (name === 'glass') { noise(0.25, 3000, 0.12, 'highpass'); tone(2400, 0.08, 'sine', 0.06); }
else if (name === 'bite') { noise(0.35, 500, 0.18, 'lowpass'); sweep(90, 55, 0.3, 'sawtooth', 0.12); }
else if (name === 'impact') { sweep(55, 38, 0.5, 'sine', 0.2); noise(0.2, 120, 0.14, 'lowpass'); }
else if (name === 'stinger') stinger();
else if (name === 'heartbeat') heartbeat();
else if (name === 'reveal') { sweep(180, 720, 0.8, 'sine', 0.1); noise(0.5, 800, 0.06); }
else if (name === 'whoosh') noise(0.5, 200, 0.06, 'lowpass');
```

`noise(dur, cutoff, gain, type)` 增加第 4 参数（默认 `bandpass`）；`stinger()` 用 55/58/110Hz 三个 saw + lowpass 1.2kHz、2s、增益 0.06；`heartbeat()` 用 `tone(50,...)` + `setTimeout(() => tone(50,...), 220)`。

- [ ] **Step 6: `menu.css` 增加开场与 HUD 入场样式**

- `.intro-root{position:absolute;inset:0;z-index:90;pointer-events:auto;background:transparent;overflow:hidden}`；
- `.intro-crack{position:absolute;inset:0;width:100%;height:100%}`；
- `.intro-veil{position:absolute;inset:0;opacity:var(--veil,1);background:radial-gradient(circle at 50% 45%, transparent calc(var(--reveal,0) * 78vmax), #000 calc(var(--reveal,0) * 78vmax + 0.001vmax))}`（`--reveal:0` = 全黑，`--reveal:1` = 中心全透明、只剩屏幕外黑边）；
- `.intro-flash{...animation}`；
- `.intro-title` 居中、`pointer-events:none`、默认 `opacity:0`；`[data-phase="title"] .intro-title, [data-phase="hold2"] .intro-title{opacity:1}`；`[data-phase="reveal"] .intro-title{opacity:0;transition:opacity .2s}`；地图名 `clamp(34px,7.2vw,86px)`、900 字重、字距 `0.18em`（入场从 `0.6em` 过渡 500ms）；`[data-phase="title"] .intro-name{animation:intro-glitch 80ms steps(2) 2}`（x ±1px）；英文 11px/0.5em/#6E90B6；红线 120×2 从中间展开；
- `.intro-skip` 右下 44×44，`[data-skip="1"]` 才显示；`.intro-progress` 底部 2px；
- `#stage.intro-shake{animation:intro-shake 120ms ease-out}`（±7px，2 次）；
- `#hud.intro-reveal .hud-top{animation:hud-top-in .32s ease-out both}`；`.hud-bottom` delay 80ms、`.hud-tabs` delay 160ms、`.btn-start` delay 160ms；
- `@media (prefers-reduced-motion: reduce){ .intro-crack, .intro-flash{display:none} #stage.intro-shake{animation:none} }`。

- [ ] **Step 7: 接入加载顺序**

`index.html` 在 `menu.js` 之后加 `intro.js`；`sw.js` 的 `SHELL` 加 `./src/view/intro.js`。

- [ ] **Step 8: 跑测试 + 浏览器抽帧**

```powershell
node --test tests/intro.test.js
npm test
```

控制台（先用 Task 4 片段让菜单显示，再）：

```js
ZG.Intro.play('suburban', {
  variant: 'full',
  settings: { intro: true, shake: true },
  onBuild: () => console.log('build', performance.now()),
  onDone: () => console.log('done', performance.now())
});
```

在 0.4s / 1.2s / 2.6s / 4.1s 截图对照 `docs/design/intro-storyboard.png`；再重放一次，0.5s 按 Esc，确认 0.55s 内结束且控制台 `done` 只出现一次。

- [ ] **Step 9: 提交**

```powershell
git add src/view/intro.js src/view/audio.js menu.css index.html sw.js tests/intro.test.js
git commit -m "feat(v1.6): add intro timeline, procedural cracks and reveal"
```

**Acceptance:** 时间轴/裂纹/跳过单测通过；四个关键帧符合分镜；跳过 ≤0.6s 且只结束一次；reduced 无裂纹/闪屏/震屏；结束帧 `onDone` 一次。

---

### Task 8：HUD/Input 重构 + 主流程接线（切换提交）

**Files:**
- Modify: `src/view/hud.js`、`src/view/input.js`、`src/main.js`、`styles.css`、`menu.css`
- Test: 现有 Node 测试 + 浏览器全流程

**Interfaces:**
- Consumes: 前面所有模块；`ZG.HUD.toast/hideTip`；`ZG.Platform`；`ZG.Audio`
- Produces: 真实的 BOOT → main → maps → intro → prep 流程；`gameplayBlocked(s)`；旧菜单/旧缩略图/旧 CSS 彻底移除

- [ ] **Step 1: 重构 `hud.js`**

- 删除 `buildMenu()`（约 284–322 行）、`drawMapThumb()`（约 324–343 行）、`init` 里的 `buildMenu()` 调用、`render` 里 530–540 的菜单块与 `H.refs.installBtn` 更新。
- 删除 `refs.menu`、`refs.mapCards`、`refs.installBtn`、`refs.shareBtn` 的菜单用途（`showShare` 之类如果只剩菜单用，一并删）。
- `render(state)` 去掉 `if (ui.showMenu) return;`；改为顺序更新：orientation → 顶栏/底栏 → 面板/卡片 → 结算/失败 → 图鉴/设置 → 教程 → tooltip/log/TechPanel。
- 结算/失败在菜单打开时隐藏：`settlement` 条件加 `|| ui.showMenu`；`gameover` 条件加 `|| ui.showMenu`。
- 设置弹窗 `options` 增加 `['intro', '开场动画']`（`onToggleSetting('intro')` 走现有布尔分支）。
- 教程条件加 `!ui.inputLocked`。
- 保留 `toast/showTip/hideTip/renderSettlement/renderGameOver` 导出。

- [ ] **Step 2: 重构 `input.js`**

```js
function gameplayBlocked(s) {
  return !s || s.ui.showMenu || s.ui.inputLocked;
}
```

- `pointermove` / `pointerdown`：首行 `if (gameplayBlocked(s)) return;`（pointerup/cancel 保留 finishDrag，避免卡住拖拽）。
- `keydown` 顺序：
  1. `tag === 'INPUT' || 'TEXTAREA'` return；
  2. `if (ev.key === 'Escape' && (s.ui.showHelp || s.ui.showSettings)) { cb.onCloseModal && cb.onCloseModal(); return; }`
  3. `if (s.ui.showTech) { ... }`
  4. `if (gameplayBlocked(s)) return;`
  5. 原有 Space/1/2/3/Tab/M/H/T/R/Escape。
- `Tab` 的 `preventDefault` 只在第 4 步之后执行，菜单内 Tab 保持原生。
- `Escape` 在菜单/过场里不做游戏操作（被第 4 步拦掉）。

- [ ] **Step 3: 重构 `styles.css`**

- `.overlay` z 40 保留；新增 `.overlay.modal { z-index: 60; }`。
- 删除旧 `.menu`/`.menu-box`/`.game-title`/`.game-sub`/`.menu-how`/`.map-grid`/`.map-card`/`.map-name`/`.map-stars`/`.map-desc`/`.map-best`/`.menu-actions`/`.version`（约 394–452 行）。
- `#hud button, #hud .unit-card, #hud .map-card, #hud .overlay, #hud .tech-row` 去掉 `.map-card`。
- 保留 `.toast-stack` 70、`.tooltip` 80；其它现有 z-index 值加一行注释标明归属，冲突的按 3.8 表调整。

- [ ] **Step 4: 重构 `main.js`**

```js
function createRun(mapId) {
  state = newState(mapId);
  state.ui.showSettlement = false;
  state.ui.tutorialStep = (mapId === 'suburban' && !state.settings.tutorialSeen) ? 0 : -1;
  state.ui.hover = null;
  state.ui.mouse = null;
  ZG.Particles.reset();
  ZG.HUD.hideTip();
  return state;
}

function selectMap(mapId) {
  if (ZG.Intro.active()) return;
  state.ui.inputLocked = true;
  ZG.Menu.freeze();
  ZG.Audio.init();
  ZG.Audio.play('click');
  ZG.Intro.play(mapId, {
    variant: 'full',
    settings: state.settings,
    onBuild() {
      createRun(mapId);
      state.ui.showMenu = false;
      state.ui.inputLocked = true;   // 黑幕下不解锁
      ZG.Menu.hide();
    },
    onDone() {
      state.ui.inputLocked = false;
    }
  });
}

function openMenu(page) {
  if (!state) return;
  state.ui.showMenu = true;
  state.ui.inputLocked = true;
  state.ui.showSettlement = false;
  state.ui.showHelp = false;
  state.ui.showSettings = false;
  state.ui.paused = false;
  state.ui.selectedCard = null;
  state.ui.selectedBuilding = null;
  state.ui.selectedHumanId = null;
  state.ui.pendingSupport = null;
  state.ui.supportAim = null;
  state.ui.hover = null;
  state.ui.mouse = null;
  state.ui.tutorialStep = -1;
  ZG.HUD.hideTip();
  ZG.Menu.show(page || 'maps');
  ZG.Menu.refreshRecords();
}
```

- `restartGame()`：`if (ZG.Intro.active()) return;` → `const mapId = state ? state.mapId : 'suburban'; createRun(mapId); state.ui.showMenu=false; state.ui.inputLocked=true; state.ui.tutorialStep=-1; ZG.Menu.hide(); ZG.Audio.init(); ZG.Intro.play(mapId,{variant:'quick', settings:state.settings, onDone(){ state.ui.inputLocked=false; }});`
- `callbacks.onSelectMap = selectMap`；`callbacks.onMenu = () => openMenu('maps')`；`onRestart = restartGame`。
- `init`：`state = newState('suburban', 20261018); state.ui.showMenu = true; state.ui.inputLocked = true;` → `Renderer.init` → `HUD.init` → `Menu.init({ ...callbacks, isOverlayOpen: () => !!(state && (state.ui.showHelp || state.ui.showSettings)), isBusy: () => ZG.Intro.active() })` → `Menu.resize()` → `Menu.show('main')` → `Renderer.resize()` → `Input.init`。
- `loop`：先 `ZG.Menu.tick(now)`、`ZG.Intro.tick(now)`；`if (state && !ZG.Menu.isVisible()) ZG.Renderer.draw(state);`；`ZG.HUD.render(state)` 保持；其余模拟循环不变。
- 新增 `function rendererResize() { ZG.Renderer.resize(); ZG.Menu.resize(); ZG.Intro.resize(); }`，把三处窗口 resize/orientationchange/visualViewport 监听都改为调用它。
- `registerPWA`：`beforeinstallprompt` 里 `ZG.__installPrompt = ev; ZG.Menu.refreshInstall();`；`appinstalled` 里 `null` + toast + `refreshInstall()`；`callbacks.onInstall` 的 `prompt.userChoice.then` 里清空后也调一次 `ZG.Menu.refreshInstall()`。
- `ZG.Game` 形状不变。

- [ ] **Step 5: 删除 `main.js` 里旧 `startGame` 的菜单语义**

`startGame` 不再被 `onSelectMap` 使用；把 `startGame` 删除，或保留为 `selectMap` 的别名时不得再设置 `showMenu=false` 之外的状态。旧 `onMenu` 的 body 替换为 `openMenu('maps')`。

- [ ] **Step 6: 跑测试 + 全流程浏览器 QA**

```powershell
npm test
```

浏览器（`python -m http.server 8765`）：

- 启动 → 主菜单；点“无尽模式” → 选图；hover 三卡 → 简报换；点“地铁站台” → 0.4/1.2/2.6/4.1s 截图 → 整备；输入可用。
- 0.5s 按 Esc → 0.55s 内进整备；`Space/1/2/3/T/H/Esc` 在菜单/过场中不触发游戏，过场后恢复。
- 菜单 → 设置：弹窗在菜单上，切“开场动画”后刷新仍保留；菜单 → 图鉴：可开、Esc 关。
- 游戏结束 → “返回选图” → maps（不是 main）；“再来一局” → quick 1.0s。
- 菜单里按 Tab：焦点按原生顺序走，不切换招募/建筑。
- console 0 error。

- [ ] **Step 7: 提交**

```powershell
git add src/view/hud.js src/view/input.js src/main.js styles.css menu.css
git commit -m "feat(v1.6): wire menu and intro into boot flow, fix HUD layering and input lock"
```

**Acceptance:** 旧 bug 4/5/6 消失；选图→开场→整备无死路；返回选图；所有游戏快捷键在菜单/过场中失效、结束后恢复；`npm test` 全绿。

---

### Task 9：响应式与可访问性打磨

**Files:**
- Modify: `menu.css`、`src/view/menu.js`
- Test: 五档截图 + 键盘走查

**Interfaces:**
- Consumes: `data-layout`（Task 4）与 `menuLayout` 断点
- Produces: 1440×900 / 1366×768 / 1024×768 / 844×390 / 390×844 五档可用；键盘/reduced motion 全流程可达

- [ ] **Step 1: 补齐四档布局 CSS**

先删掉从 mockup 带过来的 `@media (max-width:1100px)` 规则（它会和 `[data-layout]` 打架），所有断点只由 `data-layout` 控制；只保留 `prefers-reduced-motion` 的媒体查询。

- `[data-layout="mid"]`：隐藏 `.feed`，`.nav{width:420px}`，选图卡片改横滑（`.cards` 与 narrow 同一套 snap 规则）；标题 42px。
- `[data-layout="compact"]`（1366×768 等宽而矮的桌面）：主菜单标题 52px、nav `top:320px`/行高 62px、feed `top:96px`/宽 360；选图标题 42px、`.cards{top:236px}`、`.brief{top:604px;min-height:96px}`、`.maps-foot{bottom:24px}`，卡片缩略图高度按 `clamp(140px, 18vh, 200px)` 压缩，保证简报和底栏不重叠。
- `[data-layout="narrow"]`：标题上移（`top:72px`）、导航全宽（`left/right:24px`、行高 58px）、底部工具条压缩、选图 `.cards` 横滑 `scroll-snap`、单卡 `82vw`、`.brief{display:none}`、卡片 body 显示 `.card-loadout`。
- `[data-layout="short"]`：标题 28px、tagline 隐藏、导航 4×48px、卡片缩略图高 110px、`.brief` 隐藏、`.menu-bottom` 只留版本与全屏。
- 竖屏 390×844：标题 40px、导航 4×58px、底部 `env(safe-area-inset-bottom)`；页面 `overflow:hidden`，`.cards{touch-action:pan-x}`。
- 卡片/导航/工具/跳过/弹窗关闭均 ≥44px。

- [ ] **Step 2: 可访问性**

- 页切换：非活动 `.menu-page` 设 `inert` + `aria-hidden="true"`，过渡结束仍隐藏（CSS visibility）。
- 锁定项：`aria-disabled="true"` 但可点开 teaser；文案“即将开放”。
- 卡片 `aria-label` 用 `mapCardModel().ariaLabel`；简报 `aria-live="polite"`。
- 焦点：`:focus-visible` 2px 青色 + 2px offset；打开/关闭弹窗/页面时恢复合理焦点。
- 过场：`role="dialog" aria-label="进入战场"`；跳过按钮可 Tab 聚焦。
- reduced motion：场景静帧、过场 1.4s、无震屏（Task 7 已实现，这里只验证）；`@media (prefers-reduced-motion: reduce){ .menu-page, .nav-item, .map-card { transition:none !important; } }`。

- [ ] **Step 3: 五档截图与验收**

用 Edge headless（或 Playwright）截：1440×900 主菜单/选图/设置/剧情/整备；1366×768 主菜单/选图；1024×768；844×390；390×844。检查：无溢出、无横向滚动条、卡片不压简报、底部不压安全区、文字不糊。

- [ ] **Step 4: 键盘/reduced 全流程**

- 仅键盘：Tab 到“无尽模式” → Enter → 焦点首卡 → ←/→ 换卡 → Enter → 过场 → 0.5s 后 Esc → 整备。
- 系统开启 reduced motion：场景不漂移、过场 1.4s、无闪屏/震屏、流程可完成。
- 读屏（Edge/Chrome accessibility tree）：能读出主菜单、卡片标签、锁定状态、跳过按钮、剧情弹窗标题。

- [ ] **Step 5: 提交**

```powershell
git add menu.css src/view/menu.js
git commit -m "fix(v1.6): polish menu responsive layout and accessibility"
```

**Acceptance:** 五档无溢出/遮挡；键盘可完成“主菜单→选图→开始→跳过”；reduced 可完成同一流程；触控 44px 抽查通过。

---

### Task 10：回归、文档、版本与发布

**Files:**
- Modify: `package.json`、`src/core/constants.js`、`sw.js`、`tests/shell.test.js`、`tests/smoke.test.js`、`docs/STATE.md`、`docs/tech.md`、`qa/checklist.md`、`README.md`
- Test: 全量 + bench + bot + 线上

**Interfaces:**
- Consumes: 全部任务
- Produces: v1.6.0 发布；三处版本一致；SW 缓存更替；文档收口

- [ ] **Step 1: 版本号三处 + 测试**

```js
// tests/shell.test.js
assert.equal(pkg.version, '1.6.0');
assert.ok(sw.includes("'zd-v1.6.0'"));
assert.equal(ZG.Const.VERSION, 'v1.6.0');
```

`sw.js` 的 `SHELL` 增加 `./menu.css`、`./src/data/menu.js`、`./src/view/menuScene.js`、`./src/view/menu.js`、`./src/view/intro.js`；给 `tests/shell.test.js` 增加“index.html 的 stylesheet 都在 SHELL 里”的断言。`tests/smoke.test.js` 的模块列表加 `MenuScene`、`Menu`、`Intro`。

- [ ] **Step 2: 全量验证**

```powershell
npm test
node tests/bench.js
node tests/bot.js --rounds 42 --seed 1
```

记录：测试数（预计 245+）、`avgStepMs` ≤ 基线 115%、bot 回合与 v1.5 基线一致；同 seed 两次 `ZG.State.hash` 一致；菜单/过场不消耗 `state.rng`。

- [ ] **Step 3: 文档收口**

- `docs/STATE.md`：版本、测试数、性能、QA 记录、下一步；明确“桌面版已同步/未重打包”。
- `docs/tech.md`：新增模块表（`data/menu.js`、`view/menuScene.js`、`view/menu.js`、`view/intro.js`、`menu.css`）与加载顺序。
- `qa/checklist.md`：菜单/过场/层级/输入锁/Tab/触控/安全区检查项，并抄入设计稿第 15 节的 15 张截图清单（主菜单 4 档、选图 2 档、剧情/设置、开场 4 帧、整备、返回选图、重开）。
- `README.md`：若含截图/流程描述，更新为“主菜单 → 选图 → 开场 → 整备”。
- `docs/game-plan.md` 若 Task 1 有遗漏，补齐。

- [ ] **Step 4: 线上验证**

部署 GitHub Pages 后确认：`ZG.Const.VERSION === 'v1.6.0'`；SW 缓存名 `zd-v1.6.0` 且条目包含 `menu.css` 与三个新脚本；三图缩略图正常；开场可跳过；console 0 error；`file://` 双击可玩。

- [ ] **Step 5: 提交/打 tag**

```powershell
git add package.json src/core/constants.js sw.js tests/shell.test.js tests/smoke.test.js docs/STATE.md docs/tech.md qa/checklist.md README.md
git commit -m "chore(release): v1.6.0 menu and intro"
git tag v1.6.0
```

**Acceptance:** DoD（设计稿第 16 节）全部勾选；线上地址可玩；无 P0/P1 缺陷；桌面版已同步或明确标注未重打包。

---

## 5. 验收矩阵（与设计稿第 12 节对齐）

| 类别 | 检查 | 证据 |
|---|---|---|
| 功能 | 4 项导航、剧情弹窗、图鉴/设置从菜单可开 | Task 8/9 手测 |
| 功能 | 三图 → 点卡 → 开场 → 整备，无死路 | Task 8 手测 |
| 功能 | best/last 正确、刷新保留 | Task 2 单测 + 浏览器 |
| 功能 | 4.2s / 跳过 ≤0.6s / 重开 1.0s / 关闭 0.25s | Task 7 单测 + 手测 |
| 功能 | 输入锁只影响过场，结束恢复 | Task 8 手测 |
| 功能 | 返回选图、重开 quick | Task 8 手测 |
| 功能 | `file://` 可玩、SW 更新 | Task 10 手测 |
| 视觉 | 五档构图、缩略图可辨、四帧开场 | Task 9 截图 |
| 视觉 | 无外部图片/字体；与 HUD 同色系 | 代码审查 + 截图 |
| 性能 | 场景 ≤2ms/帧；无 >50ms 长帧；隐藏即停 | DevTools Performance + 代码审查 |
| 可访问性 | 键盘全流程；focus 可见；reduced；44px；读屏 | Task 9 手测 |
| 确定性 | 菜单/过场不碰 `state.rng`；同 seed hash 一致 | Task 10 命令 |

---

## 6. 风险与回退

| 风险 | 概率 | 影响 | 应对 |
|---|---|---|---|
| v1.5 合并冲突 | 中 | 中 | Task 0 先合并；冲突只允许在收尾文件；`src/**` 冲突即停 |
| 层级再次错乱 | 中 | 高 | 3.8 表一次定死；每个弹窗从菜单打开手测；`.menu-modal` 必须挂 `#hud` 直接子级 |
| 输入锁卡死 | 中 | 高 | `gameplayBlocked` 只读两个标志；`onDone` 显式置 false；手测 Space/1/2/3/T/H/Esc |
| 裂纹像划痕 | 中 | 高 | 26 点牙印 + 内凹 + 红光 + 碎片/血点/震屏；对照分镜截图调 |
| 手机掉帧 | 中 | 中 | DPR 1.5/1.25；碎片 18；隐藏即停；reduced |
| SW 旧缓存 | 中 | 高 | 升 `CACHE`；发布后强制刷新验证；shell 测试兜底 |
| 旧菜单 CSS 漏删 | 低 | 中 | `grep -n "\.menu\b\|game-title\|map-card" styles.css` 清零；浏览器确认无重复层 |
| `file://` 下 `matchMedia`/`Audio` 不可用 | 低 | 中 | 所有新 API 调用包 try/catch；Audio 无 context 时静默 |

**回退策略：** 每个 Task 独立提交；若某任务让流程不可用，`git revert <commit>` 即可回到上一个可玩点（Task 8 是唯一切换点，回退后旧菜单恢复）。

---

## 7. 执行交接

计划已保存到本文件。实现时：

- 选择 **Subagent-driven**：每个 Task 一个子代理实现，另一个复核；适合本计划接口多、视觉细节多、需要独立 review 的情况。
- 或 **Native**：在同一会话按 Task 0→10 顺序执行，每个 Task 结束跑 `npm test` 并提交；适合先快速落地再统一 review。

无论哪种，Task 8 之后必须停下来做一次完整的浏览器走查，再进入 Task 9/10。
