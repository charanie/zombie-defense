const { test } = require('node:test');
const assert = require('node:assert/strict');
const ZG = require('./load-sim.js')();

test('郊区公路网格与流场', () => {
  const map = ZG.Data.maps.suburban;
  const s = ZG.State.create({ mapId: 'suburban', seed: 1 });
  s.map = map;
  s.pathing = ZG.Pathing.build(s);
  assert.equal(s.pathing.cols, 40);
  assert.equal(s.pathing.rows, 23);
  for (const sp of map.spawns) {
    const d = ZG.Pathing.directionAt(s.pathing, sp.x, sp.y);
    assert.ok(d.y > 0, '出生点流场应指向下方部署区');
  }
});

test('三张地图边缘可达中心', () => {
  for (const id of ['suburban', 'hospital', 'subway']) {
    const r = ZG.Pathing.validate(ZG.Data.maps[id]);
    assert.equal(r.ok, true, id + ': ' + JSON.stringify(r));
  }
});

test('不可达点返回最近可达格', () => {
  const s = ZG.State.create({ mapId: 'suburban', seed: 1 });
  s.map = ZG.Data.maps.suburban;
  const p = ZG.Pathing.nearestReachable(ZG.Pathing.build(s), 420, 300);
  assert.ok(p.x >= 0 && p.y >= 0);
  assert.ok(!isNaN(p.x));
});

test('矩形墙阻挡流场', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  s.money = 9999;
  const r = ZG.Economy.build(s, 'barricade', 600, 400, { vertical: false });
  assert.equal(r.ok, true);
  const i = Math.floor(400 / 32) * 40 + Math.floor(600 / 32);
  assert.equal(s.pathing.blocked[i], 1);
});

test('地图字段与出生点不在部署区', () => {
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
