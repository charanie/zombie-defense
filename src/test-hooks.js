/* 浏览器测试钩子：window.__game */
(function () {
  'use strict';
  if (typeof window === 'undefined') return;
  const ZG = globalThis.ZG;
  if (!ZG) return;

  function game() {
    return (ZG.Game && ZG.Game.state) || null;
  }

  function findEntity(id) {
    const s = game();
    if (!s) return null;
    return s.humans.find(e => e.id === id) ||
      s.zombies.find(e => e.id === id) ||
      s.buildings.find(e => e.id === id) || null;
  }

  window.__game = {
    get state() { const s = game(); return s ? s.status : null; },
    get game() { return game(); },
    get round() { const s = game(); return s ? s.round : 0; },
    get money() { const s = game(); return s ? s.money : 0; },
    get population() { const s = game(); return s ? ZG.Economy.populationUsed(s) : 0; },
    get seed() { const s = game(); return s ? s.seed : 0; },
    get units() { const s = game(); return s ? s.humans : []; },
    get zombies() { const s = game(); return s ? s.zombies : []; },
    get buildings() { const s = game(); return s ? s.buildings : []; },
    get projectiles() { const s = game(); return s ? s.projectiles : []; },
    snapshot() { const s = game(); return s ? ZG.State.snapshot(s) : null; },
    hash() { const s = game(); return s ? ZG.State.hash(s) : null; },
    startRound() { const s = game(); return s ? ZG.Sim.startRound(s) : { ok: false }; },
    spawn(type, x, y) {
      const s = game();
      if (!s) return null;
      if (ZG.Data.zombies[type]) return ZG.State.spawnZombie(s, type, x, y);
      return ZG.State.spawnHuman(s, type, x, y);
    },
    damage(targetId, amount, type) {
      const s = game();
      const t = findEntity(targetId);
      if (!s || !t) return null;
      return ZG.Combat.applyDamage(s, {
        target: t, amount, damageKind: type || 'ranged'
      });
    },
    infect(targetId, amount) {
      const s = game();
      const t = findEntity(targetId);
      if (!s || !t) return null;
      return ZG.Infection.add(s, t, amount);
    },
    forcePromotion(n) {
      const s = game();
      return s ? ZG.Captains.promote(s, n === undefined ? 3 : n) : [];
    },
    forceHero(type) {
      const s = game();
      if (!s) return null;
      if (type && ZG.Data.heroes[type]) {
        const c = ZG.Geom.humanCentroid(s) || { x: ZG.Const.W / 2, y: ZG.Const.H / 2 };
        return ZG.State.spawnHuman(s, type, c.x, c.y, { heroId: type });
      }
      return ZG.Heroes.grant(s);
    },
    tick(n) {
      const s = game();
      if (!s) return null;
      ZG.Sim.tick(s, n || 1);
      return ZG.State.hash(s);
    },
    setSpeed(n) { const s = game(); if (s) s.ui.speed = n; },
    stopLoop() { if (ZG.Game) ZG.Game.setLoopStopped(true); },
    resumeLoop() { if (ZG.Game) ZG.Game.setLoopStopped(false); },
    record() { const s = game(); return s ? ZG.Sim.record(s) : []; },
    replay(seed, commands) {
      const s = game();
      const target = ZG.Sim.createGame({ mapId: s ? s.mapId : 'suburban', seed });
      for (const c of commands || []) ZG.Sim.applyCommand(target, c);
      return target;
    },
    benchDraw() { /* 由浏览器性能测试使用 */ },
    state_() { return game(); }
  };
})();
