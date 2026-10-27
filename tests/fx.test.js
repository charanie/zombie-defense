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

test('移动端关闭屏幕层叠加', () => {
  const s = ZG.Sim.createGame({ mapId: 'subway', seed: 1, quality: 'mobile' });
  s.effects = [{ kind: 'shockwave', x: 640, y: 360, radius: 120, life: 0.3, maxLife: 0.6, color: '#FF7043' }];
  const ctx = stubCtx();
  ZG.Fx.drawScreen(ctx, s);
  assert.equal(ctx.calls.fillRect, 0, 'mobile 不画全屏叠加');
});
