const { test } = require('node:test');
const assert = require('node:assert/strict');
const ZG = require('./load-sim.js')();

test('僵尸从四边屏幕外 10-60px 出生', () => {
  const rng = ZG.Rng.createStreams(9).spawn;
  const w = ZG.Waves.build(7, rng);
  const edges = new Set();
  for (const b of w.batches) for (const s of b.spawns) {
    const out = Math.min(
      s.x < 0 ? -s.x : 9999,
      s.x > ZG.Const.W ? s.x - ZG.Const.W : 9999,
      s.y < 0 ? -s.y : 9999,
      s.y > ZG.Const.H ? s.y - ZG.Const.H : 9999
    );
    assert.ok(out >= 10 && out <= 60, JSON.stringify(s));
    edges.add(s.edge);
  }
  assert.deepEqual([...edges].sort(), ['bottom', 'left', 'right', 'top']);
});

test('BOSS 回合也四面出生且 BOSS 在中间批次', () => {
  const rng = ZG.Rng.createStreams(7).spawn;
  const w = ZG.Waves.build(7, rng);
  const edges = new Set();
  for (const b of w.batches) for (const s of b.spawns) edges.add(s.edge);
  assert.deepEqual([...edges].sort(), ['bottom', 'left', 'right', 'top']);
  const bossBatch = w.batches.findIndex(b => b.spawns.some(s => s.type === w.bossType));
  assert.ok(Math.abs(bossBatch - Math.floor(w.batches.length / 2)) <= 1);
});

test('僵尸能从屏幕外走进战场', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  ZG.State.spawnHuman(s, 'shield', 640, 600);
  const z = ZG.State.spawnZombie(s, 'walker', 640, -30);
  ZG.Sim.startRound(s); s.spawner.batches = [];
  ZG.Sim.tick(s, 120);
  assert.ok(z.y > 0, '应进入屏幕，实际 y=' + z.y);
});

test('传送门预警保留 1 秒且坐标在屏幕外', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  ZG.State.spawnHuman(s, 'shield', 640, 600);
  ZG.Sim.startRound(s);
  const b = s.spawner.batches[0];
  s.battle.time = b.portalAt;
  ZG.Sim.tick(s, 1);
  assert.equal(s.spawner.portals.length, 1);
  const p = s.spawner.portals[0];
  assert.ok(p.x < 0 || p.x > ZG.Const.W || p.y < 0 || p.y > ZG.Const.H);
  assert.ok(p.ttl > 0.9);
});

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
