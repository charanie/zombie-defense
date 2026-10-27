const { test } = require('node:test');
const assert = require('node:assert/strict');
const ZG = require('./load-sim.js')();

test('人类可以放在原部署区之外', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  s.money = 1000;
  assert.equal(ZG.Economy.recruit(s, 'pistol', 600, 100).ok, true);
});

test('不能放在障碍、地图外或重叠位置', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  s.money = 1000;
  assert.equal(ZG.Economy.canPlace(s, 420, 300, 8).ok, false); // 车
  assert.equal(ZG.Economy.canPlace(s, 4, 100, 8).ok, false);
  ZG.Economy.recruit(s, 'pistol', 600, 600);
  assert.equal(ZG.Economy.canPlace(s, 602, 600, 8).ok, false);
  assert.equal(ZG.Economy.canPlace(s, 700, 600, 8).ok, true);
});

test('moveHuman 可跨全图并更新 home', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  const h = ZG.State.spawnHuman(s, 'pistol', 600, 600);
  assert.equal(ZG.Economy.moveHuman(s, h.id, 120, 80).ok, true);
  assert.equal(h.x, 120); assert.equal(h.homeX, 120);
  assert.equal(ZG.Economy.moveHuman(s, h.id, 0, 80).ok, false);
});

test('地铁图中央设备带与轨道不能放置', () => {
  const s = ZG.Sim.createGame({ mapId: 'subway', seed: 1 });
  s.money = 9999;
  assert.equal(ZG.Economy.canPlace(s, 200, 360, 8).reason, 'outside-zone');
  assert.equal(ZG.Economy.canPlace(s, 200, 80, 8).reason, 'outside-zone');
  assert.equal(ZG.Economy.canPlace(s, 200, 230, 8).ok, true);
  assert.equal(ZG.Economy.canPlace(s, 1100, 360, 8).ok, true);
});

test('地铁图建筑同样限制在活动区', () => {
  const s = ZG.Sim.createGame({ mapId: 'subway', seed: 1 });
  s.money = 9999;
  assert.equal(ZG.Economy.canPlaceBuilding(s, 'turret', 200, 360).reason, 'outside-zone');
  assert.equal(ZG.Economy.canPlaceBuilding(s, 'turret', 200, 240).ok, true);
});

test('moveHuman 到区域外被拒绝且不改变位置', () => {
  const s = ZG.Sim.createGame({ mapId: 'subway', seed: 1 });
  const h = ZG.State.spawnHuman(s, 'pistol', 1100, 360);
  const r = ZG.Economy.moveHuman(s, h.id, 500, 360);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'outside-zone');
  assert.equal(h.x, 1100); assert.equal(h.y, 360);
});

test('地铁图按单位半径检查，圆不能伸进设备带', () => {
  const s = ZG.Sim.createGame({ mapId: 'subway', seed: 1 });
  s.money = 9999;
  assert.equal(ZG.Economy.canPlace(s, 500, 295, 11).reason, 'outside-zone');
  assert.equal(ZG.Economy.canPlace(s, 500, 240, 11).ok, true);
});
