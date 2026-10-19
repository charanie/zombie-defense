const { test } = require('node:test');
const assert = require('node:assert/strict');
const ZG = require('./load-sim.js')();

test('逻辑分辨率、步长与关键常量', () => {
  assert.equal(ZG.Const.W, 1280);
  assert.equal(ZG.Const.H, 720);
  assert.equal(ZG.Const.STEP_MS, 1000 / 60);
  assert.equal(ZG.Const.GRID, 32);
  assert.equal(ZG.Const.GRID_COLS, 40);
  assert.equal(ZG.Const.GRID_ROWS, 23);
  assert.equal(ZG.Const.HASH_CELL, 64);
  assert.equal(ZG.Const.MAX_POP, 80);
  assert.equal(ZG.Const.MAX_CIVILIANS, 8);
  assert.equal(ZG.Const.MAX_CAPTAINS, 8);
  assert.equal(ZG.Const.MAX_HEROES, 4);
  assert.equal(ZG.Const.MAX_CONVERTED, 15);
  assert.equal(ZG.Const.INITIAL_MONEY, 400);
  assert.equal(ZG.Const.COLORS.human.pistol, '#4FC3F7');
  assert.equal(ZG.Const.COLORS.zombie.boss, '#37474F');
});

test('mulberry32 同种子同序列，不同流互不干扰', () => {
  const a = ZG.Rng.stream(123, 'spawn');
  const b = ZG.Rng.stream(123, 'spawn');
  for (let i = 0; i < 100; i++) assert.equal(a.next(), b.next());

  const s1 = ZG.Rng.createStreams(42);
  const s2 = ZG.Rng.createStreams(42);
  s1.spawn.next(); s1.spawn.next();
  assert.equal(s2.hero.next(), s1.hero.next());
});

test('随机流工具', () => {
  const s = ZG.Rng.stream(7, 'x');
  for (let i = 0; i < 50; i++) {
    const v = s.int(3, 5);
    assert.ok(v >= 3 && v <= 5);
  }
  const arr = [1, 2, 3, 4];
  s.shuffle(arr);
  assert.deepEqual(arr.slice().sort(), [1, 2, 3, 4]);
});

test('事件总线 on/emit/off 与异常隔离', () => {
  const bus = ZG.EventBus.create();
  let got = null;
  const fn = p => { got = p; };
  bus.on('x:y', fn);
  bus.emit('x:y', { n: 1 });
  assert.deepEqual(got, { n: 1 });
  bus.off('x:y', fn);
  bus.emit('x:y', { n: 2 });
  assert.deepEqual(got, { n: 1 });

  let after = false;
  bus.on('boom', () => { throw new Error('bad'); });
  bus.on('boom', () => { after = true; });
  const oldErr = console.error;
  console.error = () => {};
  bus.emit('boom', {});
  console.error = oldErr;
  assert.equal(after, true);
});

test('几何：角度、锥形、矩形/圆/世界边界', () => {
  assert.ok(ZG.Geom.inCone(0, 0, 0, 100, 0, 200, 30));
  assert.ok(!ZG.Geom.inCone(0, 0, 0, 0, 100, 200, 30));
  assert.ok(Math.abs(Math.abs(ZG.Geom.angleDiff(Math.PI * 1.9, 0)) - 0.1 * Math.PI) < 1e-9);
  assert.ok(ZG.Geom.pointInRect(10, 10, { x: 0, y: 0, w: 20, h: 20 }));
  assert.ok(!ZG.Geom.pointInRect(21, 10, { x: 0, y: 0, w: 20, h: 20 }));
  assert.ok(ZG.Geom.pointInCircle(0, 0, { x: 0, y: 0, r: 5 }));
  assert.equal(ZG.Geom.circleOverlapsRect(0, 0, 8, 7, 0, 20, 10), true);
  assert.equal(ZG.Geom.rectOverlapsRect(0, 0, 10, 10, 20, 0, 10, 10), false);
  const c = ZG.Geom.clampToWorld(1300, 900, 8);
  assert.equal(c.x, ZG.Const.W - 12);
  assert.equal(c.y, ZG.Const.H - 12);
});
