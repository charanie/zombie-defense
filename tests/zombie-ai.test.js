const { test } = require('node:test');
const assert = require('node:assert/strict');
const ZG = require('./load-sim.js')();

test('盾尸正面拦截子弹', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  const z = ZG.State.spawnZombie(s, 'shield', 600, 500);
  z.facing = Math.PI / 2;
  const hit = ZG.Combat.interceptRay(s, 600, 650, 600, 400, {});
  assert.equal(hit.id, z.id);
});

test('背对射手不拦截', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  const z = ZG.State.spawnZombie(s, 'shield', 600, 500);
  z.facing = -Math.PI / 2;
  assert.equal(ZG.Combat.interceptRay(s, 600, 650, 600, 400, {}), null);
});

test('盾破后不再拦截', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  const z = ZG.State.spawnZombie(s, 'shield', 600, 500);
  z.facing = Math.PI / 2; z.shield = 0;
  assert.equal(ZG.Combat.interceptRay(s, 600, 650, 600, 400, {}), null);
});

test('多盾尸只拦截最近的一只', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  const a = ZG.State.spawnZombie(s, 'shield', 600, 550);
  const b = ZG.State.spawnZombie(s, 'shield', 600, 480);
  a.facing = b.facing = Math.PI / 2;
  const hit = ZG.Combat.interceptRay(s, 600, 650, 600, 400, {});
  assert.equal(hit.id, a.id);
});

test('狂尸/爆尸/盾尸不走流场', () => {
  for (const id of ['runner', 'boomer', 'shield']) {
    assert.equal(ZG.AI.usesFlowField({ typeId: id }), false);
  }
  assert.equal(ZG.AI.usesFlowField({ typeId: 'walker' }), true);
});

test('火箭被盾尸拦截后改打盾尸', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  const h = ZG.State.spawnHuman(s, 'rocket', 600, 650);
  const z = ZG.State.spawnZombie(s, 'shield', 600, 500);
  z.facing = Math.PI / 2; z.speed = 0;
  const target = ZG.State.spawnZombie(s, 'walker', 600, 400);
  target.speed = 0;
  // 让导弹兵优先选择后方的僵尸集群，而不是盾尸本体
  const w2 = ZG.State.spawnZombie(s, 'walker', 580, 400); w2.speed = 0;
  const w3 = ZG.State.spawnZombie(s, 'walker', 620, 400); w3.speed = 0;
  ZG.Sim.startRound(s); s.spawner.batches = [];
  ZG.Sim.tick(s, 1);
  const p = s.projectiles.find(q => q.typeId === 'rocket');
  assert.ok(p);
  assert.equal(p.targetId, z.id);
  assert.equal(p.tx, z.x);
});
