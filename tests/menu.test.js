/* 菜单数据、记录存储与状态字段 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const ZG = require('./load-sim.js')();

function memStorage() {
  const m = {};
  return {
    getItem: k => (Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
    removeItem: k => { delete m[k]; }
  };
}

test('模式顺序与可用性', () => {
  assert.deepEqual(ZG.Data.menu.modes.map(m => m.id), ['endless', 'story']);
  assert.equal(ZG.Data.menu.modes[0].available, true);
  assert.equal(ZG.Data.menu.modes[1].available, false);
});

test('三张地图都有简报，且构成合计 100', () => {
  for (const id of ZG.Data.mapOrder) {
    const b = ZG.Data.menu.mapBriefs[id];
    assert.ok(b, id);
    assert.equal(b.mix.length, 3);
    assert.equal(b.mix.reduce((a, v) => a + v, 0), 100, id);
    assert.ok(b.loadout && b.note && b.tip && b.codename, id);
  }
});

test('剧情占位三章都锁定', () => {
  const s = ZG.Data.menu.story;
  assert.equal(s.chapters.length, 3);
  assert.ok(s.chapters.every(c => c.locked));
});

test('last 记录只增不减', () => {
  const P = ZG.Platform.create({ storage: memStorage() });
  P.saveLast('suburban', 8);
  P.saveLast('suburban', 5);
  assert.equal(P.loadLast('suburban'), 8);
  assert.equal(P.loadAllLast().suburban, 8);
  assert.equal(P.loadLast('nope'), 0);
});

test('state 默认值不影响快照', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 42 });
  assert.equal(s.ui.showMenu, false);
  assert.equal(s.ui.inputLocked, false);
  assert.equal(s.settings.intro, true);
  const before = ZG.State.hash(s);
  s.ui.showMenu = true; s.ui.inputLocked = true; s.settings.intro = false;
  assert.equal(ZG.State.hash(s), before);
});
