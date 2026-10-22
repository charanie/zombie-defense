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

  function buildingDims(typeId, opts) {
    const data = ZG.Data.buildings[typeId];
    if (!data) return null;
    const vertical = !!(opts && opts.vertical) && data.rotatable !== false;
    const shape = data.shape || 'circle';
    const w = shape === 'rect' ? (vertical ? data.h : data.w) : (data.radius || 24) * 2;
    const h = shape === 'rect' ? (vertical ? data.w : data.h) : (data.radius || 24) * 2;
    return { data, shape, w, h, vertical, radius: data.radius || Math.max(w, h) / 2 };
  }

  function canPlaceBuilding(state, typeId, x, y, opts) {
    if (!state.map) return { ok: false, reason: 'outside' };
    const d = buildingDims(typeId, opts);
    if (!d) return { ok: false, reason: 'unknown' };
    if (d.shape === 'rect') {
      if (x - d.w / 2 < ZG.Const.PLACE_MARGIN ||
          y - d.h / 2 < ZG.Const.PLACE_MARGIN ||
          x + d.w / 2 > ZG.Const.W - ZG.Const.PLACE_MARGIN ||
          y + d.h / 2 > ZG.Const.H - ZG.Const.PLACE_MARGIN) {
        return { ok: false, reason: 'outside' };
      }
    } else {
      const m = d.radius + ZG.Const.PLACE_MARGIN;
      if (x < m || y < m || x > ZG.Const.W - m || y > ZG.Const.H - m) {
        return { ok: false, reason: 'outside' };
      }
    }
    const my = d.shape === 'rect' ? ZG.Geom.rectOfCenter(x, y, d.w, d.h) : null;
    const hitsCircle = (cx, cy, cr) => d.shape === 'rect'
      ? ZG.Geom.circleOverlapsRect(cx, cy, cr, my.x, my.y, my.w, my.h, ZG.Const.PLACE_GAP)
      : ZG.Geom.circleOverlapsCircle(x, y, d.radius, cx, cy, cr, ZG.Const.PLACE_GAP);
    const hitsRect = (r) => d.shape === 'rect'
      ? ZG.Geom.rectOverlapsRect(my.x, my.y, my.w, my.h, r.x, r.y, r.w, r.h, ZG.Const.PLACE_GAP)
      : ZG.Geom.circleOverlapsRect(x, y, d.radius, r.x, r.y, r.w, r.h, ZG.Const.PLACE_GAP);

    for (const ob of state.map.obstacles || []) {
      const hit = ob.kind === 'rect' ? hitsRect(ob) : hitsCircle(ob.x, ob.y, ob.r);
      if (hit) return { ok: false, reason: 'obstacle' };
    }
    for (const h of state.humans) {
      if (h.alive && hitsCircle(h.x, h.y, h.radius)) return { ok: false, reason: 'overlap' };
    }
    for (const b of state.buildings) {
      if (!b.alive) continue;
      const br = ZG.Geom.rectOfBuilding(b);
      const hit = b.shape === 'rect'
        ? hitsRect(br)
        : hitsCircle(b.x, b.y, b.radius || 24);
      if (hit) return { ok: false, reason: 'overlap' };
    }
    return { ok: true };
  }

  function build(state, typeId, x, y, opts) {
    if (state.status !== 'prep') return { ok: false, reason: 'not-prep' };
    const data = ZG.Data.buildings[typeId];
    if (!data) return { ok: false, reason: 'unknown' };
    const count = state.buildings.filter(b => b.alive && b.typeId === typeId).length;
    const limit = ZG.Tech ? ZG.Tech.buildingLimit(state, typeId) : data.limit;
    if (limit !== undefined && limit !== Infinity && count >= limit) {
      return { ok: false, reason: 'limit' };
    }
    if (!canAfford(state, data.cost)) return { ok: false, reason: 'money' };
    const p = canPlaceBuilding(state, typeId, x, y, opts);
    if (!p.ok) return p;
    spend(state, data.cost);
    const b = ZG.State.spawnBuilding(state, typeId, x, y, opts);
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
    state.money += refund;
    state.bus.emit(ZG.Events.MONEY_CHANGED, { money: state.money, delta: refund });
    if (state.pathing) state.pathing = ZG.Pathing.build(state);
    return { ok: true, refund };
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
    canPlace, canPlaceBuilding, buildingDims, recruit, sell, build, demolish, moveHuman
  };
})();
