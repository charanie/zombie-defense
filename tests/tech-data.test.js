const { test } = require('node:test');
const assert = require('node:assert/strict');
const ZG = require('./load-sim.js')();

test('47 节点、四分支计数与层级连续', () => {
  const t = ZG.Data.tech;
  assert.equal(t.nodeOrder.length, 47);
  assert.deepEqual(t.branchOrder, ['fire', 'econ', 'life', 'hero']);
  const count = { fire: 0, econ: 0, life: 0, hero: 0 };
  const tiers = { fire: new Set(), econ: new Set(), life: new Set(), hero: new Set() };
  for (const id of t.nodeOrder) {
    const n = t.nodes[id];
    assert.equal(n.id, id);
    assert.ok(count[n.branch] !== undefined, id);
    assert.ok(n.tier >= 1 && n.tier <= 6, id);
    assert.ok(n.maxRank >= 1, id);
    assert.ok(Array.isArray(n.effects) && n.effects.length > 0, id);
    assert.equal(typeof n.summary, 'string');
    count[n.branch]++;
    tiers[n.branch].add(n.tier);
  }
  assert.deepEqual(count, { fire: 20, econ: 8, life: 8, hero: 11 });
  for (const b of t.branchOrder) {
    assert.deepEqual([...tiers[b]].sort(), [1, 2, 3, 4, 5, 6], b);
  }
});

test('层级价与 1.35 递增（四舍五入）', () => {
  assert.deepEqual(
    [0, 1, 2, 3, 4].map(r => ZG.Balance.treeNodeCost(1, r)),
    [120, 162, 219, 295, 399]
  );
  assert.equal(ZG.Balance.treeNodeCost(6, 0), 800);
  assert.equal(ZG.Balance.treeNodeCost(6, 2), Math.round(800 * 1.35 * 1.35));
});

test('存款加伤、援助伤害与尸爆伤害公式', () => {
  assert.equal(ZG.Balance.bankDamageMul(499, 0.6, 0.02), 0);
  assert.equal(ZG.Balance.bankDamageMul(2500, 0.6, 0.02).toFixed(2), '0.10');
  assert.equal(ZG.Balance.bankDamageMul(999999, 0.6, 0.02), 0.6);
  assert.equal(ZG.Balance.supportDamage(1), 312);
  assert.equal(ZG.Balance.supportDamage(10), 420);
  assert.equal(ZG.Balance.deathBoomDamage(5), 120);
});

test('援助参数集中在数据层', () => {
  const s = ZG.Data.tech.support;
  assert.equal(s.areaHeal.baseCost, 60);
  assert.equal(s.areaHeal.radius, 150);
  assert.equal(s.missileBombardment.shells, 2);
  assert.deepEqual(s.missileBombardment.offsets.map(o => [o.x, o.y]), [[-24, -12], [24, 12]]);
});
