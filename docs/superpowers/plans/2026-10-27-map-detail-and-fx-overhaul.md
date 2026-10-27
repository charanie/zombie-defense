# 三地图细化 · 地铁双通道 · 技能特效升级 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让三张地图在视觉上"像真实地点"、让地铁站台恢复"只从两个通道口出怪 + 人类与僵尸都只能在通道及末端大厅活动"，并把人类特殊技能与僵尸特殊攻击的表现升级到可读、可辨识的定制特效。

**Architecture:** 地图数据增加 `zones / spawns / decor` 三类字段（`obstacles` 仍是唯一碰撞真相）；新增 `ZG.MapZone` 统一回答"这个点属于活动区吗、最近的合法点在哪"，被放置、寻路、人类 AI、僵尸 AI 共同调用。静态地图绘制从 `renderer.js` 拆到新的 `ZG.MapLayer`，技能特效从 `state.effects` 与实体字段读取，集中到新的 `ZG.Fx` 三层绘制（地面 / 空中 / 屏幕）。模拟层只写几何、时长、颜色，不写绘制样式。

**Tech Stack:** 原生 JavaScript（经典 `<script>`，无 import/export）、Canvas 2D、Node 内置测试（`node --test`）、零依赖零构建、`file://` 可玩。

**Spec:** 本文件 + `docs/game-plan.md` §8（地图设计）/ §11（视觉与音效）。Task 1 先重写这两节，之后所有实现对文档负责。

---

## Global Constraints

以下来自 `AGENTS.md`，每个任务都隐式包含：

- **运行时零依赖、零构建**：不引入 npm 包、打包器、ES module、外部字体/图片/音频。所有资源本地静态。
- **`file://` 必须可玩**：不能用 ES module / fetch 加载游戏代码 / Service Worker 作为必需路径。
- **加载顺序唯一真相**：所有脚本只在 `index.html` 中按顺序声明；`tests/load-sim.js` 解析它。新增脚本必须同时出现在 `index.html` 与测试加载链里，且顶层不访问 `document`/`window`。
- **分层**：`src/core` ← `src/data` ← `src/sim` ← `src/view` / `src/main.js`。`src/sim/**`、`src/data/**`、`src/core/**` 不得访问 `document`、`window`、`localStorage`、`Math.random()`、`Date.now()`、`performance.now()`。
- **确定性**：模拟随机一律走 `state.rng.*`；同种子 + 同整备期命令必须得到相同 `ZG.State.hash()`。
- **固定步长**：`ZG.Const.STEP_SEC = 1/60`，不得用帧数当时间。
- **数值集中**：单位/僵尸/英雄/建筑/地图/波次/公式只写在 `src/data/**`；`src/sim/**` 不写魔法数字。
- **中文文案**：所有玩家可见文字为简体中文；代码标识符用英文。
- **可访问性**：颜色之外有符号/文字/形状；伤害数字与震屏可关；暂停随时可用。
- **不回归 v1.3 基线**：当前 `node --test "tests/*.test.js"` 为 **190 项全绿**；`node tests/bench.js` 为 `avgStepMs≈1.57`（本机基线）；`node tests/bot.js --rounds 40 --seed 1` 为郊区公路 42 回合。
- **性能预算**：500 僵尸压力下 `avgStepMs` 不超过基线的 115%（≈1.8ms）；移动端同屏粒子 ≤ 120，特效绘制不得引入每帧 `createRadialGradient` 超过 20 次。
- **无 zones / 无 spawns 的地图**：RNG 消耗路径与移动钳制必须与 v1.3 完全一致（`suburban` / `hospital` 的 bot 与回放结果不得变化）。

## Review Focus

按"最可能咬到玩家"的顺序，每条都要在对应任务里落到断言：

1. **区域外指令被静默钳制**：玩家把人类拖到地铁图中央设备带或轨道上时，期望是**明确拒绝**（`reason: 'outside-zone'` + HUD 提示"超出可活动区域"），而不是人瞬移到最近的合法点。
2. **僵尸在通道口/柱子后永久卡死**：期望 8 秒反卡死逻辑把僵尸送进可达格并继续推进；不能出现两只僵尸在窄口互相推开、原地抖动到回合超时。
3. **BOSS 技能把单位/召唤物丢进墙里**：投石落点、母巢孵出的幼体、裂爪冲刺终点期望仍然落在活动区内或被钳制回通道，不得生成在中央设备带里。
4. **移动端特效叠加掉帧**：`quality === 'mobile'` 时期望屏幕层叠加关闭、爆发型特效粒子数减半，且一场 BOSS 战不出现 >50ms 的帧。
5. **郊区/医院地图的确定性被顺手改掉**：不带 `zones`/`spawns` 的两张图，期望 `ZG.Waves.build` 的坐标与 v1.3 golden 值逐位相同，bot 回合数不变。

---

## 一、现状诊断（为什么这样做）

| 现象 | 根因 | 证据 |
|---|---|---|
| 第三图"全图出怪" | `ZG.Waves.spawnPoint` 只按 `EDGES` 四边随机，完全不知道地图长什么样；`maps.js` 的 `roads` 只是视觉色块 | `src/data/waves.js:10-18,145`；`src/data/maps.js:49-53` |
| 第三图人类可以站在轨道/设备带上 | 放置只校验世界边界、障碍、重叠，没有"活动区"概念 | `src/sim/economy.js:33-67` |
| 僵尸能穿过中央设备带抄近路 | 流场只标记障碍与建筑，没有区域遮罩；`moveZombie` 只按世界边界 ±80 钳制 | `src/sim/pathing.js:42-71`；`src/sim/ai.js:1097-1100` |
| 三张地图"空" | 背景层只有底色、道路色块、网格、暗角、地图名；障碍只有 2 种画法（车、柱） | `src/view/renderer.js:138-268` |
| 特效单薄 | 英雄技能只有 toast + 音效；剑气是一个渐变矩形；大量特殊攻击只发粒子 | `src/sim/ai.js:630-708`；`src/view/renderer.js:875-971` |
| 特效扩展困难 | 所有效果绘制写死在 `renderer.drawEffects` 的 if-else 链里 | `src/view/renderer.js:875-971` |

**设计判断**：只给 `subway` 定义 `zones` 与 `spawns`，另两张图保持"全图 + 四面来袭"。这样满足需求、把风险限制在一张图，并保住郊区/医院的确定性与 bot 基线。

---

## 二、设计决策（已定，review 时可改）

| # | 决策点 | 结论 |
|---|---|---|
| 1 | 数据模型 | 新增 `map.zones`（活动区矩形并集）、`map.spawns`（出生口）、`map.decor`（纯视觉）；`map.obstacles` 仍是唯一碰撞真相，新增 `theme` 取值与 `rect` 支持 |
| 2 | 区域约束范围 | **只有地铁站台**定义 `zones` / `spawns`；郊区公路、医院广场的行为与 v1.3 完全一致 |
| 3 | 地铁布局 | 北通道 `y 160..300`、南通道 `y 420..560`（各 140 高），末端大厅 `x 1000..1240, y 160..560`；中央 `y 300..420` 是设备带（不可通行），上下是轨道（不可通行） |
| 4 | 地铁出怪 | 只在两个通道左端屏幕外出怪：`x = -10..-60`，`y = 230±50` 与 `y = 490±50`；`edge` 固定 `left` |
| 5 | 人类活动 | 人类可部署/活动于通道 + 末端大厅任意合法点（含通道内，允许玩家把盾兵堵到通道口）；仍受世界边界约束 |
| 6 | 入口带 | `zones` 的通道矩形向左延伸到 `x = -80`，供僵尸从屏幕外走进来；人类放置因世界边界自然用不到这一段 |
| 7 | 建筑 | 与人类同一活动区约束；建筑可以堵通道（这是地铁图的策略），巨人/母体仍能拆 |
| 8 | 视觉细节 | 视觉细节走 `decor`，不参与碰撞；可碰撞的大件（货车、花坛、救护车、长椅、闸机）走 `obstacles` + `theme`；背景仍在离屏 canvas 只画一次 |
| 9 | 特效架构 | 模拟层 push 几何/时长/颜色；绘制样式常量放 `src/view/fx.js`；分地面/空中/屏幕三层 |
| 10 | 移动端降级 | `state.quality === 'mobile'`：关闭屏幕层叠加、爆发粒子 ×0.5、母巢增益连线不画 |
| 11 | 确定性 | 无 `zones`/`spawns` 时 `MapZone` 回退世界矩形、`waves` 走原 `spawnPoint`；RNG 消耗次数不变 |
| 12 | 版本 | 完成后 `ZG.Const.VERSION = 'v1.5.0'`，SW 缓存名同步 |

---

## 三、文件结构

**新增**

