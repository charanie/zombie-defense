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

test('建造占槽、扣钱、满槽拒绝', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  s.money = 9999;
  assert.equal(ZG.Economy.build(s, 'barricade', 's1').ok, true);
  assert.deepEqual(ZG.Economy.build(s, 'barricade', 's1'), { ok: false, reason: 'occupied' });
  for (const id of ['s2', 's3', 's4', 's5', 's6']) {
    assert.equal(ZG.Economy.build(s, 'barricade', id).ok, true);
  }
  assert.equal(s.buildings.length, 6);
  assert.deepEqual(ZG.Economy.build(s, 'barricade', 's1'), { ok: false, reason: 'occupied' });
});

test('拆除返 50%，废墟锁槽 1 回合', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  s.money = 1000;
  const b = ZG.Economy.build(s, 'turret', 's1').building;
  assert.equal(ZG.Economy.demolish(s, b.id).refund, 100);
  assert.equal(s.slots.find(x => x.id === 's1').rubble, true);
  assert.equal(ZG.Economy.build(s, 'turret', 's1').reason, 'rubble');

  ZG.State.spawnHuman(s, 'pistol', 600, 600);
  ZG.Sim.startRound(s); s.spawner.batches = []; s.zombies.length = 0;
  ZG.Sim.tick(s, 240);
  assert.equal(s.slots.find(x => x.id === 's1').rubble, false);
  assert.equal(ZG.Economy.build(s, 'turret', 's1').ok, true);
});

test('医疗站治疗与感染 -1/s', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  s.money = 9999;
  const h = ZG.State.spawnHuman(s, 'pistol', 600, 600);
  const b = ZG.Economy.build(s, 'hospital', 's1').building;
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
  const b = ZG.Economy.build(s, 'mine', 's1').building;
  assert.equal(b.charges, 3);
  s.round = 7;
  assert.equal(ZG.Balance.mineDamage(7).toFixed(2), (120 * Math.pow(1.06, 6)).toFixed(2));
});

test('科技：购买扣钱、立即生效、护甲按比例补血', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  s.money = 1000;
  const h = ZG.State.spawnHuman(s, 'pistol', 600, 600);
  assert.equal(ZG.Economy.buyTech(s, 'fire').level, 1);
  assert.equal(s.money, 880);
  assert.equal(ZG.Stats.human(s, h).damage.toFixed(2), '12.60');

  h.hp = 70;
  ZG.Economy.buyTech(s, 'armor');
  assert.equal(h.maxHp.toFixed(4), (140 * 1.06).toFixed(4));
  assert.equal(h.hp.toFixed(4), (70 * 1.06).toFixed(4));

  assert.equal(ZG.Balance.roundReward(1, 1), 77);
});

test('科技满级不能再买', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  s.money = 9999999;
  for (let i = 0; i < 10; i++) assert.equal(ZG.Economy.buyTech(s, 'serum').ok, true);
  assert.deepEqual(ZG.Economy.buyTech(s, 'serum'), { ok: false, reason: 'max-level' });
});

test('经济科技作用于击杀与通关奖励', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  s.money = 9999;
  ZG.Economy.buyTech(s, 'econ');
  const z = ZG.State.spawnZombie(s, 'walker', 600, 500);
  const before = s.money;
  ZG.Combat.applyDamage(s, { target: z, amount: 999, damageKind: 'ranged' });
  assert.equal(s.money - before, 6); // floor(6 * 1 * 1.04) = 6
  assert.equal(ZG.Balance.roundReward(1, 1), 77);
});
