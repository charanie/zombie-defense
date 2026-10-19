const { test } = require('node:test');
const assert = require('node:assert/strict');
const ZG = require('./load-sim.js')();

function setup() {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  const h = ZG.State.spawnHuman(s, 'pistol', 600, 600);
  const handlers = {};
  const winHandlers = {};
  const canvas = {
    style: {},
    addEventListener(type, fn) { handlers[type] = fn; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 1280, height: 720 }; }
  };
  globalThis.window = {
    addEventListener(type, fn) { winHandlers[type] = fn; }
  };
  ZG.Input.init(canvas, () => s, {});
  return { s, h, handlers, winHandlers };
}

test('拖拽中右键取消会回到拖拽起点', () => {
  const { s, h, handlers } = setup();
  handlers.pointerdown({ button: 0, clientX: 600, clientY: 600, pointerType: 'mouse' });
  assert.ok(s.ui.drag);
  handlers.pointermove({ clientX: 700, clientY: 700, buttons: 1, pointerType: 'mouse' });
  assert.equal(Math.round(h.x), 700);
  handlers.contextmenu({ preventDefault() {} });
  assert.equal(h.x, 600);
  assert.equal(h.y, 600);
  assert.equal(s.ui.drag, null);
});

test('在画布外松开鼠标会结束拖拽', () => {
  const { s, h, handlers, winHandlers } = setup();
  handlers.pointerdown({ button: 0, clientX: 600, clientY: 600, pointerType: 'mouse' });
  handlers.pointermove({ clientX: 700, clientY: 700, buttons: 1, pointerType: 'mouse' });
  assert.ok(winHandlers.pointerup, '应在 window 上监听 pointerup');
  winHandlers.pointerup({});
  assert.equal(s.ui.drag, null);
  const x = h.x, y = h.y;
  handlers.pointermove({ clientX: 900, clientY: 900, buttons: 0, pointerType: 'mouse' });
  assert.equal(h.x, x);
  assert.equal(h.y, y);
});

test('鼠标已松开时 pointermove 不再拖动单位', () => {
  const { h, handlers } = setup();
  handlers.pointerdown({ button: 0, clientX: 600, clientY: 600, pointerType: 'mouse' });
  handlers.pointermove({ clientX: 800, clientY: 800, buttons: 0, pointerType: 'mouse' });
  assert.equal(h.x, 600);
  assert.equal(h.y, 600);
});

test('战斗中不能拖动单位', () => {
  const { s, h, handlers } = setup();
  handlers.pointerdown({ button: 0, clientX: 600, clientY: 600, pointerType: 'mouse' });
  s.status = 'battle';
  handlers.pointermove({ clientX: 800, clientY: 800, buttons: 1, pointerType: 'mouse' });
  assert.equal(h.x, 600);
  assert.equal(h.y, 600);
});
