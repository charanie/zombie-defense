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
