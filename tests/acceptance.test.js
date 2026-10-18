const { test } = require('node:test');
const assert = require('node:assert/strict');
const ZG = require('./load-sim.js')();
const policy = require('./policy.js');
const { runBot } = require('./bot.js');

function playRounds(mapId, seed, rounds, testMoney) {
  const s = ZG.Sim.createGame({ mapId, seed });
  for (let i = 0; i < rounds; i++) {
    if (s.status === 'over') break;
    if (s.status !== 'prep') break;
    ZG.Heroes.returnWounded(s);
    if (testMoney) s.money = 99999;
    policy.prep(s);
    if (!ZG.Sim.startRound(s).ok) break;
    let guard = 0;
    while (s.status === 'battle' && guard++ < 300) ZG.Sim.tick(s, 60);
  }
  return s;
}

test('10 回合冒烟：不抛异常且有击杀', () => {
  const s = playRounds('suburban', 77, 10, false);
  assert.ok(s.round >= 2);
  assert.ok(s.stats.totalKills > 20);
});

test('种子 + 整备期命令可完整回放', () => {
  const cmds = [
    { op: 'recruit', classId: 'pistol', x: 600, y: 600 },
    { op: 'recruit', classId: 'shield', x: 620, y: 560 },
    { op: 'startRound' }
  ];
  const run = () => {
    const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 5 });
    for (const c of cmds) ZG.Sim.applyCommand(s, c);
    ZG.Sim.tick(s, 600);
    return ZG.State.hash(s);
  };
  assert.equal(run(), run());
});

test('20 回合 bot 跑通，机制可触发', () => {
  const r = runBot({ mapId: 'suburban', seed: 1, maxRounds: 20 });
  assert.ok(r.rounds >= 20 || r.over === true);
  assert.ok(r.kills > 100);
  assert.ok(r.captains > 0);
  assert.ok(r.heroes > 0);
  for (const m of r.metrics) assert.ok(m.round >= 1 && m.durationSec >= 0);
});

test('同种子 bot 结果一致', () => {
  const a = runBot({ mapId: 'suburban', seed: 8, maxRounds: 5 });
  const b = runBot({ mapId: 'suburban', seed: 8, maxRounds: 5 });
  assert.deepEqual(a.metrics, b.metrics);
});

test('三张地图均可运行到第 3 回合', () => {
  for (const id of ['suburban', 'hospital', 'subway']) {
    const s = playRounds(id, 3, 3, true);
    assert.ok(s.round >= 3, id + ' round=' + s.round + ' status=' + s.status);
  }
});
