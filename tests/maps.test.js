/* 三张地图数据结构与几何校验 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const ZG = require('./load-sim.js')();

test('三张地图主题键齐全', () => {
  for (const id of ZG.Data.mapOrder) {
    const m = ZG.Data.maps[id];
    for (const k of ['ground', 'road', 'accent', 'obstacle']) assert.ok(m.theme[k], id + '.' + k);
    assert.ok(Array.isArray(m.decor) && m.decor.length >= 8, id + ' decor');
    assert.ok(Array.isArray(m.obstacles));
  }
});

test('地铁图碰撞物贴边且留出通行宽度', () => {
  const m = ZG.Data.maps.subway;
  for (const ob of m.obstacles) {
    if (ob.kind === 'rect') {
      assert.ok(ob.x >= 0 && ob.y >= 0 && ob.x + ob.w <= 1280 && ob.y + ob.h <= 720, JSON.stringify(ob));
      continue;
    }
    if (ob.x >= 1000) continue; // 末端大厅柱：大厅高 400，不按通道净宽考核
    if (ob.y < 360) assert.ok(300 - (ob.y + ob.r) >= 60, '北通道剩宽不足: ' + JSON.stringify(ob));
    else assert.ok((ob.y - ob.r) - 420 >= 60, '南通道剩宽不足: ' + JSON.stringify(ob));
  }
});

test('地铁图装饰覆盖站台元素', () => {
  const kinds = new Set(ZG.Data.maps.subway.decor.map(d => d.kind));
  for (const k of ['track', 'platformLine', 'tunnel', 'kiosk']) assert.ok(kinds.has(k), k);
});

test('郊区与医院暂无活动区与出生口（Task 4 后 subway 才有 spawns）', () => {
  for (const id of ['suburban', 'hospital']) {
    const m = ZG.Data.maps[id];
    assert.equal(m.zones, undefined, id);
    assert.equal(m.spawns, undefined, id);
  }
});

test('地铁图 zones 是首尾相接的 U 形并集', () => {
  const m = ZG.Data.maps.subway;
  assert.equal(m.zones.length, 3);
  const [n, s, hall] = m.zones;
  assert.equal(n.x + n.w, hall.x);
  assert.equal(s.x + s.w, hall.x);
  assert.equal(hall.y, 160);
  assert.equal(hall.y + hall.h, 560);
});

test('地铁出生口在屏幕外且落在通道带内', () => {
  const m = ZG.Data.maps.subway;
  assert.equal(m.spawns.length, 2);
  for (const sp of m.spawns) {
    assert.equal(sp.edge, 'left');
    assert.ok(sp.x <= -10 && sp.x >= -60);
    assert.ok((sp.y > 160 && sp.y < 300) || (sp.y > 420 && sp.y < 560), JSON.stringify(sp));
  }
});

test('地铁站台开局资金 500，其余地图 400', () => {
  assert.equal(ZG.Data.maps.subway.startMoney, 500);
  assert.equal(ZG.Sim.createGame({ mapId: 'subway', seed: 1 }).money, 500);
  assert.equal(ZG.Sim.createGame({ mapId: 'suburban', seed: 1 }).money, 400);
});
