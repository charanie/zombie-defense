const { test } = require('node:test');
const assert = require('node:assert/strict');
const ZG = require('./load-sim.js')();

test('建筑可自由放置且带朝向', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  s.money = 9999;
  const a = ZG.Economy.build(s, 'barricade', 600, 200, { vertical: false });
  assert.equal(a.ok, true);
  assert.equal(a.building.w, 64); assert.equal(a.building.h, 24);
  const b = ZG.Economy.build(s, 'barricade', 700, 200, { vertical: true });
  assert.equal(b.building.w, 24); assert.equal(b.building.h, 64);
});

test('围墙不减速且数量上限 10', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  s.money = 99999;
  for (let i = 0; i < 10; i++) {
    const r = ZG.Economy.build(s, 'barricade', 100 + i * 80, 200);
    assert.equal(r.ok, true, '第 ' + i + ' 面');
  }
  assert.deepEqual(ZG.Economy.build(s, 'barricade', 600, 100), { ok: false, reason: 'limit' });
  assert.equal(ZG.Data.buildings.barricade.slow, undefined);
  assert.equal(ZG.Data.buildings.barricade.blocks, true);
});

test('摧毁释放上限，不再有废墟', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  s.money = 9999;
  const r = ZG.Economy.build(s, 'turret', 600, 200);
  const b = r.building;
  ZG.Combat.applyBuildingDamage(s, b, 99999);
  assert.equal(s.buildings.length, 0);
  assert.equal(ZG.Economy.build(s, 'turret', 600, 200).ok, true);
});

test('建筑不能与人/障碍/建筑重叠', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  s.money = 9999;
  ZG.Economy.recruit(s, 'pistol', 600, 200);
  assert.equal(ZG.Economy.build(s, 'turret', 600, 200).ok, false);
  assert.equal(ZG.Economy.build(s, 'turret', 420, 300).ok, false); // 车
  ZG.Economy.build(s, 'turret', 300, 200);
  assert.equal(ZG.Economy.build(s, 'turret', 305, 200).ok, false);
});

test('圆心建筑与矩形墙互不重叠', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  s.money = 9999;
  assert.equal(ZG.Economy.build(s, 'barricade', 600, 300).ok, true);
  assert.equal(ZG.Economy.build(s, 'turret', 600, 288).ok, false);
});

test('建筑卡显示现存/上限', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  s.money = 99999;
  for (let i = 0; i < 3; i++) ZG.Economy.build(s, 'turret', 100 + i * 90, 200);
  const c = ZG.Model.buildingCard(s, 'turret');
  assert.equal(c.count, 3);
  assert.equal(c.limit, 3);
  assert.equal(c.reason, 'limit');
});
