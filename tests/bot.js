/* 无头 bot：跑 20/40 回合并输出指标 */
'use strict';
const ZG = require('./load-sim.js')();
const policy = require('./policy.js');

function runBot(opts) {
  const o = opts || {};
  const maxRounds = o.maxRounds || 20;
  const s = ZG.Sim.createGame({ mapId: o.mapId || 'suburban', seed: o.seed || 1 });
  const bossSeen = {};
  s.bus.on(ZG.Events.BOSS_SPAWNED, p => {
    const t = p.zombie.typeId;
    bossSeen[t] = (bossSeen[t] || 0) + 1;
  });
  const metrics = [];
  let over = false;

  for (let guard = 0; guard < maxRounds + 2; guard++) {
    if (s.status === 'over') { over = true; break; }
    if (s.status !== 'prep') break;

    ZG.Heroes.returnWounded(s);
    if (o.testMoney) s.money = 99999;
    policy.prep(s, o);

    const round = s.round;
    if (!ZG.Sim.startRound(s).ok) { over = true; break; }
    const t0 = s.battle.time;

    let iter = 0;
    while (s.status === 'battle' && iter++ < 300) {
      ZG.Sim.tick(s, 60);
    }
    if (s.status === 'battle') {
      // 强制进入下一回合，避免卡死
      s.battle.time = ZG.Const.ROUND_HARD_CAP;
      ZG.Sim.tick(s, 1);
    }
    metrics.push({
      round,
      durationSec: +(s.battle.time - t0).toFixed(1),
      kills: s.battle.killCount,
      money: s.money,
      humans: s.humans.filter(h => h.alive).length,
      pop: ZG.Economy.populationUsed(s),
      zombies: s.zombies.length,
      buildings: s.buildings.filter(b => b.alive).length,
      status: s.status
    });
    if (s.status === 'over') { over = true; break; }
  }

  return {
    mapId: o.mapId || 'suburban',
    seed: o.seed || 1,
    rounds: metrics.length ? metrics[metrics.length - 1].round : 0,
    over,
    bossKills: s.stats.bossKills || 0,
    bossSeen,
    captains: s.stats.captains || 0,
    heroes: s.stats.heroes || 0,
    kills: s.stats.totalKills || 0,
    metrics,
    state: s
  };
}

function format(r) {
  const lines = [];
  lines.push(`bot map=${r.mapId} seed=${r.seed} rounds=${r.rounds} over=${r.over} ` +
    `bossKills=${r.bossKills} captains=${r.captains} heroes=${r.heroes} kills=${r.kills}`);
  lines.push('bossSeen ' + JSON.stringify(r.bossSeen));
  lines.push('round duration kills money humans pop buildings status');
  for (const m of r.metrics) {
    lines.push([m.round, m.durationSec, m.kills, m.money, m.humans, m.pop,
      m.buildings, m.status].join('  '));
  }
  return lines.join('\n');
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const get = (name, def) => {
    const i = args.indexOf('--' + name);
    return i >= 0 ? args[i + 1] : def;
  };
  const res = runBot({
    mapId: get('map', 'suburban'),
    seed: parseInt(get('seed', '1'), 10),
    maxRounds: parseInt(get('rounds', '20'), 10),
    testMoney: args.includes('--test-money'),
    rocketOnly: args.includes('--rocket-only')
  });
  console.log(format(res));
}

module.exports = { runBot, format };
