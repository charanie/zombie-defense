const { test } = require('node:test');
const assert = require('node:assert/strict');
const ZG = require('./load-sim.js')();

test('流场朝向最近人类', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  ZG.State.spawnHuman(s, 'pistol', 600, 600);
  s.pathing = ZG.Pathing.build(s);
  const d = ZG.Pathing.directionAt(s.pathing, 600, 100);
  assert.ok(d.y > 0, '应指向下方人类');
});

test('无人类时流场指向地图中心', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  const d = ZG.Pathing.directionAt(s.pathing, 100, 100);
  assert.ok(d.x > 0 && d.y > 0);
});

test('矩形墙阻挡流场', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  s.money = 9999;
  ZG.State.spawnHuman(s, 'pistol', 600, 650);
  ZG.Economy.build(s, 'barricade', 600, 400, { vertical: false });
  s.pathing = ZG.Pathing.build(s);
  const i = Math.floor(400 / 32) * 40 + Math.floor(600 / 32);
  assert.equal(s.pathing.blocked[i], 1);
});

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
  const inside = 7 * ZG.Const.GRID_COLS + 15;  // (496, 240) 北通道
  assert.equal(s.pathing.blocked[outside], 1);
  assert.equal(s.pathing.blocked[inside], 0);
  assert.notEqual(s.pathing.dist[inside], 65535);
});

test('地铁图两个入口都能走向大厅', () => {
  const s = ZG.Sim.createGame({ mapId: 'subway', seed: 1 });
  ZG.State.spawnHuman(s, 'shield', 1120, 360);
  const zs = [-20, 490].map(y => ZG.State.spawnZombie(s, 'walker', -20, y));
  ZG.Sim.startRound(s); s.spawner.batches = [];
  ZG.Sim.tick(s, 900);
  for (const z of zs) {
    assert.ok(z.x > 400, `入口僵尸应推进到通道中段，实际 x=${z.x.toFixed(0)}`);
    assert.ok(z.alive, '盾兵不应在 15 秒内杀死入口僵尸');
  }
});

test('建造/摧毁后流场立即重建', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  s.money = 9999;
  ZG.State.spawnHuman(s, 'pistol', 600, 650);
  const b = ZG.Economy.build(s, 'barricade', 600, 400).building;
  const i = Math.floor(400 / 32) * 40 + Math.floor(600 / 32);
  assert.equal(s.pathing.blocked[i], 1);
  ZG.Combat.applyBuildingDamage(s, b, 99999);
  assert.equal(s.pathing.blocked[i], 0);
});

test('战斗中每 15 步重建一次流场', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  ZG.State.spawnHuman(s, 'shield', 600, 600);
  ZG.State.spawnZombie(s, 'walker', 600, 100);
  ZG.Sim.startRound(s); s.spawner.batches = [];
  const before = s.pathing;
  ZG.Sim.tick(s, 15);
  assert.notEqual(s.pathing, before);
});
