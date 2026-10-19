/* 金钱、人口、招募、出售、建造、科技 */
(function () {
  'use strict';
  const ZG = globalThis.ZG = globalThis.ZG || {};

  function canAfford(state, cost) { return state.money >= cost; }

  function spend(state, cost) {
    state.money -= cost;
    state.bus.emit(ZG.Events.MONEY_CHANGED, { money: state.money, delta: -cost });
  }

  function earn(state, amount, reason) {
    ZG.Combat.earn(state, amount, reason);
  }

  function populationUsed(state) {
    let n = 0;
    for (const h of state.humans) {
      if (h.alive && !h.converted && !h.hero && h.pop > 0) n += h.pop;
    }
    return n;
  }

  function heroesUsed(state) {
    return state.humans.filter(h => h.alive && h.hero).length;
  }

  function civilianCount(state) {
    return state.humans.filter(h => h.alive && h.classId === 'civilian').length;
  }

  function canPlace(state, x, y, radius, ignoreId) {
    if (!state.map) return { ok: false, reason: 'outside' };
    const r = radius || 0;
    const m = r + ZG.Const.PLACE_MARGIN;
    if (x < m || y < m || x > ZG.Const.W - m || y > ZG.Const.H - m) {
      return { ok: false, reason: 'outside' };
    }
    for (const h of state.humans) {
      if (!h.alive || h.id === ignoreId) continue;
      if (ZG.Geom.circleOverlapsCircle(x, y, r, h.x, h.y, h.radius, ZG.Const.PLACE_GAP)) {
        return { ok: false, reason: 'overlap' };
      }
    }
    for (const b of state.buildings) {
      if (!b.alive) continue;
      if (b.shape === 'rect') {
        const br = ZG.Geom.rectOfBuilding(b);
        if (ZG.Geom.circleOverlapsRect(x, y, r, br.x, br.y, br.w, br.h, ZG.Const.PLACE_GAP)) {
          return { ok: false, reason: 'overlap' };
        }
      } else if (ZG.Geom.circleOverlapsCircle(x, y, r, b.x, b.y, b.radius || 24, ZG.Const.PLACE_GAP)) {
        return { ok: false, reason: 'overlap' };
      }
    }
    for (const o of state.map.obstacles || []) {
      if (o.kind === 'rect') {
        if (ZG.Geom.circleOverlapsRect(x, y, r, o.x, o.y, o.w, o.h, 0)) {
          return { ok: false, reason: 'obstacle' };
        }
      } else if (ZG.Geom.circleOverlapsCircle(x, y, r, o.x, o.y, o.r, 0)) {
        return { ok: false, reason: 'obstacle' };
      }
    }
    return { ok: true };
  }

  function recruit(state, classId, x, y) {
    if (state.status !== 'prep') return { ok: false, reason: 'not-prep' };
    const data = ZG.Data.humans[classId];
    if (!data) return { ok: false, reason: 'unknown' };
    if (!canAfford(state, data.cost)) return { ok: false, reason: 'money' };
    if (data.pop > 0 && populationUsed(state) + data.pop > ZG.Balance.populationCap(state.round)) {
      return { ok: false, reason: 'population' };
    }
    if (classId === 'civilian' && civilianCount(state) >= ZG.Const.MAX_CIVILIANS) {
      return { ok: false, reason: 'civilian-cap' };
    }
    const p = canPlace(state, x, y, data.radius || 8);
    if (!p.ok) return { ok: false, reason: p.reason };
    spend(state, data.cost);
    const h = ZG.State.spawnHuman(state, classId, x, y);
    state.bus.emit(ZG.Events.UI_TOAST, { text: data.name + ' 已就位', kind: 'ok' });
    return { ok: true, human: h };
  }

  function sell(state, humanId) {
    if (state.status !== 'prep') return { ok: false, reason: 'not-prep' };
    const h = state.humans.find(x => x.id === humanId && x.alive);
    if (!h) return { ok: false, reason: 'not-found' };
    if (h.hero) return { ok: false, reason: 'hero' };
    if (state.humans.filter(x => x.alive).length <= 1) return { ok: false, reason: 'last-human' };
    const refund = Math.floor((h.cost || 0) * 0.5);
    h.alive = false;
    const i = state.humans.indexOf(h);
    if (i >= 0) state.humans.splice(i, 1);
    state.money += refund;
    state.bus.emit(ZG.Events.MONEY_CHANGED, { money: state.money, delta: refund });
    return { ok: true, refund };
  }

  function build(state, typeId, slotId) {
    if (state.status !== 'prep') return { ok: false, reason: 'not-prep' };
    const data = ZG.Data.buildings[typeId];
    if (!data) return { ok: false, reason: 'unknown' };
    const slot = state.slots.find(s => s.id === slotId);
    if (!slot) return { ok: false, reason: 'no-slot' };
    if (slot.buildingId) return { ok: false, reason: 'occupied' };
    if (slot.rubble) return { ok: false, reason: 'rubble' };
    if (!canAfford(state, data.cost)) return { ok: false, reason: 'money' };
    spend(state, data.cost);
    const b = ZG.State.spawnBuilding(state, typeId, slotId);
    if (state.pathing) state.pathing = ZG.Pathing.build(state);
    return { ok: true, building: b };
  }

  function demolish(state, buildingId) {
    if (state.status !== 'prep') return { ok: false, reason: 'not-prep' };
    const b = state.buildings.find(x => x.id === buildingId && x.alive);
    if (!b) return { ok: false, reason: 'not-found' };
    const data = ZG.Data.buildings[b.typeId];
    const refund = Math.floor((data ? data.cost : 0) * 0.5);
    b.alive = false;
    const i = state.buildings.indexOf(b);
    if (i >= 0) state.buildings.splice(i, 1);
    const slot = state.slots.find(s => s.id === b.slotId);
    if (slot) { slot.buildingId = null; slot.rubble = true; }
    state.money += refund;
    state.bus.emit(ZG.Events.MONEY_CHANGED, { money: state.money, delta: refund });
    if (state.pathing) state.pathing = ZG.Pathing.build(state);
    return { ok: true, refund };
  }

  function buyTech(state, line) {
    if (state.status !== 'prep') return { ok: false, reason: 'not-prep' };
    if (['fire', 'armor', 'econ', 'serum'].indexOf(line) < 0) return { ok: false, reason: 'unknown' };
    const lvl = state.tech[line] || 0;
    if (lvl >= ZG.Balance.TECH_MAX) return { ok: false, reason: 'max-level' };
    const cost = ZG.Balance.techCost(line, lvl);
    if (!canAfford(state, cost)) return { ok: false, reason: 'money' };
    spend(state, cost);
    state.tech[line] = lvl + 1;

    if (line === 'armor') {
      const oldMul = 1 + 0.06 * lvl;
      const newMul = 1 + 0.06 * (lvl + 1);
      const ratio = newMul / oldMul;
      for (const h of state.humans) {
        if (!h.alive) continue;
        h.maxHp *= ratio;
        h.hp *= ratio;
        if (h.maxShield > 0) { h.maxShield *= ratio; h.shield *= ratio; }
      }
    }
    if (line === 'serum') {
      for (const h of state.humans) {
        if (h.alive && (h.classId === 'medic' || h.heroId === 'plague')) {
          h.serumLeft = Math.max(h.serumLeft || 0, 0) + 1;
        }
      }
    }
    return { ok: true, level: state.tech[line] };
  }

  function moveHuman(state, humanId, x, y) {
    if (state.status !== 'prep') return { ok: false, reason: 'not-prep' };
    const h = state.humans.find(u => u.id === humanId && u.alive);
    if (!h) return { ok: false, reason: 'not-found' };
    const p = canPlace(state, x, y, h.radius, h.id);
    if (!p.ok) return { ok: false, reason: p.reason };
    h.x = x; h.y = y; h.homeX = x; h.homeY = y;
    return { ok: true };
  }

  ZG.Economy = {
    canAfford, spend, earn, populationUsed, heroesUsed, civilianCount,
    canPlace, recruit, sell, build, demolish, buyTech, moveHuman
  };
})();
