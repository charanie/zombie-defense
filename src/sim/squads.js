/* 人类小队：以盾兵为核心的编队、搜索与阵位（纯模拟，无 DOM / 无随机） */
(function () {
  'use strict';
  const ZG = globalThis.ZG = globalThis.ZG || {};
  const STEP = ZG.Const.STEP_SEC;

  function cfg() { return ZG.Data.humanAi.squad; }

  function byId(state) {
    const m = new Map();
    for (const h of state.humans) if (h.alive) m.set(h.id, h);
    return m;
  }

  function isCore(h) {
    return h.classId === 'shield' && !h.shieldBroken;
  }

  function centroid(list) {
    if (!list.length) return { x: ZG.Const.W / 2, y: ZG.Const.H / 2 };
    let x = 0, y = 0;
    for (const h of list) { x += h.x; y += h.y; }
    return { x: x / list.length, y: y / list.length };
  }

  function nearestSquad(squads, x, y) {
    let best = squads[0], bd = Infinity;
    for (const s of squads) {
      const d = ZG.Geom.dist2(x, y, s.anchorX, s.anchorY);
      if (d < bd || (d === bd && s.id < best.id)) { bd = d; best = s; }
    }
    return best;
  }

  function makeSquad(id, core) {
    return {
      id, coreId: core ? core.id : null,
      shieldIds: core ? [core.id] : [],
      memberIds: [], civilianIds: [], tiers: {},
      anchorX: core ? core.x : ZG.Const.W / 2,
      anchorY: core ? core.y : ZG.Const.H / 2,
      frontX: core ? core.x : ZG.Const.W / 2,
      frontY: core ? core.y : ZG.Const.H / 2,
      faceAngle: -Math.PI / 2,
      targetX: ZG.Const.W / 2, targetY: ZG.Const.H / 2,
      targetZombieId: 0, mode: 'hold', depthOffset: 0
    };
  }

  function rebuild(state) {
    const c = cfg();
    const humans = state.humans.filter(h => h.alive).slice().sort((a, b) => a.id - b.id);
    const cores = humans.filter(isCore);
    const combat = humans.filter(h => h.classId !== 'civilian' && !isCore(h));
    const civs = humans.filter(h => h.classId === 'civilian');
    const old = new Map((state.squads || []).map(s => [s.id, s]));
    const squads = [];

    for (const core of cores) {
      const prev = old.get(core.id);
      const s = prev ? Object.assign({}, prev) : makeSquad(core.id, core);
      s.coreId = core.id; s.shieldIds = [core.id]; s.depthOffset = 0;
      s.memberIds = []; s.civilianIds = []; s.tiers = {};
      core.squadId = s.id; core.squadTier = 0;
      squads.push(s);
    }
    if (!squads.length) {
      const prev = old.get(0);
      const s = prev ? Object.assign({}, prev) : makeSquad(0, null);
      s.coreId = null; s.shieldIds = [];
      s.memberIds = []; s.civilianIds = []; s.tiers = {};
      squads.push(s);
    }

    const map = byId(state);
    for (const h of combat) {
      let chosen = null;
      if (h.squadId != null) {
        const prev = squads.find(s => s.id === h.squadId);
        if (prev && ZG.Geom.dist(h.x, h.y, prev.anchorX, prev.anchorY) <=
            c.joinRadius * c.keepRadiusMul) chosen = prev;
      }
      if (!chosen) chosen = nearestSquad(squads, h.x, h.y);
      chosen.memberIds.push(h.id);
      h.squadId = chosen.id;
      h.squadTier = 0;
    }
    for (const h of civs) {
      let chosen = null;
      if (h.squadId != null) {
        const prev = squads.find(s => s.id === h.squadId);
        if (prev && ZG.Geom.dist(h.x, h.y, prev.anchorX, prev.anchorY) <=
            c.joinRadius * c.keepRadiusMul) chosen = prev;
      }
      if (!chosen) chosen = nearestSquad(squads, h.x, h.y);
      chosen.civilianIds.push(h.id);
      h.squadId = chosen.id;
      h.squadTier = 0;
    }

    for (const s of squads) {
      const members = s.memberIds.map(id => map.get(id)).filter(Boolean);
      members.sort((a, b) => {
        const da = ZG.Geom.dist2(a.x, a.y, s.anchorX, s.anchorY);
        const db = ZG.Geom.dist2(b.x, b.y, s.anchorX, s.anchorY);
        return (da - db) || (a.id - b.id);
      });
      s.memberIds = members.map(h => h.id);
      members.forEach((h, i) => { h.squadTier = Math.floor(i / c.capacity); });

      const core = s.coreId != null ? map.get(s.coreId) : null;
      if (core) {
        s.anchorX = core.x; s.anchorY = core.y;
      } else {
        const list = members.length ? members : s.civilianIds.map(id => map.get(id)).filter(Boolean);
        const p = centroid(list);
        s.anchorX = p.x; s.anchorY = p.y;
      }

      // 无盾小队：把最浅的职业深度归零，避免远程被“虚拟盾线”推到更后面
      if (s.shieldIds.length) {
        s.depthOffset = 0;
      } else {
        let minDepth = Infinity;
        for (const id of s.memberIds) {
          const h = map.get(id);
          if (!h) continue;
          const d = c.roleDepth[h.role] !== undefined ? c.roleDepth[h.role] : c.roleDepth.rifle;
          minDepth = Math.min(minDepth, d);
        }
        s.depthOffset = minDepth === Infinity ? c.roleDepth.civilian : minDepth;
      }
    }

    state.squads = squads.sort((a, b) => a.id - b.id);
    state.squadDirty = false;
    state.squadTimer = 0;
    recomputeSlots(state);
    return state.squads;
  }

  function squadSpeed(state, s, map) {
    const c = cfg();
    map = map || byId(state);
    const core = s.coreId != null ? map.get(s.coreId) : null;
    let speed = c.squadSpeedCap;
    if (core) {
      speed = Math.min(speed, core.moveSpeed);
    } else {
      let fastest = 0;
      for (const id of s.memberIds) {
        const h = map.get(id);
        if (!h) continue;
        if (h.role === 'melee' || h.role === 'flame' || h.role === 'shotgun') {
          fastest = Math.max(fastest, h.moveSpeed);
        }
      }
      if (fastest > 0) speed = Math.min(speed, fastest);
    }
    return speed;
  }

  function engageRange(state, s, map) {
    const c = cfg();
    map = map || byId(state);
    const offset = s.depthOffset || 0;
    const frontRoles = { tank: 1, melee: 1, flame: 1, shotgun: 1 };
    let bestFront = Infinity, bestAny = Infinity;
    for (const id of s.memberIds) {
      const h = map.get(id);
      if (!h || !h.attack) continue;
      const base = c.roleDepth[h.role] !== undefined ? c.roleDepth[h.role] : c.roleDepth.rifle;
      const depth = Math.max(0, base + (h.squadTier || 0) * c.overflowTierDepth - offset);
      const effective = ZG.Stats.range(state, h) - depth;
      bestAny = Math.min(bestAny, effective);
      if (frontRoles[h.role]) bestFront = Math.min(bestFront, effective);
    }
    const best = isFinite(bestFront) ? bestFront : bestAny;
    if (!isFinite(best)) return Infinity;
    return Math.max(20, best);
  }

  function nearestZombieTo(state, x, y, used) {
    let best = null, bd = Infinity;
    for (const z of state.zombies) {
      if (!z.alive) continue;
      if (used && used.has(z.id)) continue;
      const d = ZG.Geom.dist2(x, y, z.x, z.y);
      if (d < bd || (d === bd && best && z.id < best.id)) { bd = d; best = z; }
    }
    return best;
  }

  function pendingSpawnPoint(state, x, y) {
    let best = null, bd = Infinity;
    const sp = state.spawner;
    for (let i = sp.batchIndex; i < sp.batches.length; i++) {
      for (const s of sp.batches[i].spawns) {
        const d = ZG.Geom.dist2(x, y, s.x, s.y);
        if (d < bd || (d === bd && best &&
            (s.x < best.x || (s.x === best.x && s.y < best.y)))) {
          bd = d; best = s;
        }
      }
    }
    return best;
  }

  function advanceFront(state, s, dt, map) {
    const step = squadSpeed(state, s, map) * dt;
    const dirX = Math.cos(s.faceAngle), dirY = Math.sin(s.faceAngle);
    const perpX = -dirY, perpY = dirX;
    const tries = [0, 0.85, -0.85, 1.5, -1.5];
    for (const t of tries) {
      const ca = Math.cos(t), sa = Math.sin(t);
      const vx = dirX * ca - dirY * sa;
      const vy = dirX * sa + dirY * ca;
      const p = ZG.Geom.clampToWorld(s.frontX + vx * step, s.frontY + vy * step, 16);
      if (!ZG.Geom.isBlockedAt(state, p.x, p.y, 16)) {
        s.frontX = p.x; s.frontY = p.y;
        return true;
      }
    }
    for (const k of [1, -1, 2, -2]) {
      const p = ZG.Geom.clampToWorld(
        s.frontX + perpX * cfg().shieldSpacing * k,
        s.frontY + perpY * cfg().shieldSpacing * k, 16);
      if (!ZG.Geom.isBlockedAt(state, p.x, p.y, 16)) {
        s.frontX = p.x; s.frontY = p.y;
        return true;
      }
    }
    return false;
  }

  function update(state) {
    const c = cfg();
    if (state.squadDirty || state.squadTimer >= c.rebuildSec) rebuild(state);
    state.squadTimer += STEP;
    if (!state.squads.length) return;

    const used = new Set();
    const map = byId(state);
    const squads = state.squads.slice().sort((a, b) => a.id - b.id);
    for (const s of squads) {
      let target = null;
      if (state.zombies.length) {
        target = nearestZombieTo(state, s.frontX, s.frontY, used);
        if (!target) target = nearestZombieTo(state, s.frontX, s.frontY, null);
        if (target) used.add(target.id);
      }
      if (target) {
        s.targetZombieId = target.id;
        s.targetX = target.x; s.targetY = target.y;
        s.faceAngle = Math.atan2(target.y - s.frontY, target.x - s.frontX);
        const d = ZG.Geom.dist(s.frontX, s.frontY, target.x, target.y);
        if (d > engageRange(state, s, map)) {
          s.mode = 'advance';
          advanceFront(state, s, STEP, map);
        } else {
          s.mode = 'hold';
        }
      } else {
        const p = pendingSpawnPoint(state, s.frontX, s.frontY);
        const goal = p
          ? {
              x: Math.max(c.searchStopInset, Math.min(ZG.Const.W - c.searchStopInset, p.x)),
              y: Math.max(c.searchStopInset, Math.min(ZG.Const.H - c.searchStopInset, p.y))
            }
          : { x: ZG.Const.W / 2, y: ZG.Const.H / 2 };
        s.targetZombieId = 0;
        s.targetX = goal.x; s.targetY = goal.y;
        s.faceAngle = Math.atan2(goal.y - s.frontY, goal.x - s.frontX);
        const hasUnits = s.memberIds.length + s.shieldIds.length + s.civilianIds.length > 0;
        if (hasUnits && ZG.Geom.dist(s.frontX, s.frontY, goal.x, goal.y) > 2) {
          s.mode = 'search';
          advanceFront(state, s, STEP, map);
        } else {
          s.mode = 'hold';
        }
      }
      s.anchorX = s.frontX;
      s.anchorY = s.frontY;
    }
    recomputeSlots(state, map);
  }

  function recomputeSlots(state, map) {
    const c = cfg();
    map = map || byId(state);
    for (const s of state.squads) {
      const face = s.faceAngle;
      const dx = Math.cos(face), dy = Math.sin(face);
      const perpX = -dy, perpY = dx;
      const backX = -dx, backY = -dy;
      const slot = (lateral, depth) => ({
        x: s.frontX + perpX * lateral + backX * depth,
        y: s.frontY + perpY * lateral + backY * depth
      });

      // 盾兵
      const shields = s.shieldIds.map(id => map.get(id)).filter(Boolean).sort((a, b) => a.id - b.id);
      for (let i = 0; i < shields.length; i++) {
        const row = Math.floor(i / 4);
        const col = i % 4;
        const nInRow = Math.min(4, shields.length - row * 4);
        const lateral = (col - (nInRow - 1) / 2) * c.shieldSpacing + (row ? c.shieldSpacing / 2 : 0);
        const depth = row * 26;
        const p = slot(lateral, depth);
        const q = ZG.Geom.clampToWorld(p.x, p.y, shields[i].radius);
        shields[i].formationX = q.x;
        shields[i].formationY = q.y;
      }

      // 非盾单位按深度桶分组，避免火箭/治疗同深度重叠
      const buckets = [
        { roles: ['melee'], depth: c.roleDepth.melee },
        { roles: ['flame'], depth: c.roleDepth.flame },
        { roles: ['shotgun'], depth: c.roleDepth.shotgun },
        { roles: ['rifle'], depth: c.roleDepth.rifle },
        { roles: ['rocket', 'medic'], depth: c.roleDepth.rocket }
      ];
      for (const bucket of buckets) {
        const list = [];
        for (const id of s.memberIds) {
          const h = map.get(id);
          if (!h) continue;
          if (bucket.roles.indexOf(h.role) >= 0) list.push(h);
        }
        list.sort((a, b) => {
          const ra = bucket.roles.indexOf(a.role), rb = bucket.roles.indexOf(b.role);
          return (ra - rb) || (a.id - b.id);
        });
        for (let i = 0; i < list.length; i++) {
          const h = list[i];
          const row = Math.floor(i / c.rowMax);
          const col = i % c.rowMax;
          const nInRow = Math.min(c.rowMax, list.length - row * c.rowMax);
          const lateral = (col - (nInRow - 1) / 2) * c.lateralSpacing;
          const depth = Math.max(0, bucket.depth - (s.depthOffset || 0)) +
            (h.squadTier || 0) * c.overflowTierDepth + row * c.rowSpacing;
          const p = slot(lateral, depth);
          const q = ZG.Geom.clampToWorld(p.x, p.y, h.radius);
          h.formationX = q.x;
          h.formationY = q.y;
        }
      }

      // 平民
      const civs = s.civilianIds.map(id => map.get(id)).filter(Boolean).sort((a, b) => a.id - b.id);
      for (let i = 0; i < civs.length; i++) {
        const h = civs[i];
        const row = Math.floor(i / c.rowMax);
        const col = i % c.rowMax;
        const nInRow = Math.min(c.rowMax, civs.length - row * c.rowMax);
        const lateral = (col - (nInRow - 1) / 2) * c.lateralSpacing;
        const depth = Math.max(0, c.roleDepth.civilian - (s.depthOffset || 0)) +
          (h.squadTier || 0) * c.overflowTierDepth +
          row * c.rowSpacing + c.civilianExtraDepth;
        const p = slot(lateral, depth);
        const q = ZG.Geom.clampToWorld(p.x, p.y, h.radius);
        h.formationX = q.x;
        h.formationY = q.y;
      }
    }
  }

  function slotFor(state, h) {
    return { x: h.formationX, y: h.formationY };
  }

  function markDirty(state) { state.squadDirty = true; }

  ZG.Squads = { rebuild, update, slotFor, markDirty };
})();
