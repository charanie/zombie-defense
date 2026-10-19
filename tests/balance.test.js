const { test } = require('node:test');
const assert = require('node:assert/strict');
const ZG = require('./load-sim.js')();

test('火箭直击 100%、溅射 50%', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  const a = ZG.State.spawnZombie(s, 'walker', 600, 500);
  const b = ZG.State.spawnZombie(s, 'walker', 640, 500);
  a.maxHp = a.hp = 999; b.maxHp = b.hp = 999;
  ZG.Projectiles.explode(s, 600, 500, 60, 130, 'explosion', {
    hitsHumans: false, directTargetId: a.id, splashMul: 0.5
  });
  assert.equal(a.hp, 999 - 130);
  assert.equal(b.hp, 999 - 65);
});

test('火箭直击攻城 +25%，溅射不吃加成', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  const g = ZG.State.spawnZombie(s, 'giant', 600, 500);
  const w = ZG.State.spawnZombie(s, 'walker', 640, 500);
  g.maxHp = g.hp = 9999; w.maxHp = w.hp = 9999;
  ZG.Projectiles.explode(s, 600, 500, 60, 130, 'explosion', {
    hitsHumans: false, directTargetId: g.id, splashMul: 0.5, siegeBonus: 1.25
  });
  assert.equal(g.hp, 9999 - 162.5);
  assert.equal(w.hp, 9999 - 65);
});

test('盾尸非火焰伤害减半', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  const z = ZG.State.spawnZombie(s, 'shield', 600, 500);
  z.facing = Math.PI / 2;
  const r = ZG.Combat.applyDamage(s, {
    target: z, amount: 100, damageKind: 'ranged', fromX: 600, fromY: 700
  });
  assert.equal(r.shieldDamage, 50);
});

test('盾尸火焰对盾 200%、对本 100%', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  const z = ZG.State.spawnZombie(s, 'shield', 600, 500);
  z.facing = Math.PI / 2;
  const r = ZG.Combat.applyDamage(s, {
    target: z, amount: 100, damageKind: 'fire', fromX: 600, fromY: 700
  });
  assert.equal(r.shieldDamage, 200);
  assert.equal(z.hp, z.maxHp);
});

test('盾尸近战 <40 绕过、背面全额、破盾全额', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  const a = ZG.State.spawnZombie(s, 'shield', 600, 500);
  a.facing = Math.PI / 2;
  const r1 = ZG.Combat.applyDamage(s, {
    target: a, amount: 100, damageKind: 'melee', fromX: 600, fromY: 520
  });
  assert.equal(r1.hpDamage, 100);
  const b = ZG.State.spawnZombie(s, 'shield', 700, 500);
  b.facing = -Math.PI / 2;
  const r2 = ZG.Combat.applyDamage(s, {
    target: b, amount: 100, damageKind: 'ranged', fromX: 700, fromY: 700
  });
  assert.equal(r2.hpDamage, 100);
  const c = ZG.State.spawnZombie(s, 'shield', 800, 500);
  c.facing = Math.PI / 2; c.shield = 0;
  const r3 = ZG.Combat.applyDamage(s, {
    target: c, amount: 100, damageKind: 'ranged', fromX: 800, fromY: 700
  });
  assert.equal(r3.hpDamage, 100);
});

test('喷火射程 140、导弹价格 320', () => {
  assert.equal(ZG.Data.humans.flame.attack.range, 140);
  assert.equal(ZG.Data.humans.rocket.cost, 320);
});

test('灼烧走火焰伤害管线且不刷伤害数字', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  const z = ZG.State.spawnZombie(s, 'shield', 600, 500);
  z.facing = Math.PI / 2;
  z.burnT = 1; z.burnDps = 60; z.burnFromX = 600; z.burnFromY = 700;
  let hits = 0;
  s.bus.on('fx:hit', () => hits++);
  ZG.Infection.tick(s);
  assert.ok(z.shield < z.maxShield);
  assert.equal(hits, 0);
});
