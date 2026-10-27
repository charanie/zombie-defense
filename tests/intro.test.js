/* 开场演出：时间轴、变体、跳过判定、裂纹几何、文案、音效名 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const ZG = require('./load-sim.js')();

test('full 时间轴单调且总长 4200ms', () => {
  const t = ZG.Intro.timeline('full', false);
  assert.equal(t.total, 4200);
  for (let i = 1; i < t.phases.length; i++) {
    assert.ok(t.phases[i].start >= t.phases[i - 1].end - 0.01, t.phases[i].id);
  }
  assert.equal(t.phases[0].id, 'windup');
  assert.equal(t.phases[t.phases.length - 1].id, 'settle');
  assert.equal(t.buildAt, 1900);
  assert.equal(t.skipAfter, 350);
});

test('skip ≤ 600ms，reduced ≤ 1500ms，quick ≤ 1100ms，off ≤ 300ms', () => {
  assert.ok(ZG.Intro.timeline('skip', false).total <= 600);
  assert.ok(ZG.Intro.timeline('full', true).total <= 1500);
  assert.ok(ZG.Intro.timeline('quick', false).total <= 1100);
  assert.ok(ZG.Intro.timeline('off', false).total <= 300);
});

test('变体优先级：reduced > intro=false > requested', () => {
  assert.equal(ZG.Intro.variantFor('full', { intro: false }, true), 'reduced');
  assert.equal(ZG.Intro.variantFor('full', { intro: false }, false), 'off');
  assert.equal(ZG.Intro.variantFor('quick', { intro: true }, false), 'quick');
  assert.equal(ZG.Intro.variantFor('full', { intro: true }, false), 'full');
});

test('跳过判定：0.35s 前忽略，曝光/收尾直接完成', () => {
  assert.equal(ZG.Intro.skipDecision(200, 'impact', 'full'), 'ignore');
  assert.equal(ZG.Intro.skipDecision(500, 'spread', 'full'), 'shorten');
  assert.equal(ZG.Intro.skipDecision(3400, 'reveal', 'full'), 'finish');
  assert.equal(ZG.Intro.skipDecision(500, 'spread', 'quick'), 'finish');
});

test('裂纹点可复现且都在画布内', () => {
  for (const [w, h] of [[1440, 900], [390, 844], [844, 390]]) {
    const a = ZG.Intro.crackPaths(20261027, w, h);
    const b = ZG.Intro.crackPaths(20261027, w, h);
    assert.deepEqual(a, b);
    assert.ok(a.length >= 6, 'w=' + w);
    assert.ok(a.some(p => p.pts[1].x < p.pts[0].x && p.pts[1].y < p.pts[0].y), '至少一条向左上');
    assert.ok(a.some(p => p.pts[p.pts.length - 1].y > p.pts[0].y), '至少一条向下');
    for (const path of a) {
      for (const p of path.pts) {
        assert.ok(p.x >= 0 && p.x <= w && p.y >= 0 && p.y <= h, 'x=' + p.x + ' y=' + p.y);
      }
      for (const br of path.branches) {
        for (const p of br.pts) {
          assert.ok(p.x >= 0 && p.x <= w && p.y >= 0 && p.y <= h, 'branch x=' + p.x + ' y=' + p.y);
        }
      }
    }
  }
});

test('开场文案与音效名', () => {
  const c = ZG.Intro.copyFor('subway');
  assert.equal(c.sector, '第 03 号战区 / SECTOR 03');
  assert.equal(c.name, '地铁站台');
  assert.equal(c.en, 'SUBWAY PLATFORM');
  assert.equal(c.stars, 3);
  assert.ok(c.threatText.includes('★★★'));
  for (const n of ['glass', 'bite', 'impact', 'stinger', 'heartbeat', 'reveal', 'whoosh']) {
    assert.ok(ZG.Audio.names.includes(n), n);
  }
});
