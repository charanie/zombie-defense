/* 地铁图僵尸活动范围与反卡死回归 */
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