| 文件 | 责任 |
|---|---|
| `src/sim/mapzone.js` | `ZG.MapZone`：活动区判定、最近合法点钳制、区域遮罩、中心点 |
| `src/view/maplayer.js` | `ZG.MapLayer`：静态地图背景绘制（三图主题 + 装饰 + 障碍 + 区域压暗）与缩略图 |
| `src/view/fx.js` | `ZG.Fx`：技能/特殊攻击特效的样式表、三层绘制、`describe()` 纯函数 |
| `tests/maps.test.js` | 三张地图数据结构与几何校验 |
| `tests/zones.test.js` | `ZG.MapZone` 单元测试 |
| `tests/zombie-zone.test.js` | 地铁图僵尸活动范围与反卡死回归 |
| `tests/fx.test.js` | 特效 KINDS、describe、stub ctx 绘制不崩 |
| `tests/stub-ctx.js` | 假 Canvas 上下文，供 `view.test.js` / `fx.test.js` 复用（非 `.test.js`，不进用例） |

**修改**

| 文件 | 改动 |
|---|---|
| `index.html` | 按层插入 `mapzone.js`（before pathing）、`maplayer.js` / `fx.js`（before renderer） |
| `src/data/maps.js` | 重写三图数据（约 260 行） |
| `src/data/waves.js` | `spawnFromDef`、`build(opts.map)`、portal 坐标 |
| `src/sim/pathing.js` | zone 遮罩写入 blocked、`validate` 支持 `validationPoints` |
| `src/sim/economy.js` | `canPlace` / `canPlaceBuilding` 加区域检查 |
| `src/sim/ai.js` | 人类/僵尸移动钳制、技能与 BOSS 技能 push effects |
| `src/sim/squads.js` | 四处 `clampToWorld` 改 `MapZone.clamp` |
| `src/sim/combat.js` | 爆尸/盾破/巨人拆墙的表现 effect |
| `src/sim/projectiles.js` | 投石、毒云、爆炸、火箭/毒瓶的 effect 与拖尾 |
| `src/sim/spawner.js` | `prepare` 把 `map` 传进 `Waves.build` |
| `src/view/renderer.js` | 背景委托 `MapLayer`、效果委托 `Fx`、portal 与单位状态绘制升级 |
| `src/view/particles.js` | 新粒子形态（spark/smoke/shard/star）、additive、自旋与缩放 |
| `src/view/audio.js` | 新音效名与合成配方 |
| `src/view/hud.js` | 缩略图走 `MapLayer.drawMinimap`、`reasonText` 加 `outside-zone` |
| `src/view/input.js` | 拖拽钳制到活动区、`reasonText` 加 `outside-zone` |
| `src/main.js` | 新 fx 事件的音效/震屏映射 |
| `sw.js` | SHELL 列表加入三个新脚本，缓存名升 `zd-v1.5.0` |
| `tests/spawn.test.js` / `tests/pathing.test.js` / `tests/placement.test.js` / `tests/view.test.js` | 追加/调整断言 |
| `tests/policy.js` | bot 按地图选前压点（地铁图用通道口） |
| `docs/game-plan.md` / `docs/STATE.md` / `docs/balance-notes.md` | 文档收尾 |

**新脚本加载顺序（`index.html` 最终顺序，只列变化处）**

```
src/core/geom.js
src/core/state.js
src/data/…（不变）
src/sim/mapzone.js        ← 新增，必须在 pathing 之前
src/sim/pathing.js
…
src/view/model.js
src/view/maplayer.js      ← 新增，必须在 renderer 之前
src/view/fx.js            ← 新增，必须在 renderer 之前
src/view/renderer.js
```

---

## 四、任务

### Task 1：先把设计真相写进 `game-plan.md`

**Files:**
- Modify: `docs/game-plan.md` §8（1025–1124 行）、§11.3–11.6（1485–1537 行）、§12.2 文件结构（1548–1586 行）

**Interfaces:**
- Produces: 后续所有任务引用的坐标表、区域规则、特效清单。

- [ ] **Step 1: 重写 §8.2 / §8.3 / §8.4**

每张图写成一个表：`活动区 / 出生口 / 可碰撞物 / 纯装饰 / 主题色 / 战术`。地铁图写清：北通道 `y 160..300`、南通道 `y 420..560`、末端大厅 `x 1000..1240`、中央设备带与上下轨道不可通行、两个出生口 `(-20, 230)` / `(-20, 490)`。把旧示意图里的"S1/S2 四面来袭""部署区 300×700"删掉。

- [ ] **Step 2: 重写 §8.6 校验清单**

替换为：
- 每张图的 `validationPoints` 全部可达。
- 地铁图所有 `spawns` 在屏幕外 10–60px，且 `y` 落在两条通道带内。
- 地铁图 `zones` 并集连通，通道与大厅在 `x=1000` 处首尾相接。
- 地铁图任一横向切片在每条通道内至少保留 64px 连续可通行宽度（柱子/长椅不得堵死）。
- 障碍不覆盖 `validationPoints` 与 `spawns`。

- [ ] **Step 3: 在 §11.3 后新增 §11.3.1「特殊攻击表现清单」**

表格三列：来源 / 触发状态 / 必须能看见的三件事。至少覆盖：长官导弹、武士剑气、加特林鼓舞、疫医群疗、火箭兵、喷火兵、疫医毒瓶、坦克投石、坦克践踏、裂爪冲刺、腐吐者喷吐、母巢召唤、爆尸引信、狂尸冲刺、盾尸拦截、巨人拆墙、感染。

- [ ] **Step 4: 更新 §11.6 音效表与 §12.2 文件结构**

音效新增 `missile / slash / heal / stomp / rockBreak / fuse`；文件结构表加 `mapzone.js / maplayer.js / fx.js` 三行，写明分层归属。

- [ ] **Step 5: 提交**

```bash
git add docs/game-plan.md
git commit -m "docs: v1.5 map zones, subway layout and special-attack fx spec"
```

---

### Task 2：`ZG.MapZone` 活动区模块

**Files:**
- Create: `src/sim/mapzone.js`
- Modify: `index.html`（在 `src/sim/pathing.js` 之前插入）
- Test: `tests/zones.test.js`

**Interfaces:**
```js
ZG.MapZone = {
  has(map) -> boolean,                     // map.zones 为非空数组
  contains(map, x, y) -> boolean,          // 无 zones 时等价于世界矩形 0..W / 0..H
  containsCircle(map, x, y, r) -> boolean, // 圆心 + 8 方位采样，允许跨相邻矩形
  clamp(map, x, y, r) -> {x, y},           // 无 zones 时等价于 Geom.clampToWorld
  center(map) -> {x, y},                   // 面积最大矩形的中心；保证落在活动区内；无 zones 时 W/2,H/2
  mask(state) -> Uint8Array(COLS*ROWS)     // 1 = 可走
}
```

实现约束：
- `zones` 是矩形并集，相邻矩形在边界处**首尾相接**（`x+w` 等于下一个的 `x`），`contains` 用半开区间不重叠。
- `clamp` 只做"投影到最近矩形内缩 `r`"，不搜索路径；调用方负责之后再查障碍。
- `center` 不能用面积加权质心：U 形并集的质心可能落在中央设备带，必须取"面积最大矩形"的中心。
- 不缓存、不读写 `state` 以外的东西（`mask` 只读 `state.map`）。

- [ ] **Step 1: 写失败测试**

```js
// tests/zones.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const ZG = require('./load-sim.js')();
const subway = () => ZG.Data.maps.subway;

test('地铁活动区只在两条通道与末端大厅', () => {
  const m = subway();
  assert.equal(ZG.MapZone.contains(m, 200, 230), true);
  assert.equal(ZG.MapZone.contains(m, 200, 490), true);
  assert.equal(ZG.MapZone.contains(m, 1150, 360), true);
  assert.equal(ZG.MapZone.contains(m, 200, 360), false);  // 中央设备带
  assert.equal(ZG.MapZone.contains(m, 200, 80), false);   // 上轨道
  assert.equal(ZG.MapZone.contains(m, 200, 640), false);  // 下轨道
  assert.equal(ZG.MapZone.contains(m, 1260, 360), false); // 大厅右侧墙
});

test('没有 zones 的地图回退到世界矩形', () => {
  const m = ZG.Data.maps.hospital;
  assert.equal(ZG.MapZone.has(m), false);
  assert.equal(ZG.MapZone.contains(m, 0, 0), true);
  assert.equal(ZG.MapZone.contains(m, -1, 300), false);
});

test('圆跨两个相邻矩形时不被误判', () => {
  const m = subway();
  assert.equal(ZG.MapZone.containsCircle(m, 1000, 360, 12), true);
});

test('clamp 把区域外的点推到最近合法点', () => {
  const m = subway();
  const p = ZG.MapZone.clamp(m, 500, 360, 8);   // 中央设备带
  assert.ok(Math.abs(p.y - 300) <= 8.01 || Math.abs(p.y - 420) <= 8.01, JSON.stringify(p));
  const q = ZG.MapZone.clamp(m, 500, 100, 8);   // 上轨道
  assert.ok(q.y >= 160 && q.y <= 300, JSON.stringify(q));
});

test('mask 与 contains 一致', () => {
  const m = subway();
  const s = { map: m };
  const mask = ZG.MapZone.mask(s);
  assert.equal(mask.length, ZG.Const.GRID_COLS * ZG.Const.GRID_ROWS);
  const i = 11 * ZG.Const.GRID_COLS + 15; // (496, 368) 中央设备带
  assert.equal(mask[i], 0);
  const j = 7 * ZG.Const.GRID_COLS + 15;  // (496, 240) 北通道
  assert.equal(mask[j], 1);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test "tests/zones.test.js"`
