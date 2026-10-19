const { test } = require('node:test');
const assert = require('node:assert/strict');
const ZG = require('./load-sim.js')();

test('圆与矩形重叠（矩形为左上角坐标）', () => {
  assert.equal(ZG.Geom.circleOverlapsRect(0, 0, 8, 7, 0, 20, 10), true);
  assert.equal(ZG.Geom.circleOverlapsRect(0, 0, 8, 10, 0, 20, 10), false);
});

test('矩形与矩形重叠（左上角坐标，严格不等）', () => {
  assert.equal(ZG.Geom.rectOverlapsRect(0, 0, 10, 10, 5, 5, 10, 10), true);
  assert.equal(ZG.Geom.rectOverlapsRect(0, 0, 10, 10, 11, 0, 10, 10), false);
  assert.equal(ZG.Geom.rectOverlapsRect(0, 0, 10, 10, 10, 0, 10, 10), false);
});

test('点到矩形距离', () => {
  assert.equal(ZG.Geom.distPointToRect(5, 5, 0, 0, 10, 10), 0);
  assert.equal(ZG.Geom.distPointToRect(13, 5, 0, 0, 10, 10), 3);
});

test('线段与圆首次相交参数', () => {
  assert.ok(Math.abs(ZG.Geom.segmentCircleT(0, 0, 10, 0, 5, 0, 2) - 0.3) < 1e-9);
  assert.equal(ZG.Geom.segmentCircleT(0, 0, 10, 0, 5, 5, 2), null);
  assert.equal(ZG.Geom.segmentCircleT(0, 0, 2, 0, 5, 0, 2), null);
});

test('世界边界钳制与人类质心', () => {
  const p = ZG.Geom.clampToWorld(-10, 800, 9);
  assert.equal(p.x, 13); assert.equal(p.y, 707);
  const s = ZG.State.create({ mapId: 'suburban', seed: 1 });
  ZG.State.spawnHuman(s, 'pistol', 100, 100);
  ZG.State.spawnHuman(s, 'pistol', 300, 100);
  const c = ZG.Geom.humanCentroid(s);
  assert.equal(c.x, 200); assert.equal(c.y, 100);
});

test('建筑中心/左上角换算与共享碰撞', () => {
  const r = ZG.Geom.rectOfCenter(100, 100, 64, 24);
  assert.deepEqual(r, { x: 68, y: 88, w: 64, h: 24 });
  const s = ZG.State.create({ mapId: 'suburban', seed: 1 });
  s.map = ZG.Data.maps.suburban;
  s.buildings = [{ id: 1, alive: true, typeId: 'barricade', shape: 'rect',
    x: 600, y: 300, w: 64, h: 24, radius: 32 }];
  assert.equal(ZG.Geom.isBlockedAt(s, 600, 300, 8), true);
  assert.equal(ZG.Geom.isBlockedAt(s, 700, 300, 8), false);
});
