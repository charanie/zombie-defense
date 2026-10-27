/* 菜单数据、记录存储与状态字段 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const ZG = require('./load-sim.js')();
const { stubCtx } = require('./stub-ctx.js');

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

test('三张地图缩略图都能画', () => {
  for (const id of ZG.Data.mapOrder) {
    const ctx = stubCtx();
    ZG.MenuScene.drawThumb(ctx, ZG.Data.maps[id], 384, 216);
    assert.ok(ctx.calls.fillRect + ctx.calls.arc + ctx.calls.stroke > 8, id);
  }
});

test('背景场景与监视画面不抛错', () => {
  const ctx = stubCtx();
  ZG.MenuScene.draw(ctx, 1440, 900, 0, { reduced: false });
  ZG.MenuScene.draw(ctx, 1440, 900, 1000, { reduced: true });
  ZG.MenuScene.drawFeed(ctx, ZG.Data.maps.subway, 376, 212, 0);
  assert.ok(ctx.calls.fillRect > 10);
});

test('缩略图优先 MapLayer，缺失时回退', () => {
  const savedLayer = ZG.MapLayer;
  const savedZone = ZG.MapZone;
  ZG.MapLayer = { drawMinimap: (ctx, map, w, h) => { ctx.fillRect(0, 0, w, h); } };
  ZG.MapZone = { has: () => false };
  const a = stubCtx();
  ZG.MenuScene.drawThumb(a, ZG.Data.maps.suburban, 384, 216);
  assert.ok(a.calls.fillRect > 1);
  delete ZG.MapLayer; delete ZG.MapZone;
  const b = stubCtx();
  ZG.MenuScene.drawThumb(b, ZG.Data.maps.hospital, 384, 216);
  assert.ok(b.calls.fillRect > 4);
  if (savedLayer) ZG.MapLayer = savedLayer;
  if (savedZone) ZG.MapZone = savedZone;
});

test('导航项顺序与锁定态', () => {
  const nav = ZG.Menu.navItems();
  assert.deepEqual(nav.map(n => n.id), ['endless', 'story', 'codex', 'settings']);
  assert.deepEqual(nav.map(n => n.index), ['01', '02', '03', '04']);
  assert.equal(nav[1].locked, true);
  assert.equal(nav[2].action, 'help');
  assert.equal(nav[3].action, 'settings');
});

test('布局断点：宽屏显示监视，窄屏横滑', () => {
  assert.deepEqual(ZG.Menu.menuLayout(1440, 900, false),
    { mode: 'wide', showFeed: true, cardFlow: 'grid' });
  assert.deepEqual(ZG.Menu.menuLayout(1366, 768, false),
    { mode: 'compact', showFeed: true, cardFlow: 'grid' });
  assert.equal(ZG.Menu.menuLayout(1024, 768, false).mode, 'mid');
  assert.equal(ZG.Menu.menuLayout(1024, 768, false).showFeed, false);
  assert.equal(ZG.Menu.menuLayout(1024, 768, false).cardFlow, 'snap');
  assert.equal(ZG.Menu.menuLayout(390, 844, true).cardFlow, 'snap');
  assert.equal(ZG.Menu.menuLayout(844, 390, true).mode, 'short');
  assert.equal(ZG.Menu.menuLayout(700, 800, false).mode, 'narrow');
});

test('选卡防抖与过场互斥', () => {
  assert.equal(ZG.Menu.acceptsSelect(1000, 0, false), true);
  assert.equal(ZG.Menu.acceptsSelect(1200, 1000, false), false);
  assert.equal(ZG.Menu.acceptsSelect(1500, 1000, false), true);
  assert.equal(ZG.Menu.acceptsSelect(1500, 1000, true), false);
});

test('地图卡：AO 编号、最佳/上次为空显示破折号', () => {
  const a = ZG.Menu.mapCardModel('suburban', 23, 12);
  assert.equal(a.code, 'AO-01');
  assert.equal(a.name, '郊区公路');
  assert.equal(a.codename, 'SUBURBAN HIGHWAY');
  assert.equal(a.bestText, '最佳 23 回合');
  assert.equal(a.lastText, '上次抵达 12 回合');
  assert.equal(a.stars, 1);
  assert.ok(a.ariaLabel.includes('最佳 23 回合'));

  const b = ZG.Menu.mapCardModel('hospital', 0, 0);
  assert.equal(b.code, 'AO-02');
  assert.equal(b.bestText, '最佳 —');
  assert.equal(b.lastText, '上次抵达 —');
});

test('卡片顺序来自 mapOrder', () => {
  const ids = ZG.Data.mapOrder.map(id => ZG.Menu.mapCardModel(id, 0, 0).code);
  assert.deepEqual(ids, ['AO-01', 'AO-02', 'AO-03']);
});

test('剧情弹窗内容完整且不承诺后端能力', () => {
  const s = ZG.Data.menu.story;
  const text = [s.title, s.chapterTitle, s.blurb, ...s.chapters.map(c => c.name)].join(' ');
  assert.ok(text.includes('撤离命令'));
  assert.ok(!/预约|购买|登录|通知/.test(text));
  assert.deepEqual(s.chapters.map(c => c.mapId), ['suburban', 'hospital', 'subway']);
});