Expected: FAIL — `Cannot read properties of undefined (reading 'contains')`

- [ ] **Step 3: 实现 `src/sim/mapzone.js` 并接入 `index.html`**

`contains` 注意半开区间与浮点边界；`mask` 用格子中心 `cx*32+16` 取样；`center` 取面积最大矩形的中心（并列时取数组靠前者，即北通道 `(460, 230)`）。

- [ ] **Step 4: 运行确认通过 + 全量回归**

Run: `node --test "tests/zones.test.js"`
Expected: 5 pass
Run: `node --test "tests/*.test.js"`
Expected: 195 pass（190 + 5）

- [ ] **Step 5: 提交**

```bash
git add src/sim/mapzone.js index.html tests/zones.test.js
git commit -m "feat: add MapZone arena queries for subway map"
```

---

### Task 3：三张地图视觉与碰撞数据细化

> 本任务只写"视觉 + 碰撞"数据（`theme / roads / obstacles / decor / terrain`）。地铁的 `zones / spawns / validationPoints` 留到 Task 4 与流场接入一起做，保证本任务结束时全量测试全绿。

**Files:**
- Modify: `src/data/maps.js`（整体重写）
- Test: `tests/maps.test.js`

**Interfaces:** 每张地图对象新增/保留：
```js
{
  id, name, difficulty, desc,
  theme: { ground, road, accent, obstacle, zone, line },
  zones?: [{ id, x, y, w, h }],
  spawns?: [{ edge, x, y, jitterY, label }],
  validationPoints?: [{ x, y }],
  roads: [{ x, y, w, h }],
  terrain: [{ kind:'circle', x, y, r, theme, infectionMul }],
  obstacles: [{ kind:'circle', x, y, r, theme } | { kind:'rect', x, y, w, h, theme }],
  decor: [{ kind, ... }]   // 纯视觉
}
```

**精确数据（决策级，照抄）**

地铁站台（本任务只写 `theme / roads / obstacles / decor`；`zones / spawns / validationPoints` 见 Task 4）：
```js
theme: { ground:'#121820', road:'#202932', accent:'#2B3742', obstacle:'#546E7A',
         zone:'#2B3540', line:'#E6C34A' }
roads: [
  {x:0,y:160,w:1000,h:140},{x:0,y:420,w:1000,h:140},{x:1000,y:160,w:240,h:400}
]
obstacles: [
  {kind:'circle',x:400,y:180,r:22,theme:'pillar'},
  {kind:'circle',x:560,y:540,r:22,theme:'pillar'},
  {kind:'circle',x:1110,y:230,r:26,theme:'pillar'},
  {kind:'circle',x:1110,y:490,r:26,theme:'pillar'},
  {kind:'rect',x:700,y:162,w:100,h:22,theme:'bench'},
  {kind:'rect',x:780,y:536,w:100,h:22,theme:'bench'}
]
```
> 通道净宽校验：北通道柱 `180±22` 贴顶，剩 `202..300` = 98px；南通道柱 `540±22` 贴底，剩 `420..518` = 98px；长椅贴边，剩 ≥108px。巨人在 98px 内通过（直径 44）。

郊区公路：
- `theme` 走暗绿灰（`ground '#1C241F'`、`road '#2A2C2E'`、`accent '#3B3D40'`、`obstacle '#4A4038'`、`zone '#2F3A31'`、`line '#C9B458'`）。
- `roads`：一条横向公路 `{x:0,y:180,w:1280,h:340}` + 两条路肩带 `{x:0,y:160,w:1280,h:20}`、`{x:0,y:520,w:1280,h:20}`。
- `obstacles`：2 辆废弃轿车 `(420,300,r36)`、`(860,300,r36)`；1 辆翻倒货车 `{rect, x:585,y:222,w:110,h:56,theme:'truck'}`；2 个混凝土路障 `{rect,x:250,y:462,w:80,h:26}`、`{rect,x:1050,y:462,w:80,h:26}`；1 堆轮胎 `(1140,250,r22,theme:'tires')`。
- `decor` 至少 10 类：车道虚线（y=270/430）、中央双黄线（y=350）、斑马线（x 230..290、x 990..1050 覆盖 y 180..520）、路灯（x=160/620/1080，y=150 与 540）、交通锥 6 个、广告牌 `(1110,60,140,80)`、护栏（y=172 与 528）、草丛 18 丛、裂缝/油渍/轮胎印 24 处、交通标志牌 `(60,120)`。

医院广场：
- `theme` 冷蓝灰（`ground '#1B2230'`、`road '#27313F'`、`accent '#33404F'`、`obstacle '#4C566A'`、`zone '#2A3442'`、`line '#D8E2EF'`）。
- `roads`：中央十字广场 `{x:0,y:260,w:1280,h:200}` + 竖向广场 `{x:540,y:0,w:200,h:720}`。
- `obstacles`：2 个消毒池（保留 `terrain` 语义，不改成障碍）、喷泉 `(640,360,r46,theme:'fountain')`、花坛 4 个 `{rect,...theme:'planter'}`、救护车 `{rect,x:1030,y:200,w:100,h:50,theme:'van'}`、树池 `(200,300,r22)`、`(1080,300,r22)`。
- `decor`：广场砖、红十字地贴、停车位线、长椅、轮椅、垃圾桶、指示牌、雨棚、血迹拖痕、积水。
- `terrain` 保持 `(300,560,r100)`、`(980,560,r100)`，`infectionMul: 0.5`。

- [ ] **Step 1: 写 `tests/maps.test.js` 结构断言**

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const ZG = require('./load-sim.js')();

test('三张地图主题键齐全', () => {
  for (const id of ZG.Data.mapOrder) {
    const m = ZG.Data.maps[id];
    for (const k of ['ground','road','accent','obstacle']) assert.ok(m.theme[k], id + '.' + k);
    assert.ok(Array.isArray(m.decor) && m.decor.length >= 8, id + ' decor');
    assert.ok(Array.isArray(m.obstacles));
  }
});

test('地铁图碰撞物贴边且留出通行宽度', () => {
  const m = ZG.Data.maps.subway;
  for (const ob of m.obstacles) {
    if (ob.kind === 'rect') {
      assert.ok(ob.x >= 0 && ob.y >= 0 && ob.x + ob.w <= 1280 && ob.y + ob.h <= 720, JSON.stringify(ob));
      continue;
    }
    if (ob.y < 360) assert.ok(300 - (ob.y + ob.r) >= 60, '北通道剩宽不足: ' + JSON.stringify(ob));
    else assert.ok((ob.y - ob.r) - 420 >= 60, '南通道剩宽不足: ' + JSON.stringify(ob));
  }
});

test('地铁图装饰覆盖站台元素', () => {
  const kinds = new Set(ZG.Data.maps.subway.decor.map(d => d.kind));
  for (const k of ['track', 'platformLine', 'tunnel', 'kiosk']) assert.ok(kinds.has(k), k);
});

