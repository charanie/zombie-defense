/* 出生队列：批次、传送门预警、数量上限 */
(function () {
  'use strict';
  const ZG = globalThis.ZG = globalThis.ZG || {};

  function prepare(state) {
    const w = ZG.Waves.build(state.round, state.rng.spawn, state.map);
    state.spawner = {
      batches: w.batches,
      batchIndex: 0,
      timer: 0,
      remaining: w.total,
      warning: 0,
      bossPending: false,
      portals: [],
      bossBatchIndex: w.bossBatchIndex,
      total: w.total
    };
    state.battle.waveTotal = w.total;
    state.battle.waveId = state.round;
    state.battle.babyCount = 0;
    state.battle.convertedThisRound = 0;
    state.battle.bossId = null;
    return w;
  }

  function zombieCap(state) {
    return state.quality === 'mobile'
      ? ZG.Const.ZOMBIE_CAP_MOBILE
      : ZG.Const.ZOMBIE_CAP_DESKTOP;
  }

  function step(state) {
    const sp = state.spawner;
    const dt = ZG.Const.STEP_SEC;

    for (let i = sp.portals.length - 1; i >= 0; i--) {
      sp.portals[i].ttl -= dt;
      if (sp.portals[i].ttl <= 0) sp.portals.splice(i, 1);
    }

    while (sp.batchIndex < sp.batches.length) {
      const b = sp.batches[sp.batchIndex];
      if (!b.warned && state.battle.time >= b.portalAt) {
        b.warned = true;
        const first = b.spawns[0];
        if (first) {
          sp.portals.push({ x: first.x, y: first.y, ttl: 1.2 });
          state.bus.emit(ZG.Events.PORTAL_WARNING, { x: first.x, y: first.y });
        }
      }
      if (state.battle.time < b.at) break;

      if (state.zombies.length >= zombieCap(state)) {
        // 达到同屏上限：延后出生，不丢弃
        break;
      }

      for (const s of b.spawns) {
        ZG.State.spawnZombie(state, s.type, s.x, s.y, { wave: state.battle.waveId });
      }
      sp.batchIndex++;
      sp.remaining = remaining(state);
    }
  }

  function remaining(state) {
    const sp = state.spawner;
    let n = 0;
    for (let i = sp.batchIndex; i < sp.batches.length; i++) {
      n += sp.batches[i].spawns.length;
    }
    return n;
  }

  ZG.Spawner = { prepare, step, remaining, zombieCap };
})();
