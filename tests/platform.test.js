const { test } = require('node:test');
const assert = require('node:assert/strict');
const ZG = require('./load-sim.js')();

test('存档读写失败不影响游戏', () => {
  const P = ZG.Platform.create({
    storage: {
      getItem() { throw new Error('denied'); },
      setItem() { throw new Error('denied'); }
    }
  });
  assert.equal(P.load(), null);
  assert.equal(P.save({ a: 1 }), false);
});

test('存档带版本号与最佳回合', () => {
  const mem = {};
  const storage = {
    getItem: k => (Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null),
    setItem: (k, v) => { mem[k] = String(v); },
    removeItem: k => { delete mem[k]; }
  };
  const P = ZG.Platform.create({ storage });
  P.save({ version: 1, best: { suburban: 12 } });
  assert.equal(P.loadBest('suburban'), 12);
  assert.equal(P.load().version, 1);
  assert.equal(P.saveBest('suburban', 20), true);
  assert.equal(P.loadBest('suburban'), 20);
  assert.equal(P.saveBest('suburban', 10), false);
});

test('画质档位与上限', () => {
  assert.deepEqual(ZG.Platform.qualityFor('mobile'),
    { dprCap: 1.5, particleCap: 120, zombieCap: 200, shake: false, damageNumbers: false });
  assert.deepEqual(ZG.Platform.qualityFor('desktop'),
    { dprCap: 2, particleCap: 250, zombieCap: 300, shake: true, damageNumbers: true });
});

test('导出/导入存档', () => {
  const mem = {};
  const storage = {
    getItem: k => (Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null),
    setItem: (k, v) => { mem[k] = String(v); },
    removeItem: k => { delete mem[k]; }
  };
  const P = ZG.Platform.create({ storage });
  P.save({ version: 1, settings: { muted: true } });
  P.saveBest('subway', 9);
  const text = P.exportSave();
  const P2 = ZG.Platform.create({ storage: {
    getItem: () => null, setItem: () => {}, removeItem: () => {}
  } });
  const r = P2.importSave(text);
  assert.equal(r.ok, true);
});
