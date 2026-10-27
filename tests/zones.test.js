/* ZG.MapZone：活动区判定、最近合法点、区域遮罩 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const ZG = require('./load-sim.js')();
const subway = () => ZG.Data.maps.subway;

test('地铁活动区只在两条通道与末端大厅', () => {
  const m = subway();
  assert.equal(ZG.MapZone.contains(m, 200, 230), true);
  assert.equal(ZG.MapZone.contains(m, 200, 490), true);
  assert.equal(ZG.MapZone.contains(m, 1150, 360), true);
  assert.equal(ZG.MapZone.contains(m, 200, 360), false);  // 中央设备带
  assert.equal(ZG.MapZone.contains(m, 200, 80), false);   // 上轨道
  assert.equal(ZG.MapZone.contains(m, 200, 640), false);  // 下轨道
  assert.equal(ZG.MapZone.contains(m, 1260, 360), false); // 大厅右侧墙
});

test('没有 zones 的地图回退到世界矩形', () => {
  const m = ZG.Data.maps.hospital;
  assert.equal(ZG.MapZone.has(m), false);
  assert.equal(ZG.MapZone.contains(m, 0, 0), true);
  assert.equal(ZG.MapZone.contains(m, -1, 300), false);
});

test('圆跨两个相邻矩形时不被误判', () => {
  const m = subway();
  // (1000,230) 正好跨 north 与 hall；圆整体仍在活动区内
  assert.equal(ZG.MapZone.containsCircle(m, 1000, 230, 12), true);
  // 圆心在区域内但圆伸进中央设备带
  assert.equal(ZG.MapZone.containsCircle(m, 1000, 360, 12), false);
});

test('clamp 把区域外的点推到最近合法点', () => {
  const m = subway();
  const p = ZG.MapZone.clamp(m, 500, 360, 8);   // 中央设备带
  assert.ok(Math.abs(p.y - 300) <= 8.01 || Math.abs(p.y - 420) <= 8.01, JSON.stringify(p));
  const q = ZG.MapZone.clamp(m, 500, 100, 8);   // 上轨道
  assert.ok(q.y >= 160 && q.y <= 300, JSON.stringify(q));
});

test('mask 与 contains 一致', () => {
  const m = subway();
  const s = { map: m };
  const mask = ZG.MapZone.mask(s);
  assert.equal(mask.length, ZG.Const.GRID_COLS * ZG.Const.GRID_ROWS);
  const i = 11 * ZG.Const.GRID_COLS + 15; // (496, 368) 中央设备带
  assert.equal(mask[i], 0);
  const j = 7 * ZG.Const.GRID_COLS + 15;  // (496, 240) 北通道
  assert.equal(mask[j], 1);
});
