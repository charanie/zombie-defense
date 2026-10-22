const { test } = require('node:test');
const assert = require('node:assert/strict');
const ZG = require('./load-sim.js')();

test('招募扣钱、占人口', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  const r = ZG.Economy.recruit(s, 'pistol', 600, 600);
  assert.equal(r.ok, true);
  assert.equal(s.money, 340);
  assert.equal(ZG.Economy.populationUsed(s), 1);
});

test('人口上限与平民上限', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  s.money = 99999;
  for (let i = 0; i < 10; i++) {
    assert.equal(ZG.Economy.recruit(s, 'pistol', 200 + i * 30, 600).ok, true);
  }
  assert.deepEqual(ZG.Economy.recruit(s, 'pistol', 900, 600), { ok: false, reason: 'population' });

  const s2 = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  s2.money = 99999;
  for (let i = 0; i < 8; i++) {
    assert.equal(ZG.Economy.recruit(s2, 'civilian', 200 + i * 30, 600).ok, true);
  }
  assert.deepEqual(ZG.Economy.recruit(s2, 'civilian', 900, 600), { ok: false, reason: 'civilian-cap' });
});

test('地图外、障碍或重叠位置不能放置', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  s.money = 1000;
  assert.equal(ZG.Economy.canPlace(s, 600, 100, 8).ok, true);
  assert.equal(ZG.Economy.canPlace(s, 4, 100, 8).ok, false);
  assert.equal(ZG.Economy.canPlace(s, 420, 300, 8).ok, false);
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
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  s.money = 10;
  assert.deepEqual(ZG.Economy.recruit(s, 'pistol', 600, 600), { ok: false, reason: 'money' });
});

test('自由建造扣钱并遵守数量上限', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  s.money = 99999;
  for (let i = 0; i < 10; i++) {
    assert.equal(ZG.Economy.build(s, 'barricade', 100 + i * 80, 200).ok, true, '第 ' + i + ' 面');
  }
  assert.deepEqual(ZG.Economy.build(s, 'barricade', 600, 100), { ok: false, reason: 'limit' });
  assert.equal(s.buildings.length, 10);
});

test('拆除返 50%，摧毁后释放名额', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  s.money = 1000;
  const b = ZG.Economy.build(s, 'turret', 600, 200).building;
  assert.equal(ZG.Economy.demolish(s, b.id).refund, 100);
  assert.equal(ZG.Economy.build(s, 'turret', 600, 200).ok, true);

  const b2 = s.buildings[0];
  ZG.Combat.applyBuildingDamage(s, b2, 99999);
  assert.equal(s.buildings.length, 0);
  assert.equal(ZG.Economy.build(s, 'turret', 600, 200).ok, true);
});

test('医疗站治疗与感染 -1/s', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  s.money = 9999;
  const h = ZG.State.spawnHuman(s, 'pistol', 600, 600);
  const b = ZG.Economy.build(s, 'hospital', 600, 500).building;
  b.x = 600; b.y = 600;
  h.hp = 100; h.infection = 50;
  ZG.Sim.startRound(s); s.spawner.batches = [];
  ZG.Sim.tick(s, 60);
  assert.ok(h.hp > 100);
  assert.ok(h.infection < 50);
});

test('地雷阵 3 次触发并按回合成长', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  s.money = 9999;
  const b = ZG.Economy.build(s, 'mine', 300, 200).building;
  assert.equal(b.charges, 3);
  s.round = 7;
  assert.equal(ZG.Balance.mineDamage(7).toFixed(2), (120 * Math.pow(1.06, 6)).toFixed(2));
});

