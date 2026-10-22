const { test } = require('node:test');
const assert = require('node:assert/strict');
const ZG = require('./load-sim.js')();

function fresh(money) {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  if (money !== undefined) s.money = money;
  return s;
}

test('初始化 47 个 rank=0，T1 无前置', () => {
  const s = fresh(1000);
  assert.equal(Object.keys(s.tech.ranks).length, 47);
  assert.deepEqual(ZG.Tech.canBuy(s, 'fire_dmg'), { ok: true });
  assert.equal(ZG.Tech.buy(s, 'fire_dmg').ok, true);
  assert.equal(s.tech.ranks.fire_dmg, 1);
  assert.equal(s.money, 880);
});

test('前置：同分支上一层任一点解锁下一层，不跨分支', () => {
  const s = fresh(99999);
  assert.deepEqual(ZG.Tech.canBuy(s, 'pistol_passive'), { ok: false, reason: 'locked' });
  ZG.Tech.buy(s, 'fire_rate');
  assert.deepEqual(ZG.Tech.canBuy(s, 'pistol_passive'), { ok: true });
  assert.deepEqual(ZG.Tech.canBuy(s, 'bank_power'), { ok: false, reason: 'locked' });
  ZG.Tech.buy(s, 'econ_gold');
  assert.deepEqual(ZG.Tech.canBuy(s, 'bank_power'), { ok: true });
});

test('同层可全部购买；多级节点逐级涨价并封顶', () => {
  const s = fresh(99999);
  assert.equal(ZG.Tech.buy(s, 'fire_dmg').cost, 120);
  assert.equal(ZG.Tech.buy(s, 'fire_rate').cost, 120);
  assert.equal(ZG.Tech.nextCost(s, 'fire_dmg'), 162);
  assert.equal(ZG.Tech.buy(s, 'fire_dmg').cost, 162);
  for (let i = 0; i < 3; i++) ZG.Tech.buy(s, 'fire_dmg');
  assert.equal(ZG.Tech.buy(s, 'fire_dmg').ok, false);
  assert.equal(ZG.Tech.buy(s, 'fire_dmg').reason, 'maxed');
});

test('拒绝原因：not-prep / money / unknown', () => {
  const s = fresh(1000);
  s.status = 'battle';
  assert.deepEqual(ZG.Tech.buy(s, 'fire_dmg'), { ok: false, reason: 'not-prep' });
  s.status = 'prep'; s.money = 10;
  assert.deepEqual(ZG.Tech.buy(s, 'fire_dmg'), { ok: false, reason: 'money' });
  assert.deepEqual(ZG.Tech.buy(s, 'nope'), { ok: false, reason: 'unknown' });
});

test('效果缓存：fire_dmg 2 级 → dmgMul 1.08', () => {
  const s = fresh(99999);
  ZG.Tech.buy(s, 'fire_dmg');
  ZG.Tech.buy(s, 'fire_dmg');
  assert.equal(ZG.Tech.mods(s).dmgMul.toFixed(4), '1.0800');
  assert.equal(ZG.Tech.has(s, 'cap_dmg'), false);
});

test('快照只含非零节点并按 id 排序，购买命令可回放', () => {
  const run = () => {
    const s = fresh(5000);
    ZG.Sim.applyCommand(s, { op: 'buyTechNode', nodeId: 'fire_rate' });
    ZG.Sim.applyCommand(s, { op: 'buyTechNode', nodeId: 'fire_dmg' });
    ZG.State.spawnHuman(s, 'pistol', 600, 600);
    ZG.Sim.applyCommand(s, { op: 'startRound' });
    ZG.Sim.tick(s, 120);
    return ZG.State.hash(s);
  };
  const a = run(), b = run();
  assert.equal(a, b);
  const s = fresh(5000);
  ZG.Tech.buy(s, 'fire_rate');
  assert.deepEqual(ZG.State.snapshot(s).tech, [['fire_rate', 1]]);
});

test('科技购买失败不写命令', () => {
  const s = fresh(10);
  ZG.Sim.applyCommand(s, { op: 'buyTechNode', nodeId: 'fire_dmg' });
  assert.equal(s.commands.length, 0);
});
