# 《尸潮防线》实现方案（Implementation Plan v1.0）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按 `docs/game-plan.md` v1.2 交付一个零依赖、零构建、双击 `index.html` 即玩的 Canvas 2D 无尽防守游戏，按 M1–M4 四个里程碑逐步通过验收。

**Architecture:** 单一 `ZG` 命名空间 + 经典 `<script>` 顺序加载；`src/sim` 是纯逻辑模拟层，不接触 DOM，可在 Node 中确定性重放；`src/view` 只读状态并负责 Canvas/DOM 呈现；所有数值集中在 `src/data`，逻辑层不出现魔法数字。

**Tech Stack:** 原生 JavaScript（ES2017，无 ES module）、Canvas 2D、DOM/CSS、Web Audio、localStorage；测试只用 Node 内置 `node:test`（开发依赖，不进入游戏运行时）。

**Spec:** `docs/game-plan.md`（v1.2，2026-10-18，2237 行）

---

## 0. 使用说明

- 任务按顺序执行。M1 的 14 个任务全部通过后才进入 M2；M2/M3 同理。每个里程碑结束跑一次完整回归。
- 每个任务按 TDD 五步走：写失败测试 → 确认失败 → 最小实现 → 确认通过 → 提交。
- `F:\claudecode` 本身不是 git 仓库。第一次执行 Task 1 时在 `games/zombie-defense/` 内 `git init`；如果用户明确不要 git，跳过所有 `git commit` 步骤，但保留测试。
- 所有测试命令在 `F:\claudecode\games\zombie-defense` 下执行。Node 版本要求 ≥ 18（`node --test`）。
- 代码标识符用英文，玩家可见文案用简体中文。
- 计划书与实现冲突时，先改计划书或在本文件末尾“偏差记录”登记，再改代码。

---

## 1. Global Constraints

以下约束对每个任务都生效，不再逐条重复：

- **零依赖、零构建**：运行时只有 `index.html` + `src/**/*.js` + `styles.css` + `manifest.webmanifest` + `sw.js` + 图标；不用 npm 包、不用打包器、不用 ES module（保证 `file://` 双击可玩）。
- **命名空间**：每个文件形如 `(function(){ 'use strict'; const ZG = globalThis.ZG = globalThis.ZG || {}; /* ... */ })();`，不向全局泄漏其他变量。
- **模拟/表现分离**：`src/sim/**`、`src/data/**`、`src/core/**` 禁止访问 `document`、`window`、`localStorage`、`performance.now()`、`Math.random()`、`Date.now()`。DOM 只允许出现在 `src/view/**`、`src/main.js`、`src/test-hooks.js`、`src/core/platform.js`（需做环境判断）。
- **固定步长**：`STEP_MS = 1000/60`，所有模拟以 `dt = 1/60s` 推进；禁止用帧数当时间。
- **确定性**：模拟中的一切随机走 `state.rng` 的独立流；同种子 + 同操作必须得到相同 `State.hash()`。
- **数值集中**：单位、僵尸、英雄、建筑、地图、波次、公式全部在 `src/data/*.js`；`src/sim/*.js` 只能读数据与 `ZG.Balance`。
- **逻辑分辨率**：1280×720，16:9；Canvas 等比缩放，DOM HUD 跟随。
- **平台目标**：Chrome / Edge 最新版；桌面 60 FPS；手机横屏可玩（M4 验收）。
- **性能预算**：300 僵尸 + 99 人类 + 100 投射物；模拟 ≤ 4ms/步，渲染 ≤ 6ms/帧，总计 ≤ 12ms/帧。
- **可访问性**：颜色之外必须有符号/文字/描边；最小字号 12px；伤害数字与震屏可关；暂停随时可用。
- **存档安全**：所有 localStorage 读写包 try/catch，失败不影响游戏。
- **中文文案**：所有玩家可见文字为简体中文；不出现英文占位文案。
- **测试**：每个逻辑任务必须带 `node:test` 测试；视觉与交互任务必须带可执行的模型层测试 + 浏览器手动验收步骤。

---

## 2. 架构总览

### 2.1 分层与依赖方向

```
core/     常量、随机、事件、几何、状态、平台抽象        ← 无依赖
data/     人类/僵尸/英雄/建筑/地图/波次/公式            ← 只依赖 core
sim/      寻路、AI、战斗、感染、经济、投射物、步进器      ← 依赖 core + data，禁止 DOM
view/     Canvas 渲染、DOM HUD、粒子、音效               ← 只读 state，可依赖 core/data
main.js   启动、主循环、输入                             ← 组装层
```

依赖方向只能向下，`sim` 不引用 `view`，`view` 不修改游戏规则状态（UI 选择态除外，放在 `state.ui`）。

### 2.2 加载顺序（`index.html` 中写死）

```html
<script src="src/core/constants.js"></script>
<script src="src/core/rng.js"></script>
<script src="src/core/eventbus.js"></script>
<script src="src/core/geom.js"></script>
<script src="src/core/state.js"></script>
<script src="src/data/balance.js"></script>
<script src="src/data/humans.js"></script>
<script src="src/data/zombies.js"></script>
<script src="src/data/heroes.js"></script>
<script src="src/data/buildings.js"></script>
<script src="src/data/maps.js"></script>
<script src="src/data/waves.js"></script>
<script src="src/sim/spatial.js"></script>
<script src="src/sim/stats.js"></script>
<script src="src/sim/pathing.js"></script>
<script src="src/sim/infection.js"></script>
<script src="src/sim/combat.js"></script>
<script src="src/sim/projectiles.js"></script>
<script src="src/sim/economy.js"></script>
<script src="src/sim/spawner.js"></script>
<script src="src/sim/ai.js"></script>
<script src="src/sim/captains.js"></script>
<script src="src/sim/heroes.js"></script>
<script src="src/sim/sim.js"></script>
<script src="src/core/platform.js"></script>
<script src="src/view/model.js"></script>
<script src="src/view/renderer.js"></script>
<script src="src/view/particles.js"></script>
<script src="src/view/audio.js"></script>
<script src="src/view/hud.js"></script>
<script src="src/view/input.js"></script>
<script src="src/main.js"></script>
<script src="src/test-hooks.js"></script>
```

**测试加载器**：`tests/load-sim.js` 解析 `index.html` 的 `<script src>`，过滤掉 `src/main.js`、`src/test-hooks.js`，以及 `src/view/` 中除 `model.js` 外的 DOM 模块（renderer/hud/particles/audio/input），按顺序用 `vm.runInThisContext` 加载其余文件，返回 `globalThis.ZG`。这样 `index.html` 是唯一的加载顺序真相源，新增文件不会漏测；`view/model.js` 是纯函数，允许在 Node 中测试。

> 2.2 是**最终顺序**；任务按需增量加入脚本标签。未实现的文件不要提前写进 `index.html`，否则测试加载器会读不到文件。

### 2.3 目录结构（最终形态）

```
zombie-defense/
  index.html                 游戏入口 + 加载顺序
  styles.css                 HUD/面板/弹窗/响应式样式
  manifest.webmanifest       PWA 清单（M4）
  sw.js                      Service Worker（M4）
  icons/                     192/512/maskable 图标（M4）
  src/
    core/
      constants.js           W/H/STEP/网格/上限/调色板/伤害类型
      rng.js                 mulberry32 + 命名随机流
      eventbus.js            EventBus + 事件名常量
      geom.js                dist/角度/锥形/圆矩形/部署区夹取
      state.js               create/spawn/remove/snapshot/hash
      platform.js            localStorage/设备/画质档/分享
    data/
      balance.js             全部公式与科技
      humans.js              8 职业数据
      zombies.js             6 僵尸 + 幼体 + BOSS 数据
      heroes.js              4 英雄数据
      buildings.js           6 建筑数据
      maps.js                3 张地图
      waves.js               数量/构成/批次生成
    sim/
      spatial.js             64px 空间哈希
      stats.js               科技/队长/光环后的有效属性
      pathing.js             32px 网格 + 多源 BFS 流场 + 地图校验
      spawner.js             出生队列/批次/传送门预警
      ai.js                  人类/僵尸索敌与状态机
      captains.js            队长晋升/上限/死亡爆炸
      heroes.js              英雄奖励/重复强化/重伤回归
      combat.js              伤害管线/护盾/死亡/赏金
      infection.js           感染/灼烧/减速/嘲讽/血清
      economy.js             金钱/人口/招募/建造/科技
      projectiles.js         子弹/火箭/药瓶/石块/导弹/爆炸
      sim.js                 回合生命周期 + 固定步进器
    view/
      model.js               纯函数视图模型（可 Node 测试）
      renderer.js            Canvas 渲染
      hud.js                 DOM HUD/面板/弹窗
      particles.js           粒子/伤害数字/震屏
      audio.js               Web Audio 程序音效
      input.js               鼠标/键盘/触控
    main.js                  启动、主循环、暂停/速度
    test-hooks.js            window.__game
  tests/
    load-sim.js              模拟层加载器
    *.test.js                node:test 测试
    bench.js                 性能基准
  tools/
    make-icons.html          Canvas 生成 PNG 图标/OG 图
  docs/
    game-plan.md             设计计划书
    superpowers/plans/       本实现方案
  shots/                     验证截图
```

### 2.4 状态契约（`ZG.State.create`）

```js
state = {
  version: 1,
  status: 'menu' | 'prep' | 'battle' | 'settlement' | 'over',
  mapId: 'suburban', map: mapDef, seed: 1,
  round: 1, money: 400, tech: { fire:0, armor:0, econ:0, serum:0 },
  humans: [], zombies: [], buildings: [], projectiles: [], effects: [],
  slots: [], spawns: [], deploy: {},
  spawner: { batches: [], batchIndex: 0, timer: 0, remaining: 0, warning: 0, bossPending: false },
  battle: { time: 0, killCount: 0, spawned: 0, berserkTier: 0, bossId: null, deathConfirmT: 0, infectionTimer: 0 },
  stats: { totalKills: 0, totalEarned: 0, bestRound: 1, captains: 0, heroes: 0 },
  rng: { spawn, promote, hero, jitter },
  ui: { selectedCard: null, selectedHumanId: null, panel: 'recruit', tooltip: null, speed: 1, paused: false, drag: null },
  settings: { damageNumbers: true, shake: true, muted: false, tutorialSeen: false },
  log: [], uid: 1, bus: eventBus, pathing: null
}
```

实体公共字段：`id:number, kind:'human'|'zombie'|'building'|'projectile', typeId, x, y, radius, hp, maxHp, shield, maxShield, facing:radians, alive:boolean`。

**坐标约定**：原点左上，x 向右，y 向下，角度 0 = +x，顺时针为正。

**距离约定**：人类攻击判定用“边缘距离”——`dist(a,b) <= range + b.radius`；僵尸近战判定用 `dist <= a.radius + b.radius + 4`。

### 2.5 模块接口总表

后续任务只能使用这些名字与签名；改名必须同步所有任务与本表。

```js
// core
ZG.Const
ZG.Rng.mulberry32(seed) -> () => [0,1)
ZG.Rng.stream(seed, name) -> { next, int(min,max), pick(arr), chance(p), shuffle(arr) }
ZG.Rng.createStreams(seed) -> { spawn, promote, hero, jitter }
ZG.EventBus.create() -> { on, once, off, emit, clear }
ZG.Events
ZG.Geom = { dist, angle, angleDiff, inCone, circleOverlapsCircle, pointInRect, pointInCircle, clampToDeploy, clampPoint }
ZG.State.create(opts) -> state
ZG.State.spawnHuman(state, classId, x, y, extra) -> human
ZG.State.spawnZombie(state, typeId, x, y, extra) -> zombie
ZG.State.spawnBuilding(state, typeId, slotId) -> building
ZG.State.remove(state, entity)
ZG.State.nextId(state) -> number
ZG.State.snapshot(state) -> object
ZG.State.hash(state) -> string
ZG.Platform = { isMobile, isStandalone, isWeChat, isDesktop, quality, qualityFor(device), save, load, exportSave, importSave, share, vibrate, requestFullscreen }

// data
ZG.Balance.zombieHp(base, R) / zombieDamage(base, R) / zombieSpeed(base, R)
ZG.Balance.bounty(base, R) / roundReward(R) / bossHp(R) / bossRockDamage(R) / bossReward(R)
ZG.Balance.populationCap(R) / techCost(line, level) / techMul(line, level)
ZG.Data.humans / zombies / heroes / buildings / maps / wavesOn
ZG.Waves.composition(R) -> {walker, runner, shield, boomer, mother, giant}
ZG.Waves.total(R) -> number
ZG.Waves.isBossRound(R) -> boolean
ZG.Waves.preview(R) -> { total, counts, boss, escort, newTypes }
ZG.Waves.build(R, rng, map) -> { batches:[{at, portalAt, spawns:[{type, x, y}]}], bossBatch }

// sim
ZG.Spatial.create() -> hash
ZG.Spatial.rebuild(hash, state)
ZG.Spatial.queryCircle(hash, x, y, r) -> entity[]
ZG.Spatial.queryNearest(hash, x, y, maxR, filter) -> entity|null
ZG.Stats.human(state, h) -> { damage, interval, range, maxHp, attackSpeed }
ZG.Stats.zombie(state, z) -> { damage, speed, maxHp }
ZG.Stats.recomputeMaxHp(state, h)
ZG.Pathing.build(state) -> pathing
ZG.Pathing.directionAt(pathing, x, y) -> { x, y }
ZG.Pathing.nearestReachable(pathing, x, y) -> { x, y }
ZG.Pathing.validate(mapDef) -> { ok, maxDetour }
ZG.Spawner.prepare(state)
ZG.Spawner.step(state)
ZG.Spawner.remaining(state) -> number
ZG.AI.stepHumans(state)
ZG.AI.stepZombies(state)
ZG.AI.pickHumanTarget(state, h) -> zombie|null
ZG.AI.pickZombieTarget(state, z) -> { kind:'human'|'building'|'point', target }|null
ZG.Combat.applyDamage(state, opts) -> { shieldDamage, hpDamage, killed }
ZG.Combat.attack(state, attacker, target)
ZG.Combat.heal(state, target, amount)
ZG.Combat.earn(state, amount, reason)
ZG.Combat.convertZombie(state, zombie) / tryConvert(state, zombie, roll?)
ZG.Captains.promote(state, max) -> human[]
ZG.Heroes.grant(state) / returnWounded(state) / onHeroDeath(state, hero)
ZG.Infection.add(state, human, amount)
ZG.Infection.dispel(state, human, amount)
ZG.Infection.tick(state)
ZG.Infection.settlementClamp(state)
ZG.Economy.canAfford(state, cost) / spend / earn
ZG.Economy.recruit(state, classId, x, y) -> { ok, reason?, human? }
ZG.Economy.sell(state, humanId) -> { ok, reason?, refund? }
ZG.Economy.build(state, typeId, slotId) -> { ok, reason?, building? }
ZG.Economy.demolish(state, buildingId) -> { ok, reason?, refund? }
ZG.Economy.buyTech(state, line) -> { ok, reason?, level? }
ZG.Economy.populationUsed(state) -> number
ZG.Economy.canPlace(state, x, y, radius, ignoreId) -> { ok, reason? }
ZG.Projectiles.spawn(state, opts) -> projectile
ZG.Projectiles.step(state)
ZG.Projectiles.explode(state, x, y, radius, damage, damageKind, opts)
ZG.Sim.createGame({ mapId, seed, quality }) -> state
ZG.Sim.startRound(state) -> { ok, reason? }
ZG.Sim.step(state)
ZG.Sim.tick(state, n)
ZG.Sim.checkRoundEnd(state)
ZG.Sim.settleRound(state)
ZG.Sim.restart(state)
ZG.Sim.applyCommand(state, cmd) -> { ok, reason? }   // 回放用：recruit/sell/build/demolish/buyTech/startRound
ZG.Sim.record(state) -> command[]                     // 返回本局整备期命令副本

// view
ZG.Model.topBar(state) / cardState(state, id) / buildingCard(state, id) / wavePreview(state) / humanInfo(state, id) / zombieInfo(state, id) / touchTargetSize()
ZG.Renderer.init(canvas, state) / draw(state) / resize()
ZG.HUD.init(state, callbacks) / render(state) / toast(text) / setMode(mode)
ZG.Particles.spawn(kind, x, y, opts) / step() / draw(ctx) / shake(power)
ZG.Audio.init() / play(name) / setMuted(bool)
ZG.Input.init(canvas, state, callbacks)
```

### 2.6 模拟步进顺序（`Sim.step`，固定 1/60 秒）

```
1. if status !== 'battle' || paused: return
2. battle.time += dt
3. Spawner.step(state)
4. Spatial.rebuild(state)
5. Pathing 方向 + 移动（僵尸沿流场/部署区内直追；人类武士位移）
6. AI.stepHumans + AI.stepZombies（索敌、开火/治疗、技能）
7. 分离碰撞（僵尸软推挤，最多 8 邻居）
8. Combat 结算本步攻击/持续伤害
9. Projectiles.step（火箭/石块/导弹/药瓶）
10. Infection.tick（感染 DoT、灼烧、减速到期、嘲讽到期）
11. 死亡结算（队长爆炸/母体爆仔/英雄重伤/普通人类变丧尸/赏金）
12. 建筑光环（医疗站/弹药库/减速/路障）每步重算
13. 经济与清场判定（Spawner.remaining + zombies.length + 3 秒感染计时）
14. 失败判定（人类为 0 → 1 秒死亡确认）
15. 反卡死计时（8 秒传送 / 180 秒狂暴 / 240 秒强制结算）
```

### 2.7 关键实现裁决（计划书未写死或需要落地的部分）

这些裁决在实现中直接生效；如用户不同意，先改本节再改代码。

1. **科技费用按当前等级计价**：`cost(line, level)` 的 `level` 是“购买前的等级”，0 级买入第一级。费用向下取整。
2. **护甲科技提升最大生命时按比例保留当前血量**：`hp = hp * newMax / oldMax`，满血者仍满血。
3. **击杀赏金 = floor(基础 × 回合成长 × 经济科技击杀倍率)**；通关奖励 = floor((60+12R) × 经济科技奖励倍率)。
4. **R10 后的精英占比转移**：每 5 回合从“普通”移 2% 给精英，按固定顺序 `[runner, shield, boomer, mother, giant]` 轮转；普通最低 30%。R10 转给 runner，R15 转给 shield，依此类推。
5. **BOSS 护卫数量 = round(N × 0.2)**，护卫构成用当回合普通构成比例。
6. **批次生成**：首波 t=5s；每批 6–12 只；相邻批次间隔 5–8s；每批出生前 1 秒发传送门预警；BOSS 在批次中点单独成批出现。
7. **盾值吸收**：先按角度/伤害类型算减免，再把减免后的伤害扣盾；盾值不足时，溢出部分全额进 HP。盾破后按数据施加永久减速（BOSS 盾尸 20%）。
8. **减速叠加取最强单源**：路障 25%、减速陷阱 35%、盾破 20% 之间取最大，不叠乘；移动速度 = 基础速度 × (1 - strongestSlow)。
9. **光环叠加**：同类建筑光环取最大，不叠加；不同类可叠乘（弹药库攻速 × 鼓舞攻速）；治疗量相加。
10. **转化兵寿命**：转化发生的回合记为第 1 回合，`expireRound = round + 2`；在第 `expireRound` 回合结算时消失。当回合上限 5，全局同时上限 15，不占人口。
11. **英雄重伤回归**：在第 R 回合阵亡 → `woundedUntilRound = R + 1`；在第 R+2 回合的整备期以 50% HP 回归（即休整一个完整回合）。
12. **废墟**：建筑被摧毁当回合槽位锁定；下一次进入整备期时自动清除，可原价重建。
13. **BOSS 石块侧移**：2.0 秒红圈；落点锁定前 0.4 秒（t=1.6s）开始侧移，实际用 0.5 秒完成 60px（120px/s），落点锁定视为 t=1.6s；盾兵不侧移。若侧移会离开部署区，则夹在边界内。
14. **狂暴**：180 秒后每满 30 秒叠加一层，每层速度与伤害 ×1.3（乘算累积）；240 秒强制结算，剩余僵尸无赏金死亡。
15. **同帧同归于尽判负**：先检查人类为 0，再检查清场。
16. **地图坐标为初值**：本文件给出三张图的初始坐标；`Pathing.validate` 的“满建可达 + 绕行 ≤1.35×”测试是最终裁判，允许在不改变地图设计意图的前提下微调槽位/障碍坐标。
17. **重复英雄强化为加法**：每个重复英雄 +20% 最大生命、+15% 伤害，按 `1 + 0.2n`、`1 + 0.15n` 计算。
18. **霰弹弹丸分配**：5 发弹丸按“锥内目标由近到远”循环分配；只有一个目标时 5 发全打它，多个目标时尽量均分；单发伤害 10，超过 120 距离衰减 50%。
19. **喷火判定**：每 0.125 秒对 50° 锥、100 射程内所有僵尸判定 5 伤害，并刷新 3 秒灼烧（5/秒）；喷火对盾尸只吃一半减伤。
20. **移动端上限**：`pointer: coarse` 或设备内存 ≤4GB 时 `quality='mobile'`：同屏僵尸 200、粒子 120、DPR ≤1.5、伤害数字默认关闭、震屏默认关闭。超出僵尸上限时延迟出生，不丢弃。