test('郊区与医院暂无活动区与出生口（Task 4 后 subway 才有）', () => {
  for (const id of ['suburban', 'hospital']) {
    const m = ZG.Data.maps[id];
    assert.equal(m.zones, undefined, id);
    assert.equal(m.spawns, undefined, id);
  }
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test "tests/maps.test.js"`
Expected: FAIL — `decor` 缺失 / 柱子位置不符 / `platformLine` 未实现

- [ ] **Step 3: 重写 `src/data/maps.js`**

按上面的精确坐标写 `subway`；郊区/医院按清单写。`decor` 用固定坐标手写关键大件，草丛/裂缝这类噪声用 `{ kind:'scatter', seed, count, area, colors }` 交给渲染层用固定种子 LCG 生成，保证每次一致。

同时更新 `desc`：地铁站台改为「两条站台通道，僵尸只从西侧隧道涌入；柱子和长椅既是掩体也是陷阱。」；郊区/医院保留一句话特色，可微调措辞。

- [ ] **Step 4: 运行通过 + 全量回归**

Run: `node --test "tests/maps.test.js"` → 4 pass
Run: `node --test "tests/*.test.js"` → 全部通过（此时 subway 仍无 `zones`，`pathing.validate` 仍走四边采样）

- [ ] **Step 5: 提交**

```bash
git add src/data/maps.js tests/maps.test.js
git commit -m "feat: detailed map data for suburban, hospital and subway arenas"
```

---

### Task 4：地铁双通道：活动区数据 + 流场接入

**Files:**
- Modify: `src/data/maps.js`（`subway` 追加 `zones / spawns / validationPoints`）
- Modify: `src/sim/pathing.js`（`build` 42–71 行、`validate` 173–197 行）
- Modify: `tests/pathing.test.js`（把「地图边缘可达中心」改为三图 validate）
- Test: `tests/maps.test.js`（追加）

**Interfaces:**
```js
// maps.subway 追加
zones: [
  { id:'north', x:-80, y:160, w:1080, h:140 },  // -80..1000
  { id:'south', x:-80, y:420, w:1080, h:140 },  // -80..1000
  { id:'hall',  x:1000, y:160, w:240, h:400 }   // 1000..1240
]
spawns: [
  { edge:'left', x:-20, y:230, jitterY:50, label:'北通道' },
  { edge:'left', x:-20, y:490, jitterY:50, label:'南通道' }
]
validationPoints: [
  {x:-20,y:230},{x:-20,y:490},{x:500,y:230},{x:500,y:490},
  {x:1080,y:200},{x:1080,y:360},{x:1080,y:520},{x:1230,y:360}
]
```
- `ZG.Pathing.build(state)`：障碍/建筑标记后、BFS 前，若 `MapZone.has(state.map)`，把 mask 为 0 的格子 `blocked = 1`。
- `ZG.Pathing.validate(map)`：有 `zones` 时用 `validationPoints`；点不在活动区 → `problems.push('outside-zone ...')`；否则四边采样。返回结构不变 `{ ok, maxDetour, problems, detourOk }`。

- [ ] **Step 1: 加测试**

```js
// tests/maps.test.js 追加
test('地铁图 zones 是首尾相接的 U 形并集', () => {
  const m = ZG.Data.maps.subway;
  assert.equal(m.zones.length, 3);
  const [n, s, hall] = m.zones;
  assert.equal(n.x + n.w, hall.x);
  assert.equal(s.x + s.w, hall.x);
  assert.equal(hall.y, 160);
  assert.equal(hall.y + hall.h, 560);
});

test('地铁出生口在屏幕外且落在通道带内', () => {
  const m = ZG.Data.maps.subway;
  assert.equal(m.spawns.length, 2);
  for (const sp of m.spawns) {
    assert.equal(sp.edge, 'left');
    assert.ok(sp.x <= -10 && sp.x >= -60);
    assert.ok(sp.y > 160 && sp.y < 300 || sp.y > 420 && sp.y < 560, JSON.stringify(sp));
  }
});
```
```js
// tests/pathing.test.js：替换旧「地图边缘可达中心」
test('三张地图可达性校验', () => {
  for (const id of ['suburban', 'hospital', 'subway']) {
    const r = ZG.Pathing.validate(ZG.Data.maps[id]);
    assert.equal(r.ok, true, id + ': ' + JSON.stringify(r));
  }
});

test('地铁图流场只覆盖活动区', () => {
  const s = ZG.Sim.createGame({ mapId: 'subway', seed: 1 });
  ZG.State.spawnHuman(s, 'shield', 1120, 360);
  s.pathing = ZG.Pathing.build(s);
  const outside = 11 * ZG.Const.GRID_COLS + 15; // (496, 368) 中央设备带
  const inside  = 7 * ZG.Const.GRID_COLS + 15;  // (496, 240) 北通道
  assert.equal(s.pathing.blocked[outside], 1);
  assert.equal(s.pathing.blocked[inside], 0);
  assert.notEqual(s.pathing.dist[inside], 65535);
});

test('地铁图两个入口都能走向大厅', () => {
  const s = ZG.Sim.createGame({ mapId: 'subway', seed: 1 });
  ZG.State.spawnHuman(s, 'shield', 1120, 360);
  s.pathing = ZG.Pathing.build(s);
  for (const p of [{ x: -20, y: 230 }, { x: -20, y: 490 }]) {
    const d = ZG.Pathing.directionAt(s.pathing, p.x + 40, p.y);
    assert.ok(d.x > 0, JSON.stringify(d));
  }
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test "tests/maps.test.js"` → FAIL — `m.zones is undefined`
Run: `node --test "tests/pathing.test.js"` → FAIL — `validate(subway)` 四边不可达、设备带 `blocked` 为 0

- [ ] **Step 3: 写数据 + 改 `pathing.js`**

`build`：
- `const mask = ZG.MapZone.has(map) ? ZG.MapZone.mask(state) : null;` 循环一次标记。
- 无人类时的源点回退从 `{W/2, H/2}` 改为 `ZG.MapZone.center(map)`（无 zones 时仍是 W/2,H/2），否则地铁图的 `createGame` 与 `validate` 会把源点放在被遮罩的中央设备带，导致整张图 `dist` 全 INF。
- `centerX/centerY` 同样用 `MapZone.center(map)`。

`validate`：
- `const pts = (map.zones && map.validationPoints) ? map.validationPoints : edgePoints;`
- fake state 用 `humans: []`，依赖上面的 center 回退。
- 逐点先判 `MapZone.contains`（不在区域内 → `problems.push('outside-zone ...')`），再查 `blocked` / `dist`。

- [ ] **Step 4: 运行通过 + 全量回归**

Run: `node --test "tests/maps.test.js"` → 6 pass
Run: `node --test "tests/pathing.test.js"` → 8 pass
Run: `node --test "tests/*.test.js"` → 全部通过

- [ ] **Step 5: 提交**

```bash
git add src/data/maps.js src/sim/pathing.js tests/maps.test.js tests/pathing.test.js
git commit -m "feat: subway arena zones, spawn mouths and zone-aware flow field"
```

---

### Task 5：地铁图只从两个通道口出怪

**Files:**
- Modify: `src/data/waves.js`（`spawnPoint` 之后加 `spawnFromDef`；`build` 145 行；返回对象加 `spawns`）
- Modify: `src/sim/spawner.js:11`（`Waves.build` 传 `map`）
- Modify: `src/view/renderer.js:1040-1070`（`drawPortals` 用 `portalX/portalY`）
- Modify: `sw.js`（SHELL 列表加入本轮新增脚本；若 Task 9/10 已加则跳过）
- Test: `tests/spawn.test.js`

**Interfaces:**
```js
ZG.Waves.spawnFromDef(rng, def) -> { x, y, edge, portalX, portalY }
// def = { edge:'left', x:-20, y:230, jitterY:50 }
// x = -10 - rng.next()*50；y = def.y + (rng.next()-0.5)*2*jitterY
// portalX = 60（入口内侧），portalY = y

ZG.Waves.build(R, rng, opts)  // opts.map 可选
// 有 opts.map.spawns 时：spawns[(i+j) % list.length]
// 无 spawns 时：走原 spawnPoint(rng, EDGES[(i+j)%4])，RNG 消耗次数必须不变
```

- [ ] **Step 1: 改测试**

```js
test('地铁图只从两个通道口出怪', () => {
  const rng = ZG.Rng.createStreams(9).spawn;
  const w = ZG.Waves.build(9, rng, { map: ZG.Data.maps.subway });
  const edges = new Set();
  for (const b of w.batches) for (const s of b.spawns) {
    assert.equal(s.edge, 'left');
    assert.ok(s.x <= -10 && s.x >= -60, 'x=' + s.x);
    assert.ok((s.y > 175 && s.y < 285) || (s.y > 435 && s.y < 545), 'y=' + s.y);
    edges.add(s.y < 360 ? 'north' : 'south');
  }
  assert.deepEqual([...edges].sort(), ['north', 'south']);
});

test('无 spawns 的地图与 v1.3 出生坐标逐位一致', () => {
  const rng = ZG.Rng.createStreams(9).spawn;
  const w = ZG.Waves.build(7, rng);
  const first = w.batches[0].spawns.slice(0, 4)
    .map(s => [+s.x.toFixed(2), +s.y.toFixed(2), s.edge]);
  assert.deepEqual(first, [
    [1230.84, -37.98, 'top'],
    [1336.97, 352.93, 'right'],
    [447.1, 761, 'bottom'],
    [-54.19, 551.63, 'left']
  ]);
});
```
> golden 值取自 v1.3.0 本机实测（seed 9, R7）。若本机浮点输出末位不同，保留 2 位小数即可。

- [ ] **Step 2: 运行确认失败**

Run: `node --test "tests/spawn.test.js"`
Expected: FAIL — 地铁图仍四边出怪

- [ ] **Step 3: 实现 `spawnFromDef` 与 `build(opts.map)`，`Spawner.prepare` 传 map**

`prepare` 改为：`ZG.Waves.build(state.round, state.rng.spawn, { bossType, map: state.map })`。
portal 预警改用 `first.portalX ?? first.x`、`first.portalY ?? first.y`。

- [ ] **Step 4: 运行通过 + 全量回归 + bot 回归**

Run: `node --test "tests/spawn.test.js"` → 通过
Run: `node --test "tests/*.test.js"` → 通过
Run: `node tests/bot.js --rounds 40 --seed 1` → 仍为 42 回合（无 spawns 地图路径不变）

- [ ] **Step 5: 提交**

```bash
git add src/data/waves.js src/sim/spawner.js src/view/renderer.js sw.js tests/spawn.test.js
git commit -m "feat: per-map spawn points; subway spawns only from two tunnels"
```

---

### Task 6：放置与建筑限制在活动区

**Files:**
- Modify: `src/sim/economy.js`（`canPlace` 33–67 行、`canPlaceBuilding` 113–160 行）
- Modify: `src/view/hud.js:36-49`（`reasonText` 映射加一项）
- Modify: `src/view/input.js:247-254`（`reasonText` 映射加一项）
- Test: `tests/placement.test.js`

**Interfaces:**
- `canPlace` 返回新原因 `'outside-zone'`，检查顺序：世界边界 → 区域 → 重叠 → 障碍。
- `canPlaceBuilding` 对矩形检查 9 个采样点（四角 + 四边中点 + 中心），任一点不在活动区即 `'outside-zone'`。
- 两处 `reasonText` 映射加 `'outside-zone': '超出可活动区域'`（`hud.js` 与 `input.js` 各自维护，不改 `model.js`）。

- [ ] **Step 1: 加测试**

```js
test('地铁图中央设备带与轨道不能放置', () => {
  const s = ZG.Sim.createGame({ mapId: 'subway', seed: 1 });
  s.money = 9999;
  assert.equal(ZG.Economy.canPlace(s, 200, 360, 8).reason, 'outside-zone');
  assert.equal(ZG.Economy.canPlace(s, 200, 80, 8).reason, 'outside-zone');
  assert.equal(ZG.Economy.canPlace(s, 200, 230, 8).ok, true);
  assert.equal(ZG.Economy.canPlace(s, 1100, 360, 8).ok, true);
});

test('地铁图建筑同样限制在活动区', () => {
  const s = ZG.Sim.createGame({ mapId: 'subway', seed: 1 });
  s.money = 9999;
  assert.equal(ZG.Economy.canPlaceBuilding(s, 'turret', 200, 360).reason, 'outside-zone');
  assert.equal(ZG.Economy.canPlaceBuilding(s, 'turret', 200, 240).ok, true);
});

test('moveHuman 到区域外被拒绝且不改变位置', () => {
  const s = ZG.Sim.createGame({ mapId: 'subway', seed: 1 });
  const h = ZG.State.spawnHuman(s, 'pistol', 1100, 360);
  const r = ZG.Economy.moveHuman(s, h.id, 500, 360);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'outside-zone');
  assert.equal(h.x, 1100); assert.equal(h.y, 360);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test "tests/placement.test.js"`
Expected: FAIL — 地铁图区域外 `ok: true`

- [ ] **Step 3: 实现区域检查与文案**

`canPlace` 在 `outside` 判定之后、重叠之前插入：
```js
if (!ZG.MapZone.contains(state.map, x, y)) return { ok: false, reason: 'outside-zone' };
```
`canPlaceBuilding` 用 `[心 + 四角 + 四边中点]` 9 个点逐个 `MapZone.contains`，任一失败即返回 `outside-zone`。两处 `reasonText` 加同一行文案。

- [ ] **Step 4: 运行通过 + 全量回归**

Run: `node --test "tests/placement.test.js"` → 通过
Run: `node --test "tests/*.test.js"` → 通过

- [ ] **Step 5: 提交**

```bash
git add src/sim/economy.js src/view/hud.js src/view/input.js tests/placement.test.js
git commit -m "feat: restrict placement and buildings to arena zones"
```

---

### Task 7：人类移动、小队阵位与拖拽限制在活动区

**Files:**
- Modify: `src/sim/ai.js`（`blockedAt` 150–164 行、`moveHumanDir` 167–186 行、`separateHumans` 873–897 行）
- Modify: `src/sim/squads.js`（229、236、321、354、372 行的 `clampToWorld`）
- Modify: `src/view/input.js`（101 行拖拽钳制）
- Test: `tests/human-ai.test.js`

**Interfaces:**
- `blockedAt(state, x, y, r)` 增加：`if (!ZG.MapZone.contains(state.map, x, y)) return true;`
- `moveHumanDir`：候选点 `p = ZG.MapZone.clamp(state.map, nx, ny, h.radius)`，再夹到世界边界 `8..W-8 / 8..H-8`，最后 `blockedAt` 判定。
- 所有 `ZG.Geom.clampToWorld(x, y, r)` 的调用点改成 `ZG.MapZone.clamp(state.map, x, y, r)`。
- `separateHumans` 末尾对每名存活人类做一次 `MapZone.clamp`，防止互相推挤把边缘单位挤进设备带。
- 拖拽时若落点在区域外，`input.js` 直接用 `MapZone.clamp` 回弹，不产生命令。

- [ ] **Step 1: 加测试**

```js
test('地铁图人类不会走出活动区', () => {
  const s = ZG.Sim.createGame({ mapId: 'subway', seed: 1 });
  const h = ZG.State.spawnHuman(s, 'shield', 1100, 360);
  for (let i = 0; i < 10; i++) ZG.State.spawnZombie(s, 'walker', -20, i % 2 ? 230 : 490);
  ZG.Sim.startRound(s); s.spawner.batches = [];
  ZG.Sim.tick(s, 900);
  for (const u of s.humans) {
    if (!u.alive) continue;
    assert.ok(ZG.MapZone.contains(s.map, u.x, u.y), `${u.x},${u.y}`);
  }
});
```
> 900 步 = 15 秒；盾兵会前压，足以测到通道边界。

- [ ] **Step 2: 运行确认失败**

Run: `node --test "tests/human-ai.test.js"`
Expected: FAIL — 有人类坐标落在中央设备带

- [ ] **Step 3: 实现三处改动**

- [ ] **Step 4: 运行通过 + 全量回归**

Run: `node --test "tests/human-ai.test.js"` → 通过
Run: `node --test "tests/*.test.js"` → 通过

- [ ] **Step 5: 提交**

```bash
git add src/sim/ai.js src/sim/squads.js src/view/input.js tests/human-ai.test.js
git commit -m "feat: keep humans and formations inside arena zones"
```

---

### Task 8：僵尸移动限制在活动区

**Files:**
- Modify: `src/sim/ai.js`（`moveZombie` 末尾 1097–1100 行、分离钳制 1523–1525 行、母巢孵化 1305–1312 行、裂爪冲刺 1204–1207 行）
- Test: `tests/zombie-zone.test.js`（新建）

**Interfaces:**
- `moveZombie` 末尾：
```js
if (ZG.MapZone.has(state.map)) {
  const p = ZG.MapZone.clamp(state.map, nx, ny, z.radius);
  z.x = p.x; z.y = p.y;
} else {
  const M = ZG.Const.SPAWN_WORLD_MARGIN;
  z.x = Math.max(-M, Math.min(ZG.Const.W + M, nx));
  z.y = Math.max(-M, Math.min(ZG.Const.H + M, ny));
}
```
- 分离阶段末尾同样分支。
- 母巢孵出的幼体：`const p = ZG.MapZone.clamp(state.map, x, y, 7);` 再 `spawnZombie`。
- 裂爪冲刺：冲刺目标点先 clamp 再移动（避免贴墙滑出通道）。

- [ ] **Step 1: 写失败测试**

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const ZG = require('./load-sim.js')();

test('地铁图僵尸始终在通道与大厅内', () => {
  const s = ZG.Sim.createGame({ mapId: 'subway', seed: 5 });
  ZG.State.spawnHuman(s, 'shield', 1120, 360);
  for (let i = 0; i < 12; i++) ZG.State.spawnZombie(s, 'walker', -20, i % 2 ? 230 : 490);
  ZG.Sim.startRound(s); s.spawner.batches = [];
  ZG.Sim.tick(s, 900);
  assert.ok(s.zombies.length > 0, '僵尸应仍存活');
  for (const z of s.zombies) {
    assert.ok(ZG.MapZone.contains(s.map, z.x, z.y), `zombie ${z.typeId} at ${z.x},${z.y}`);
  }
});

test('地铁图 BOSS 与召唤物不会进入设备带', () => {
  const s = ZG.Sim.createGame({ mapId: 'subway', seed: 5 });
  s.round = 7;
  ZG.State.spawnHuman(s, 'shield', 1120, 360);
  const boss = ZG.State.spawnZombie(s, 'boss_brood', -20, 230);
  boss.hp = boss.maxHp = 1e6;
  ZG.Sim.startRound(s); s.spawner.batches = [];
  ZG.Sim.tick(s, 1200);
  for (const z of s.zombies) {
    assert.ok(ZG.MapZone.contains(s.map, z.x, z.y), `${z.typeId} at ${z.x},${z.y}`);
  }
});

test('地铁图僵尸 8 秒内能推进过柱子不被卡死', () => {
  const s = ZG.Sim.createGame({ mapId: 'subway', seed: 5 });
  ZG.State.spawnHuman(s, 'shield', 1100, 480);
  const z = ZG.State.spawnZombie(s, 'walker', -20, 490);
  ZG.Sim.startRound(s); s.spawner.batches = [];
  const x0 = z.x;
  ZG.Sim.tick(s, 480);
  assert.ok(z.x > x0 + 100, `推进不足：x=${z.x}`);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test "tests/zombie-zone.test.js"`
Expected: FAIL — 有僵尸进入设备带

- [ ] **Step 3: 实现四处钳制**

- [ ] **Step 4: 运行通过 + 全量回归**

Run: `node --test "tests/zombie-zone.test.js"` → 3 pass
Run: `node --test "tests/*.test.js"` → 通过

- [ ] **Step 5: 提交**

```bash
git add src/sim/ai.js tests/zombie-zone.test.js
git commit -m "feat: clamp zombies to subway arena zones"
```

---

### Task 9：静态地图绘制层 `ZG.MapLayer`

**Files:**
- Create: `src/view/maplayer.js`
- Create: `tests/stub-ctx.js`（假 Canvas 上下文，供 Task 9/10 复用）
- Modify: `src/view/renderer.js`（`drawBackground` 138–268 行改为委托；保留 `mapSignature` 缓存）
- Modify: `src/view/hud.js`（`drawMapThumb` 331–350 行改为委托）
- Modify: `index.html`
- Modify: `sw.js`（SHELL 列表加入 `src/sim/mapzone.js`、`src/view/maplayer.js`）
- Test: `tests/view.test.js`

**Interfaces:**
```js
ZG.MapLayer = {
  draw(ctx, map),                 // 完整静态背景（含区域压暗），坐标 0..1280 / 0..720
  drawMinimap(ctx, map, w, h),   // 缩略图，内部按 w/1280、h/720 缩放
  drawArenaMask(ctx, map),        // 区域外压暗 + 边界虚线（只在有 zones 时生效）
  styleOf(map) -> { ground, road, zone, line, obstacle },  // 纯函数，测试用
  decorKinds() -> string[]        // 已实现的装饰 kind 列表
}
```

绘制顺序（固定，写进函数注释）：
`主题底色 → 大地面（roads）→ 活动区底色（zones 对应的 roads）→ 标线 → 地面噪声/血迹 → 大件装饰 → terrain → obstacles → 网格 → 区域外压暗 → 暗角 → 地图名`

装饰 kind 至少实现：`lane / doubleLine / zebra / shoulder / guardrail / lamp / cone / billboard / grass / crack / oil / tire / track / platformLine / tunnel / kiosk / lightbox / vending / bench / sign / gate / plazaTiles / cross / parking / planterDetails / fountain / van / blood`。`scatter` 用固定种子 LCG 生成。

- [ ] **Step 1: 先写 `tests/stub-ctx.js`，再加纯函数与 stub 绘制测试**

```js
// tests/stub-ctx.js —— 只用于测试，不是 .test.js，不会被 node --test 当成用例
module.exports.stubCtx = function () {
  const calls = { fillRect: 0, stroke: 0, arc: 0, fillText: 0 };
  const grad = { addColorStop() {} };
  return {
    calls, globalAlpha: 1, globalCompositeOperation: 'source-over',
    fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '', textBaseline: '',
    save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, beginPath() {},
    closePath() {}, moveTo() {}, lineTo() {}, arc() { calls.arc++; }, ellipse() {},
    rect() {}, fill() {}, stroke() { calls.stroke++; }, fillRect() { calls.fillRect++; },
    strokeRect() {}, setLineDash() {}, fillText() { calls.fillText++; }, clearRect() {},
    createRadialGradient: () => grad, createLinearGradient: () => grad
  };
};
```
```js
const { stubCtx } = require('./stub-ctx.js');

test('三张地图有各自的区域色', () => {
  const st = ZG.MapLayer.styleOf(ZG.Data.maps.subway);
  assert.ok(st.zone);
  assert.notEqual(st.zone, ZG.MapLayer.styleOf(ZG.Data.maps.suburban).zone);
});

test('地图背景绘制不抛错且画出足够图元', () => {
  for (const id of ZG.Data.mapOrder) {
    const ctx = stubCtx();
    ZG.MapLayer.draw(ctx, ZG.Data.maps[id]);
    assert.ok(ctx.calls.fillRect + ctx.calls.stroke + ctx.calls.arc >= 10, id);
  }
});

test('缩略图绘制不抛错', () => {
  const ctx = stubCtx();
  ZG.MapLayer.drawMinimap(ctx, ZG.Data.maps.subway, 220, 110);
  assert.ok(ctx.calls.fillRect >= 3);
});

test('装饰 kind 覆盖三图需求', () => {
  const kinds = new Set(ZG.MapLayer.decorKinds());
  for (const k of ['track','platformLine','tunnel','kiosk','zebra','lamp','planter','parking']) {
    assert.ok(kinds.has(k), k);
  }
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test "tests/view.test.js"`
Expected: FAIL — `ZG.MapLayer is undefined`

- [ ] **Step 3: 实现 `maplayer.js` 并接入 renderer / hud / index.html**

`renderer.drawBackground` 变成 3 行：清屏、`ZG.MapLayer.draw(R.bgctx, map)`、设置 `R.bgSig` 由调用方维护。`hud.drawMapThumb` 变成两行。

- [ ] **Step 4: 运行通过 + 浏览器目检**

Run: `node --test "tests/view.test.js"` → 通过
Run: `node --test "tests/*.test.js"` → 通过
浏览器：三张图整备期各截一张，确认装饰不抢单位、可部署区清晰。

- [ ] **Step 5: 提交**

```bash
git add src/view/maplayer.js src/view/renderer.js src/view/hud.js index.html sw.js tests/view.test.js tests/stub-ctx.js
git commit -m "feat: MapLayer static rendering and thumbnails for detailed maps"
```

---

### Task 10：特效基础设施（`ZG.Fx` + 粒子 + 音效）

**Files:**
- Create: `src/view/fx.js`
- Modify: `src/view/renderer.js`（`drawEffects` 875–971 行改为委托；`draw` 末尾加屏幕层）
- Modify: `src/view/particles.js`（新形态与 additive）
- Modify: `src/view/audio.js`（新音效名）
- Modify: `src/main.js`（事件 → 音效/震屏）
- Modify: `index.html`
- Modify: `sw.js`（SHELL 加入 `src/view/fx.js`）
- Test: `tests/fx.test.js`

**Interfaces:**
```js
ZG.Fx.KINDS = [
  'missile_lock','shockwave','inspire','groupheal','slash','rock_warn',
  'rock_impact','stomp','boom','summon','poison_cloud','crack','burn_mark','burrow','shield_flash','flame','tracer','dash_warn'
];
ZG.Fx.describe(effect) -> { layer: 'world'|'air'|'screen', color, radius, alpha } | null
ZG.Fx.drawWorld(ctx, state)
ZG.Fx.drawAir(ctx, state)
ZG.Fx.drawScreen(ctx, state)   // 用 state.cssW/cssH 由 renderer 提供；无则用 Const.W/H
```

效果实体字段（sim 侧只写这些）：
`kind, x, y, x1, y1, x2, y2, radius, facing, arc, color, lifetime（life/maxLife）, seed, width, alpha`

粒子扩展：
```js
particles.spawn(kind, x, y, { shape:'circle'|'spark'|'smoke'|'shard'|'star', rot, spin, scaleTo, additive })
```

- [ ] **Step 1: 写测试**

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const ZG = require('./load-sim.js')();
const { stubCtx } = require('./stub-ctx.js');

test('KINDS 覆盖所有特殊攻击', () => {
  const kinds = new Set(ZG.Fx.KINDS);
  for (const k of ['missile_lock','shockwave','inspire','groupheal','slash','rock_warn',
    'rock_impact','stomp','boom','summon','poison_cloud','crack','burn_mark','burrow',
    'shield_flash','flame','tracer','dash_warn']) assert.ok(kinds.has(k), k);
});

test('describe 给每类效果正确的图层', () => {
  assert.equal(ZG.Fx.describe({ kind: 'poison_cloud' }).layer, 'world');
  assert.equal(ZG.Fx.describe({ kind: 'slash' }).layer, 'air');
  assert.equal(ZG.Fx.describe({ kind: 'shockwave' }).layer, 'world');
  assert.equal(ZG.Fx.describe({ kind: 'nope' }), null);
});

test('所有效果都能在 stub ctx 上绘制', () => {
  const s = ZG.Sim.createGame({ mapId: 'subway', seed: 1 });
  s.effects = ZG.Fx.KINDS.map((kind, i) => ({
    kind, x: 100 + i * 10, y: 200, x1: 90, y1: 200, x2: 300, y2: 260,
    radius: 60, facing: 0, arc: 0.8, life: 0.3, maxLife: 0.6, color: '#FFD54F', seed: i
  }));
  const ctx = stubCtx();
  assert.doesNotThrow(() => ZG.Fx.drawWorld(ctx, s));
  assert.doesNotThrow(() => ZG.Fx.drawAir(ctx, s));
  assert.doesNotThrow(() => ZG.Fx.drawScreen(ctx, s));
});

test('粒子新形态不突破上限', () => {
  const P = ZG.Particles.create({ cap: 40, damageCap: 10 });
  for (let i = 0; i < 200; i++) P.spawn('smoke', 10, 10, { shape: 'smoke', scaleTo: 2 });
  assert.equal(P.activeCount(), 40);
  assert.doesNotThrow(() => P.step());
});

test('移动端关闭屏幕层叠加', () => {
  const s = ZG.Sim.createGame({ mapId: 'subway', seed: 1, quality: 'mobile' });
  s.effects = [{ kind: 'shockwave', x: 640, y: 360, radius: 120, life: 0.3, maxLife: 0.6, color: '#FF7043' }];
  const ctx = stubCtx();
  ZG.Fx.drawScreen(ctx, s);
  assert.equal(ctx.calls.fillRect, 0, 'mobile 不画全屏叠加');
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test "tests/fx.test.js"`
Expected: FAIL — `ZG.Fx is undefined`

- [ ] **Step 3: 实现模块与接入**

`renderer.drawEffects` 改为 `ZG.Fx.drawWorld(); ZG.Fx.drawAir();`；`renderer.draw` 末尾调 `ZG.Fx.drawScreen`。`drawScreen` 从 `effects` 里推导闪光强度（`shockwave`/`boom` 的 life 比例），不新增全局状态。音效表加入 `missile/slash/heal/stomp/rockBreak/fuse`，`main.js` 对应事件映射。

- [ ] **Step 4: 运行通过 + 全量回归**

Run: `node --test "tests/fx.test.js"` → 5 pass
Run: `node --test "tests/*.test.js"` → 通过

- [ ] **Step 5: 提交**

```bash
git add src/view/fx.js src/view/particles.js src/view/audio.js src/view/renderer.js src/main.js index.html sw.js tests/fx.test.js
git commit -m "feat: layered fx module, particle shapes and skill sfx"
```

---

### Task 11：人类技能与特殊攻击特效

**Files:**
- Modify: `src/sim/ai.js`（`stepHeroAbilities` 630–688 行、`samuraiSlash` 690–708 行、`performHumanAttack` 444–561 行）
- Modify: `src/sim/projectiles.js`（火箭/毒瓶拖尾字段）
- Modify: `src/view/fx.js`（绘制器）
- Modify: `src/view/renderer.js`（`drawHuman` 头顶技能状态、治疗光束升级）
- Test: `tests/fx.test.js`、`tests/heroes.test.js`

**每类技能必须能看见的三件事**

| 技能 | 触发时 | 过程中 | 命中/结束 |
|---|---|---|---|
| 长官导弹 | 3 个落点红色锁定圈 + 十字准星 | 导弹从屏幕上方带烟迹坠落 | 三层冲击波 + 橙白闪光 + 碎石 + 震屏 8 |
| 武士剑气 | 扇形刀光起手 | 三层弧光扫过 + 火星 | 命中点白色闪 + 斩击音 |
| 加特林鼓舞 | 金色扩散环 | 受鼓舞单位头顶金色小环 | 环消失时轻闪 |
| 疫医群疗 | 绿色波纹 | 上升十字粒子 | 被治疗者绿色描边闪烁 |
| 火箭兵 | 发射尾焰 | 烟迹拖尾 | 大爆炸三层环 |
| 喷火兵 | 枪口火舌 | 三层锥形火焰 + 火星 | 地面焦痕 1.5s |
| 疫医毒瓶 | 抛物线拖尾 | 绿色液滴 | 落点溅射环 |

模拟层改动（只 push 数据）：
- 导弹：发射时 push 3 个 `{kind:'missile_lock', x:tx, y:ty, radius:140, life:0.9, maxLife:0.9, delay:i*0.4, color:'#FFD54F'}`。
- 剑气：`slash` 增加 `arc: 0.9`（弧度）、`ang`（朝向）。
- 鼓舞：push `{kind:'inspire', x, y, radius:200, life:0.8, maxLife:0.8, color:'#FFD54F'}`。
- 群疗：push `{kind:'groupheal', x, y, radius:180, life:0.7, maxLife:0.7, color:'#66BB6A'}`。
- 火箭/毒瓶：`projectiles.spawn` 增加 `trailMax: 12`，`step` 每 2 步记录一个点（最多 12 个），渲染画渐隐折线。

- [ ] **Step 1: 加 sim 侧数据测试**

```js
test('长官技能生成三个落点锁定圈', () => {
  const s = ZG.Sim.createGame({ mapId: 'subway', seed: 1 });
  const h = ZG.State.spawnHuman(s, 'officer', 1100, 360, { heroId: 'officer' });
  // 9 只聚在 90px 半径内，且在长官 420px 内（北通道里）
  for (let i = 0; i < 9; i++) {
    ZG.State.spawnZombie(s, 'walker', 940 + (i % 3) * 15, 215 + Math.floor(i / 3) * 15);
  }
  ZG.Sim.startRound(s); s.spawner.batches = [];
  ZG.Sim.tick(s, 2);
  const locks = s.effects.filter(e => e.kind === 'missile_lock');
  assert.equal(locks.length, 3);
  for (const e of locks) assert.ok(ZG.MapZone.contains(s.map, e.x, e.y), '落点在活动区');
});

test('加特林鼓舞与疫医群疗各生成一个范围效果', () => {
  const s = ZG.Sim.createGame({ mapId: 'subway', seed: 1 });
  const g = ZG.State.spawnHuman(s, 'gatling', 1100, 300, { heroId: 'gatling' });
  for (let i = 0; i < 4; i++) ZG.State.spawnHuman(s, 'pistol', 1080 + i * 12, 320);
  ZG.State.spawnHuman(s, 'plague', 1100, 420, { heroId: 'plague' });
  for (let i = 0; i < 3; i++) {
    const u = ZG.State.spawnHuman(s, 'pistol', 1060 + i * 10, 430);
    u.hp = u.maxHp * 0.5;
  }
  ZG.Sim.startRound(s); s.spawner.batches = [];
  // startRound 会清空技能计时，必须在开战后设置
  g.nextInspireAt = 0;
  s.humans.find(u => u.heroId === 'plague').nextGroupHealAt = 0;
  ZG.Sim.tick(s, 2);
  assert.equal(s.effects.filter(e => e.kind === 'inspire').length, 1);
  assert.equal(s.effects.filter(e => e.kind === 'groupheal').length, 1);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test "tests/fx.test.js"`
Expected: FAIL — `missile_lock` 数量为 0

- [ ] **Step 3: 实现 sim push 与 fx 绘制**

绘制时所有技能特效按 `state.quality` 降级：`mobile` 时粒子数量 ×0.5、屏幕层关闭。

- [ ] **Step 4: 运行通过 + 全量回归**

Run: `node --test "tests/fx.test.js"` → 通过
Run: `node --test "tests/*.test.js"` → 通过
浏览器：招募 4 名英雄，各触发一次技能，确认"起手/过程/命中"三件事可见。

- [ ] **Step 5: 提交**

```bash
git add src/sim/ai.js src/sim/projectiles.js src/view/fx.js src/view/renderer.js tests/fx.test.js tests/heroes.test.js
git commit -m "feat: hero ability and special attack fx with lock-on, arcs and pulses"
```

---

### Task 12：僵尸特殊攻击特效

**Files:**
- Modify: `src/sim/ai.js`（坦克 1144–1179 行、裂爪 1182–1242 行、腐吐者 1244–1293 行、母巢 1295–1329 行、爆尸 1420–1445 行）
- Modify: `src/sim/combat.js`（爆尸/巨人/盾破）
- Modify: `src/sim/projectiles.js`（投石、毒云、落点）
- Modify: `src/view/fx.js`、`src/view/renderer.js`（BOSS 蓄力/硬直/引信）
- Test: `tests/fx.test.js`、`tests/boss.test.js`

**每类攻击必须能看见的三件事**

| 攻击 | 预警/蓄力 | 过程 | 命中/结束 |
|---|---|---|---|
| 坦克投石 | 落点红色准星 + 收缩环 + 阴影 | 石块从上方坠落 + 拖尾 | 冲击波 + 碎石 + 地裂 6s + 震屏 8 |
| 坦克践踏 | 身体下压 | 双同心圆冲击波 | 尘土环 + 地面裂纹 |
| 裂爪冲刺 | 红色地面划痕 + 箭头脉冲 | 3 段残影 + 速度线 | 硬直星环 |
| 腐吐者喷吐 | 口部蓄力球（按弹种色） | 抛物线 + 拖尾 | 毒云涡流 / 爆炸冲击 |
| 母巢召唤 | 旋转符文阵 | 幼体破土 + 土屑 | 光环脉冲 |
| 爆尸 | 引信进度环 + 膨胀 | 红白闪烁 | 绿色毒雾 + 冲击波 |
| 狂尸冲刺 | 速度线 | 残影 | 尘土 |
| 盾尸拦截 | 盾面高光 | 弧形火花 | 破盾碎片 |
| 巨人拆墙 | 抬臂 | 撞击 | 砖块飞溅 + 震屏 |
| 感染 | 紫色扩散环 | 孢子粒子 | 感染值条闪烁 |

模拟层新增 push：
- 坦克投石：`rock_warn`（落点，life=warn）+ 落地时 `rock_impact` + `crack`。
- 践踏：`stomp`。
- 腐吐者：蓄力由 `z.spitWindupT` 绘制；毒云 effect 已有，补 `seed`。
- 母巢：`summon` 已有；孵化时 `burrow`。
- 爆尸：`boom` + `crack`（小）。
- 盾尸拦截：`shield_flash`（在 `Combat.interceptRay` 成功处）。
- 巨人：`fx:stomp` 之外 push `boom`（radius 30）。

- [ ] **Step 1: 加测试**

```js
test('坦克投石先预警后落地', () => {
  const s = ZG.Sim.createGame({ mapId: 'subway', seed: 1 });
  s.round = 7;
  ZG.State.spawnHuman(s, 'shield', 1120, 360);
  const b = ZG.State.spawnZombie(s, 'boss', -20, 230);
  b.hp = b.maxHp = 1e6; b.rockCd = 0;
  ZG.Sim.startRound(s); s.spawner.batches = [];
  ZG.Sim.tick(s, 1);
  const warn = s.effects.find(e => e.kind === 'rock_warn');
  assert.ok(warn, '应有落点预警');
  assert.ok(ZG.MapZone.contains(s.map, warn.x, warn.y), '落点在活动区');
  ZG.Sim.tick(s, 150);   // 2.5s 后落地
  assert.ok(s.effects.some(e => e.kind === 'rock_impact'), '应有落地表现');
});

test('爆尸爆炸同时生成 boom 与毒雾表现', () => {
  const s = ZG.Sim.createGame({ mapId: 'subway', seed: 1 });
  ZG.State.spawnHuman(s, 'shield', 1100, 360);
  const z = ZG.State.spawnZombie(s, 'boomer', 1080, 360);
  z.fuseArmed = true; z.fuseT = 0.01;
  ZG.Sim.startRound(s); s.spawner.batches = [];
  ZG.Sim.tick(s, 2);
  assert.ok(s.effects.some(e => e.kind === 'boom'));
});

test('母巢孵化不会把幼体放进设备带', () => {
  const s = ZG.Sim.createGame({ mapId: 'subway', seed: 1 });
  s.round = 7;
  ZG.State.spawnHuman(s, 'shield', 1120, 360);
  const b = ZG.State.spawnZombie(s, 'boss_brood', 1060, 200);
  b.hp = b.maxHp = 1e6; b.summonCd = 0;
  ZG.Sim.startRound(s); s.spawner.batches = [];
  ZG.Sim.tick(s, 120);
  for (const z of s.zombies) assert.ok(ZG.MapZone.contains(s.map, z.x, z.y), `${z.x},${z.y}`);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test "tests/fx.test.js"`
Expected: FAIL — 缺少 `rock_warn` / `boom`

- [ ] **Step 3: 实现 sim push 与绘制**

- [ ] **Step 4: 运行通过 + 全量回归**

Run: `node --test "tests/fx.test.js"` → 通过
Run: `node --test "tests/boss.test.js"` → 通过
Run: `node --test "tests/*.test.js"` → 通过

- [ ] **Step 5: 提交**

```bash
git add src/sim/ai.js src/sim/combat.js src/sim/projectiles.js src/view/fx.js src/view/renderer.js tests/fx.test.js
git commit -m "feat: boss and special zombie attack fx with warnings and impacts"
```

---

### Task 13：回归、性能、bot 与文档收尾

**Files:**
- Modify: `tests/policy.js`（按地图选前压点）
- Modify: `docs/STATE.md`、`docs/balance-notes.md`、`src/core/constants.js`（VERSION）、`sw.js`（缓存名，若存在）
- Test: 全量

**Interfaces:**
- `policy.frontTarget(state)`：地图有 `spawns` 时，把盾兵前压点放在两个通道中段 `(300, 230)` / `(300, 490)` 交替；否则保持 `FRONT_RING`。

- [ ] **Step 1: 全量测试**

Run: `node --test "tests/*.test.js"`
Expected: 全绿（190 + 新增，记录最终数量）

- [ ] **Step 2: 性能基准**

Run: `node tests/bench.js`
Expected: `avgStepMs ≤ 1.8`（基线 1.57 的 115%）；`maxStepMs` 允许偶发 >15ms

- [ ] **Step 3: bot 三图回归**

Run: `node tests/bot.js --rounds 40 --seed 1` → 郊区公路仍 42 回合
Run: `node tests/bot.js --rounds 40 --seed 1 --map subway` → 地铁图 ≥ R20（新地图结构，先记录实际值，不设硬门槛；若 < R10 检查 policy 前压点）
Run: `node tests/bot.js --rounds 40 --seed 1 --map hospital` → 医院图结果与 v1.3 一致

- [ ] **Step 4: 浏览器验收**

- 三图整备期：装饰细节、区域压暗、缩略图。
- 地铁图：只能从两个通道口出怪；人类拖到设备带被拒绝并提示；僵尸/人类都不越界；BOSS 技能不把人/幼体丢进墙。
- 四英雄技能 + 四 BOSS 技能各触发一次，确认"预警/过程/命中"三件事。
- 桌面 1366×768 与手机 390×844：无横向滚动、无 console error、BOSS 战 15 秒内无 >50ms 帧。
- 截图存 `shots/map-suburban.png`、`shots/map-hospital.png`、`shots/map-subway.png`、`shots/fx-hero.png`、`shots/fx-boss.png`。

- [ ] **Step 5: 更新文档与版本**

`STATE.md` 写 v1.5.0 完成项、验证记录、下一步；`balance-notes.md` 记录新基准（bench/bot）；`constants.js` 版本号；SW 缓存名同步（若存在 `sw.js`）。

- [ ] **Step 6: 提交**

```bash
git add -A
git commit -m "chore: v1.5.0 map detail, subway arena and fx overhaul"
```

---

## 五、验收标准（Definition of Done）

1. **测试**：`node --test "tests/*.test.js"` 全绿；新增测试覆盖 `MapZone`、地图数据、出生口、放置拒绝、双方活动区、特效 KINDS 与绘制。
2. **地铁图**：整局只能从两个通道口出怪；人类与僵尸坐标始终在通道 + 末端大厅；区域外放置返回 `outside-zone`；BOSS 召唤/冲刺/投石不产生区域外实体。
3. **地图观感**：三图各有 ≥ 10 类装饰元素、≥ 4 个可碰撞大件；区域外压暗使地铁图的可玩区一眼可辨；缩略图能区分三图。
4. **特效**：Task 11/12 表里每一行都能在浏览器里看到"预警/过程/结果"三件事；关闭伤害数字与震屏后，技能可用颜色/形状区分。
5. **性能**：`avgStepMs ≤ 1.8`；移动端 300 僵尸同屏不出现连续掉帧。
6. **确定性**：同种子两次 bot 输出的 `State.hash` 序列一致；郊区/医院 bot 回合数不变。
7. **文档**：`game-plan.md` §8/§11/§12.2 已按本计划更新；`STATE.md` 记录验证结果。

## 六、风险与回退

| 风险 | 触发信号 | 回退/缓解 |
|---|---|---|
| 地铁通道太窄，巨人/BOSS 卡死 | bot 地铁图回合数异常低、僵尸卡在柱子 | 柱子 r 从 22 降到 18；通道从 140 加到 160；`MapZone.clamp` 改为沿通道轴滑动 |
| 人类被限制后地铁图难度暴涨 | R1–3 就掉人 | 允许人类放在大厅任意处（已是）；必要时把开局 400 金提到 500（仅地铁图，写进 game-plan） |
| 特效叠加拖慢低端机 | 手机上 BOSS 战掉帧 | `quality === 'mobile'` 关闭屏幕层、粒子减半；`MAX_EFFECTS` 降到 200 |
| 区域遮罩导致流场每 15 步重建变慢 | bench 超 1.8ms | `MapZone.mask` 结果缓存在 `state.mapMask`，只在建筑变化时失效 |
| 无 spawns 地图 RNG 漂移 | Task 5 golden 测试失败 | 恢复 `spawnPoint` 调用顺序，确保每次仍消耗两次 `rng.next()` |
