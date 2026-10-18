const { test } = require('node:test');
const assert = require('node:assert/strict');
const ZG = require('./load-sim.js')();

test('郊区公路网格与流场', () => {
  const map = ZG.Data.maps.suburban;
  const s = ZG.State.create({ mapId: 'suburban', seed: 1 });
  s.map = map;
  s.slots = map.slots.map(sl => ({ ...sl, buildingId: null, rubble: false }));
  s.pathing = ZG.Pathing.build(s);
  assert.equal(s.pathing.cols, 40);
  assert.equal(s.pathing.rows, 23);
  for (const sp of map.spawns) {
    const d = ZG.Pathing.directionAt(s.pathing, sp.x, sp.y);
    assert.ok(d.y > 0, '出生点流场应指向下方部署区');
  }
});

test('三张地图满建仍可达且绕行 ≤1.35 倍', () => {
  for (const id of ['suburban', 'hospital', 'subway']) {
    const r = ZG.Pathing.validate(ZG.Data.maps[id]);
    assert.equal(r.ok, true, id + ': ' + JSON.stringify(r));
    assert.ok(r.maxDetour <= 1.35, id + ': ' + r.maxDetour);
  }
});

test('不可达点返回最近可达格', () => {
  const s = ZG.State.create({ mapId: 'suburban', seed: 1 });
  s.map = ZG.Data.maps.suburban;
  s.slots = s.map.slots.map(sl => ({ ...sl, buildingId: null, rubble: false }));
  const p = ZG.Pathing.nearestReachable(ZG.Pathing.build(s), 420, 300);
  assert.ok(p.x >= 0 && p.y >= 0);
  assert.ok(!isNaN(p.x));
});

test('地图字段与出生点不在部署区', () => {
  assert.equal(ZG.Data.maps.suburban.slots.length, 6);
  assert.equal(ZG.Data.maps.hospital.slots.length, 7);
  assert.equal(ZG.Data.maps.subway.slots.length, 8);
  assert.equal(ZG.Data.maps.hospital.deploy.kind, 'circle');
  assert.equal(ZG.Data.maps.subway.deploy.kind, 'rect');
  for (const id of ['suburban', 'hospital', 'subway']) {
    const s = ZG.Sim.createGame({ mapId: id, seed: 1 });
    assert.equal(s.status, 'prep');
    for (const sp of s.map.spawns) {
      assert.equal(ZG.Geom.pointInDeploy(sp.x, sp.y, s.map.deploy), false);
    }
  }
});