### 2.8 事件契约

事件名固定为 `domain:action`，负载一律是对象：

```js
ZG.Events = {
  ROUND_STARTED:'round:started', ROUND_SETTLED:'round:settled',
  BATTLE_CLEARED:'battle:cleared', GAME_OVER:'game:over',
  HUMAN_SPAWNED:'human:spawned', HUMAN_DIED:'human:died',
  ZOMBIE_SPAWNED:'zombie:spawned', ZOMBIE_DIED:'zombie:died',
  BUILDING_BUILT:'building:built', BUILDING_DESTROYED:'building:destroyed',
  CAPTAIN_PROMOTED:'captain:promoted', HERO_GRANTED:'hero:granted',
  HERO_WOUNDED:'hero:wounded', BOSS_SPAWNED:'boss:spawned',
  MONEY_CHANGED:'money:changed', INFECTION_TREATED:'infection:treated',
  UI_TOAST:'ui:toast'
}
```

`sim` 只 emit，不订阅；`hud`/`particles`/`audio` 订阅。任何订阅者抛异常都不得中断模拟（`EventBus.emit` 内 try/catch 并 `console.error`）。

### 2.9 Review Focus（最容易被实现者踩坏的 5 类输入）

| # | 输入/条件 | 合理预期 | 归属任务 |
|---|---|---|---|
| 1 | 最后一名人类与最后一只僵尸同帧死亡 | 判负，不能因清场而判胜 | Task 12 / 22 |
| 2 | 所有建筑槽位建满 + 三张地图 | 每个出生点仍能到达部署区，绕行 ≤1.35× 直连 | Task 5 / 20 |
| 3 | 暂停、3x、切后台后回到前台 | 模拟不追帧螺旋、不跳时间、不重复结算 | Task 13 / 37 |
| 4 | 300 僵尸 + 99 人类 + 100 投射物 | 无 O(n²)、无每帧新建大对象、60 FPS | Task 8 / 37 |
| 5 | 手机竖屏打开、刘海屏、手指点放置 | 显示横屏提示、安全区不被遮挡、44px 可点 | Task 35 |

上述每一条都必须在对应任务里有测试或明确的手动验收步骤，不能留到“最后再测”。

### 2.10 参考实现与取舍（GitHub / 公开资料）

定稿前查阅了以下同类实现。只吸收与“零依赖 + 确定性 + 300 单位”相关的算法与工程做法，不引入任何运行时依赖。

