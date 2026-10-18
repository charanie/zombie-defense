/* 队长晋升、上限与死亡爆炸 */
(function () {
  'use strict';
  const ZG = globalThis.ZG = globalThis.ZG || {};

  function candidates(state) {
    return state.humans.filter(h =>
      h.alive && !h.captain && !h.hero && !h.converted && h.classId !== 'civilian'
    );
  }

  function promote(state, max) {
    const limit = max === undefined ? 3 : max;
    const pool = candidates(state);
    if (!pool.length) return [];

    const rng = state.rng.promote;
    rng.shuffle(pool);

    const promoted = [];
    const usedClasses = new Set();
    for (const h of pool) {
      if (promoted.length >= limit) break;
      if (usedClasses.has(h.classId)) continue;
      usedClasses.add(h.classId);
      promoted.push(h);
    }
    if (promoted.length < limit) {
      for (const h of pool) {
        if (promoted.length >= limit) break;
        if (promoted.indexOf(h) >= 0) continue;
        promoted.push(h);
      }
    }

    const count = state.humans.filter(h => h.alive && h.captain).length;
    let canPromote = Math.max(0, ZG.Const.MAX_CAPTAINS - count);

    const result = [];
    if (pool.length < limit) {
      const missing = limit - promoted.length;
      for (let i = 0; i < missing; i++) {
        if (state.stats.captainOverflow < 5) state.stats.captainOverflow++;
      }
    }

    for (const h of promoted) {
      if (canPromote > 0) {
        canPromote--;
        h.captain = true;
        h.maxHp *= 2.5;
        h.hp *= 2.5;
        h.infection = 0;
        state.stats.captains = (state.stats.captains || 0) + 1;
        state.bus.emit(ZG.Events.CAPTAIN_PROMOTED, { human: h });
        state.bus.emit(ZG.Events.UI_TOAST, {
          text: h.name + ' 晋升队长！', kind: 'captain'
        });
        result.push(h);
      } else {
        if (state.stats.captainOverflow < 5) {
          state.stats.captainOverflow++;
        }
      }
    }
    return result;
  }

  ZG.Captains = { promote, candidates };
})();
