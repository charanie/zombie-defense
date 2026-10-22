const { test } = require('node:test');
const assert = require('node:assert/strict');
const ZG = require('./load-sim.js')();

test('桌面竖向布局：y 随层级递增，节点不重叠', () => {
  const branch = { id: 'fire', tiers: [['a'], ['b', 'c', 'd', 'e'], ['f']] };
  const L = ZG.TechLayout.compute(branch, { direction: 'vertical' });
  assert.ok(L.nodes.b.y > L.nodes.a.y);
  assert.ok(L.nodes.f.y > L.nodes.b.y);
  const boxes = Object.values(L.nodes);
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const p = boxes[i], q = boxes[j];
      const overlap = p.x < q.x + q.w && q.x < p.x + p.w &&
                      p.y < q.y + q.h && q.y < p.y + p.h;
      assert.equal(overlap, false);
    }
  }
});

test('手机横向布局：x 随层级递增', () => {
  const branch = { id: 'fire', tiers: [['a'], ['b', 'c'], ['d']] };
  const L = ZG.TechLayout.compute(branch, { direction: 'horizontal' });
  assert.ok(L.nodes.b.x > L.nodes.a.x);
  assert.ok(L.nodes.d.x > L.nodes.b.x);
});

test('连线端点对齐节点边缘且输出确定', () => {
  const branch = { id: 'life', tiers: [['a'], ['b']] };
  const A = ZG.TechLayout.compute(branch, { direction: 'vertical' });
  const B = ZG.TechLayout.compute(branch, { direction: 'vertical' });
  assert.deepEqual(A, B);
  assert.equal(A.links.length, 1);
  assert.ok(A.links[0].d.startsWith('M '));
  assert.ok(A.links[0].d.includes('V '));
});

test('节点详情：锁定/可买/已购/满级', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  s.money = 99999;
  assert.equal(ZG.Tech.nodeView(s, 'pistol_passive').locked, true);
  assert.equal(ZG.Tech.nodeView(s, 'fire_dmg').canBuy, true);
  ZG.Tech.buy(s, 'fire_dmg');
  assert.equal(ZG.Tech.nodeView(s, 'fire_dmg').owned, true);
  for (let i = 0; i < 4; i++) ZG.Tech.buy(s, 'fire_dmg');
  assert.equal(ZG.Tech.nodeView(s, 'fire_dmg').maxed, true);
  assert.equal(ZG.Tech.nodeView(s, 'fire_dmg').cost, null);
});
