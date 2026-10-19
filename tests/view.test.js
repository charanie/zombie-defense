const { test } = require('node:test');
const assert = require('node:assert/strict');
const ZG = require('./load-sim.js')();

test('兵种卡状态与禁用原因', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  assert.deepEqual(ZG.Model.cardState(s, 'pistol'), { disabled: false, reason: null, cost: 60 });
  s.money = 10;
  assert.deepEqual(ZG.Model.cardState(s, 'pistol'), { disabled: true, reason: 'money', cost: 60 });
  s.money = 9999;
  s.humans = Array(10).fill({ pop: 1, converted: false, alive: true, hero: false });
  assert.equal(ZG.Model.cardState(s, 'pistol').reason, 'population');
});

test('顶栏与波次预览', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  const bar = ZG.Model.topBar(s);
  assert.equal(bar.round, 1);
  assert.equal(bar.money, 400);
  assert.equal(bar.pop, 0);
  assert.equal(bar.popCap, 10);
  assert.equal(bar.heroes, 0);
  const p = ZG.Model.wavePreview(s);
  assert.equal(p.total, 11);
  assert.equal(p.boss, false);
});

test('建筑卡与科技行', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  s.money = 1000;
  const c = ZG.Model.buildingCard(s, 'turret');
  assert.deepEqual({ cost: c.cost, disabled: c.disabled }, { cost: 200, disabled: false });
  s.money = 10;
  assert.equal(ZG.Model.buildingCard(s, 'turret').reason, 'money');
  const row = ZG.Model.techRow(s, 'fire');
  assert.equal(row.level, 0);
  assert.equal(row.cost, 120);
  assert.equal(row.maxed, false);
});

test('tooltip 数据完整', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  const z = ZG.State.spawnZombie(s, 'giant', 600, 500);
  const info = ZG.Model.zombieInfo(s, z.id);
  for (const k of ['name', 'hp', 'maxHp', 'speed', 'damage', 'bounty', 'special']) {
    assert.ok(k in info, k);
  }
  const h = ZG.State.spawnHuman(s, 'pistol', 600, 600);
  const hi = ZG.Model.humanInfo(s, h.id);
  assert.equal(hi.name, '手枪兵');
  assert.ok(hi.dps > 0);
});

test('触控目标最小 44px', () => {
  assert.ok(ZG.Model.touchTargetSize() >= 44);
});

test('引导 4 步状态机', () => {
  const T = ZG.Tutorial.create();
  assert.equal(T.step, 0);
  T.next(); T.next(); T.next(); T.next();
  assert.equal(T.done, true);
  T.restart();
  assert.equal(T.step, 0);
});

test('粒子与伤害数字上限', () => {
  const P = ZG.Particles.create({ cap: 250, damageCap: 50 });
  for (let i = 0; i < 1000; i++) P.spawn('spark', 100, 100, {});
  assert.equal(P.activeCount(), 250);
  P.step(); P.step();
  assert.ok(P.activeCount() <= 250);
  for (let i = 0; i < 200; i++) P.addDamageNumber(100, 100, 10);
  assert.equal(P.damageCount(), 50);
});

test('音效名表与静音状态', () => {
  const A = ZG.Audio.create({ ctxFactory: () => null });
  assert.ok(A.names.includes('pistol'));
  assert.ok(A.names.includes('bossRoar'));
  A.setMuted(true);
  assert.equal(A.isMuted(), true);
  A.play('pistol');
});

test('世界等比居中', () => {
  const a = ZG.Renderer.fitWorldRect(1280, 720);
  assert.equal(a.scale, 1); assert.equal(a.offsetX, 0); assert.equal(a.offsetY, 0);
  const b = ZG.Renderer.fitWorldRect(2000, 720);
  assert.equal(b.scale, 1); assert.equal(b.offsetX, 360); assert.equal(b.offsetY, 0);
  const c = ZG.Renderer.fitWorldRect(844, 216);
  assert.ok(Math.abs(c.scale - 0.3) < 1e-9);
  assert.ok(Math.abs(c.offsetX - 230) < 1e-9);
});

test('手机横屏策略', () => {
  assert.equal(ZG.Platform.orientationPlan({
    isMobile: true, portrait: true, supportsLock: true, fullscreenEnabled: true
  }), 'lock');
  assert.equal(ZG.Platform.orientationPlan({
    isMobile: true, portrait: true, supportsLock: false, fullscreenEnabled: true
  }), 'portrait');
  assert.equal(ZG.Platform.orientationPlan({
    isMobile: true, portrait: false, supportsLock: true, fullscreenEnabled: true
  }), 'landscape');
  assert.equal(ZG.Platform.orientationPlan({
    isMobile: false, portrait: true, supportsLock: false, fullscreenEnabled: true
  }), 'portrait');
});

test('建筑卡显示上限', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  s.money = 99999;
  for (let i = 0; i < 3; i++) ZG.Economy.build(s, 'turret', 100 + i * 90, 200);
  const c = ZG.Model.buildingCard(s, 'turret');
  assert.equal(c.count, 3); assert.equal(c.limit, 3); assert.equal(c.reason, 'limit');
});
