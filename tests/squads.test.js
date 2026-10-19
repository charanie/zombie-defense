const { test } = require('node:test');
const assert = require('node:assert/strict');
const ZG = require('./load-sim.js')();

test('盾兵在前、远程在后，全队主动接敌', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  const shield = ZG.State.spawnHuman(s, 'shield', 600, 600);
  const pistol = ZG.State.spawnHuman(s, 'pistol', 640, 600);
  const mg = ZG.State.spawnHuman(s, 'mg', 560, 600);
  const z = ZG.State.spawnZombie(s, 'walker', 600, 200);
  z.speed = 0;
  ZG.Sim.startRound(s); s.spawner.batches = [];
  ZG.Sim.tick(s, 180);
  assert.ok(shield.y < pistol.y, '盾兵应在前，实际 ' + shield.y + ' vs ' + pistol.y);
  assert.ok(shield.y < mg.y);
  assert.equal(shield.squadId, pistol.squadId);
});

test('看不到僵尸也会主动搜索，不返回原位', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  const h = ZG.State.spawnHuman(s, 'pistol', 600, 600);
  ZG.Sim.startRound(s);
  s.spawner.batches = [{ at: 999, portalAt: 998, warned: false,
    spawns: [{ type: 'walker', x: 600, y: -30, edge: 'top' }] }];
  ZG.Sim.tick(s, 180);
  assert.ok(Math.abs(h.y - 600) > 20, '应离开原位，实际 y=' + h.y);
  assert.notEqual(h.aiState, 'return');
});

test('闪避结束后回阵位而不是 home', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  const front = ZG.State.spawnHuman(s, 'shield', 600, 450);
  const h = ZG.State.spawnHuman(s, 'pistol', 600, 600);
  const z = ZG.State.spawnZombie(s, 'runner', 600, 350);
  z.sprinting = true; z.sprintT = 1; z.facing = Math.PI / 2;
  ZG.Sim.startRound(s); s.spawner.batches = [];
  ZG.Sim.tick(s, 120);
  assert.ok(Math.abs(h.y - 600) > 10, '应回到盾后阵位，实际 y=' + h.y);
  assert.ok(h.y > front.y, '应位于盾兵身后');
  assert.notEqual(h.aiState, 'return');
});

test('编队确定性', () => {
  const run = () => {
    const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 11 });
    ZG.State.spawnHuman(s, 'shield', 600, 600);
    ZG.State.spawnHuman(s, 'pistol', 640, 600);
    ZG.State.spawnHuman(s, 'medic', 560, 600);
    ZG.State.spawnZombie(s, 'walker', 600, 200);
    ZG.Sim.startRound(s); s.spawner.batches = [];
    ZG.Sim.tick(s, 300);
    return ZG.State.hash(s);
  };
  assert.equal(run(), run());
});

test('多盾兵分散成多个小队，按 id 稳定', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  const a = ZG.State.spawnHuman(s, 'shield', 300, 600);
  const b = ZG.State.spawnHuman(s, 'shield', 900, 600);
  const p = ZG.State.spawnHuman(s, 'pistol', 320, 600);
  ZG.Squads.rebuild(s);
  assert.equal(s.squads.length, 2);
  assert.equal(p.squadId, a.id);
  assert.deepEqual(s.squads.map(q => q.id).sort((x, y) => x - y),
    [a.id, b.id].sort((x, y) => x - y));
});

test('无盾兵时虚拟小队仍能排阵', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  ZG.State.spawnHuman(s, 'pistol', 600, 600);
  ZG.State.spawnHuman(s, 'medic', 620, 600);
  ZG.Squads.rebuild(s);
  assert.equal(s.squads.length, 1);
  assert.equal(s.squads[0].shieldIds.length, 0);
  assert.ok(s.squads[0].memberIds.length === 2);
});

test('搜索在距边界 120px 处停住', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  const h = ZG.State.spawnHuman(s, 'pistol', 600, 400);
  ZG.Sim.startRound(s);
  s.spawner.batches = [{ at: 999, portalAt: 998, warned: false,
    spawns: [{ type: 'walker', x: 600, y: -30, edge: 'top' }] }];
  ZG.Sim.tick(s, 600);
  const q = s.squads[0];
  assert.ok(q.frontY >= 120 - 1, '前缘不应越过 120，实际 ' + q.frontY);
});
