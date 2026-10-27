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
