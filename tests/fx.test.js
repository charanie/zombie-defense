/* 技能/特殊攻击特效：KINDS、describe、三层绘制与移动端降级 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const ZG = require('./load-sim.js')();
const { stubCtx } = require('./stub-ctx.js');

test('KINDS 覆盖所有特殊攻击', () => {
  const kinds = new Set(ZG.Fx.KINDS);
  for (const k of ['missile_lock', 'shockwave', 'inspire', 'groupheal', 'slash', 'rock_warn',
    'rock_impact', 'stomp', 'boom', 'summon', 'poison_cloud', 'crack', 'burn_mark', 'burrow',
    'shield_flash', 'flame', 'tracer', 'dash_warn']) assert.ok(kinds.has(k), k);
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

test('移动端爆发粒子数量减半', () => {
  const P = ZG.Particles.create({ cap: 100, damageCap: 10 });
  P.setQuality('mobile');
  P.burst(10, 10, '#FFFFFF', 10);
  assert.equal(P.activeCount(), 5);
  const Q = ZG.Particles.create({ cap: 100, damageCap: 10 });
  Q.setQuality('desktop');
  Q.burst(10, 10, '#FFFFFF', 10);
  assert.equal(Q.activeCount(), 10);
});

test('移动端关闭屏幕层叠加', () => {
  const s = ZG.Sim.createGame({ mapId: 'subway', seed: 1, quality: 'mobile' });
  s.effects = [{ kind: 'shockwave', x: 640, y: 360, radius: 120, life: 0.3, maxLife: 0.6, color: '#FF7043' }];
  const ctx = stubCtx();
  ZG.Fx.drawScreen(ctx, s);
  assert.equal(ctx.calls.fillRect, 0, 'mobile 不画全屏叠加');
});

test('长官技能生成三个落点锁定圈', () => {
  const s = ZG.Sim.createGame({ mapId: 'subway', seed: 1 });
  const h = ZG.State.spawnHuman(s, 'officer', 1100, 360, { heroId: 'officer' });
  h.skillUses = 1; h.skillCd = 0;
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
  for (let i = 0; i < 4; i++) {
    ZG.State.spawnHuman(s, 'pistol', 1080 + i * 12, 320);
  }
  const plague = ZG.State.spawnHuman(s, 'plague', 1100, 420, { heroId: 'plague' });
  for (let i = 0; i < 3; i++) {
    const u = ZG.State.spawnHuman(s, 'pistol', 1060 + i * 10, 430);
    u.hp = u.maxHp * 0.5;
  }
  ZG.Sim.startRound(s); s.spawner.batches = [];
  // startRound 会重置技能计时，必须在开战后设置
  g.skillCd = 0;
  plague.skillCd = 0;
  ZG.Sim.tick(s, 2);
  assert.equal(s.effects.filter(e => e.kind === 'inspire').length, 1);
  assert.equal(s.effects.filter(e => e.kind === 'groupheal').length, 1);
});

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
  assert.ok(s.effects.some(e => e.kind === 'poison_cloud'));
});