| 参考 | 可借鉴 | 本项目取舍 |
|---|---|---|
| [Antix-Development/Flow-Field-Generator](https://github.com/Antix-Development/Flow-Field-Generator) | 单目标流场、BFS 距离场、`reached` 计数避免每次清空大数组、可回溯路径 | 采用多源 BFS + 距离/方向数组 + epoch 标记；本项目只有 40×23 格，远小于其 1000×1000 压测 |
| [Red Blob Games: Flow Field Pathfinding for Tower Defense](https://www.redblobgames.com/pathfinding/tower-defense/) | 集成场/方向场、多源目标、障碍过滤、BFS 队列 | 作为 `Pathing` 的算法依据；部署区所有可达格为多源 |
| [hiddentao/clockwork-engine](https://github.com/hiddentao/clockwork-engine) | 固定帧更新、种子 PRNG、录制/回放、无头平台、帧计时器 | 采用“seed + 整备期命令”回放；不引入 TypeScript/PIXI，保留纯 JS 与 Node 无头测试 |
| [unblevable/monster-tower-defense](https://github.com/unblevable/monster-tower-defense) | 分层双缓冲 canvas、quadtree、A*、tile/sprite 技术 | 采用分层 canvas（静态层/动态层）；拒绝 quadtree——300 个均匀圆用 64px 空间哈希更便宜 |
| [reu/broadphase.js](https://github.com/reu/broadphase.js) / [@zakkster/lite-spatial](https://www.npmjs.com/package/@zakkster/lite-spatial) | HashGrid/QuadTree/BruteForce 对比；格子约 2× 最大实体；TypedArray + epoch 去重；查询复用缓冲区 | 采用 64px 网格（最大 BOSS 直径 60）、TypedArray 桶、查询不分配数组 |
| [Furkiozknn/nova-drift](https://github.com/Furkiozknn/nova-drift) | 纯 `update` 与 `render` 分离、RNG 独立可测、录制回放脚本、每日同种子 | 采用 sim/view 分离与回放断言；不做每日挑战 |
| [phase-rs/phase 回放查看器](https://deepwiki.com/phase-rs/phase/7.6-replay-viewer) | 回放存“输入动作”而非状态快照，必要时加检查点 | 战斗全自动，回放只需 seed + 整备期命令；不加快照检查点 |
| [Arcane Bastion 零依赖 TD 复盘](https://dev.to/jasonguo/i-built-a-tower-defense-game-with-zero-dependencies-ai-art-procedural-audio-and-3200-lines-of-42m1) | 9 个普通 script 文件、程序音频、Chrome 自动播放策略 | 采用经典 script 与 Web Audio 手势解锁；不采用其 AI 美术管线 |
| [CyOps Defense](https://arena.cysic.xyz/projects/bcNGMLZQDEAogOn6Ii1mG) | ES module 分层、纯 Canvas 60 FPS | 拒绝 ES module：`file://` 双击即玩是硬约束 |
| [TheRoam/endleZZ](https://github.com/TheRoam/endleZZ) | 单文件无限僵尸、离线可玩 | 只借鉴“无限模式”节奏；不采用单文件结构（本项目需要可测试分层） |

没有找到可直接复用的 “Yet Another Zombie Defense” 开源复刻；搜索到的项目多为换皮或框架工程，故本项目按计划书原创实现，只借用上述通用算法。

**结论**：成熟 TD/自动战斗项目通常依赖框架或构建工具；本项目的差异化约束是 **`file://` 可玩 + 零依赖 + 可无头复现**。因此只借算法与分层，不借运行时。

---

## 3. 测试与验收方法

### 3.1 Node 测试

- `tests/load-sim.js`：解析 `index.html`，加载全部非 view 脚本，返回 `ZG`。测试文件第一行 `const ZG = require('./load-sim.js')();`。
- 每个逻辑任务至少 1 个测试文件；命名 `tests/<topic>.test.js`。
- 运行：`node --test tests/`；单文件：`node --test tests/balance.test.js`。
- 断言用 `node:assert/strict`；浮点比较用 `assert.ok(Math.abs(a-b) < 1e-6)` 或 `toFixed`。
- 不使用 fake timer；模拟时间靠 `Sim.tick(state, n)` 推进。
- 性能不写进 `node:test` 的硬断言（机器差异大），放 `tests/bench.js`，手动记录。

### 3.2 浏览器手动验收

每个 UI 任务给出“打开 `index.html` 后的步骤 + 预期现象”。M4 前不引入 Playwright 作为运行时依赖；M4 的 QA 使用本机 Playwright MCP 或 `npx playwright`（仅开发环境）。

### 3.3 每任务的完成定义

- 测试通过、无 console 错误、性能不明显退化；
- 规则与计划书一致，偏差已登记；
- 提交信息以 `feat(m1):` / `fix(m2):` / `test:` 开头。

---

## 4. M1 纵向切片（Tasks 1–14）

**M1 目标**：郊区公路 + 手枪/霰弹/盾兵/治疗兵 + 普通/狂尸 + 完整整备/战斗/结算/失败 + HUD + 测试钩子。验收：10 回合无报错、100 僵尸 60 FPS、同种子同操作结果一致、`__game.tick()` 能跑完一回合。

---

### Task 1: 工程骨架、命名空间、常量与测试加载器

**Files:**
- Create: `index.html`, `styles.css`, `src/core/constants.js`, `src/main.js`, `tests/load-sim.js`, `tests/constants.test.js`, `package.json`, `.gitignore`

**Interfaces:**
- Produces: `ZG.Const`（所有全局常量与调色板）、`tests/load-sim.js` 加载器、`index.html` 脚本顺序。

- [ ] **Step 1: 写失败测试**

```js
// tests/constants.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const ZG = require('./load-sim.js')();

test('逻辑分辨率与步长固定', () => {
  assert.equal(ZG.Const.W, 1280);
  assert.equal(ZG.Const.H, 720);
  assert.equal(ZG.Const.STEP_MS, 1000 / 60);
  assert.equal(ZG.Const.GRID, 32);
  assert.equal(ZG.Const.GRID_COLS, 40);
  assert.equal(ZG.Const.GRID_ROWS, 23);
  assert.equal(ZG.Const.HASH_CELL, 64);
});

test('关键上限与调色板', () => {
  assert.equal(ZG.Const.MAX_POP, 80);
  assert.equal(ZG.Const.MAX_CIVILIANS, 8);
  assert.equal(ZG.Const.MAX_CAPTAINS, 8);
  assert.equal(ZG.Const.MAX_HEROES, 4);
  assert.equal(ZG.Const.MAX_CONVERTED, 15);
  assert.equal(ZG.Const.INITIAL_MONEY, 400);
  assert.equal(ZG.Const.INITIAL_POP_CAP, 10);
  assert.equal(ZG.Const.COLORS.human.pistol, '#4FC3F7');
  assert.equal(ZG.Const.COLORS.zombie.boss, '#37474F');
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test tests/constants.test.js`
Expected: FAIL，`Cannot find module './load-sim.js'` 或 `ZG.Const` 未定义。

- [ ] **Step 3: 最小实现**

`src/core/constants.js` 用 `Object.freeze` 导出：`W/H/STEP_MS/STEP_SEC/GRID/GRID_COLS/GRID_ROWS/HASH_CELL/MAX_STEPS_PER_FRAME:5`、`ZOMBIE_CAP_DESKTOP:300/ZOMBIE_CAP_MOBILE:200/PARTICLE_CAP_* /DAMAGE_NUMBER_CAP:50`、全部上限、`INITIAL_MONEY:400/INITIAL_POP_CAP:10`、`STUCK_SEC:8/BERSERK_AT:180/BERSERK_INTERVAL:30/ROUND_HARD_CAP:240`、`BATCH_MIN:6/BATCH_MAX:12/BATCH_GAP_MIN:5/BATCH_GAP_MAX:8/SPAWN_FIRST_DELAY:5/SPAWN_WARN:1`、`DAMAGE:{RANGED:'ranged',MELEE:'melee',FIRE:'fire',EXPLOSION:'explosion'}`、计划书 11.2 的完整调色板。

`tests/load-sim.js`：

```js
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
module.exports = function loadSim() {
  const root = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const srcs = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
  const DOM_VIEW = /^src\/view\/(renderer|hud|particles|audio|input)\.js$/;
  const simFiles = srcs.filter(s => !DOM_VIEW.test(s) && s !== 'src/main.js' && s !== 'src/test-hooks.js');
  delete globalThis.ZG;
  for (const f of simFiles) vm.runInThisContext(fs.readFileSync(path.join(root, f), 'utf8'), { filename: f });
  return globalThis.ZG;
};
```

`index.html` 建立两层 Canvas：`#game-bg`（静态层：网格/障碍/部署区/槽位）与 `#game`（动态层：单位/投射物/特效），两者绝对定位重叠，再叠 `#hud` DOM 覆盖层；逻辑尺寸均为 1280×720。按 2.2 顺序先只放 `constants.js` 与 `main.js`。`package.json` 只含 `"scripts": {"test":"node --test tests/","bench":"node tests/bench.js"}`。`.gitignore` 忽略 `node_modules/`、`shots/*.tmp`、`bench/`。

- [ ] **Step 4: 运行确认通过**

Run: `node --test tests/constants.test.js` → PASS。
手动：浏览器打开 `index.html`，看到 1280×720 深色画布且 console 无错。

- [ ] **Step 5: 初始化仓库并提交**

```bash
cd games/zombie-defense && git init
git add . && git commit -m "feat(m1): project skeleton, constants, test loader"
```

---

### Task 2: 确定性随机、事件总线、几何工具

**Files:**
- Create: `src/core/rng.js`, `src/core/eventbus.js`, `src/core/geom.js`, `tests/core.test.js`

**Interfaces:**
- Produces: `ZG.Rng.*`、`ZG.EventBus.create`、`ZG.Events`、`ZG.Geom.*`（供所有 sim 任务使用）。

- [ ] **Step 1: 写失败测试**

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const ZG = require('./load-sim.js')();

test('mulberry32 同种子同序列', () => {
  const a = ZG.Rng.stream(123, 'spawn'), b = ZG.Rng.stream(123, 'spawn');
  for (let i = 0; i < 100; i++) assert.equal(a.next(), b.next());
});

test('不同流互不干扰', () => {
  const s1 = ZG.Rng.createStreams(42), s2 = ZG.Rng.createStreams(42);
  s1.spawn.next(); s1.spawn.next();
  assert.equal(s2.hero.next(), s1.hero.next());
});

test('事件总线 on/emit/off', () => {
  const bus = ZG.EventBus.create(); let got = null;
  const fn = p => { got = p; }; bus.on('x:y', fn); bus.emit('x:y', { n: 1 });
  assert.deepEqual(got, { n: 1 }); bus.off('x:y', fn); bus.emit('x:y', { n: 2 });
  assert.deepEqual(got, { n: 1 });
});

test('角度与锥形判定', () => {
  assert.ok(ZG.Geom.inCone(0, 0, 10, 90, 0, 0, 100, 50));   // 正前方
  assert.ok(!ZG.Geom.inCone(0, 0, 10, 90, 0, 0, 100, 40));  // 90° 超出 40° 半角
  assert.ok(Math.abs(ZG.Geom.angleDiff(Math.PI * 1.9, 0) - 0.1 * Math.PI) < 1e-9);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test tests/core.test.js` → FAIL，`ZG.Rng` 未定义。

- [ ] **Step 3: 最小实现**

- `rng.js`：`mulberry32(seed)`；`stream(seed,name)` 用字符串哈希混合种子；提供 `next/int(min,max)/pick/shuffle/chance`（`shuffle` 用 Fish-Yates，只消费本流）。
- `eventbus.js`：`on/once/off/emit/clear`；`emit` 遍历副本，订阅者异常 try/catch 后 `console.error`。
- `geom.js`：`dist`、`angle`、`angleDiff`（归一化到 [-π,π]）、`inCone(cx,cy,facing,x,y,range,halfAngleDeg)`、圆/矩形/点判定、`clampPoint`、`clampToDeploy(point, deploy)`（矩形或圆形部署区）。
- 在 `index.html` 中加入这三个文件（顺序见 2.2）。

- [ ] **Step 4: 运行确认通过**

Run: `node --test tests/core.test.js` → PASS。

- [ ] **Step 5: 提交**

```bash
git add src/core index.html tests/core.test.js
git commit -m "feat(m1): deterministic rng, event bus, geometry helpers"
```

---

### Task 3: 数值公式与全部单位数据

**Files:**
- Create: `src/data/balance.js`, `src/data/humans.js`, `src/data/zombies.js`, `tests/balance.test.js`, `tests/data.test.js`

**Interfaces:**
- Produces: `ZG.Balance.*`、`ZG.Data.humans`（8 职业，数据先行，M1 只实现 4 个行为）、`ZG.Data.zombies`（7 普通 + BOSS）。后续所有任务从这里取数，不得在 sim 里写死数值。

- [ ] **Step 1: 写失败测试**

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const ZG = require('./load-sim.js')();

test('难度公式与计划书一致', () => {
  assert.equal(ZG.Balance.zombieHp(90, 1), 90);
  assert.equal(ZG.Balance.zombieHp(90, 7).toFixed(2), '127.67');
  assert.equal(ZG.Balance.zombieDamage(8, 51), 12);          // +50% 上限
  assert.equal(ZG.Balance.zombieSpeed(38, 60), 47.5);        // ×1.25 上限
  assert.equal(ZG.Balance.bounty(6, 7), 7);                  // floor(6×1.18)
  assert.equal(ZG.Balance.populationCap(1), 10);
  assert.equal(ZG.Balance.populationCap(7), 22);
  assert.equal(ZG.Balance.populationCap(40), 80);
  assert.equal(ZG.Balance.roundReward(1), 72);
  assert.equal(ZG.Balance.bossHp(7).toFixed(2), '2633.97');
  assert.equal(ZG.Balance.bossRockDamage(7), 122);
  assert.equal(ZG.Balance.bossReward(7), 750);
});

test('科技费用按购买前等级计价', () => {
  assert.equal(ZG.Balance.techCost('fire', 0), 120);
  assert.equal(ZG.Balance.techCost('fire', 1), 174);
  assert.equal(ZG.Balance.techCost('econ', 0), 100);
  assert.equal(ZG.Balance.techCost('econ', 1), 140);
  assert.equal(ZG.Balance.techMul('fire', 10), 1.5);
  assert.equal(ZG.Balance.techMul('armor', 10), 1.6);
});

test('人类数据表精确', () => {
  const h = ZG.Data.humans;
  assert.deepEqual([h.pistol.cost, h.pistol.hp, h.pistol.attack.damage, h.pistol.attack.interval], [60, 140, 12, 0.5]);
  assert.equal(h.shotgun.attack.pellets * h.shotgun.attack.damage / h.shotgun.attack.interval, 50);
  assert.equal((45 * 9 / (45 / 9 + 2)).toFixed(1), '57.9');       // 机枪综合 DPS
  assert.deepEqual([h.flame.attack.damage, h.flame.attack.interval, h.flame.attack.coneDeg], [5, 0.125, 50]);
  assert.deepEqual([h.rocket.attack.damage, h.rocket.attack.interval, h.rocket.attack.siegeBonus], [130, 2, 1.25]);
  assert.deepEqual([h.shield.shieldHp, h.shield.attack.range], [250, 50]);
  assert.deepEqual([h.medic.healRate, h.medic.serumLeft, h.medic.serumAmount], [20, 3, 50]);
  assert.deepEqual([h.civilian.cost, h.civilian.income], [40, 12]);
});

test('僵尸数据表精确', () => {
  const z = ZG.Data.zombies;
  assert.deepEqual([z.walker.hp, z.walker.speed, z.walker.damage, z.walker.bounty], [90, 38, 8, 6]);
  assert.deepEqual([z.runner.hp, z.runner.speed, z.runner.bounty], [60, 75, 9]);
  assert.deepEqual([z.shield.hp, z.shield.shield, z.shield.shieldReduction], [200, 200, 0.7]);
  assert.deepEqual([z.boomer.fuse, z.boomer.explosion.radius, z.boomer.explosion.infection], [0.8, 80, 100]);
  assert.deepEqual([z.mother.hp, z.mother.deathExplosion.human, z.mother.deathExplosion.building], [360, 80, 200]);
  assert.deepEqual([z.giant.hp, z.giant.buildingMultiplier, z.giant.radius], [1100, 3, 22]);
  assert.deepEqual([z.baby.hp, z.baby.speed, z.baby.bounty], [40, 55, 2]);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test tests/balance.test.js tests/data.test.js`
Expected: FAIL，`ZG.Balance` / `ZG.Data` 未定义。

- [ ] **Step 3: 最小实现**

- `balance.js`：严格实现计划书附录 B 的 11 条公式；`techCost` 向下取整；`techMul` 返回 `{damage, maxHp, kill, reward, heal, serum}` 中对应项。
- `humans.js`：8 条记录，字段 `cost/hp/pop/radius/range/symbol/color/attack|heal|income`。攻击对象统一为 `{kind, damage, interval, range, damageKind, targeting, ...}`；四类投射物 `bullet/rocket/vial/flame`；盾兵加 `shieldHp/shieldReduction/tauntRadius`；治疗兵加 `healRate/healRange/serumLeft/serumAmount/serumCd`。
- `zombies.js`：7 条普通记录 + `boss`；解锁回合、感染概率、冲刺/攻城/爆炸/爆仔字段按计划书第 5 章；BOSS 用公式而非固定值。
- 在 `index.html` 中按 2.2 加入。

- [ ] **Step 4: 运行确认通过**

Run: `node --test tests/balance.test.js tests/data.test.js` → PASS。

- [ ] **Step 5: 提交**

```bash
git add src/data index.html tests/balance.test.js tests/data.test.js
git commit -m "feat(m1): balance formulas and full unit data tables"
```

---

### Task 4: 状态工厂、快照哈希、空间哈希

**Files:**
- Create: `src/core/state.js`, `src/sim/spatial.js`, `tests/state.test.js`, `tests/spatial.test.js`

**Interfaces:**
- Produces: `ZG.State.create/spawnHuman/spawnZombie/spawnBuilding/remove/nextId/snapshot/hash`；`ZG.Spatial.create/rebuild/queryCircle/queryNearest`。

- [ ] **Step 1: 写失败测试**

```js
test('状态工厂初始值', () => {
  const s = ZG.State.create({ mapId: 'suburban', seed: 42 });
  assert.equal(s.status, 'prep');
  assert.equal(s.round, 1);
  assert.equal(s.money, 400);
  assert.equal(s.humans.length + s.zombies.length, 0);
  assert.equal(s.uid, 1);
});

test('实体 ID 单调且快照稳定', () => {
  const s = ZG.State.create({ mapId: 'suburban', seed: 1 });
  const a = ZG.State.spawnHuman(s, 'pistol', 600, 600);
  const z = ZG.State.spawnZombie(s, 'walker', 600, 100);
  assert.equal(a.id, 1); assert.equal(z.id, 2);
  assert.equal(ZG.State.hash(s), ZG.State.hash(s));
  z.x += 1;
  assert.notEqual(ZG.State.hash(s), ZG.State.hash(s));
});

test('空间哈希圆形查询与最近目标', () => {
  const s = ZG.State.create({ mapId: 'suburban', seed: 1 });
  const a = ZG.State.spawnZombie(s, 'walker', 100, 100);
  const b = ZG.State.spawnZombie(s, 'walker', 300, 100);
  const h = ZG.Spatial.create(); ZG.Spatial.rebuild(h, s);
  assert.deepEqual(ZG.Spatial.queryCircle(h, 110, 100, 50).map(e => e.id), [a.id]);
  assert.equal(ZG.Spatial.queryNearest(h, 90, 100, 500, e => e.kind === 'zombie').id, a.id);
  assert.equal(ZG.Spatial.queryNearest(h, 90, 100, 150, e => e.kind === 'zombie').id, a.id);
  assert.equal(ZG.Spatial.queryNearest(h, 900, 900, 100, e => true), null);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test tests/state.test.js tests/spatial.test.js` → FAIL。

- [ ] **Step 3: 最小实现**

- `state.js`：按 2.4 建对象；`spawnHuman` 从 `ZG.Data.humans` 复制数据并派生 `hp/maxHp/range/...`；`spawnZombie` 接收 `extra` 覆盖（BOSS HP、转化丧尸等）；`snapshot` 输出按 id 排序的稳定结构；`hash` 用 FNV-1a 对 `JSON.stringify(snapshot)` 计算。
- `spatial.js`：格子 64px，桶数组；`rebuild` 每步重建；`queryCircle` 只查覆盖格子；`queryNearest` 由近到远扩格，返回首个满足 filter 的最近实体；插入人类、僵尸、建筑。

- [ ] **Step 4: 运行确认通过**

Run: `node --test tests/state.test.js tests/spatial.test.js` → PASS。

- [ ] **Step 5: 提交**

```bash
git add src/core/state.js src/sim/spatial.js tests/state.test.js tests/spatial.test.js index.html
git commit -m "feat(m1): state factory, snapshot hash, spatial hash"
```

---

### Task 5: 地图数据、导航网格、流场与地图校验

**Files:**
- Create: `src/data/maps.js`, `src/sim/pathing.js`, `tests/pathing.test.js`

**Interfaces:**
- Produces: `ZG.Data.maps.suburban`（M1）、`ZG.Pathing.build/directionAt/nearestReachable/validate`。`state.pathing` 由 `Sim.createGame` 挂载。

- [ ] **Step 1: 写失败测试**

```js
test('郊区公路网格与流场', () => {
  const map = ZG.Data.maps.suburban;
  const s = ZG.State.create({ mapId: 'suburban', seed: 1 });
  s.map = map; s.slots = map.slots.map(sl => ({ ...sl, buildingId: null, rubble: false }));
  s.pathing = ZG.Pathing.build(s);
  assert.equal(s.pathing.cols, 40); assert.equal(s.pathing.rows, 23);
  for (const sp of map.spawns) {
    const d = ZG.Pathing.directionAt(s.pathing, sp.x, sp.y);
    assert.ok(d.y > 0, '出生点流场应指向下方部署区');
  }
});

test('满建仍可达且绕行 ≤1.35 倍', () => {
  const r = ZG.Pathing.validate(ZG.Data.maps.suburban);
  assert.equal(r.ok, true);
  assert.ok(r.maxDetour <= 1.35, `maxDetour=${r.maxDetour}`);
});

test('不可达点能返回最近可达格', () => {
  const map = ZG.Data.maps.suburban;
  const s = ZG.State.create({ mapId: 'suburban', seed: 1 });
  s.map = map; s.slots = map.slots.map(sl => ({ ...sl, buildingId: null, rubble: false }));
  const p = ZG.Pathing.nearestReachable(ZG.Pathing.build(s), 40, 40);
  assert.ok(p.x >= 0 && p.y >= 0);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test tests/pathing.test.js` → FAIL。

- [ ] **Step 3: 最小实现**

- `maps.js` 先实现郊区公路：
  - `deploy: {kind:'rect', x:140, y:520, w:1000, h:160}`
  - `spawns: [{x:80,y:80},{x:1200,y:80}]`
  - `obstacles: [{kind:'circle',x:420,y:300,r:36,theme:'car'},{kind:'circle',x:860,y:300,r:36,theme:'car'}]`
  - `slots: [{id:'s1',x:260,y:460},…,{id:'s6',x:1020,y:460}]`（6 个）
  - `theme` 配色、`name:'郊区公路'`、`difficulty:1`。
- `pathing.js`（参考 Flow-Field-Generator 的 `reached` 计数法）：
  - `cols=40, rows=23`；`blocked: Uint8Array`、`dist: Uint16Array`、`dirIndex: Uint8Array`（0–7）、`stamp: Uint32Array`、`queue: Int32Array(cols*rows)`。
  - 每次重建 `epoch++`；入队检查 `stamp[cell] !== epoch`，**不整数组 `fill()`**，避免每步重建时的大数组清零开销（其 1000×1000 压测正是靠这个做法）。
  - BFS 用头/尾指针的环形队列，禁止 `shift()`；默认 4 邻域（不切角），提供 `enableDiagonal` 仅用于校验/调试。
  - 以“格心在部署区内”的所有可走格为多源，`dist=0`；方向场由 `dist` 差反推；部署区内 `dir` 指向区中心。
  - 圆/矩形障碍按格心栅格化；建筑按半径 24 阻挡（路障同样阻挡；M1 无建筑）。
  - `validate(map)`：临时建满槽位，用 **BFS 回溯真实格路径长度**（不是欧氏）÷ 出生点到部署区直线距离，返回 `{ok, maxDetour}`；同时校验出生点不在部署区、每个槽位可被至少一个出生点到达、部署区面积 ≥ `99 × π × 12² × 1.2`（80 人口 + 4 英雄 + 15 转化兵的最小估算）。
  - 额外导出 `Pathing.pathToTarget(pathing, x, y)` 仅供测试/校验回溯；运行时只读方向。
  - 重建触发：地图加载、建造、拆除、建筑被摧毁；战斗中一次重算，不在每步重算。
- `Sim.createGame` 在本任务里先只做 `state.map/map.slots/pathing` 挂载；完整生命周期在 Task 7。

- [ ] **Step 4: 运行确认通过**

Run: `node --test tests/pathing.test.js` → PASS。若 detour 超限，微调车的位置/半径，不改设计意图。

- [ ] **Step 5: 提交**

```bash
git add src/data/maps.js src/sim/pathing.js tests/pathing.test.js index.html
git commit -m "feat(m1): suburban map, navigation grid, flow field, map validation"
```

---

### Task 6: 波次构成与出生队列

**Files:**
- Create: `src/data/waves.js`, `src/sim/spawner.js`, `tests/waves.test.js`

**Interfaces:**
- Produces: `ZG.Waves.composition/total/isBossRound/preview/build`；`ZG.Spawner.prepare/step/remaining`。

- [ ] **Step 1: 写失败测试**

```js
test('波次数量与构成', () => {
  assert.deepEqual(ZG.Waves.composition(1), { walker: 11, runner: 0, shield: 0, boomer: 0, mother: 0, giant: 0 });
  assert.deepEqual(ZG.Waves.composition(3), { walker: 18, runner: 3, shield: 0, boomer: 0, mother: 0, giant: 0 });
  assert.deepEqual(ZG.Waves.composition(4), { walker: 18, runner: 4, shield: 2, boomer: 2, mother: 0, giant: 0 });
  assert.deepEqual(ZG.Waves.composition(5), { walker: 17, runner: 5, shield: 3, boomer: 3, mother: 3, giant: 0 });
  assert.deepEqual(ZG.Waves.composition(6), { walker: 16, runner: 6, shield: 5, boomer: 4, mother: 3, giant: 2 });
  assert.deepEqual(ZG.Waves.composition(7), { walker: 19, runner: 7, shield: 5, boomer: 5, mother: 3, giant: 2 });
  assert.equal(ZG.Waves.total(7), 41);
});

test('BOSS 回合与护卫', () => {
  assert.equal(ZG.Waves.isBossRound(7), true);
  assert.equal(ZG.Waves.isBossRound(8), false);
  assert.equal(ZG.Waves.preview(7).escort, 8);
  assert.equal(ZG.Waves.preview(7).boss, true);
});

test('批次总量与间隔', () => {
  const rng = ZG.Rng.createStreams(9).spawn;
  const w = ZG.Waves.build(7, rng, ZG.Data.maps.suburban);
  const n = w.batches.reduce((s, b) => s + b.spawns.length, 0);
  assert.equal(n, 49);
  for (const b of w.batches) assert.ok(b.spawns.length >= 6 && b.spawns.length <= 12);
  assert.ok(w.batches[0].at === 5);
  assert.ok(w.batches.every((b, i) => i === 0 || b.at - w.batches[i - 1].at >= 5));
  assert.ok(w.batches.some(b => b.spawns.some(s => s.type === 'boss')));
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test tests/waves.test.js` → FAIL。

- [ ] **Step 3: 最小实现**

- `composition(R)`：按计划书 5.3 的百分比与解锁；用“最大余数法”分配整数，余数相同按固定类型顺序 `[walker,runner,shield,boomer,mother,giant]`；R≥10 每 5 回合按 2.7 第 4 条转移 2%。
- `preview(R)`：基于 `composition`，BOSS 回合追加 `round(N*0.2)` 护卫；返回 `newTypes`（本回合新解锁类型）。
- `build(R, rng, map)`：批次 6–12、间隔 5–8、首波 5s、`portalAt = at - 1`；把本回合类型多重集洗牌后切批；BOSS **计入中间批次的 6–12 只配额**，不额外加批；护卫均匀分到各批；出生点轮流选取。
- `spawner.js`：`prepare` 调 `Waves.build`；`step` 按 `battle.time` 触发批次，提前 1 秒 emit `zombie:spawned` 的预警事件（`{portal:true,x,y}`）；实际出生调用 `State.spawnZombie` 并带当回合系数；`remaining` 返回未出生总数。

- [ ] **Step 4: 运行确认通过**

Run: `node --test tests/waves.test.js` → PASS。

- [ ] **Step 5: 提交**

```bash
git add src/data/waves.js src/sim/spawner.js tests/waves.test.js index.html
git commit -m "feat(m1): wave composition, batches, spawn queue"
```

---

### Task 7: 回合生命周期与固定步进器

**Files:**
- Create: `src/sim/sim.js`, `tests/round.test.js`

**Interfaces:**
- Produces: `ZG.Sim.createGame/startRound/step/tick/checkRoundEnd/settleRound/restart`；`state.spawner` 由 Task 6 接入。

- [ ] **Step 1: 写失败测试**

```js
test('创建游戏与开始回合', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 7 });
  assert.equal(s.status, 'prep');
  assert.equal(s.money, 400);
  assert.equal(s.battle.time, 0);
  ZG.State.spawnHuman(s, 'pistol', 600, 600);
  assert.equal(ZG.Sim.startRound(s).ok, true);
  assert.equal(s.status, 'battle');
  assert.ok(s.spawner.batches.length > 0);
});

test('清场后 3 秒结算并进入下一回合整备', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 7 });
  ZG.State.spawnHuman(s, 'pistol', 600, 600);
  ZG.Sim.startRound(s);
  s.spawner.batches = []; s.spawner.batchIndex = 0; s.zombies.length = 0;
  ZG.Sim.tick(s, 60 * 4);
  assert.equal(s.status, 'prep');
  assert.equal(s.round, 2);
  assert.equal(s.money, 400 + 72);
});

test('同种子同操作哈希一致', () => {
  const run = () => {
    const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 99 });
    ZG.State.spawnHuman(s, 'pistol', 600, 600);
    ZG.State.spawnHuman(s, 'shield', 620, 560);
    ZG.Sim.startRound(s);
    ZG.Sim.tick(s, 120);
    return ZG.State.hash(s);
  };
  assert.equal(run(), run());
});

test('没有人类不能开始回合', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  assert.deepEqual(ZG.Sim.startRound(s), { ok: false, reason: 'no-humans' });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test tests/round.test.js` → FAIL。

- [ ] **Step 3: 最小实现**

- `createGame`：`State.create` + 挂载 map/slots/pathing + `spawner` 初始空 + `bus`。
- `startRound`：校验人类 > 0；重置 `battle`、`projectiles`、`effects`；`Spawner.prepare`；`status='battle'`；emit `round:started`。
- `step`：按 2.6 顺序调用系统；本任务中 AI/战斗/投射物可为空函数，但 `checkRoundEnd` 与 `settleRound` 必须真实工作。
- `checkRoundEnd`：`remaining===0 && zombies.length===0` 时累计 3 秒 `infectionTimer`，满 3 秒进入 `settlement` 并调 `settleRound`；人类为 0 时走死亡确认。
- `settleRound`（本任务先实现完整骨架）：存活回血 30%、感染 clamp、平民收入、通关奖励、`round += 1`、`status='prep'`、emit `round:settled`。
- `tick(state,n)`：循环 `step`，与渲染无关。
- `restart`：`createGame` 同 mapId、新种子或同种子（参数决定）。

- [ ] **Step 4: 运行确认通过**

Run: `node --test tests/round.test.js` → PASS。

- [ ] **Step 5: 提交**

```bash
git add src/sim/sim.js tests/round.test.js index.html
git commit -m "feat(m1): round lifecycle and fixed-step simulator"
```

---

### Task 8: 僵尸 AI、移动、伤害管线与死亡转化

**Files:**
- Create: `src/sim/ai.js`, `src/sim/combat.js`, `src/sim/stats.js`, `tests/zombie-ai.test.js`, `tests/combat.test.js`

**Interfaces:**
- Produces: `ZG.AI.stepZombies/pickZombieTarget`、`ZG.Combat.applyDamage/attack/earn`、`ZG.Stats.zombie`。人类索敌留给 Task 9。

- [ ] **Step 1: 写失败测试**

```js
test('普通丧尸沿流场接近并攻击人类', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 3 });
  const h = ZG.State.spawnHuman(s, 'pistol', 600, 600);
  const z = ZG.State.spawnZombie(s, 'walker', 600, 100);
  ZG.Sim.startRound(s); s.spawner.batches = []; s.spawner.batchIndex = 0;
  ZG.Sim.tick(s, 300);
  assert.ok(z.y > 100, '应向部署区移动');
  assert.ok(h.hp < h.maxHp || z.y > 400, '应接近并造成伤害');
});

test('击杀僵尸给赏金并移除', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 3 });
  ZG.State.spawnHuman(s, 'pistol', 600, 600);
  const z = ZG.State.spawnZombie(s, 'walker', 600, 500);
  const before = s.money;
  const r = ZG.Combat.applyDamage(s, { target: z, amount: 999, damageKind: 'ranged' });
  assert.equal(r.killed, true);
  assert.equal(z.alive, false);
  assert.equal(s.money, before + 6);
});

test('人类死亡变成 50% HP 的转化丧尸，赏金 0', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 3 });
  const h = ZG.State.spawnHuman(s, 'pistol', 600, 600);
  ZG.Combat.applyDamage(s, { target: h, amount: 999, damageKind: 'melee' });
  const turned = s.zombies.find(z => z.typeId === 'walker' && z.turnedFromHuman);
  assert.ok(turned);
  assert.equal(turned.bounty, 0);
  assert.equal(turned.maxHp.toFixed(1), (90 * 0.5).toFixed(1));
});

test('没有友伤', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 3 });
  const a = ZG.State.spawnHuman(s, 'pistol', 600, 600);
  const b = ZG.State.spawnHuman(s, 'pistol', 620, 600);
  ZG.Combat.applyDamage(s, { target: b, amount: 999, damageKind: 'ranged', friendly: true });
  // 友伤由调用方禁止；管线断言直接攻击人类只在敌方来源时生效
  assert.equal(b.alive, true);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test tests/zombie-ai.test.js tests/combat.test.js` → FAIL。

- [ ] **Step 3: 最小实现**

- `stats.js`：`zombie(state,z)` 只计算当回合伤害/速度等有效值，**不每步覆盖 `maxHp/hp`**；HP 在 `State.spawnZombie` 时按 `Balance` 公式写入（测试可安全覆写 HP）。`human` 先返回基础值（科技/队长在后续任务扩展）。
- `applyDamage`：目标存活检查 → 护盾/减伤（Task 10 完整化，先留 `resolveShield` 钩子）→ 扣 HP → 死亡。死亡分支：僵尸 → 赏金（`bounty>0` 才给）、emit `zombie:died`；普通人类 → 在死亡位置生成 `walker` 转化丧尸（HP=当回合 walker HP×0.5，赏金 0，`turnedFromHuman:true`），人类移除并 emit `human:died`；队长/英雄分支留空（Task 19/27）。
- `AI.stepZombies`：状态 `approach/attack`；`pickZombieTarget`：最近人类，盾兵 90 内优先（Task 10 生效，先按最近）；无人类 → 部署区中心。移动：`Pathing.directionAt` 速度 × `Stats`；进入部署区后直接朝目标转向；近战距离 `r1+r2+4`，冷却按间隔。
- 分离：`Spatial.queryCircle` 取最多 8 个僵尸做软推挤（重叠时各退一半）。
- 人类不参与推挤。
- 反卡死：每只僵尸记录 `lastX/lastY/stuckT`，8 秒位移 <4px 且未攻击 → `Pathing.nearestReachable` 传送。

- [ ] **Step 4: 运行确认通过**

Run: `node --test tests/zombie-ai.test.js tests/combat.test.js` → PASS。

- [ ] **Step 5: 提交**

```bash
git add src/sim/ai.js src/sim/combat.js src/sim/stats.js tests/zombie-ai.test.js tests/combat.test.js index.html
git commit -m "feat(m1): zombie movement, targeting, damage pipeline, death conversion"
```

---

### Task 9: 人类索敌、攻击与投射物表现

**Files:**
- Create: `src/sim/projectiles.js`，修改 `src/sim/ai.js`、`src/sim/combat.js`，`tests/human-ai.test.js`

**Interfaces:**
- Produces: `ZG.AI.stepHumans/pickHumanTarget`、`ZG.Projectiles.spawn/step/explode`；子弹为瞬时伤害 + 曳光效果，火箭/药瓶/石块在 Task 16/24 扩展。

- [ ] **Step 1: 写失败测试**

```js
test('手枪兵每秒造成 24 伤害', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 5 });
  ZG.State.spawnHuman(s, 'pistol', 600, 600);
  const z = ZG.State.spawnZombie(s, 'walker', 600, 500); // 100px，射程内
  z.speed = 0; ZG.Sim.startRound(s); s.spawner.batches = [];
  const before = z.hp; ZG.Sim.tick(s, 60);
  assert.ok(Math.abs((before - z.hp) - 24) < 1e-6, `实际 ${before - z.hp}`);
});

test('霰弹兵单目标 5 弹丸全中', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 5 });
  ZG.State.spawnHuman(s, 'shotgun', 600, 600);
  const z = ZG.State.spawnZombie(s, 'walker', 600, 520); // 80px
  z.speed = 0; ZG.Sim.startRound(s); s.spawner.batches = [];
  const before = z.hp; ZG.Sim.tick(s, 60);
  assert.ok(Math.abs((before - z.hp) - 50) < 1e-6);
});

test('霰弹 120 外衰减一半', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 5 });
  ZG.State.spawnHuman(s, 'shotgun', 600, 600);
  const z = ZG.State.spawnZombie(s, 'walker', 600, 450); // 150px
  z.speed = 0; ZG.Sim.startRound(s); s.spawner.batches = [];
  const before = z.hp; ZG.Sim.tick(s, 60);
  assert.ok(Math.abs((before - z.hp) - 25) < 1e-6);
});

test('靶子超出射程不受伤', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 5 });
  ZG.State.spawnHuman(s, 'pistol', 600, 680);
  const z = ZG.State.spawnZombie(s, 'walker', 600, 100); // 580px
  z.speed = 0; ZG.Sim.startRound(s); s.spawner.batches = [];
  const before = z.hp; ZG.Sim.tick(s, 60);
  assert.equal(z.hp, before);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test tests/human-ai.test.js` → FAIL。

- [ ] **Step 3: 最小实现**

- `pickHumanTarget`：手枪/机枪最近目标（按边缘距离）；霰弹在 5 条射线上按“锥内目标由近到远循环”分配；喷火/导弹留到 M2。
- `Stats.human`：输出 `damage/interval/range/attackSpeed`；本任务只有基础值。
- 攻击：冷却按 `interval`；手枪/机枪每发调用 `Projectiles.spawn({type:'bullet'})`，子弹瞬时结算并生成 2–3 帧曳光（`state.effects`）；霰弹 5 发弹丸同帧结算。
- 伤害类型：手枪/机枪/霰弹 = `ranged`；霰弹在 120–180 距离伤害 ×0.5。
- 玩家单位无友伤：`applyDamage` 对同阵营直接忽略。
- `Projectiles.step` 处理未来的实体投射物；子弹不占投射物数组。

- [ ] **Step 4: 运行确认通过**

Run: `node --test tests/human-ai.test.js` → PASS。

- [ ] **Step 5: 提交**

```bash
git add src/sim/ai.js src/sim/combat.js src/sim/stats.js src/sim/projectiles.js tests/human-ai.test.js index.html
git commit -m "feat(m1): human targeting, attacks, shotgun pellets, tracers"
```

---

### Task 10: 护盾、嘲讽、治疗与感染核心

**Files:**
- Create: `src/sim/infection.js`，修改 `src/sim/combat.js`、`src/sim/ai.js`、`src/sim/stats.js`，`tests/shield-medic.test.js`

**Interfaces:**
- Produces: `ZG.Infection.add/dispel/tick/settlementClamp`；护盾判定 `Combat.resolveShield`；盾兵嘲讽；治疗兵治疗/血清。

- [ ] **Step 1: 写失败测试**

```js
test('盾尸正面远程减伤 70% 并先扣盾', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  const z = ZG.State.spawnZombie(s, 'shield', 600, 500);
  z.facing = Math.PI / 2; // 朝下
  const r = ZG.Combat.applyDamage(s, { target: z, amount: 100, damageKind: 'ranged', fromX: 600, fromY: 700 });
  assert.equal(r.shieldDamage, 30);
  assert.equal(z.shield, 170);
  assert.equal(z.hp, z.maxHp);
});

test('近战绕过盾，火焰只吃一半减伤', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  const z = ZG.State.spawnZombie(s, 'shield', 600, 500); z.facing = Math.PI / 2;
  ZG.Combat.applyDamage(s, { target: z, amount: 100, damageKind: 'melee', fromX: 600, fromY: 700 });
  assert.equal(z.hp, z.maxHp - 100);
  const z2 = ZG.State.spawnZombie(s, 'shield', 700, 500); z2.facing = Math.PI / 2;
  const r = ZG.Combat.applyDamage(s, { target: z2, amount: 100, damageKind: 'fire', fromX: 700, fromY: 700 });
  assert.equal(r.shieldDamage, 50);
});

test('盾兵 90 内嘲讽优先', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  const tank = ZG.State.spawnHuman(s, 'shield', 600, 600);
  ZG.State.spawnHuman(s, 'pistol', 660, 600);
  const z = ZG.State.spawnZombie(s, 'walker', 640, 560);
  assert.equal(ZG.AI.pickZombieTarget(s, z).target.id, tank.id);
});

test('治疗兵每秒 +20 HP，感染 ≥50 优先用血清', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  const h = ZG.State.spawnHuman(s, 'pistol', 600, 600);
  ZG.State.spawnHuman(s, 'medic', 620, 600);
  h.hp = 100; h.infection = 60;
  ZG.Sim.startRound(s); s.spawner.batches = [];
  ZG.Sim.tick(s, 60);
  assert.equal(h.infection, 10);
  assert.ok(h.hp > 100);
});

test('100 感染每秒掉 2% 最大生命', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  const h = ZG.State.spawnHuman(s, 'pistol', 600, 600); h.infection = 100;
  const before = h.hp; ZG.Infection.tick(s);
  // 一步 1/60 秒
  assert.ok(Math.abs((before - h.hp) - (h.maxHp * 0.0002 * 100 / 60)) < 1e-9);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test tests/shield-medic.test.js` → FAIL。

- [ ] **Step 3: 最小实现**

- `resolveShield`：若目标有盾且距离 >40、攻击来自正面 120°（以 `target.facing` 与 `fromX/fromY` 判定）→ ranged 减免 70%，fire/explosion 减免 50%，melee 不减免；减免后扣盾，溢出进 HP；盾到 0 → `target.slowFactor = max(slowFactor, 0.2)` 并 emit 提示。
- 盾兵：250 盾、正面 40%（fire/explosion 只吃 20%），判定距离 >40；90 半径嘲讽；`pickZombieTarget` 优先嘲讽盾兵。
- 治疗兵：AI 优先感染 ≥50，其次血量百分比最低；治疗 20/s 连续施加；血清每回合 3 次、8 秒 CD、每次驱散 50；血清优先于普通治疗。
- `Infection`：`add` clamp 100；`tick` 按 `maxHp*0.0002*infection/60` 扣血并检查死亡；`dispel` 减感染；`settlementClamp` 压到 30（有治疗兵/疫医时 0）。
- 医疗站/血清科技留到 M2，但 `settlementClamp` 的“有治疗兵”分支现在生效。

- [ ] **Step 4: 运行确认通过**

Run: `node --test tests/shield-medic.test.js` → PASS。

- [ ] **Step 5: 提交**

```bash
git add src/sim/infection.js src/sim/combat.js src/sim/ai.js src/sim/stats.js tests/shield-medic.test.js index.html
git commit -m "feat(m1): shields, taunt, medic healing, infection core"
```

---

### Task 11: 经济、招募、放置、出售与人口

**Files:**
- Create: `src/sim/economy.js`, `tests/economy.test.js`

**Interfaces:**
- Produces: `ZG.Economy.*`（2.5 列出的全部签名）；`ZG.Sim.applyCommand(state, cmd)` 命令包装层（`recruit/sell/build/demolish/buyTech/startRound`），UI、输入与回放统一走它；M1 科技购买先返回 `{ok:false, reason:'locked'}`。

- [ ] **Step 1: 写失败测试**

```js
test('招募扣钱、占人口', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  const r = ZG.Economy.recruit(s, 'pistol', 600, 600);
  assert.equal(r.ok, true); assert.equal(s.money, 340);
  assert.equal(ZG.Economy.populationUsed(s), 1);
});

test('人口上限与平民上限', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 }); s.money = 99999;
  for (let i = 0; i < 10; i++) assert.equal(ZG.Economy.recruit(s, 'pistol', 200 + i * 30, 600).ok, true);
  assert.deepEqual(ZG.Economy.recruit(s, 'pistol', 900, 600), { ok: false, reason: 'population' });
  const s2 = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 }); s2.money = 99999;
  for (let i = 0; i < 8; i++) assert.equal(ZG.Economy.recruit(s2, 'civilian', 200 + i * 30, 600).ok, true);
  assert.deepEqual(ZG.Economy.recruit(s2, 'civilian', 900, 600), { ok: false, reason: 'civilian-cap' });
});

test('部署区外或重叠位置不能放置', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 }); s.money = 1000;
  assert.equal(ZG.Economy.canPlace(s, 600, 100, 8).ok, false);
  ZG.Economy.recruit(s, 'pistol', 600, 600);
  assert.equal(ZG.Economy.canPlace(s, 602, 600, 8).ok, false);
  assert.equal(ZG.Economy.canPlace(s, 700, 600, 8).ok, true);
});

test('出售返 50%，最后一名人类不能出售', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  const a = ZG.Economy.recruit(s, 'pistol', 600, 600).human;
  const b = ZG.Economy.recruit(s, 'pistol', 700, 600).human;
  assert.equal(ZG.Economy.sell(s, a.id).refund, 30);
  assert.equal(ZG.Economy.sell(s, b.id).ok, false);
});

test('金钱不足返回原因', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 }); s.money = 10;
  assert.deepEqual(ZG.Economy.recruit(s, 'pistol', 600, 600), { ok: false, reason: 'money' });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test tests/economy.test.js` → FAIL。

- [ ] **Step 3: 最小实现**

- `canAfford/spend/earn`：`earn` 走整数并 emit `money:changed`。
- `recruit`：顺序校验 `prep` → 金钱 → 人口 → 平民上限 → `canPlace`；调用 `State.spawnHuman`，扣钱，emit `human:spawned`。
- `canPlace`：在部署区内、不与其他人类/建筑/障碍重叠（圆-圆，含 2px 间隙）、不越界。
- `sell`：`Math.floor(cost*0.5)`；人类数量为 1 时拒绝；移除单位。
- `build/demolish/buyTech`：签名与校验先落地；建筑与科技的完整行为分别在 Task 17/28 补全；M1 返回 `locked`。
- `populationUsed`：只数 `pop>0` 且非转化兵。

- [ ] **Step 4: 运行确认通过**

Run: `node --test tests/economy.test.js` → PASS。

- [ ] **Step 5: 提交**

```bash
git add src/sim/economy.js tests/economy.test.js index.html
git commit -m "feat(m1): economy, recruiting, placement, selling, population"
```

---

### Task 12: 结算细节、失败判定与回合边界

**Files:**
- Modify: `src/sim/sim.js`、`src/sim/combat.js`，`tests/settlement.test.js`

**Interfaces:**
- Produces: 完整 `settleRound` 与 `checkRoundEnd` 分支；`state.battle.deathConfirmT`。

- [ ] **Step 1: 写失败测试**

```js
test('结算回血 30%、感染压到 30、平民收入', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  const h = ZG.State.spawnHuman(s, 'pistol', 600, 600); h.hp = 10; h.infection = 90;
  const c = ZG.State.spawnHuman(s, 'civilian', 700, 600);
  const before = s.money;
  ZG.Sim.startRound(s); s.spawner.batches = []; s.zombies.length = 0;
  ZG.Sim.tick(s, 60 * 4);
  assert.equal(h.hp, 10 + h.maxHp * 0.3);
  assert.equal(h.infection, 30);
  assert.equal(c.alive, true);
  assert.equal(s.money, before + 12 + 72);
});

test('有治疗兵时感染清零', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  const h = ZG.State.spawnHuman(s, 'pistol', 600, 600); h.infection = 80;
  ZG.State.spawnHuman(s, 'medic', 650, 600);
  ZG.Sim.startRound(s); s.spawner.batches = []; s.zombies.length = 0;
  ZG.Sim.tick(s, 60 * 4);
  assert.equal(h.infection, 0);
});

test('人类全灭 1 秒后判负', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  const h = ZG.State.spawnHuman(s, 'pistol', 600, 600);
  ZG.Sim.startRound(s); s.spawner.batches = [];
  ZG.Combat.applyDamage(s, { target: h, amount: 9999, damageKind: 'melee' });
  // 人类死亡会生成转化丧尸，先移除它模拟“彻底全灭”
  s.zombies = s.zombies.filter(z => !z.turnedFromHuman);
  ZG.Sim.tick(s, 59); assert.equal(s.status, 'battle');
  ZG.Sim.tick(s, 2);  assert.equal(s.status, 'over');
});

test('最后一名人类与最后一只僵尸同帧死亡判负', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  const h = ZG.State.spawnHuman(s, 'pistol', 600, 600);
  const z = ZG.State.spawnZombie(s, 'walker', 600, 500);
  ZG.Sim.startRound(s); s.spawner.batches = [];
  ZG.Combat.applyDamage(s, { target: h, amount: 9999, damageKind: 'melee' });
  ZG.Combat.applyDamage(s, { target: z, amount: 9999, damageKind: 'ranged' });
  s.zombies = s.zombies.filter(z2 => !z2.turnedFromHuman);
  ZG.Sim.tick(s, 61);
  assert.equal(s.status, 'over');
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test tests/settlement.test.js` → FAIL。

- [ ] **Step 3: 最小实现**

- `settleRound` 顺序严格按计划书 2.5：回血 30% → 感染 clamp（有治疗兵/疫医则 0）→ 平民 +12 → 通关奖励（含经济科技倍率，M1 为 1）→ 队长（M2 接入）→ 转化兵到期（M3 接入）→ 盾恢复/地雷重布/废墟清理（M2 接入）→ `round++` → `prep`。
- `checkRoundEnd`：先判人类数量 0；再判清场；清场后 3 秒计时；计时期间若又有僵尸/人类变化则重置。
- 死亡确认：`deathConfirmT` 从 0 增到 1.0 秒，期间若人类重新 >0（不会发生，但保留）则取消；满 1 秒 `status='over'`，记录最佳回合（M4 写 localStorage）。
- `startRound` 人类为 0 返回 `no-humans`。
- 同帧：`step` 内先结算所有死亡，再统一调用 `checkRoundEnd`，保证人类全灭优先。

- [ ] **Step 4: 运行确认通过**

Run: `node --test tests/settlement.test.js` → PASS。

- [ ] **Step 5: 提交**

```bash
git add src/sim/sim.js src/sim/combat.js tests/settlement.test.js
git commit -m "feat(m1): settlement, failure confirmation, round edge cases"
```

---

### Task 13: HUD、渲染器、输入与主循环

**Files:**
- Create: `src/view/model.js`, `src/view/renderer.js`, `src/view/hud.js`, `src/view/input.js`，修改 `src/main.js`、`styles.css`，`tests/view-model.test.js`

**Interfaces:**
- Produces: `ZG.Model.topBar/cardState/wavePreview/humanInfo/zombieInfo`；`ZG.Renderer.init/draw/resize`；`ZG.HUD.init/render/toast/setMode`；`ZG.Input.init`。M1 只暴露手枪/霰弹/盾兵/治疗兵四张卡。

- [ ] **Step 1: 写失败测试（纯视图模型）**

```js
test('兵种卡状态与禁用原因', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  assert.deepEqual(ZG.Model.cardState(s, 'pistol'), { disabled: false, reason: null, cost: 60 });
  s.money = 10;
  assert.deepEqual(ZG.Model.cardState(s, 'pistol'), { disabled: true, reason: 'money', cost: 60 });
  s.money = 9999; s.humans = Array(10).fill({ pop: 1, converted: false, alive: true });
  assert.equal(ZG.Model.cardState(s, 'pistol').reason, 'population');
});

test('顶栏与波次预览', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  const bar = ZG.Model.topBar(s);
  assert.equal(bar.round, 1); assert.equal(bar.money, 400);
  assert.equal(bar.pop, 0); assert.equal(bar.popCap, 10);
  assert.equal(bar.heroes, 0); // 人口显示格式：人口 22/22（英雄 1）
  const p = ZG.Model.wavePreview(s);
  assert.equal(p.total, 11); assert.equal(p.boss, false);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test tests/view-model.test.js` → FAIL。

- [ ] **Step 3: 最小实现**

- `model.js`：全部纯函数，只读 state；`cardState` 复刻 Economy 的校验顺序；`wavePreview` 调 `Waves.preview`；`topBar` 返回 `round/money/pop/popCap/heroes/zombies/speed/paused`，人口按“22/22（英雄 1）”格式渲染。
- `renderer.js`：DPR 处理；**分层 canvas**（参考 monster-tower-defense 的 double buffering）——`#game-bg` 只在加载地图/建造/拆除/建筑被毁时重绘（网格、道路、障碍、部署区、槽位、出生点），`#game` 每帧只清动态层并绘制建筑、僵尸、人类、投射物、血条（仅受伤）、感染条、护盾弧、队长金环；放置模式在动态层画射程圈与绿/红幽灵。查询/绘制不分配临时数组。
- `hud.js`：顶部 HUD（回合/金钱/人口/僵尸/速度/暂停）、底部三页签（招募可用，建筑/科技 M2）、四张兵种卡、开始回合按钮、收入明细弹窗、游戏结束弹窗。DOM 结构写在 `index.html` 或由 `init` 创建；事件委托到回调。
- `input.js`：鼠标左键选卡/放置/选中；右键/Esc 取消；整备期拖动人类；空格暂停；1/2/3 速度；Tab 切页签。触控在 M4 扩展。
- `main.js`：初始化 `Sim.createGame` → Renderer/HUD/Input；`requestAnimationFrame` 主循环：

```js
const dt = Math.min(now - last, 250); last = now;
if (state.status === 'battle' && !state.paused) {
  acc += dt * state.ui.speed;
  let steps = 0;
  while (acc >= ZG.Const.STEP_MS && steps < ZG.Const.MAX_STEPS_PER_FRAME) {
    ZG.Sim.step(state); acc -= ZG.Const.STEP_MS; steps++;
  }
  if (steps === ZG.Const.MAX_STEPS_PER_FRAME) acc = 0;
}
Renderer.draw(state); HUD.render(state);
```

- [ ] **Step 4: 运行确认通过**

Run: `node --test tests/view-model.test.js` → PASS。
手动验收：
1. 打开 `index.html`，顶部显示“回合 1 / 金钱 400 / 人口 0/10 / 僵尸 0”。
2. 点手枪卡→部署区出现绿色射程圈→点击放置，金钱变 340。
3. 点“开始回合”，5 秒后僵尸出现并走向防线，手枪自动开火。
4. 清场后出现收入明细，进入回合 2 整备；刷新无 console 错误。

- [ ] **Step 5: 提交**

```bash
git add src/view src/main.js styles.css index.html tests/view-model.test.js
git commit -m "feat(m1): canvas renderer, DOM hud, input, main loop"
```

---

### Task 14: 测试钩子、M1 验收与性能基准

**Files:**
- Create: `src/test-hooks.js`, `tests/acceptance-m1.test.js`, `tests/bench.js`，修改 `README.md`

**Interfaces:**
- Produces: `window.__game`（计划书 12.7 全部字段与方法 + `record/replay`）；`ZG.Sim.applyCommand/record`；`node tests/bench.js` 输出模拟/渲染耗时。

- [ ] **Step 1: 写失败测试**

```js
test('种子 + 整备期命令可完整回放', () => {
  const cmds = [
    { op: 'recruit', classId: 'pistol', x: 600, y: 600 },
    { op: 'recruit', classId: 'shield', x: 620, y: 560 },
    { op: 'startRound' }
  ];
  const run = () => {
    const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 5 });
    for (const c of cmds) assert.equal(ZG.Sim.applyCommand(s, c).ok, true);
    ZG.Sim.tick(s, 600);
    return ZG.State.hash(s);
  };
  assert.equal(run(), run());
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 5 });
  for (const c of cmds) ZG.Sim.applyCommand(s, c);
  assert.deepEqual(ZG.Sim.record(s), cmds);
});

test('测试钩子能确定性推进一回合', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 123 });
  ZG.State.spawnHuman(s, 'pistol', 600, 600);
  ZG.Sim.startRound(s);
  ZG.Sim.tick(s, 60 * 8);
  assert.ok(['battle', 'settlement', 'prep', 'over'].includes(s.status));
  assert.equal(typeof ZG.State.hash(s), 'string');
});

test('10 回合冒烟：不抛异常', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 77 });
  for (let r = 0; r < 10; r++) {
    s.money = 99999;
    if (s.status === 'over') break;
    if (s.status === 'prep') {
      while (ZG.Economy.recruit(s, 'pistol', 300 + (s.humans.length % 10) * 60, 620).ok) {}
      ZG.Sim.startRound(s);
    }
    ZG.Sim.tick(s, 60 * 250);
  }
  assert.ok(s.round >= 2);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test tests/acceptance-m1.test.js` → FAIL。

- [ ] **Step 3: 最小实现**

- `test-hooks.js`：`window.__game` 暴露 `state`（字符串）、`round/money/population/seed`、`units/zombies/buildings/projectiles`、`snapshot()`、`startRound/spawn/damage/infect/forcePromotion/forceHero/tick/setSpeed/stopLoop/resumeLoop`、`record()/replay(seed, commands)`；`spawn(type,x,y)` 按 `ZG.Data.zombies[type]` 或 `humans[type]` 判断；`stopLoop/resumeLoop` 控制 `main.js` 的 rAF 标志。
- Task 11 已落地 `Sim.applyCommand`；本任务补齐 `record/replay`：命令成功执行后追加到 `state.commands`，`record` 返回深拷贝；`replay` 用同 seed + 同命令序列 + 同 tick 数重建。战斗全自动，不记录战斗内操作。
- 检查 `input.js`/`hud.js` 的所有操作都走 `Sim.applyCommand`，避免“UI 一套、bot 一套、回放一套”三套逻辑漂移。
- `bench.js`：构造 300 僵尸 + 99 人类 + 100 投射物，跑 600 步，输出 `avgStepMs/maxStepMs`；不设硬断言。
- `README.md` 更新为“M1 可玩”，写运行方式与测试命令。

- [ ] **Step 4: 运行确认通过**

Run:
- `node --test tests/` → 全绿。
- `node tests/bench.js` → 记录 `avgStepMs`，目标 ≤4ms（M1 实体少，应远低于）。
- 浏览器：`__game.tick(600)` 能推进；同种子两次 `snapshot()` 一致。

- [ ] **Step 5: 提交**

```bash
git add src/test-hooks.js tests/acceptance-m1.test.js tests/bench.js README.md
git commit -m "feat(m1): test hooks, acceptance smoke, performance bench"
```

**M1 Gate：** 以上 14 个任务全绿；10 回合手动可玩；100 僵尸 60 FPS；无 console 错误；同种子可复现。

---

## 5. M2 完整内容（Tasks 15–23）

**M2 目标**：8 人类、6 僵尸、感染完整、6 建筑、平民、队长、3 地图。验收：20 回合可玩；感染能治疗/致死/变丧尸；队长每 3 回合晋升；建筑能被巨人/母体拆；3 张地图通过满建可达校验。

---

### Task 15: 机枪、喷火、导弹、平民行为

**Files:**
- Modify: `src/sim/ai.js`, `src/sim/combat.js`, `src/sim/projectiles.js`, `src/sim/stats.js`, `src/sim/economy.js`，Create: `tests/humans-full.test.js`

**Interfaces:**
- Consumes: Task 9 的攻击管线。
- Produces: 机枪弹匣/换弹字段 `h.ammo/h.reloadT`；火焰锥 `Projectiles` 火焰判定；火箭实体投射物与 `siegeBonus`；平民结算收入。

- [ ] **Step 1: 写失败测试**

```js
test('机枪 45 发后换弹 2 秒', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 2 });
  ZG.State.spawnHuman(s, 'mg', 600, 600);
  const z = ZG.State.spawnZombie(s, 'giant', 600, 380); z.speed = 0; z.hp = z.maxHp = 99999;
  ZG.Sim.startRound(s); s.spawner.batches = [];
  ZG.Sim.tick(s, 60 * 5);            // 5 秒打空 45 发
  assert.equal(s.humans[0].ammo, 0);
  const before = z.hp;
  ZG.Sim.tick(s, 60 * 1.5);          // 换弹中
  assert.equal(z.hp, before);
  ZG.Sim.tick(s, 60 * 0.6);          // 换弹完成
  assert.ok(z.hp < before);
});

test('喷火穿透并施加 3 秒灼烧', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 2 });
  ZG.State.spawnHuman(s, 'flame', 600, 600);
  const a = ZG.State.spawnZombie(s, 'walker', 600, 550);
  const b = ZG.State.spawnZombie(s, 'walker', 600, 520);
  a.speed = b.speed = 0; ZG.Sim.startRound(s); s.spawner.batches = [];
  ZG.Sim.tick(s, 60);
  assert.ok(a.hp < a.maxHp && b.hp < b.maxHp);
  const mid = a.hp; ZG.Sim.tick(s, 60 * 3.2);
  assert.ok(a.hp < mid);
});

test('导弹对攻城单位 +25%', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 2 });
  ZG.State.spawnHuman(s, 'rocket', 600, 600);
  const z = ZG.State.spawnZombie(s, 'giant', 600, 400); z.speed = 0; z.hp = z.maxHp = 99999;
  ZG.Sim.startRound(s); s.spawner.batches = [];
  const before = z.hp; ZG.Sim.tick(s, 60 * 2.1);
  assert.ok(Math.abs((before - z.hp) - 162.5) < 1e-6, `实际 ${before - z.hp}`);
});

test('平民不攻击，结算 +12', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 2 });
  ZG.State.spawnHuman(s, 'civilian', 600, 600);
  ZG.Sim.startRound(s); s.spawner.batches = []; s.zombies.length = 0;
  const before = s.money; ZG.Sim.tick(s, 60 * 4);
  assert.equal(s.money, before + 12 + 72);
});
```

- [ ] **Step 2: 运行确认失败**：`node --test tests/humans-full.test.js` → FAIL。

- [ ] **Step 3: 最小实现**

- 机枪：`ammo=45`，每发 `damage 9`，`interval=1/9`；打空后 `reloadT=2` 停火；DPS 综合约 58。
- 喷火：每 0.125 秒对锥内全部僵尸 5 伤害并刷新灼烧 `{dps:5, t:3}`；灼烧在 `Infection.tick` 结算。
- 导弹：实体火箭（速度 420，生命 2s），到达/命中后 `explode` 半径 60、伤害 130；对 `isSiege` 目标 ×1.25。
- 平民：不索敌；`settleRound` 每个存活平民 +12。
- 所有单位享受火力/护甲科技（若等级 >0）与弹药库/鼓舞光环（后者在 Task 17 接入）。

- [ ] **Step 4: 运行通过**：`node --test tests/humans-full.test.js` → PASS。

- [ ] **Step 5: 提交**

```bash
git add src/sim tests/humans-full.test.js
git commit -m "feat(m2): machine gun, flamethrower, rocket, civilian"
```

---

### Task 16: 盾尸、爆尸、母体、巨人、幼体、转化丧尸

**Files:**
- Modify: `src/sim/ai.js`, `src/sim/combat.js`, `src/sim/projectiles.js`, `src/sim/stats.js`, `tests/zombies-full.test.js`

**Interfaces:**
- Consumes: Task 8 的僵尸管线、Task 10 的护盾。
- Produces: `z.isSiege`（giant/mother）、`z.fuseT`、`z.sprintT`、`z.deathEffect`；`Combat.killZombie` 统一处理死亡效果。

- [ ] **Step 1: 写失败测试**

```js
test('狂尸每 4 秒冲刺 0.8 秒', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 4 });
  ZG.State.spawnHuman(s, 'shield', 600, 620);
  const z = ZG.State.spawnZombie(s, 'runner', 600, 80);
  ZG.Sim.startRound(s); s.spawner.batches = [];
  ZG.Sim.tick(s, 60 * 4.1);
  assert.equal(z.sprinting, true);
  ZG.Sim.tick(s, 60 * 0.9);
  assert.equal(z.sprinting, false);
});

test('爆尸引信 0.8 秒，期间击杀取消爆炸', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 4 });
  const h = ZG.State.spawnHuman(s, 'pistol', 600, 600);
  const z = ZG.State.spawnZombie(s, 'boomer', 600, 640); // 距离 40 → 进入引信
  ZG.Sim.startRound(s); s.spawner.batches = [];
  ZG.Sim.tick(s, 1);
  assert.ok(z.fuseT > 0);
  ZG.Combat.applyDamage(s, { target: z, amount: 9999, damageKind: 'ranged' });
  ZG.Sim.tick(s, 60);
  assert.equal(h.hp, h.maxHp); // 取消爆炸
});

test('爆尸爆炸 +100 感染且不伤建筑', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 4 });
  const h = ZG.State.spawnHuman(s, 'pistol', 600, 600);
  const z = ZG.State.spawnZombie(s, 'boomer', 600, 630);
  ZG.Sim.startRound(s); s.spawner.batches = [];
  ZG.Sim.tick(s, 60);
  assert.equal(h.infection, 100);
});

test('母体死亡爆 3–5 幼体并有全局上限 30', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 4 });
  ZG.State.spawnHuman(s, 'shield', 600, 620);
  const m = ZG.State.spawnZombie(s, 'mother', 600, 400);
  ZG.Sim.startRound(s); s.spawner.batches = [];
  ZG.Combat.applyDamage(s, { target: m, amount: 99999, damageKind: 'explosion' });
  const babies = s.zombies.filter(z => z.typeId === 'baby');
  assert.ok(babies.length >= 3 && babies.length <= 5);
});

test('巨人拆建筑伤害 ×3', () => {
  // 用 mock 建筑验证乘数；建筑系统在 Task 17 完整接入
  assert.equal(ZG.Data.zombies.giant.buildingMultiplier, 3);
});
```

- [ ] **Step 2: 运行确认失败**：`node --test tests/zombies-full.test.js` → FAIL。

- [ ] **Step 3: 最小实现**

- 狂尸：每 4 秒冲刺 0.8 秒，速度取 `max(base, 150×speedScale)`；冲刺期间优先绕过慢速僵尸（分离力降低）。
- 盾尸：数据驱动；朝向始终指向当前目标；盾破减速 20%（Task 10 已实现）。
- 爆尸：`pickZombieTarget` 选“人类最密集点”；距离 ≤35 或 HP ≤20% 点燃 `fuseT=0.8`；死亡时若 `fuseT>0` 则 `explode(80,70,ranged/explosion,+100 infection,no buildings)`，被击杀则清 `fuseT`。
- 母体：`isSiege=true`；220 内有建筑优先拆；死亡爆 3–5 幼体，单波累计 ≤30；死亡爆炸半径 120，人类 80、建筑 200。
- 巨人：`isSiege=true`；对建筑 ×3；`knockbackImmune=true`。
- 幼体：快速近战，感染 25% +15。
- 转化丧尸：由人类死亡生成，统计入剩余僵尸，`bounty=0`，不再转化。
- 死亡效果统一走 `Combat.killZombie`，避免各调用点重复。

- [ ] **Step 4: 运行通过**：`node --test tests/zombies-full.test.js` → PASS。

- [ ] **Step 5: 提交**

```bash
git add src/sim tests/zombies-full.test.js
git commit -m "feat(m2): full zombie roster and death effects"
```

---

### Task 17: 建筑系统、槽位、废墟与光环

**Files:**
- Create: `src/data/buildings.js`（若 Task 3 未建则现在建全），修改 `src/sim/economy.js`, `src/sim/sim.js`, `src/sim/pathing.js`, `src/sim/ai.js`, `src/sim/combat.js`, `tests/buildings.test.js`

**Interfaces:**
- Consumes: `Economy.build/demolish`、`Pathing.build`。
- Produces: `building.charges`、`building.aura`；`Economy.build/demolish` 完整行为；建造/摧毁后重算流场。

- [ ] **Step 1: 写失败测试**

```js
test('建造占槽、扣钱、满槽拒绝', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 }); s.money = 9999;
  assert.equal(ZG.Economy.build(s, 'barricade', 's1').ok, true);
  assert.deepEqual(ZG.Economy.build(s, 'barricade', 's1'), { ok: false, reason: 'occupied' });
  for (const id of ['s2','s3','s4','s5','s6']) ZG.Economy.build(s, 'barricade', id);
  assert.deepEqual(ZG.Economy.build(s, 'barricade', 's1'), { ok: false, reason: 'occupied' });
});

test('拆除返 50%，废墟锁槽 1 回合', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 }); s.money = 1000;
  const b = ZG.Economy.build(s, 'turret', 's1').building;
  assert.equal(ZG.Economy.demolish(s, b.id).refund, 100);
  assert.equal(s.slots.find(x => x.id === 's1').rubble, true);
  assert.equal(ZG.Economy.build(s, 'turret', 's1').reason, 'rubble');
});

test('医疗站治疗与感染 -1/s，弹药库加成', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 }); s.money = 9999;
  const h = ZG.State.spawnHuman(s, 'pistol', 600, 600);
  const b = ZG.Economy.build(s, 'hospital', 's1').building;
  b.x = 600; b.y = 600; // 测试用：贴近
  h.hp = 100; h.infection = 50;
  ZG.Sim.startRound(s); s.spawner.batches = []; ZG.Sim.tick(s, 60);
  assert.ok(h.hp > 100);
  assert.ok(h.infection < 50);
});

test('地雷阵 3 次触发并按回合成长，整备期重布', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 }); s.money = 9999;
  const b = ZG.Economy.build(s, 'mine', 's1').building;
  assert.equal(b.charges, 3);
  s.round = 7;
  assert.equal(ZG.Balance.mineDamage(7).toFixed(2), (120 * Math.pow(1.06, 6)).toFixed(2));
});
```

- [ ] **Step 2: 运行确认失败**：`node --test tests/buildings.test.js` → FAIL。

- [ ] **Step 3: 最小实现**

- `buildings.js`：6 条数据（造价/HP/半径/效果字段）。
- `Economy.build/demolish`：槽位校验、扣钱、返还 50%、废墟状态；建造/拆除后 `Pathing.build` 重算。
- 建筑 HP 与摧毁：只有巨人/母体可攻击建筑；普通丧尸只绕行；HP 归零 → 废墟 + `building:destroyed` + 槽位锁 1 回合；下次整备清废墟。
- 光环每步重算：路障 80 内 -25%、减速陷阱 120 内 -35%（取最强）、医疗站 200 内 +8HP/s 与 -1 感染/s、弹药库 220 内 +15% 攻速 +10% 射程（不叠加同类）。
- 哨塔：10 伤害/0.25s、280 射程、吃火力科技、不吃弹药库。
- 医疗站给范围内治疗兵血清 +1（每回合同类不叠加）。
- 地雷：3 次，`120×1.06^(R-1)`，半径 80，整备期重布。
- `Balance.mineDamage(R)` 加入 `balance.js` 并测试。

- [ ] **Step 4: 运行通过**：`node --test tests/buildings.test.js` → PASS。

- [ ] **Step 5: 提交**

```bash
git add src/data/buildings.js src/sim src/tests/buildings.test.js index.html
git commit -m "feat(m2): buildings, slots, rubble, auras, mines"
```

---

### Task 18: 感染完整版、医疗设施与死亡链

**Files:**
- Modify: `src/sim/infection.js`, `src/sim/combat.js`, `src/sim/ai.js`, `tests/infection.test.js`

**Interfaces:**
- Consumes: Task 10 的 `Infection.*`、Task 17 的医疗站。
- Produces: 所有僵尸命中感染概率、爆尸/石块感染、医院 -1/s、治疗目标优先级完整版。

- [ ] **Step 1: 写失败测试**

```js
test('普通丧尸命中 30% 概率 +20 感染（固定种子）', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 11 });
  const h = ZG.State.spawnHuman(s, 'shield', 600, 600);
  const z = ZG.State.spawnZombie(s, 'walker', 600, 620); z.damage = 0;
  ZG.Sim.startRound(s); s.spawner.batches = [];
  ZG.Sim.tick(s, 60 * 20);
  assert.ok(h.infection > 0);
});

test('感染死亡同样变丧尸', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 11 });
  const h = ZG.State.spawnHuman(s, 'pistol', 600, 600); h.hp = 0.1; h.infection = 100;
  ZG.Infection.tick(s);
  assert.equal(h.alive, false);
  assert.ok(s.zombies.some(z => z.turnedFromHuman));
});

test('医疗站每秒降低感染 1 点', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 11 }); s.money = 9999;
  const h = ZG.State.spawnHuman(s, 'pistol', 600, 600); h.infection = 50;
  const b = ZG.Economy.build(s, 'hospital', 's1').building;
  b.x = 600; b.y = 600;
  ZG.Sim.startRound(s); s.spawner.batches = []; ZG.Sim.tick(s, 60);
  assert.ok(Math.abs(h.infection - 49) < 0.5);
});
```

- [ ] **Step 2: 运行确认失败**：`node --test tests/infection.test.js` → FAIL。

- [ ] **Step 3: 最小实现**

- 命中感染：按 6.1 表，用 `state.rng.jitter.chance`；BOSS 石块 100% +30；爆尸 +100。
- 感染 tick 与灼烧、减速到期统一在 `Infection.tick`。
- 治疗优先级：感染 ≥50（血清）> 血量百分比最低；疫医在 M3 接入相同接口。
- 医疗站 -1/s；血清科技在 Task 28 接入 `serumLeft` 与治疗量倍率。
- 回合结算 clamp 已由 Task 12 实现，确认有治疗兵/疫医时清零。

- [ ] **Step 4: 运行通过**：`node --test tests/infection.test.js` → PASS。

- [ ] **Step 5: 提交**

```bash
git add src/sim tests/infection.test.js
git commit -m "feat(m2): full infection sources, hospital, infection death chain"
```

---

### Task 19: 队长晋升、上限与死亡爆炸

**Files:**
- Create: `src/sim/captains.js`，修改 `src/sim/sim.js`, `src/sim/combat.js`, `src/sim/stats.js`, `tests/captains.test.js`

**Interfaces:**
- Produces: `ZG.Captains.promote(state, max=3) -> promoted[]`；`human.captain` 与 `state.stats.captains`。

- [ ] **Step 1: 写失败测试**

```js
test('每 3 回合晋升最多 3 名，尽量不同职业', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  for (let i = 0; i < 3; i++) ZG.State.spawnHuman(s, ['pistol','shotgun','shield'][i], 500 + i*80, 600);
  const got = ZG.Captains.promote(s);
  assert.equal(got.length, 3);
  assert.equal(new Set(got.map(h => h.classId)).size, 3);
});

test('晋升属性与免疫', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  const h = ZG.State.spawnHuman(s, 'pistol', 600, 600); h.infection = 40;
  ZG.Captains.promote(s, 1);
  assert.equal(h.captain, true);
  assert.equal(h.maxHp, 140 * 2.5 * (1 + 0.06 * 0)); // 无护甲科技
  assert.equal(h.infection, 0);
  ZG.Infection.add(s, h, 50);
  assert.equal(h.infection, 0);
});

test('上限 8 名，溢出 +10% 全体队长伤害（最多 +50%）', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  for (let i = 0; i < 12; i++) ZG.State.spawnHuman(s, 'pistol', 200 + i * 40, 600);
  for (let k = 0; k < 6; k++) ZG.Captains.promote(s, 3);
  assert.equal(s.humans.filter(h => h.captain).length, 8);
  assert.equal(s.stats.captainOverflow, 5); // 10 次溢出尝试，前 5 次生效后封顶
});

test('队长死亡爆炸 120+15% 最大生命，BOSS 百分比上限 800', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  const h = ZG.State.spawnHuman(s, 'pistol', 600, 600); ZG.Captains.promote(s, 1);
  const z = ZG.State.spawnZombie(s, 'giant', 620, 600); z.hp = z.maxHp = 9999;
  ZG.Combat.applyDamage(s, { target: h, amount: 99999, damageKind: 'melee' });
  assert.ok(z.hp < 9999);
  const boss = ZG.State.spawnZombie(s, 'boss', 640, 600); boss.hp = boss.maxHp = 100000;
  ZG.Combat.applyDamage(s, { target: h, amount: 0 }); // 已死，不应重复爆炸
});
```

- [ ] **Step 2: 运行确认失败**：`node --test tests/captains.test.js` → FAIL。

- [ ] **Step 3: 最小实现**

- `promote(state, max=3)`：候选 = 存活、非队长、非英雄、非平民、**非转化兵**；先按职业去重选，再补足；不足 3 名时剩余名额转为溢出计数。
- 晋升：`maxHp *= 2.5`、`hp *= 2.5`、`damageMul *= 1.3`、`attackSpeedMul *= 1.4`、感染清零并免疫。
- 上限 8；溢出每名 +10% 全体队长伤害，最多 +50%，存 `state.stats.captainOverflow`。
- 死亡：半径 90 对僵尸造成 `120 + min(0.15*target.maxHp, 800)`，只伤僵尸；不转化、不移除（走统一死亡）。
- `Sim.settleRound` 在 `round % 3 === 0` 时调用 `promote`，在 `round++` 之前。
- `Stats.human` 读 `captain`、`captainOverflow`、`hero` 的乘数。

- [ ] **Step 4: 运行通过**：`node --test tests/captains.test.js` → PASS。

- [ ] **Step 5: 提交**

```bash
git add src/sim/captains.js src/sim/sim.js src/sim/combat.js src/sim/stats.js tests/captains.test.js index.html
git commit -m "feat(m2): captains, promotion, cap, death explosion"
```

---

### Task 20: 医院广场、地铁站台与选图界面

**Files:**
- Modify: `src/data/maps.js`, `src/sim/pathing.js`, `src/view/hud.js`, `src/main.js`, `tests/maps.test.js`

**Interfaces:**
- Consumes: `Pathing.validate`、`HUD`。
- Produces: `ZG.Data.maps.hospital/subway`；`state.mapSelection`；三张图都能创建并校验通过。

- [ ] **Step 1: 写失败测试**

```js
test('三张地图都通过满建可达与绕行校验', () => {
  for (const id of ['suburban', 'hospital', 'subway']) {
    const r = ZG.Pathing.validate(ZG.Data.maps[id]);
    assert.equal(r.ok, true, `${id}: ${JSON.stringify(r)}`);
    assert.ok(r.maxDetour <= 1.35, `${id}: ${r.maxDetour}`);
  }
});

test('地图基本字段与槽位数量', () => {
  assert.equal(ZG.Data.maps.suburban.slots.length, 6);
  assert.equal(ZG.Data.maps.hospital.slots.length, 7);
  assert.equal(ZG.Data.maps.subway.slots.length, 8);
  assert.equal(ZG.Data.maps.hospital.deploy.kind, 'circle');
  assert.equal(ZG.Data.maps.subway.deploy.kind, 'rect');
});

test('消毒池内感染获取减半', () => {
  const s = ZG.Sim.createGame({ mapId: 'hospital', seed: 1 });
  const h = ZG.State.spawnHuman(s, 'pistol', 300, 560); // 池心
  ZG.Infection.add(s, h, 20);
  assert.equal(h.infection, 10);
});

test('每张图可创建且部署区不被出生点侵占', () => {
  for (const id of ['suburban', 'hospital', 'subway']) {
    const s = ZG.Sim.createGame({ mapId: id, seed: 1 });
    assert.equal(s.status, 'prep');
    for (const sp of s.map.spawns) {
      assert.equal(ZG.Geom.pointInDeploy(sp.x, sp.y, s.map.deploy), false);
    }
  }
});
```

- [ ] **Step 2: 运行确认失败**：`node --test tests/maps.test.js` → FAIL。

- [ ] **Step 3: 最小实现**

- 医院广场（初值）：`deploy` 圆 `(640,400,r170)`；出生点 `(640,60)/(80,380)/(1200,380)`；消毒池 `(300,560,r100)/(980,560,r100)` 作为**可行走地形**（不阻挡，只影响感染获取 -50%）；7 个槽位按半径 280、360/7° 均匀分布。
- 地铁站台（初值）：`deploy` 矩形 `(930,10,300,700)`；出生点 `(70,80)/(70,640)` 交替；柱子 `(380,250,r40)/(380,500,r40)/(700,370,r40)`；8 个槽位沿双通道分布。
- `Geom.pointInDeploy` 支持矩形/圆形；消毒池作为 `terrain` 数组（可行走、不阻挡），不进 `obstacles`；`Infection.add` 若人类位于池内，感染量 ×0.5。
- 选图界面：菜单显示三张缩略图（Canvas 画的简化布局）、难度星级、特色一句话；选择后 `Sim.createGame`。
- 地图切换必须重建 pathing 与 slots；不能残留上一局实体。

- [ ] **Step 4: 运行确认通过**：`node --test tests/maps.test.js` → PASS。
手动：三张图各开一局，槽位/出生点/部署区显示正确；满建后僵尸仍能走到部署区。

- [ ] **Step 5: 提交**

```bash
git add src/data/maps.js src/sim/pathing.js src/view/hud.js src/main.js tests/maps.test.js
git commit -m "feat(m2): hospital and subway maps, map selection"
```

---

### Task 21: 完整整备 UI、波次预览、单位信息与战斗日志

**Files:**
- Modify: `src/view/hud.js`, `src/view/model.js`, `styles.css`, `index.html`，`tests/view-model.test.js`

**Interfaces:**
- Consumes: `Model.*`、`Economy.*`、`Waves.preview`。
- Produces: 招募/建筑/科技三页签；建筑卡与槽位交互；tooltip；波次预览；战斗日志；收入明细。

- [ ] **Step 1: 写失败测试**

```js
test('建筑卡状态与槽位高亮模型', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 }); s.money = 1000;
  const c = ZG.Model.buildingCard(s, 'turret');
  assert.deepEqual({ cost: c.cost, disabled: c.disabled }, { cost: 200, disabled: false });
  s.money = 10;
  assert.equal(ZG.Model.buildingCard(s, 'turret').reason, 'money');
});

test('波次预览含新解锁类型与 BOSS', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  s.round = 7;
  const p = ZG.Model.wavePreview(s);
  assert.equal(p.boss, true);
  assert.deepEqual(p.counts, ZG.Waves.composition(7));
});

test('tooltip 数据完整', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  const z = ZG.State.spawnZombie(s, 'giant', 600, 500);
  const info = ZG.Model.zombieInfo(s, z.id);
  for (const k of ['name','hp','maxHp','speed','damage','bounty','special']) assert.ok(k in info);
});
```

- [ ] **Step 2: 运行确认失败**：`node --test tests/view-model.test.js` → FAIL。

- [ ] **Step 3: 最小实现**

- 招募页 8 卡（M2 全部可用），显示造价/HP/DPS/射程/定位/可买状态；点击进入放置模式。
- 建筑页 6 卡；点击后空槽高亮；槽位显示建筑图标/血条/光环范围（悬停）。
- 科技页保留四条线的占位行（等级/费用/效果），购买按钮置灰并提示“M3 开放”。
- 下一波预览：总数、各类型数量、BOSS 标记、新解锁类型。
- 悬停/点按 tooltip：人类/僵尸/建筑/卡片完整信息，含“克制/被克制”。
- 战斗日志：过滤 `UI_TOAST`，保留最近 8 条。
- 收入明细弹窗：击杀、平民、通关奖励、BOSS、合计。
- 顶部 HUD：BOSS 出现时显示顶部血条；屏幕边缘显示僵尸来源方向箭头与数量。
- 选中人类后显示“出售”按钮（仅整备期；最后一名人类禁用）。
- 非阻塞横幅：队长晋升、BOSS 出现、英雄获取、英雄重伤、建筑被摧毁，不打断战斗。
- 战斗期底部面板收起为窄栏。

- [ ] **Step 4: 运行通过**：`node --test tests/view-model.test.js` → PASS。
手动：8 个兵种、6 个建筑都能买能放；预览数量与实际出怪一致。

- [ ] **Step 5: 提交**

```bash
git add src/view tests/view-model.test.js styles.css index.html
git commit -m "feat(m2): full prep ui, wave preview, tooltips, battle log"
```

---

### Task 22: 反卡死完整规则与回合边界表

**Files:**
- Modify: `src/sim/ai.js`, `src/sim/sim.js`, `tests/anti-stuck.test.js`

**Interfaces:**
- Consumes: Task 8 的 8 秒传送。
- Produces: 180 秒狂暴（每 30 秒 +30%，乘算累积）、240 秒强制结算、`battle.berserkTier`。

- [ ] **Step 1: 写失败测试**

```js
test('180 秒后每 30 秒全体僵尸 +30% 速度与伤害', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  ZG.State.spawnHuman(s, 'shield', 600, 620);
  const z = ZG.State.spawnZombie(s, 'giant', 300, 100); z.speed = 0;
  ZG.Sim.startRound(s); s.spawner.batches = [];
  s.battle.time = 181; ZG.Sim.tick(s, 1);
  assert.equal(s.battle.berserkTier, 1);
  s.battle.time = 211; ZG.Sim.tick(s, 1);
  assert.equal(s.battle.berserkTier, 2);
});

test('240 秒强制结算且剩余僵尸无赏金', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  ZG.State.spawnHuman(s, 'shield', 600, 620);
  ZG.State.spawnZombie(s, 'walker', 600, 300);
  ZG.Sim.startRound(s); s.spawner.batches = [];
  s.battle.time = 240; ZG.Sim.tick(s, 1);
  assert.ok(['settlement', 'prep'].includes(s.status)); // 强制结算后立即结算或进入结算展示
  assert.equal(s.zombies.length, 0);
});

test('8 秒无进展传送', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  ZG.State.spawnHuman(s, 'shield', 600, 620);
  const z = ZG.State.spawnZombie(s, 'walker', 80, 80); z.speed = 0;
  ZG.Sim.startRound(s); s.spawner.batches = [];
  ZG.Sim.tick(s, 60 * 8.5);
  assert.ok(z.x !== 80 || z.y !== 80);
});
```

- [ ] **Step 2: 运行确认失败**：`node --test tests/anti-stuck.test.js` → FAIL。

- [ ] **Step 3: 最小实现**

- 每步计算 `battle.time`；达到 180 后每满 30 秒 `berserkTier++`；`Stats.zombie` 的最终速度/伤害乘 `1.3^tier`。
- 240 秒：所有存活僵尸 `alive=false` 移除，**不发赏金**，进入常规 `settleRound`。
- 8 秒无进展：位移 <4px 且不在攻击 → 传送到 `Pathing.nearestReachable`；传送后重置计时。
- 狂暴/强制结算只对战斗期生效；暂停时 `battle.time` 不增长。

- [ ] **Step 4: 运行通过**：`node --test tests/anti-stuck.test.js` → PASS。

- [ ] **Step 5: 提交**

```bash
git add src/sim tests/anti-stuck.test.js
git commit -m "feat(m2): berserk, forced settlement, teleport anti-stuck"
```

---

### Task 23: M2 验收：20 回合无头跑通

**Files:**
- Create: `tests/acceptance-m2.test.js`, `tests/policy.js`（简单无头策略），修改 `README.md`

**Interfaces:**
- Consumes: 全部 M2 系统。
- Produces: 可复用的 `runPolicy(state, rounds)` 策略函数，供 M3 bot 复用。

- [ ] **Step 1: 写失败测试**

```js
test('固定策略跑 20 回合不抛异常且机制可触发', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 2026 });
  const log = require('./policy.js')(s, 20);
  assert.ok(s.round >= 20 || s.status === 'over');
  assert.ok(log.kills > 0);
  assert.ok(log.captains > 0 || s.round < 3);
});
```

- [ ] **Step 2: 运行确认失败**：`node --test tests/acceptance-m2.test.js` → FAIL。

- [ ] **Step 3: 最小实现**

`policy.js`：整备期按“2 盾 + 4 手枪 + 1 治疗 + 剩余买霰弹/机枪”的固定顺序招募，优先 2 个路障 + 医疗站；金钱不足时停；`startRound` 后 `tick` 到战斗结束；记录每回合的击杀、金钱、人口、时长。允许测试注入金钱（`testMoney=true`）用于冒烟，不用于平衡结论。

- [ ] **Step 4: 运行通过**：`node --test tests/acceptance-m2.test.js` → PASS。
手动：三张图各玩 20 回合，确认感染/建筑/队长/巨人/母体都出现过。

- [ ] **Step 5: 提交**

```bash
git add tests/acceptance-m2.test.js tests/policy.js README.md
git commit -m "test(m2): 20-round headless acceptance policy"
```

**M2 Gate：** 23 个任务全绿；20 回合可玩；三张图校验通过；所有 M2 机制手动触发过；无 console 错误。

---

## 6. M3 BOSS、英雄与科技（Tasks 24–30）

**M3 目标**：BOSS、4 英雄、英雄奖励、科技树、无头 bot、40 回合。验收：BOSS 每 7 回合正确；英雄优先未拥有/集齐强化；转化兵规则正确；bot 跑通 20/40。

---

### Task 24: BOSS 坦克

**Files:**
- Modify: `src/data/zombies.js`（boss 数值）、`src/sim/ai.js`, `src/sim/projectiles.js`, `src/sim/combat.js`, `src/sim/spawner.js`, `tests/boss.test.js`

**Interfaces:**
- Consumes: Task 6 的 BOSS 批次、Task 16 的死亡管线。
- Produces: `z.isBoss`；石块投射物 `type:'rock'`；`boss:spawned` 事件。

- [ ] **Step 1: 写失败测试**

```js
test('BOSS 每 7 回合出现且 HP 正确', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 31 });
  s.round = 7;
  assert.equal(ZG.Waves.isBossRound(7), true);
  const b = ZG.State.spawnZombie(s, 'boss', 600, 200);
  assert.equal(b.maxHp.toFixed(2), ZG.Balance.bossHp(7).toFixed(2));
  const w = ZG.Waves.build(7, ZG.Rng.createStreams(31).spawn, s.map);
  assert.ok(w.batches.some(x => x.spawns.some(y => y.type === 'boss')));
});

test('石块 2 秒预警、半径 70、伤害 80+6R、+30 感染', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 31 }); s.round = 7;
  const b = ZG.State.spawnZombie(s, 'boss', 600, 200); b.isBoss = true;
  const h = ZG.State.spawnHuman(s, 'shield', 600, 600);
  ZG.Sim.startRound(s); s.spawner.batches = [];
  ZG.Sim.tick(s, 1);
  const rock = s.projectiles.find(p => p.typeId === 'rock');
  assert.ok(rock && rock.warnT > 0);
});

test('BOSS 击杀奖励 400+50R', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 31 }); s.round = 7;
  const b = ZG.State.spawnZombie(s, 'boss', 600, 500); b.isBoss = true;
  const before = s.money;
  ZG.Combat.applyDamage(s, { target: b, amount: 999999, damageKind: 'ranged' });
  assert.equal(s.money - before, 750);
});
```

- [ ] **Step 2: 运行确认失败**：`node --test tests/boss.test.js` → FAIL。

- [ ] **Step 3: 最小实现**

- BOSS 数据：HP `1200×1.14^(R-1)`、速度 14、半径 30、石块 `80+6R`、赏金 `400+50R`；不叠加普通僵尸系数。
- 出生：`Waves.build` 的 BOSS 批次；spawner 在批次中点生成；带 20% 护卫（Task 6 已做）。
- 石块：每 4 秒选“人类最密集点”（`Spatial` 网格统计），生成 `rock` 投射物，`warnT=2.0`；t=1.6 锁定落点；非盾人类在半径 70 内开始侧移 60px；落地半径 70 伤害、+30 感染、只伤人类。
- 近身践踏：半径 60、80 伤害、1.5 秒一次。
- 死亡：赏金 + `forceHero`（Task 27 接入）；不转化。

- [ ] **Step 4: 运行通过**：`node --test tests/boss.test.js` → PASS。

- [ ] **Step 5: 提交**

```bash
git add src/data/zombies.js src/sim tests/boss.test.js
git commit -m "feat(m3): boss tank, rock barrage, stomp, rewards"
```

---

### Task 25: 长官与武士

**Files:**
- Create: `src/data/heroes.js`（若 Task 3 未建全则补全），修改 `src/sim/ai.js`, `src/sim/projectiles.js`, `src/sim/combat.js`, `src/sim/economy.js`, `tests/heroes-a.test.js`

**Interfaces:**
- Consumes: 人类 AI/攻击管线。
- Produces: `hero.heroId`、英雄技能状态 `h.abilityT/abilityUsed`；`Economy` 不占人口。

- [ ] **Step 1: 写失败测试**

```js
test('长官每回合 3 发导弹，优先 8+ 集群', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 41 });
  const h = ZG.State.spawnHuman(s, 'officer', 600, 600, { heroId: 'officer' });
  for (let i = 0; i < 10; i++) ZG.State.spawnZombie(s, 'walker', 500 + i * 20, 300);
  ZG.Sim.startRound(s); s.spawner.batches = [];
  ZG.Sim.tick(s, 60);
  assert.equal(h.abilityUsed, true);
  assert.equal(s.stats.missilesFired, 3); // 用计数而不是残留投射物，避免飞行中已命中被移除
});

test('武士 25% 剑气（固定种子可复现）', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 41 });
  ZG.State.spawnHuman(s, 'samurai', 600, 600, { heroId: 'samurai' });
  const z = ZG.State.spawnZombie(s, 'walker', 600, 570); z.speed = 0; z.hp = z.maxHp = 99999;
  ZG.Sim.startRound(s); s.spawner.batches = [];
  let slashes = 0;
  for (let i = 0; i < 20; i++) { const before = z.hp; ZG.Sim.tick(s, 60); if (z.hp < before - 126) slashes++; }
  assert.ok(slashes > 0);
});
```

- [ ] **Step 2: 运行确认失败**：`node --test tests/heroes-a.test.js` → FAIL。

- [ ] **Step 3: 最小实现**

- 英雄数据：长官 HP1200/双枪 2×18 每 0.35s/射程 300；武士 HP1100/126 每 0.7s/射程 45/移速 70。
- `State.spawnHuman` 扩展：若 `classId` 命中 `ZG.Data.heroes`，按英雄数据生成，自动设置 `heroId`，不占人口；测试与 `Heroes.grant` 都走这条路径。
- 长官：每回合一次，检测“140 半径内 ≥8 僵尸”或 BOSS，发射 3 枚 `missile`（400 伤害、r140、间隔 0.4s），并累加 `state.stats.missilesFired`；没有合适目标时延后，不浪费。
- 武士：180 半径内敌人 → 突进到近战范围；无敌人回原位；每次攻击 25% 触发剑气（正面 320×80，300 伤害，穿透）。
- 英雄不占人口、免疫感染、不参与队长；`human.maxHp` 用英雄数据。
- 英雄死亡分支先留 `wounded` 标记（Task 27 完整）。

- [ ] **Step 4: 运行通过**：`node --test tests/heroes-a.test.js` → PASS。

- [ ] **Step 5: 提交**

```bash
git add src/data/heroes.js src/sim tests/heroes-a.test.js index.html
git commit -m "feat(m3): officer and samurai heroes"
```

---

### Task 26: 加特林、疫医与转化兵

**Files:**
- Modify: `src/sim/ai.js`, `src/sim/combat.js`, `src/sim/economy.js`, `src/sim/sim.js`, `src/data/heroes.js`, `tests/heroes-b.test.js`, `tests/converted.test.js`

**Interfaces:**
- Consumes: Task 25 英雄管线、Task 18 感染。
- Produces: `h.inspireT`、`Combat.convertZombie/tryConvert(state, zombie, roll?)`、`human.converted/expireRound`。

- [ ] **Step 1: 写失败测试**

```js
test('加特林每 45 秒鼓舞周围 ≥3 友军 +30% 攻速 8 秒', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 51 });
  ZG.State.spawnHuman(s, 'gatling', 600, 600, { heroId: 'gatling' });
  for (let i = 0; i < 3; i++) ZG.State.spawnHuman(s, 'pistol', 620 + i * 25, 600);
  ZG.Sim.startRound(s); s.spawner.batches = [];
  s.battle.time = 45; ZG.Sim.tick(s, 1);
  assert.equal(s.humans[1].inspireT > 0, true);
});

test('疫医 15% 判定、每回合最多 5、不占人口', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 51 });
  ZG.State.spawnHuman(s, 'plague', 600, 600, { heroId: 'plague' });
  const zs = []; for (let i = 0; i < 20; i++) zs.push(ZG.State.spawnZombie(s, 'walker', 600, 400 + i));
  ZG.Sim.startRound(s); s.spawner.batches = [];
  let converted = 0;
  for (const z of zs) {
    assert.equal(ZG.Combat.tryConvert(s, z, 0.10), true);  // 0.10 < 0.15
    if (z.alive === false) converted++;
    if (converted === 5) break;
  }
  assert.equal(converted, 5);
  assert.equal(s.humans.filter(h => h.converted).length, 5);
  assert.equal(ZG.Economy.populationUsed(s), 0); // 英雄与转化兵都不占人口
  const s2 = ZG.Sim.createGame({ mapId: 'suburban', seed: 52 });
  const z2 = ZG.State.spawnZombie(s2, 'walker', 600, 400);
  assert.equal(ZG.Combat.tryConvert(s2, z2, 0.20), false); // 0.20 > 0.15，单独状态避免回合上限干扰
});

test('转化兵 3 个完整回合后结算消失，不转化', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 51 }); s.round = 5;
  const h = ZG.State.spawnHuman(s, 'pistol', 600, 600, { converted: true, expireRound: 7 });
  s.status = 'settlement';
  ZG.Sim.settleRound(s);
  assert.equal(h.alive, true);
  s.round = 7; s.status = 'settlement'; ZG.Sim.settleRound(s);
  assert.equal(s.humans.includes(h), false);
  assert.equal(s.zombies.some(z => z.turnedFromHuman), false);
});

test('转化母体/爆尸阻止死亡效果', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 51 });
  const m = ZG.State.spawnZombie(s, 'mother', 600, 400);
  ZG.Combat.convertZombie(s, m);
  assert.equal(s.zombies.includes(m), false);
  assert.equal(s.zombies.filter(z => z.typeId === 'baby').length, 0);
});
```

- [ ] **Step 2: 运行确认失败**：`node --test tests/heroes-b.test.js tests/converted.test.js` → FAIL。

- [ ] **Step 3: 最小实现**

- 加特林：HP1600、r14、22×10/s、260；每 45 秒，若 200 内友军 ≥3，给友军 `inspireT=8`（攻速 ×1.3），否则延后。
- 疫医：HP800、药瓶 29×1.2/s、230、溅射 50；治疗 35/s、驱散 80/8s；每 12 秒若 ≥3 友军受伤，投群体治疗（r180、+70、驱散 30）；攻击命中 15% 转化，每回合上限 5。
- `Combat.convertZombie`：非 BOSS；移除僵尸并生成 `converted:true` 手枪兵（同数据、不占人口）；母体/爆尸不触发死亡效果；`state.battle.convertedThisRound++`；超过 15 全局上限则不再转化。
- 转化兵：`spawnRound=state.round`、`expireRound=state.round+2`；结算时到期移除；到期前死亡按普通人类变丧尸。
- `settleRound` 增加转化兵到期步骤（在人类为 0 判定之前）。

- [ ] **Step 4: 运行通过**：`node --test tests/heroes-b.test.js tests/converted.test.js` → PASS。

- [ ] **Step 5: 提交**

```bash
git add src/sim src/data/heroes.js tests/heroes-b.test.js tests/converted.test.js
git commit -m "feat(m3): gatling, plague doctor, converted soldiers"
```

---

### Task 27: 英雄奖励、重复强化、重伤回归

**Files:**
- Create: `src/sim/heroes.js`，修改 `src/sim/combat.js`, `src/sim/sim.js`, `tests/hero-rewards.test.js`

**Interfaces:**
- Produces: `ZG.Heroes.grant(state) -> hero|null`、`Heroes.onHeroDeath`、`Heroes.returnWounded(state)`；`state.stats.heroes`。

- [ ] **Step 1: 写失败测试**

```js
test('优先随机未拥有英雄', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 61 });
  const a = ZG.Heroes.grant(s);
  const b = ZG.Heroes.grant(s);
  assert.notEqual(a.heroId, b.heroId);
});

test('集齐后重复强化 +20% 生命 +15% 伤害（加法）', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 61 });
  for (let i = 0; i < 4; i++) ZG.Heroes.grant(s);
  const dup = ZG.Heroes.grant(s);
  const h = s.humans.find(x => x.heroId === dup.heroId);
  assert.equal(h.heroHpStacks, 1);
  assert.ok(Math.abs(h.damageMul - 1.15) < 1e-9);
});

test('英雄阵亡休整 1 回合，50% HP 回归', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 61 });
  const h = ZG.Heroes.grant(s);
  s.round = 7; ZG.Combat.applyDamage(s, { target: h, amount: 99999, damageKind: 'melee' });
  assert.equal(h.wounded, true);
  s.round = 8; s.status = 'settlement'; ZG.Sim.settleRound(s);
  assert.equal(h.alive, false);
  s.round = 9; s.status = 'prep'; ZG.Heroes.returnWounded(s);
  assert.equal(h.alive, true);
  assert.equal(h.hp, h.maxHp * 0.5);
});

test('BOSS 死亡立即触发英雄奖励', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 61 }); s.round = 7;
  const b = ZG.State.spawnZombie(s, 'boss', 600, 500); b.isBoss = true;
  ZG.Combat.applyDamage(s, { target: b, amount: 999999, damageKind: 'ranged' });
  assert.equal(s.stats.heroes, 1);
});

test('英雄是最后一名人类时阵亡立即判负', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 61 });
  const h = ZG.Heroes.grant(s);
  ZG.Sim.startRound(s); s.spawner.batches = [];
  ZG.Combat.applyDamage(s, { target: h, amount: 99999, damageKind: 'melee' });
  s.zombies.length = 0;
  ZG.Sim.tick(s, 61);
  assert.equal(s.status, 'over');
});
```

- [ ] **Step 2: 运行确认失败**：`node --test tests/hero-rewards.test.js` → FAIL。

- [ ] **Step 3: 最小实现**

- `grant`：优先未拥有类型；四种集齐后随机已拥有类型，给对应英雄 +20% 生命/+15% 伤害（加法叠加，存 `heroHpStacks/heroDmgStacks`）；最多 4 名英雄；生成在部署区中心，满血；emit `hero:granted`。
- 英雄死亡：免疫感染、不转化、`wounded=true`；`woundedUntilRound=round+1`；英雄是最后人类 → 判负。
- `returnWounded`：在 `round > woundedUntilRound` 的整备期以 50% HP 回归；若同名英雄已在场则刷新/保留一个。
- BOSS 死亡调用 `grant`；`state.stats.heroes` 计数。

- [ ] **Step 4: 运行通过**：`node --test tests/hero-rewards.test.js` → PASS。

- [ ] **Step 5: 提交**

```bash
git add src/sim/heroes.js src/sim/combat.js src/sim/sim.js tests/hero-rewards.test.js index.html
git commit -m "feat(m3): hero rewards, duplicates, wounded return"
```

---

### Task 28: 科技树完整接入

**Files:**
- Modify: `src/sim/economy.js`, `src/sim/stats.js`, `src/sim/infection.js`, `src/sim/sim.js`, `src/view/hud.js`, `tests/tech.test.js`

**Interfaces:**
- Consumes: `Balance.techCost/techMul`、`Economy.buyTech`。
- Produces: 四条科技线 0–10 级、即时生效、不可退款。

- [ ] **Step 1: 写失败测试**

```js
test('购买科技扣钱、升级、立即生效', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 71 }); s.money = 1000;
  const h = ZG.State.spawnHuman(s, 'pistol', 600, 600);
  assert.equal(ZG.Economy.buyTech(s, 'fire').level, 1);
  assert.equal(s.money, 880);
  assert.equal(ZG.Stats.human(s, h).damage.toFixed(2), '12.60');
});

test('护甲提升最大生命并保持血量比例', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 71 }); s.money = 1000;
  const h = ZG.State.spawnHuman(s, 'pistol', 600, 600); h.hp = 70;
  ZG.Economy.buyTech(s, 'armor');
  assert.equal(h.maxHp.toFixed(4), (140 * 1.06).toFixed(4));
  assert.equal(h.hp.toFixed(4), (70 * 1.06).toFixed(4));
});

test('经济科技同时作用于击杀与通关奖励', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 71 }); s.money = 9999;
  ZG.Economy.buyTech(s, 'econ');
  assert.equal(ZG.Balance.bounty(6, 1, 1) , 6); // 签名保持 base,R,level
  assert.equal(ZG.Balance.roundReward(1, 1), 77); // floor(72*1.08)
});

test('满级不能再买', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 71 }); s.money = 9999999;
  for (let i = 0; i < 10; i++) ZG.Economy.buyTech(s, 'serum');
  assert.deepEqual(ZG.Economy.buyTech(s, 'serum'), { ok: false, reason: 'max-level' });
});
```

- [ ] **Step 2: 运行确认失败**：`node --test tests/tech.test.js` → FAIL。

- [ ] **Step 3: 最小实现**

- `Stats.human` 乘入火力（伤害）与护甲（最大生命已写入实体）。
- 购买护甲时对所有人类按 `hp * newMax / oldMax` 调整；对英雄/队长/转化兵同样生效。
- 经济科技乘入击杀与通关奖励；血清科技增加 `serumLeft` 并提高治疗量/驱散量。
- 科技页替换占位，显示四条线的等级/当前效果/下一级费用/下一级效果/购买按钮；满级显示“已满级”。
- `Balance.bounty(base, R, econLevel)` 与 `roundReward(R, econLevel)` 签名统一；旧调用更新。

- [ ] **Step 4: 运行通过**：`node --test tests/tech.test.js` → PASS。
手动：四条线各买 3 级，伤害/血量/收入/血清数字正确；满级按钮禁用。

- [ ] **Step 5: 提交**

```bash
git add src/sim src/view/hud.js tests/tech.test.js
git commit -m "feat(m3): full tech tree with immediate effects"
```

---

### Task 29: 无头 bot 与 20/40 回合平衡报告

**Files:**
- Create: `tests/bot.js`, `tests/balance-report.test.js`，修改 `tests/policy.js`、`README.md`

**Interfaces:**
- Consumes: 全部 M3 系统。
- Produces: `runBot({mapId, seed, maxRounds, strategy}) -> metrics`；输出每回合 `round, duration, kills, income, survivors, dps`。

- [ ] **Step 1: 写失败测试**

```js
test('bot 跑通 20 回合并输出指标', () => {
  const { runBot } = require('./bot.js');
  const r = runBot({ mapId: 'suburban', seed: 1, maxRounds: 20 });
  assert.ok(r.rounds >= 20 || r.over === true);
  assert.ok(r.metrics.length >= 2);
  for (const m of r.metrics) assert.ok(m.round >= 1 && m.durationSec >= 0);
});

test('同种子 bot 结果一致', () => {
  const { runBot } = require('./bot.js');
  const a = runBot({ mapId: 'suburban', seed: 8, maxRounds: 10 });
  const b = runBot({ mapId: 'suburban', seed: 8, maxRounds: 10 });
  assert.deepEqual(a.metrics, b.metrics);
});
```

- [ ] **Step 2: 运行确认失败**：`node --test tests/balance-report.test.js` → FAIL。

- [ ] **Step 3: 最小实现**

- `bot.js`：在 `policy.js` 基础上加入建造/科技优先级；支持 `testMoney`（冒烟）与 `strictMoney`（平衡结论）；跑 20/40 回合，记录计划书 9.7 列出的指标。
- 输出 `bench/balance-<seed>.json` 与可读表格到 stdout；不写进仓库（`bench/` 加入 `.gitignore`）。
- 对比计划书推演表，标出偏差 >25% 的回合。

- [ ] **Step 4: 运行确认通过**

```bash
node tests/bot.js --rounds 20 --seed 1
node tests/bot.js --rounds 40 --seed 1
```

记录结果；若 R20 过于简单，按计划书 9.10 优先调精英比例，不动 HP 底数。

- [ ] **Step 5: 提交**

```bash
git add tests/bot.js tests/balance-report.test.js tests/policy.js README.md .gitignore
git commit -m "test(m3): headless bot and 20/40 round balance report"
```

---

### Task 30: M3 验收

**Files:**
- Modify: `README.md`，Create: `docs/balance-notes.md`

- [ ] **Step 1: 写验收测试**

```js
test('40 回合冒烟与 BOSS 轮次', () => {
  const { runBot } = require('./bot.js');
  const r = runBot({ mapId: 'suburban', seed: 3, maxRounds: 40, testMoney: true });
  assert.ok(r.rounds >= 20);
  assert.ok(r.bossKills >= 1);
});
```

- [ ] **Step 2: 运行确认失败/通过**（视已有实现；这是里程碑门禁，不是新功能）。

- [ ] **Step 3: 补齐缺口**

按失败项修：BOSS 轮次、英雄奖励、转化兵、科技、bot。不得用“跳过测试”收尾。

- [ ] **Step 4: 运行全套**

```bash
node --test tests/
node tests/bot.js --rounds 40 --seed 1
```

手动：郊区公路完整打一局到 40 回合或失败；检查 BOSS 石块预警、英雄技能、队长晋升、转化兵、科技满级表现。

- [ ] **Step 5: 提交**

```bash
git add README.md docs/balance-notes.md tests/
git commit -m "test(m3): milestone acceptance and balance notes"
```

**M3 Gate：** 30 个任务全绿；40 回合可玩；bot 20/40 无异常；BOSS 每 7 回合；英雄四类全部出现；科技可满级。

---

## 7. M4 打磨与发布（Tasks 31–38）

**M4 目标**：粒子/震屏/音效/教学/最佳成绩/性能/QA/PWA/手机。验收：300 僵尸 60 FPS；中端手机可玩；PWA 可安装/离线；无 console 错误。

---

### Task 31: 粒子、伤害数字、震屏与命中反馈

**Files:**
- Create: `src/view/particles.js`，修改 `src/view/renderer.js`, `styles.css`, `tests/particles.test.js`

**Interfaces:**
- Produces: `ZG.Particles.spawn/step/draw/shake/reset`；对象池；上限按 `Platform.quality`。

- [ ] **Step 1: 写失败测试（纯逻辑）**

```js
test('粒子上限与对象池复用', () => {
  const P = ZG.Particles.create({ cap: 250 });
  for (let i = 0; i < 1000; i++) P.spawn('spark', 100, 100, {});
  assert.equal(P.activeCount(), 250);
  P.step(); P.step();
  assert.ok(P.activeCount() <= 250);
});

test('伤害数字上限 50 并合并', () => {
  const P = ZG.Particles.create({ cap: 250, damageCap: 50 });
  for (let i = 0; i < 200; i++) P.addDamageNumber(100, 100, 10);
  assert.equal(P.damageCount(), 50);
});
```

- [ ] **Step 2: 运行确认失败**：`node --test tests/particles.test.js` → FAIL。

- [ ] **Step 3: 最小实现**

- 对象池：粒子/伤害数字/曳光；`spawn(kind,x,y,opts)`；`step` 更新寿命；`draw(ctx)`。
- 命中闪白 1–2 帧、击杀粒子、爆炸环、烟雾、金币飘字。
- 震屏：`shake(power)` 0.15–0.3s；设置关闭时不生效。
- BOSS 死亡：0.3 秒 hit-stop + 大爆炸 + 金币雨；hit-stop 只冻结模拟视觉，不改变 `battle.time`。
- 粒子上限桌面 250/移动 120；伤害数字上限 50。
- 绘制顺序固定：背景（静态层）→ 地面效果 → 建筑 → 僵尸 → 人类 → 投射物 → 粒子 → UI。
- 接入 `combat`/`projectiles` 事件（`zombie:died`、`building:destroyed`、`boss:spawned`）。

- [ ] **Step 4: 运行通过**：`node --test tests/particles.test.js` → PASS。
手动：300 僵尸场景无明显卡顿；关掉伤害数字后数字消失。

- [ ] **Step 5: 提交**

```bash
git add src/view/particles.js src/view/renderer.js styles.css tests/particles.test.js
git commit -m "feat(m4): particles, damage numbers, screen shake"
```

---

### Task 32: Web Audio 程序音效

**Files:**
- Create: `src/view/audio.js`, `tests/audio-model.test.js`

**Interfaces:**
- Produces: `ZG.Audio.init/play/setMuted/isMuted`；首次用户手势初始化；无音频文件。

- [ ] **Step 1: 写失败测试**

```js
test('音效名表与静音状态', () => {
  const A = ZG.Audio.create({ ctxFactory: () => null });
  assert.ok(A.names.includes('pistol'));
  assert.ok(A.names.includes('bossRoar'));
  A.setMuted(true); assert.equal(A.isMuted(), true);
  A.play('pistol'); // 未初始化时静默，不抛异常
});
```

- [ ] **Step 2: 运行确认失败**：`node --test tests/audio-model.test.js` → FAIL。

- [ ] **Step 3: 最小实现**

- `Audio` 工厂可注入 `AudioContext`（Node 测试传 null）。`init()` 只在真实用户手势里创建并解锁：`ctx = new AudioContext(); if (ctx.state === 'suspended') await ctx.resume()`；iOS 在首次点击前不创建。监听 `visibilitychange`，回到前台再次 `resume()`（参考 Arcane Bastion 对 Chrome 自动播放策略的处理）。
- 程序生成：短噪声/振荡器/滤波；音效名：`pistol/shotgun/mg/flame/rocket/explosion/heal/infect/bossRoar/click/horn/coin`。
- 主音量、静音持久化（`Platform.save`）；同一音效 30ms 内节流，避免 300 僵尸时爆音。
- 订阅 `zombie:died`/`boss:spawned`/`round:started` 等事件播放。

- [ ] **Step 4: 运行通过**：`node --test tests/audio-model.test.js` → PASS。
手动：首次点击后有声音；M 键静音；刷新后静音状态保留。

- [ ] **Step 5: 提交**

```bash
git add src/view/audio.js tests/audio-model.test.js
git commit -m "feat(m4): procedural web audio sfx"
```

---

### Task 33: 新手引导、图鉴、帮助与战斗日志完善

**Files:**
- Modify: `src/view/hud.js`, `src/view/model.js`, `styles.css`, `tests/tutorial.test.js`

**Interfaces:**
- Consumes: `state.settings.tutorialSeen`、`state.round`。
- Produces: 4 步引导、图鉴/帮助面板、可重播。

- [ ] **Step 1: 写失败测试**

```js
test('引导 4 步状态机', () => {
  const T = ZG.Tutorial.create();
  assert.equal(T.step, 0);
  T.next(); T.next(); T.next(); T.next();
  assert.equal(T.done, true);
  T.restart(); assert.equal(T.step, 0);
});

test('第一回合只出普通丧尸', () => {
  assert.deepEqual(ZG.Waves.composition(1), { walker: 11, runner: 0, shield: 0, boomer: 0, mother: 0, giant: 0 });
});
```

- [ ] **Step 2: 运行确认失败**：`node --test tests/tutorial.test.js` → FAIL。

- [ ] **Step 3: 最小实现**

- `Tutorial` 状态机（纯逻辑，放 `view/model.js` 或独立小对象）：4 步高亮：放一个手枪兵 → 开始回合 → 结算后补 2 个兵 → 介绍建筑/科技。
- 只在首次进入郊区公路且 `tutorialSeen=false` 时出现；完成后写设置；设置里可重播。
- 图鉴：8 人类/8 僵尸/4 英雄/6 建筑/4 科技，含数值与克制提示；H 键打开；打开时自动暂停。
- 战斗日志保留最近 20 条，支持过滤“全部/战斗/经济”。
- 帮助面板含操作表与“暂停/加速/静音/帮助”快捷键。

- [ ] **Step 4: 运行通过**：`node --test tests/tutorial.test.js` → PASS。
手动：首次进入走完 4 步；H 打开图鉴且战斗暂停；重播引导正常。

- [ ] **Step 5: 提交**

```bash
git add src/view tests/tutorial.test.js styles.css
git commit -m "feat(m4): tutorial, codex, help, battle log"
```

---

### Task 34: 设置、最佳回合、存档导入导出

**Files:**
- Create: `src/core/platform.js`（若 Task 1 未建则现在建全），修改 `src/main.js`, `src/view/hud.js`, `tests/platform.test.js`

**Interfaces:**
- Produces: `ZG.Platform.*`（2.5 签名）；`zd_best_<map>`、`zd_settings`、`zd_save_version`。

- [ ] **Step 1: 写失败测试**

```js
test('存档读写失败不影响游戏', () => {
  const P = ZG.Platform.create({ storage: { getItem(){ throw new Error('denied'); }, setItem(){ throw new Error('denied'); } } });
  assert.equal(P.load(), null);
  assert.equal(P.save({ a: 1 }), false);
});

test('存档带版本号与迁移', () => {
  const mem = {}; const storage = { getItem:k=>mem[k]??null, setItem:(k,v)=>{mem[k]=v;}, removeItem:k=>{delete mem[k];} };
  const P = ZG.Platform.create({ storage });
  P.save({ version: 1, best: { suburban: 12 } });
  assert.equal(P.loadBest('suburban'), 12);
  assert.equal(P.load().version, 1);
});
```

- [ ] **Step 2: 运行确认失败**：`node --test tests/platform.test.js` → FAIL。

- [ ] **Step 3: 最小实现**

- `Platform` 工厂支持注入 storage；浏览器用 localStorage；Electron/Tauri 预留 `window.__saveBridge`。
- 设置：速度、伤害数字、震屏、静音、引导已看；全部 try/catch。
- 最佳回合：游戏结束时比较并写 `zd_best_<map>`；选图界面显示。
- 导出：`Blob` + `<a download>`；导入：`<input type=file>` + JSON 校验 + 版本迁移；失败给出中文提示。
- 菜单显示版本号（`v0.4.0`）。

- [ ] **Step 4: 运行通过**：`node --test tests/platform.test.js` → PASS。
手动：刷新后设置/最佳回合保留；导出→清 localStorage→导入恢复；禁用 localStorage 后游戏仍可玩。

- [ ] **Step 5: 提交**

```bash
git add src/core/platform.js src/main.js src/view/hud.js tests/platform.test.js
git commit -m "feat(m4): settings, best rounds, save export/import"
```

---

### Task 35: 手机横屏、触控与画质档

**Files:**
- Modify: `styles.css`, `src/view/input.js`, `src/view/renderer.js`, `src/main.js`, `src/core/platform.js`, `tests/mobile-model.test.js`

**Interfaces:**
- Consumes: `Platform.isMobile/quality`。
- Produces: 触控选择/放置/拖动/点按 tooltip；竖屏遮罩；安全区；移动画质档。

- [ ] **Step 1: 写失败测试**

```js
test('画质档位与上限', () => {
  assert.deepEqual(ZG.Platform.qualityFor('mobile'), { dprCap: 1.5, particleCap: 120, zombieCap: 200, shake: false, damageNumbers: false });
  assert.deepEqual(ZG.Platform.qualityFor('desktop'), { dprCap: 2, particleCap: 250, zombieCap: 300, shake: true, damageNumbers: true });
});

test('触控目标最小 44px', () => {
  assert.ok(ZG.Model.touchTargetSize() >= 44);
});
```

- [ ] **Step 2: 运行确认失败**：`node --test tests/mobile-model.test.js` → FAIL。

- [ ] **Step 3: 最小实现**

- CSS：`viewport-fit=cover`、`touch-action:none`、`user-select:none`；安全区 `env(safe-area-inset-*)`；按钮 ≥44px；底部面板可折叠。
- 竖屏检测（`innerHeight > innerWidth`）显示“请横屏游玩”，提供“仍然继续”；横屏后隐藏。
- 触控：`pointerdown/move/up` 统一处理；点卡片→点部署区放置；点人类→拖动；点空白取消；点按显示 tooltip，再点关闭。
- 微信内置浏览器：检测 `MicroMessenger` UA，顶部一次性提示“建议在浏览器中打开”，不反复弹窗；微信内不注册 Service Worker，按普通 H5 运行。
- 画质：`Platform.qualityFor(device)`；DPR 上限、粒子上限、僵尸上限；超出僵尸上限时 spawner 延迟出生。
- Android：`requestFullscreen` + `screen.orientation.lock('landscape')`，失败静默。
- iOS：不支持方向锁，用遮罩兜底；音频首次点击初始化。

- [ ] **Step 4: 运行通过**：`node --test tests/mobile-model.test.js` → PASS。
真机手动：iPhone Safari、Android Chrome、微信内置浏览器、QQ 浏览器各开一局；检查横屏、放置、拖动、tooltip、安全区、音效、帧率。

- [ ] **Step 5: 提交**

```bash
git add styles.css src/view/input.js src/view/renderer.js src/main.js src/core/platform.js tests/mobile-model.test.js
git commit -m "feat(m4): mobile landscape, touch input, quality tiers"
```

---

### Task 36: PWA、图标、OG 与版本提示

**Files:**
- Create: `manifest.webmanifest`, `sw.js`, `icons/icon-192.png`, `icons/icon-512.png`, `icons/icon-maskable-512.png`, `tools/make-icons.html`, `tests/pwa.test.js`，修改 `index.html`, `src/main.js`

**Interfaces:**
- Produces: 可安装 PWA、离线缓存、更新提示、OG 标签。

- [ ] **Step 1: 写失败测试（静态断言）**

```js
const fs = require('node:fs');
const { test } = require('node:test');
const assert = require('node:assert/strict');

test('manifest 字段与 sw 缓存版本', () => {
  const m = JSON.parse(fs.readFileSync('manifest.webmanifest', 'utf8'));
  assert.equal(m.name, '尸潮防线');
  assert.equal(m.display, 'standalone');
  assert.equal(m.orientation, 'landscape');
  assert.equal(m.start_url, './');
  assert.equal(m.icons.length, 3);
  const sw = fs.readFileSync('sw.js', 'utf8');
  assert.ok(/zd-v\d+\.\d+\.\d+/.test(sw));
});
```

- [ ] **Step 2: 运行确认失败**：`node --test tests/pwa.test.js` → FAIL。

- [ ] **Step 3: 最小实现**

- `manifest.webmanifest` 按计划书 13.3.2 全字段。
- `sw.js`：Cache First 缓存 `index.html`、`styles.css`、`src/**/*.js`、manifest、icons；版本号 `zd-v1.0.0`；`install` 预缓存，`activate` 清旧缓存；`fetch` 只处理同源 GET。
- `index.html`：`theme-color`、`viewport-fit=cover`、OG 标题/描述/图；版本号显示。
- `main.js`：HTTPS/localhost 下注册 SW；`beforeinstallprompt` 显示安装按钮；`controllerchange` 显示“新版本已就绪，点击刷新”；iOS 显示手动添加主屏指引。
- `tools/make-icons.html`：Canvas 画圆形单位 + 标题，按钮下载 192/512/maskable/OG 1200×630；把生成的 PNG 提交。

- [ ] **Step 4: 运行通过**：`node --test tests/pwa.test.js` → PASS。
手动：`npx serve .`（或任意静态服务器）打开，安装按钮出现；断网刷新可玩；改版本号后出现更新提示。

- [ ] **Step 5: 提交**

```bash
git add manifest.webmanifest sw.js icons tools index.html src/main.js tests/pwa.test.js
git commit -m "feat(m4): pwa manifest, service worker, icons, og tags"
```

---

### Task 37: 性能优化与 300 僵尸基准

**Files:**
- Modify: `src/sim/**`, `src/view/renderer.js`，修改 `tests/bench.js`

**Interfaces:**
- Consumes: 全部系统。
- Produces: 模拟 ≤4ms、渲染 ≤6ms；300 僵尸 + 99 人类 + 100 投射物 60 FPS。

- [ ] **Step 1: 写基准（先测再优化）**

`tests/bench.js` 输出：
```
entities=300 zombies, 99 humans, 100 projectiles
steps=600
avgStepMs=... maxStepMs=...
drawAvgMs=...
```
渲染基准可在浏览器 `__game.benchDraw(300)` 中测。

- [ ] **Step 2: 记录基线**

Run: `node tests/bench.js`
把基线写进 `docs/balance-notes.md`。

- [ ] **Step 3: 优化（按瓶颈逐项）**

- 空间哈希：64px 初始值（约 2× 最大实体直径 60）；用 `Int32Array` 桶 + `stamp` epoch，每步只重置 `count`，不重建所有数组；`queryCircle` 复用调用方传入的缓冲区，不在热路径分配。
- 索敌先查哈希邻格，禁止遍历全部僵尸；距离用平方比较，避免 `sqrt`。
- 分离最多 8 邻居；用 `for` 循环，不在热路径用 `forEach/map/filter`，不创建临时对象/闭包。
- 渲染：保留分层 canvas，静态层只在建造/拆除/毁建筑时重绘；动态层每帧只清一次。
- 血条仅受伤单位；伤害数字上限；僵尸/投射物/粒子全部对象池化，复用死亡实体对象，数组按 `alive` 压缩，避免每步 `new` 与 `splice` 高频。
- 渲染按颜色/形状批处理（可选）；关闭阴影/模糊。
- 移动端上限 200、DPR 1.5。
- 用 `bench.js` 对比 48/64/96 三种格子大小，把最优值写回 `Const.HASH_CELL` 并记录在 `docs/balance-notes.md`。
- 加一个 10,000 tick 的确定性压测（`tests/replay.test.js`）：同 seed 两次哈希一致，且平均步耗时 ≤4ms。

- [ ] **Step 4: 复测并验收**

Run: `node tests/bench.js` → `avgStepMs ≤ 4`。
浏览器 300 僵尸场景 → 60 FPS（DevTools Performance 记录 10 秒）。

- [ ] **Step 5: 提交**

```bash
git add src/sim src/view/renderer.js tests/bench.js docs/balance-notes.md
git commit -m "perf(m4): 300-zombie benchmark and optimization pass"
```

---

### Task 38: QA、部署与 README

**Files:**
- Create: `qa/checklist.md`, `qa/smoke.js`（可选 Playwright），修改 `README.md`, `docs/game-plan.md`（偏差记录）

**Interfaces:**
- Consumes: 全部里程碑。
- Produces: 可发布的静态站点与验收记录。

- [ ] **Step 1: 写 QA 清单**

`qa/checklist.md` 覆盖：
- 桌面：开始/暂停/1x/2x/3x/空格/1-2-3/Tab/M/H/Esc；放置/拖动/出售/建造/拆建/科技；结算/失败/重开 3 次。
- 手机：横屏/竖屏遮罩/安全区/44px/触摸放置/拖动/tooltip/音效/帧率。
- 边界：同帧同归于尽、转化兵到期、英雄最后一人阵亡、240 秒强制结算、满建可达。
- PWA：安装、离线、更新提示、OG 预览。
- 性能：300 僵尸 60 FPS。

- [ ] **Step 2: 跑全套测试与 QA**

```bash
node --test tests/
node tests/bench.js
node tests/bot.js --rounds 40 --seed 1
```

浏览器逐条勾选 `qa/checklist.md`；故意重启 3 次，第三次行为与第一次一致。

- [ ] **Step 3: 修复发现的问题**

每个问题补一条回归测试；不允许只修 UI 不补测试（纯视觉问题除外）。

- [ ] **Step 4: 部署 PWA**

1. `git init`（若未初始化）→ 提交 → 新建 GitHub 仓库 `zombie-defense`（账号 `charanie`）。
2. 通过 SSH 推送（本机 `github.com:443` 被阻断，必须用 `git@github.com:charanie/zombie-defense.git`）。
3. 仓库 Settings → Pages → Deploy from branch `main` / root。
4. 访问 `https://charanie.github.io/zombie-defense/`，确认 manifest/SW/OG 生效；生成二维码。
5. 更新 README：玩法、操作、开发命令、目录、发布地址、版本号、已知限制。

- [ ] **Step 5: 提交与打标签**

```bash
git add qa README.md docs
git commit -m "docs(m4): qa checklist, deployment, readme"
git tag v1.0.0
git push origin main --tags
```

**M4 Gate：** 38 个任务全绿；300 僵尸 60 FPS；中端手机可玩；PWA 可安装/离线；无 console 错误；README 与计划书同步。

### 7.1 不在本计划任务内的可选项

计划书第 13 章把 P2 桌面壳、P3 手机 App、P4 Steam 标为可选/后期。本计划不为其排任务，但保留接口：

- **桌面壳（Electron/Tauri）**：Task 34 的 `Platform` 已预留 `window.__saveBridge`；壳只需 `loadFile('index.html')` 或 `frontendDist`，不侵入游戏逻辑。
- **Capacitor**：复用同一静态构建；需另做返回键、文件存档与商店素材。
- **Steam**：等内容与 40 回合平衡稳定后再接 Steamworks；`Platform.save` 可换成 Steam Cloud 适配器。

触发条件与风险见计划书 13.4–13.6、13.9。

---

## 8. 里程碑依赖与排期建议

| 里程碑 | 任务 | 依赖 | 建议投入 |
|---|---|---|---|
| M1 | 1–14 | 无 | 先把“能玩的 10 回合”做出来，不碰英雄/BOSS/建筑 |
| M2 | 15–23 | M1 Gate | 内容填充；每加一类单位先写数据再写行为 |
| M3 | 24–30 | M2 Gate | BOSS 与英雄；科技与 bot 同步调平 |
| M4 | 31–38 | M3 Gate | 先做性能与手机，再做 PWA 与发布 |

**不要跨里程碑抢功能**：M1 不做建筑、不做英雄、不做 BOSS；否则核心循环的验收会被内容量拖垮。

---

## 9. 自检（对照 writing-plans 清单）

### 9.1 计划书覆盖检查

| 计划书章节 | 落点 | 状态 |
|---|---|---|
| 1 定位/成功标准 | Global Constraints + M1–M4 Gate | 覆盖 |
| 2 核心循环/阶段/结算/失败/反卡死 | Task 7/12/22 | 覆盖 |
| 3 操作与 UI | Task 13/21/33/35 | 覆盖 |
| 4 人类/队长/英雄/人口 | Task 3/9/15/19/25/26/27 | 覆盖 |
| 5 僵尸/BOSS/波次 | Task 3/8/16/24/6 | 覆盖 |
| 6 感染/队长/英雄/转化/护盾/爆尸/母体/石块 | Task 10/16/18/19/24/26 | 覆盖 |
| 7 建筑/槽位/废墟/寻路 | Task 17 | 覆盖 |
| 8 三张地图/校验 | Task 5/20 | 覆盖 |
| 9 经济/科技/难度 | Task 3/11/28/29 | 覆盖 |
| 10 AI/寻路/投射物/伤害/状态 | Task 8/9/10/16/22 | 覆盖 |
| 11 视觉/音效/UI/可访问性 | Task 13/21/31/32/33 | 覆盖 |
| 12 技术方案/文件/循环/性能/测试钩子 | 第 2 章 + Task 14/37 | 覆盖 |
| 13 发布与包装 | Task 36/38 | 覆盖 |
| 14 里程碑 | 第 4–7 章 | 覆盖 |
| 15 风险/调参/待定项 | 2.7 裁决 + Task 29 | 覆盖 |
| 16 验收清单 | 各 Gate + Task 38 | 覆盖 |
| 17 附录数据/公式 | Task 3 测试逐项断言 | 覆盖 |

### 9.2 类型与命名一致性

- 人类 `classId`、僵尸 `typeId`、建筑 `typeId`、英雄 `heroId` 在全部任务中一致。
- `ZG.Sim.tick(state,n)`、`ZG.State.hash`、`ZG.Economy.*`、`ZG.Combat.applyDamage` 在 Task 7–38 中同名同签名。
- `state.ui.speed`/`state.ui.paused` 在 Task 13/35 中一致；`state.battle.time` 在 Task 7/22/24 中一致。

### 9.3 Review Focus 对应测试

| Review Focus | 测试 |
|---|---|
| 同帧同归于尽 | Task 12 `settlement.test.js` |
| 满建可达 + 1.35× | Task 5 `pathing.test.js`、Task 20 `maps.test.js` |
| 暂停/3x/切后台 | Task 13 主循环手动验收、Task 37 性能复测 |
| 300 僵尸性能 | Task 14 `bench.js`、Task 37 |
| 手机横屏/安全区/触控 | Task 35 真机清单 |

### 9.4 参考实现核对

- 流场：采用 Red Blob Games / Antix 的“多源 BFS + 距离场 + epoch 标记”，没有引入其 `graphFromArray`（本项目网格更小，扁平 TypedArray 更直接）。
- 确定性：采用 clockwork-engine / nova-drift 的“seed + 输入命令回放”，不做状态快照；战斗全自动，回放成本极低。
- 渲染：采用 monster-tower-defense 的分层 canvas；拒绝 quadtree（均匀圆形分布下 64px 空间哈希的常量更小）。
- 空间哈希：采用 lite-spatial 的 TypedArray + epoch 去重、格子约 2× 最大实体；本项目最大实体 BOSS 直径 60，故初始 64px。
- 音频：采用 Arcane Bastion 的手势解锁与 `resume()` 处理，不引入音频文件。

### 9.5 比例检查

本方案约 3000 行，计划书约 2237 行；代码预计 7000–10000 行。方案只锁定“实现者无法独自决定”的东西（文件、接口、数值、测试断言），没有逐行转录实现。

---

## 10. 偏差记录（执行时填写）

| 日期 | 任务 | 偏差 | 原因 | 计划书是否同步 |
|---|---|---|---|---|
| 2026-10-18 | 全部 | 测试命令改为 `node --test tests/*.test.js` | Node 24 / Windows 下 `node --test tests/` 会把目录当模块解析 | README/AGENTS 已同步 |
| 2026-10-18 | Task 13/35 | 战场 Canvas 与底部面板改为纵向独立占位（战场 16:9 + 面板在下方），而非面板覆盖战场 | 部署区位于画面底部，覆盖式面板会遮住可放置区域 | 已在 README/STATE 记录 |
| 2026-10-18 | Task 36 | `manifest` 由 `main.js` 在 http(s) 下动态注入 | `file://` 直接声明 manifest 会产生 CORS 控制台错误，违背“无控制台错误” | 已在 README 记录 |
| 2026-10-18 | Task 35 | 手机横屏采用等比缩放 + 左右留黑边 | 保证 16:9 战场与底部面板不重叠、坐标不拉伸 | 已记录为已知限制 |
| 2026-10-18 | Task 24 | BOSS 首次石块在出生后立即释放，此后每 4 秒 | 与 Task 24 测试（tick 1 即出现 rock）一致 | 计划书未细化首轮时机 |
| 2026-10-18 | Task 19 | 队长候选不足 3 名时，缺失名额计入溢出强化 | 与计划书 6.2 一致；测试未覆盖但实现补齐 | 一致 |
