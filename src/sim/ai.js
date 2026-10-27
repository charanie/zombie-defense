/* 人类 / 僵尸自动战斗 AI */
(function () {
  'use strict';
  const ZG = globalThis.ZG = globalThis.ZG || {};
  const D = ZG.Const.DAMAGE;
  const STEP = ZG.Const.STEP_SEC;

  /* ---------------- 查询工具 ---------------- */

  function edgeDist(a, b) {
    return ZG.Geom.dist(a.x, a.y, b.x, b.y) - (a.radius || 0) - (b.radius || 0);
  }

  function nearestHuman(state, x, y, maxR) {
    // 人类数量有限（≤100），线性扫描比大半径空间查询更快
    const r = maxR || 4000;
    const r2 = r * r;
    let best = null, bestD = r2;
    for (let i = 0; i < state.humans.length; i++) {
      const h = state.humans[i];
      if (!h.alive) continue;
      const dx = h.x - x, dy = h.y - y;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = h; }
    }
    return best;
  }

  function nearestShield(state, z, radius) {
    let best = null, bd = radius * radius;
    for (const h of state.humans) {
      if (!h.alive || h.classId !== 'shield') continue;
      const d = ZG.Geom.dist2(h.x, h.y, z.x, z.y);
      if (d < bd) { bd = d; best = h; }
    }
    return best;
  }

  function buildingDist(x, y, b) {
    if (b.shape === 'rect') {
      const r = ZG.Geom.rectOfBuilding(b);
      return ZG.Geom.distPointToRect(x, y, r.x, r.y, r.w, r.h);
    }
    return Math.max(0, ZG.Geom.dist(x, y, b.x, b.y) - (b.radius || 24));
  }

  function nearestBuilding(state, x, y, maxR) {
    let best = null, bestD = maxR || 220;
    for (const b of state.buildings) {
      if (!b.alive) continue;
      const d = buildingDist(x, y, b);
      if (d < bestD) { bestD = d; best = b; }
    }
    return best;
  }

  function densestHumanPoint(state) {
    let best = null, bestCount = 0;
    for (const a of state.humans) {
      if (!a.alive) continue;
      let count = 0;
      for (const b of state.humans) {
        if (!b.alive) continue;
        if (ZG.Geom.dist2(a.x, a.y, b.x, b.y) <= 90 * 90) count++;
      }
      if (count > bestCount) { bestCount = count; best = a; }
    }
    if (!best) {
      const c = ZG.Geom.humanCentroid(state) || { x: ZG.Const.W / 2, y: ZG.Const.H / 2 };
      return { x: c.x, y: c.y, count: 0 };
    }
    return { x: best.x, y: best.y, count: bestCount, human: best };
  }

  function densestZombieCluster(state, x, y, maxR) {
    let best = null, bestCount = 0;
    for (const a of state.zombies) {
      if (!a.alive) continue;
      if (ZG.Geom.dist2(a.x, a.y, x, y) > maxR * maxR) continue;
      let count = 0;
      for (const b of state.zombies) {
        if (!b.alive) continue;
        if (ZG.Geom.dist2(a.x, a.y, b.x, b.y) <= 90 * 90) count++;
      }
      if (count > bestCount) { bestCount = count; best = a; }
    }
    return best ? { x: best.x, y: best.y, count: bestCount } : { x, y, count: 0 };
  }

  function zombiesInRange(state, h, range) {
    const list = ZG.Spatial.queryCircle(state.spatial, h.x, h.y,
      range + h.radius + 24, e => e.kind === 'zombie' && e.alive);
    const out = [];
    for (const z of list) {
      const rr = range + h.radius + (z.radius || 0);
      if (ZG.Geom.dist2(h.x, h.y, z.x, z.y) <= rr * rr) out.push(z);
    }
    return out;
  }

  function nearestByEdgeDist(h, list) {
    let best = null, bd = Infinity;
    for (const z of list) {
      const d = edgeDist(h, z);
      if (d < bd || (d === bd && best && z.id < best.id)) { bd = d; best = z; }
    }
    return best;
  }

  // 一次遍历取最近 n 个，避免对整群排序（大群时显著更快）
  function nearestNByEdgeDist(h, list, n) {
    const best = [];
    for (const z of list) {
      const d = edgeDist(h, z);
      if (best.length >= n) {
        const w = best[n - 1];
        if (d > w.d || (d === w.d && z.id > w.z.id)) continue;
      }
      let i = best.length;
      while (i > 0) {
        const p = best[i - 1];
        if (p.d < d || (p.d === d && p.z.id < z.id)) break;
        i--;
      }
      best.splice(i, 0, { z, d });
      if (best.length > n) best.pop();
    }
    return best.map(e => e.z);
  }

  function faceToward(h, x, y) {
    h.facing = Math.atan2(y - h.y, x - h.x);
  }

  /* ---------------- 人类自主移动 ---------------- */

  const HAI = ZG.Data.humanAi;

  function isMedicClass(h) {
    return h.classId === 'medic' || h.heroId === 'plague';
  }

  function healRangeOf(h) {
    if (h.heroId === 'plague') {
      return (ZG.Data.heroes.plague && ZG.Data.heroes.plague.healRange) || 230;
    }
    return h.healRange || (ZG.Data.humans.medic && ZG.Data.humans.medic.healRange) || 160;
  }

  function blockedAt(state, x, y, radius) {
    if (x < 8 || y < 8 || x > ZG.Const.W - 8 || y > ZG.Const.H - 8) return true;
    if (!ZG.MapZone.contains(state.map, x, y)) return true;
    const map = state.map;
    if (map && map.obstacles) {
      for (const ob of map.obstacles) {
        if (ob.kind !== 'circle') continue;
        if (ZG.Geom.circleOverlapsCircle(x, y, radius, ob.x, ob.y, ob.r, 1)) return true;
      }
    }
    for (const b of state.buildings) {
      if (!b.alive) continue;
      if (ZG.Geom.circleOverlapsCircle(x, y, radius, b.x, b.y, b.radius, 1)) return true;
    }
    return false;
  }

  // 直接移动；正面撞上障碍时依次尝试偏转方向，避免直线卡死
  function moveHumanDir(state, h, dx, dy, step) {
    const d = Math.hypot(dx, dy);
    if (d < 1e-9 || step <= 0) { h.moveX = 0; h.moveY = 0; return false; }
    dx /= d; dy /= d;
    const angles = [0, 0.85, -0.85, 1.5, -1.5, 2.2, -2.2];
    for (const a of angles) {
      const ca = Math.cos(a), sa = Math.sin(a);
      const vx = dx * ca - dy * sa;
      const vy = dx * sa + dy * ca;
      const p = ZG.MapZone.clamp(state.map, h.x + vx * step, h.y + vy * step, h.radius);
      const nx = Math.max(8, Math.min(ZG.Const.W - 8, p.x));
      const ny = Math.max(8, Math.min(ZG.Const.H - 8, p.y));
      if (!blockedAt(state, nx, ny, h.radius)) {
        h.x = nx; h.y = ny;
        h.moveX = vx; h.moveY = vy;
        return true;
      }
    }
    h.moveX = 0; h.moveY = 0;
    return false;
  }

  function moveHumanToward(state, h, tx, ty, speed, dt) {
    const dx = tx - h.x, dy = ty - h.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.001) { h.moveX = 0; h.moveY = 0; return false; }
    return moveHumanDir(state, h, dx, dy, Math.min(speed * dt, d));
  }

  function nearestZombie(state, x, y, maxR) {
    let best = null, bestD = maxR * maxR;
    for (const z of state.zombies) {
      if (!z.alive) continue;
      const dx = z.x - x, dy = z.y - y;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = z; }
    }
    return best;
  }

  function stopDistance(state, h, z) {
    const st = ZG.Stats.human(state, h);
    if (h.attack && h.attack.kind === 'melee') {
      const bonus = h.attack.rangeBonusRadius ? z.radius : 0;
      return Math.max(12, st.range + bonus - 4);
    }
    return Math.max(16, st.range * HAI.stopRangeMul);
  }

  function needsCare(state, h) {
    if (h.infection >= HAI.careInfection) return true;
    return h.hp < h.maxHp * HAI.careHpRatio;
  }

  function canDispel(h) {
    if (h.heroId === 'plague') return h.dispelCd <= 0;
    return h.serumLeft > 0 && h.serumCd <= 0;
  }

  function carePointOf(state, h) {
    if (!h.careTargetId) return null;
    if (h.careKind === 'hospital') {
      const b = state.buildings.find(u => u.id === h.careTargetId && u.alive);
      if (!b) return null;
      return {
        kind: 'hospital', id: b.id, x: b.x, y: b.y,
        stop: ZG.Data.buildings.hospital.heal.radius * HAI.hospitalStopRatio
      };
    }
    if (h.careKind === 'medic') {
      const u = state.humans.find(x => x.id === h.careTargetId && x.alive);
      if (!u || !isMedicClass(u)) return null;
      return {
        kind: 'medic', id: u.id, x: u.x, y: u.y,
        stop: healRangeOf(u) * HAI.medicStopRatio
      };
    }
    return null;
  }

  function findCareTarget(state, h) {
    const hurt = h.hp < h.maxHp * HAI.careHpRatio;
    const infected = h.infection >= HAI.careInfection;
    if (!hurt && !infected) return null;

    let best = null, bestScore = Infinity;
    for (const b of state.buildings) {
      if (!b.alive || b.typeId !== 'hospital') continue;
      const d = ZG.Geom.dist(h.x, h.y, b.x, b.y);
      const stop = ZG.Data.buildings.hospital.heal.radius * HAI.hospitalStopRatio;
      if (d - stop > HAI.careSearchRadius) continue;
      const score = Math.max(0, d - stop);
      if (score < bestScore) {
        bestScore = score;
        best = { kind: 'hospital', id: b.id, x: b.x, y: b.y, stop };
      }
    }

    // 治疗兵只能处理外伤；感染需要还有血清/疫医驱散可用
    const medicUsefulForInfection = infected && h.infection >= 50;
    for (const u of state.humans) {
      if (!u.alive || u === h || !isMedicClass(u)) continue;
      const range = healRangeOf(u);
      const stop = range * HAI.medicStopRatio;
      const d = ZG.Geom.dist(h.x, h.y, u.x, u.y);
      if (d - stop > HAI.careSearchRadius) continue;
      const useful = hurt || (medicUsefulForInfection && canDispel(u));
      if (!useful) continue;
      let score = Math.max(0, d - stop);
      if (h.infection >= 50 && canDispel(u)) score -= 90;
      if (score < bestScore) {
        bestScore = score;
        best = { kind: 'medic', id: u.id, x: u.x, y: u.y, stop };
      }
    }
    return best;
  }

  // 返回 true 表示这一步被“寻医移动”占用
  function stepCare(state, h, dt) {
    if (!needsCare(state, h)) {
      h.careTargetId = 0;
      h.careKind = null;
      return false;
    }
    let care = carePointOf(state, h);
    if (!care) {
      care = findCareTarget(state, h);
      if (!care) {
        h.careTargetId = 0;
        h.careKind = null;
        return false;
      }
      h.careTargetId = care.id;
      h.careKind = care.kind;
    }
    h.aiState = 'heal';
    const d = ZG.Geom.dist(h.x, h.y, care.x, care.y);
    if (d > care.stop) {
      moveHumanToward(state, h, care.x, care.y, h.moveSpeed * HAI.careSpeedMul, dt);
      return true;
    }
    h.moveX = 0; h.moveY = 0;
    return false;
  }

  function findPatient(state, h) {
    let best = null, bestScore = 0;
    for (const u of state.humans) {
      if (!u.alive || u === h) continue;
      const injured = u.hp < u.maxHp - 0.01;
      const infected = u.infection >= 50 && canDispel(h);
      if (!injured && !infected) continue;
      const d = ZG.Geom.dist(h.x, h.y, u.x, u.y);
      if (d > HAI.medicAssistRadius) continue;
      // 已经处于医疗站范围内的伤员交给医疗站
      let covered = false;
      for (const b of state.buildings) {
        if (!b.alive || b.typeId !== 'hospital') continue;
        if (ZG.Geom.dist(u.x, u.y, b.x, b.y) <=
          ZG.Data.buildings.hospital.heal.radius) { covered = true; break; }
      }
      if (covered) continue;
      const score = (1 - u.hp / u.maxHp) * 100 + u.infection * 1.2 - d * 0.05;
      if (score > bestScore) { bestScore = score; best = u; }
    }
    return best;
  }

  function collectChargers(state) {
    const out = [];
    for (const z of state.zombies) {
      if (z.alive && z.typeId === 'runner' && z.sprinting) out.push(z);
    }
    return out;
  }

  function tryStartDodge(h, chargers) {
    if (!h.dodgeEnabled || h.dodgeT > 0 || h.dodgeCd > 0) return;
    for (const z of chargers) {
      const dx = h.x - z.x, dy = h.y - z.y;
      const d = Math.hypot(dx, dy);
      if (d < 1e-6 || d > HAI.dodgeRadius + h.radius + z.radius) continue;
      const fx = Math.cos(z.facing), fy = Math.sin(z.facing);
      const dot = (fx * dx + fy * dy) / d;
      if (dot < HAI.dodgeMinDot) continue; // 不是朝我冲
      const cross = fx * dy - fy * dx;
      let sign;
      if (Math.abs(cross) < 0.25) sign = (h.id & 1) ? 1 : -1; // 正面：按 id 固定侧移方向
      else sign = cross > 0 ? 1 : -1;                          // 向偏离冲刺线的一侧闪
      h.dodgeDirX = -fy * sign;
      h.dodgeDirY = fx * sign;
      h.dodgeT = HAI.dodgeDuration;
      h.dodgeCd = HAI.dodgeCooldown;
      h.aiState = 'dodge';
      return;
    }
  }

  function stepDodge(state, h, dt) {
    if (h.dodgeT <= 0) return false;
    h.dodgeT -= dt;
    moveHumanDir(state, h, h.dodgeDirX, h.dodgeDirY, HAI.dodgeSpeed * dt);
    h.aiState = 'dodge';
    return true;
  }

  /* ---------------- 人类 ---------------- */

  function pickHumanTarget(state, h) {
    if (!h.attack || h.classId === 'civilian') return null;
    if (h.classId === 'shield' && !h.shieldBroken) return null;

    // 同一模拟步内复用索敌结果，减少重复空间查询（跨步仍重新索敌）
    const step = (state.battle && state.battle.stepCount) || 0;
    if (h.tgtStep !== undefined && step >= h.tgtStep && step - h.tgtStep < 1) {
      if (!h.tgtId) return null;
      const cached = state.zombies.find(z => z.id === h.tgtId && z.alive);
      if (cached && edgeDist(h, cached) <= ZG.Stats.range(state, h)) return cached;
    }
    const result = pickHumanTargetUncached(state, h);
    h.tgtId = result ? result.id : 0;
    h.tgtStep = step;
    return result;
  }

  function pickHumanTargetUncached(state, h) {
    if (h.classId === 'samurai' || h.heroId === 'samurai') {
      const list = zombiesInRange(state, h, 180);
      if (!list.length) return null;
      list.sort((a, b) => {
        const pa = (a.typeId === 'shield' || a.typeId === 'runner') ? 0 : 1;
        const pb = (b.typeId === 'shield' || b.typeId === 'runner') ? 0 : 1;
        return pa - pb || edgeDist(h, a) - edgeDist(h, b);
      });
      return list[0];
    }

    const range = ZG.Stats.range(state, h);
    const list = zombiesInRange(state, h, range);
    if (!list.length) return null;

    const kind = h.attack.kind;
    // BOSS 进入射程时优先集火，避免被杂兵拖死
    const boss = list.find(z => z.isBoss);
    if (boss && (kind === 'ranged' || kind === 'rocket')) return boss;
    if (kind === 'rocket') {
      const siege = list.filter(z => z.isSiege || z.isBoss);
      if (siege.length) return nearestByEdgeDist(h, siege);
      // 只对最近的一批候选做密度评估，避免大群时 O(n²)
      const near = nearestNByEdgeDist(h, list, 24);
      let best = near[0], bestCount = -1;
      for (const z of near) {
        let count = 0;
        for (const o of near) {
          if (ZG.Geom.dist2(z.x, z.y, o.x, o.y) <= 60 * 60) count++;
        }
        if (count > bestCount) { bestCount = count; best = z; }
      }
      return best;
    }

    if (kind === 'shotgun' || kind === 'flame') {
      const near = nearestNByEdgeDist(h, list, 24);
      let best = near[0], bestCount = -1;
      for (const z of near) {
        let count = 0;
        for (const o of near) {
          if (ZG.Geom.dist2(z.x, z.y, o.x, o.y) <= 70 * 70) count++;
        }
        if (count > bestCount) { bestCount = count; best = z; }
      }
      return best;
    }

    return nearestByEdgeDist(h, list);
  }

  function performHumanAttack(state, h, target) {
    const ok = performHumanAttackRaw(state, h, target);
    if (ok && ZG.Skills) ZG.Skills.onAttack(state, h, target);
    return ok;
  }

  function performHumanAttackRaw(state, h, target) {
    const st = ZG.Stats.human(state, h);
    const passives = ZG.Tech.mods(state).classPassives;
    const a = h.attack;
    faceToward(h, target.x, target.y);
    h.muzzleT = 0.07;

    switch (a.kind) {
      case 'ranged': {
        if (a.warmup && h.warmup > 0) return false;
        if (a.ammo) {
          if (h.reloadT > 0) return false;
          if (h.ammo <= 0) { h.reloadT = a.reload; h.ammo = 0; return false; }
          h.ammo--;
          if (h.ammo <= 0) h.reloadT = a.reload;
        }
        const pellets = a.pellets || 1;
        for (let i = 0; i < pellets; i++) {
          if (!target.alive) break;
          const spread = a.spread || 0;
          const ang = h.facing + (spread ? (state.rng.jitter.next() - 0.5) * spread : 0);
          let hit = spread ? pickAlongRay(state, h, ang, st.range) || target : target;
          const inter = ZG.Combat.interceptRay(state, h.x, h.y, hit.x, hit.y,
            { excludeId: hit.id });
          if (inter) hit = inter;
          ZG.Combat.applyDamage(state, {
            target: hit, amount: st.damage, damageKind: a.damageKind,
            fromX: h.x, fromY: h.y, sourceIsHuman: true
          });
          ZG.Projectiles.tracer(state, h.x, h.y, hit.x, hit.y,
            hit.kind === 'zombie' ? '#FFE082' : '#BFE6FF');
        }
        return true;
      }
      case 'shotgun': {
        const targets = zombiesInRange(state, h, st.range).filter(z =>
          ZG.Geom.inCone(h.x, h.y, h.facing, z.x, z.y, st.range, (a.coneDeg || 42) / 2));
        targets.sort((p, q) => edgeDist(h, p) - edgeDist(h, q));
        const n = a.pellets || 5;
        for (let i = 0; i < n; i++) {
          const z = targets.length ? targets[i % targets.length] : target;
          if (!z || !z.alive) continue;
          const inter = ZG.Combat.interceptRay(state, h.x, h.y, z.x, z.y,
            { excludeId: z.id });
          const hit = inter || z;
          const d = ZG.Geom.dist(h.x, h.y, hit.x, hit.y);
          let dmg = d > a.falloffStart ? st.damage * a.falloffMul : st.damage;
          if (passives.shotgun && d <= passives.shotgun.range) dmg *= passives.shotgun.dmgMul;
          ZG.Combat.applyDamage(state, {
            target: hit, amount: dmg, damageKind: a.damageKind,
            fromX: h.x, fromY: h.y, sourceIsHuman: true
          });
          ZG.Projectiles.tracer(state, h.x, h.y,
            hit.x + (state.rng.jitter.next() - 0.5) * 18,
            hit.y + (state.rng.jitter.next() - 0.5) * 18, '#FFCC80');
        }
        return true;
      }
      case 'flame': {
        const list = zombiesInRange(state, h, st.range).filter(z =>
          ZG.Geom.inCone(h.x, h.y, h.facing, z.x, z.y, st.range, (a.coneDeg || 50) / 2));
        for (const z of list) {
          ZG.Combat.applyDamage(state, {
            target: z, amount: st.damage, damageKind: D.FIRE,
            fromX: h.x, fromY: h.y, sourceIsHuman: true
          });
          z.burnT = passives.flame ? passives.flame.burnTime : (a.burnTime || 3);
          z.burnDps = (a.burnDps || 5) * (passives.flame ? passives.flame.burnMul : 1);
          z.burnFromX = h.x;
          z.burnFromY = h.y;
        }
        h.flameT = 0.16;
        if (state.effects.length < 250) {
          state.effects.push({
            kind: 'flame', x1: h.x, y1: h.y, facing: h.facing,
            range: st.range, coneDeg: a.coneDeg || 50, life: 0.16, maxLife: 0.16
          });
        }
        return list.length > 0;
      }
      case 'rocket': {
        const interceptor = ZG.Combat.interceptRay(state, h.x, h.y, target.x, target.y,
          { excludeId: target.id, pad: 6 });
        const aim = interceptor || target;
        let dmg = st.damage;
        if (passives.rocket && (aim.isBoss || aim.isSiege)) dmg *= passives.rocket.bossSiegeMul;
        ZG.Projectiles.spawn(state, {
          typeId: 'rocket', x: h.x, y: h.y, tx: aim.x, ty: aim.y,
          speed: a.speed || 420, splash: a.splash || 60, damage: dmg,
          damageKind: D.EXPLOSION,
          ownerId: h.id, color: '#CE93D8',
          targetId: aim.id, directTargetId: aim.id,
          siegeBonus: a.siegeBonus || 1, splashMul: 0.5
        });
        if (h.rocketDouble > 0) {
          h.rocketDouble = 0;
          let second = null, bestD = Infinity;
          for (const z of state.zombies) {
            if (!z.alive || z.id === aim.id) continue;
            const d = ZG.Geom.dist2(h.x, h.y, z.x, z.y);
            if (d < bestD) { bestD = d; second = z; }
          }
          second = second || aim;
          if (second) {
            ZG.Projectiles.spawn(state, {
              typeId: 'rocket', x: h.x, y: h.y, tx: second.x, ty: second.y,
              speed: a.speed || 420, splash: a.splash || 60, damage: dmg,
              damageKind: D.EXPLOSION,
              ownerId: h.id, color: '#CE93D8',
              targetId: second.id, directTargetId: second.id,
              siegeBonus: a.siegeBonus || 1, splashMul: 0.5
            });
          }
        }
        return true;
      }
      case 'vial': {
        const interceptor = ZG.Combat.interceptRay(state, h.x, h.y, target.x, target.y,
          { excludeId: target.id, pad: 6 });
        const aim = interceptor || target;
        ZG.Projectiles.spawn(state, {
          typeId: 'vial', x: h.x, y: h.y, tx: aim.x, ty: aim.y,
          speed: a.speed || 380, splash: a.splash || 50, damage: st.damage,
          damageKind: D.EXPLOSION, ownerId: h.id, color: '#B39DDB',
          targetId: aim.id
        });
        return true;
      }
      case 'melee': {
        const range = st.range + (a.rangeBonusRadius ? target.radius : 0);
        if (ZG.Geom.dist(h.x, h.y, target.x, target.y) <= range) {
          ZG.Combat.applyDamage(state, {
            target, amount: st.damage, damageKind: D.MELEE,
            fromX: h.x, fromY: h.y, sourceIsHuman: true
          });
          return true;
        }
        return false;
      }
    }
    return false;
  }

  function pickAlongRay(state, h, ang, range) {
    const cx = h.x + Math.cos(ang) * range;
    const cy = h.y + Math.sin(ang) * range;
    let best = null, bestD = Infinity;
    for (const z of state.zombies) {
      if (!z.alive) continue;
      // 点到射线距离
      const dx = z.x - h.x, dy = z.y - h.y;
      const proj = dx * Math.cos(ang) + dy * Math.sin(ang);
      if (proj < 0 || proj > range) continue;
      const lat = Math.abs(-dx * Math.sin(ang) + dy * Math.cos(ang));
      if (lat <= z.radius + 4 && proj < bestD) { bestD = proj; best = z; }
    }
    return best;
  }

  function healLogic(state, h) {
    const isPlague = h.heroId === 'plague';
    const m = ZG.Tech.mods(state);
    const serumMul = 1 + 0.08 * m.hero.medicalRank;
    const rate = (isPlague ? 35 : (h.healRate || 20)) * serumMul;
    const range = isPlague ? 230 : (h.healRange || 160);
    let best = null, bestScore = -Infinity;

    const dispelReady = isPlague
      ? h.dispelCd <= 0
      : (h.serumLeft > 0 && h.serumCd <= 0);
    for (const u of state.humans) {
      if (!u.alive) continue;
      if (u === h) continue;
      if (ZG.Geom.dist(h.x, h.y, u.x, u.y) > range + u.radius) continue;
      // 满血且感染值还没到驱散线：治疗兵帮不上忙，别停在这里
      const canHelp = u.hp < u.maxHp - 0.01 ||
        (u.infection >= (isPlague ? 40 : 50) && dispelReady);
      if (!canHelp) continue;
      let score = (1 - u.hp / u.maxHp) * 100;
      if (u.infection > 0) score += u.infection * 1.2;
      if (score > bestScore) { bestScore = score; best = u; }
    }
    if (!best) return null;
    if (best.hp >= best.maxHp - 0.01 && best.infection <= 0) return null;

    if (!isPlague && best.infection >= 50 && h.serumLeft > 0 && h.serumCd <= 0) {
      ZG.Infection.dispel(state, best, h.serumAmount || 50);
      h.serumLeft--;
      h.serumCd = h.serumCdMax || 8;
      emitHeal(h, best);
      return best;
    }
    if (isPlague && best.infection >= 40 && h.dispelCd <= 0) {
      ZG.Infection.dispel(state, best, 80 * serumMul);
      h.dispelCd = 8;
      emitHeal(h, best);
      return best;
    }
    let amt = rate * STEP;
    const medicPassive = m.classPassives.medic;
    if (medicPassive && best.hp < best.maxHp * medicPassive.lowHpRatio) {
      amt *= medicPassive.healMul;
    }
    if (best.hp < best.maxHp) {
      ZG.Combat.heal(state, best, amt);
      h.healBeamT = 0.1;
    }
    return best;
  }

  function emitHeal(from, to) {
    from.healBeamT = 0.2;
    from.healTargetId = to.id;
  }

  function stepHeroAbilities(state, h, dt) {
    const m = ZG.Tech.mods(state);

    if (h.heroId === 'officer' && h.skillUses > 0 && h.skillCd <= 0) {
      const c = densestZombieCluster(state, h.x, h.y, 420);
      const bossNear = state.zombies.some(z => z.alive && z.isBoss &&
        ZG.Geom.dist(h.x, h.y, z.x, z.y) <= 460);
      if (c.count >= 8 || bossNear) {
        const target = bossNear
          ? (state.zombies.find(z => z.alive && z.isBoss) || c)
          : c;
        const volley = m.hero.officerUses;
        for (let i = 0; i < volley; i++) {
          const lock = ZG.MapZone.clamp(state.map,
            target.x + (i - (volley - 1) / 2) * 40,
            target.y + (i - (volley - 1) / 2) * 20, 0);
          if (state.effects.length < 250) {
            state.effects.push({
              kind: 'missile_lock', x: lock.x, y: lock.y, radius: 140,
              life: 0.9, maxLife: 0.9, delay: i * 0.4, color: '#FFD54F', seed: i
            });
          }
          ZG.Projectiles.spawn(state, {
            typeId: 'missile', x: h.x, y: h.y,
            tx: lock.x, ty: lock.y,
            speed: 900, splash: m.hero.officerRange, damage: 400, delay: i * 0.4,
            damageKind: D.EXPLOSION, ownerId: h.id, color: '#FFD54F'
          });
        }
        h.skillUses--;
        h.skillCd = m.hero.officerVolleyCd * m.skillCdMul;
        state.stats.missilesFired = (state.stats.missilesFired || 0) + volley;
        state.bus.emit('fx:ability', { kind: 'missiles', x: h.x, y: h.y, text: '导弹支援！' });
      } else {
        h.skillCd = 1;
      }
    }

    if (h.heroId === 'gatling' && h.skillCd <= 0) {
      const allies = state.humans.filter(u => u.alive &&
        ZG.Geom.dist2(u.x, u.y, h.x, h.y) <= 200 * 200);
      if (allies.length >= 4) {
        for (const u of allies) {
          u.inspireT = m.hero.gatlingDuration;
          u.inspireMul = m.hero.gatlingAttackSpeed;
        }
        if (m.hero.gatlingHeal > 0) {
          for (const u of allies) {
            ZG.Combat.heal(state, u, m.hero.gatlingHeal);
            ZG.Infection.dispel(state, u, m.hero.gatlingDispel);
          }
        }
        h.skillCd = m.hero.gatlingInterval * m.skillCdMul;
        if (state.effects.length < 250) {
          state.effects.push({
            kind: 'inspire', x: h.x, y: h.y, radius: 200,
            life: 0.8, maxLife: 0.8, color: '#FFD54F'
          });
        }
        state.bus.emit('fx:ability', { kind: 'inspire', x: h.x, y: h.y, text: '鼓舞！' });
      } else {
        h.skillCd = 1;
      }
    }

    if (h.heroId === 'plague' && h.skillCd <= 0) {
      const injured = state.humans.filter(u => u.alive &&
        ZG.Geom.dist2(u.x, u.y, h.x, h.y) <= 180 * 180 &&
        (u.hp < u.maxHp || u.infection > 0));
      if (injured.length >= 3) {
        const amount = 70 * (1 + 0.08 * m.hero.medicalRank);
        for (const u of injured) {
          ZG.Combat.heal(state, u, amount);
          ZG.Infection.dispel(state, u, 30);
        }
        h.skillCd = m.hero.plagueInterval * m.skillCdMul;
        if (state.effects.length < 250) {
          state.effects.push({
            kind: 'groupheal', x: h.x, y: h.y, radius: 180,
            life: 0.7, maxLife: 0.7, color: '#66BB6A'
          });
        }
        state.bus.emit('fx:ability', { kind: 'groupheal', x: h.x, y: h.y, text: '群体治疗' });
      } else {
        h.skillCd = 1;
      }
    }
  }

  function stepShield(state, h, dt) {
    const c = ZG.Data.humanAi.squad;
    const st = ZG.Stats.human(state, h);
    if (h.careTargetId && needsCare(state, h)) {
      h.aiState = 'heal'; h.moveX = 0; h.moveY = 0;
      return;
    }
    const slot = ZG.Squads.slotFor(state, h);
    const dSlot = ZG.Geom.dist(h.x, h.y, slot.x, slot.y);
    if (dSlot > c.arriveEps) {
      const speed = h.moveSpeed * (dSlot > c.catchUpDist ? c.catchUpMul : 1);
      moveHumanToward(state, h, slot.x, slot.y, speed, dt);
      h.aiState = 'advance';
    } else {
      h.moveX = 0; h.moveY = 0;
    }
    const z = nearestZombie(state, h.x, h.y, st.range + 40);
    if (z) {
      faceToward(h, z.x, z.y);
      const d = ZG.Geom.dist(h.x, h.y, z.x, z.y);
      if (h.cd <= 0 && d <= st.range + z.radius - 2) {
        ZG.Combat.applyDamage(state, {
          target: z, amount: st.damage, damageKind: D.MELEE,
          fromX: h.x, fromY: h.y, sourceIsHuman: true
        });
        h.cd = Math.max(-STEP, h.cd) + st.interval;
      }
      h.aiState = 'engage';
    } else if (dSlot <= c.arriveEps) {
      const squad = state.squads.find(s => s.id === h.squadId);
      if (squad) h.facing = squad.faceAngle;
      h.aiState = 'hold';
    }
  }

  function stepMedic(state, h, dt) {
    const healed = healLogic(state, h);
    stepHeroAbilities(state, h, dt);
    // 有范围内伤员时停下治疗
    if (healed) {
      h.aiState = 'heal';
      h.moveX = 0; h.moveY = 0;
      return;
    }

    if (!h.careTargetId) {
      const patient = findPatient(state, h);
      if (patient) {
        const stop = healRangeOf(h) * HAI.medicStopRatio;
        const d = ZG.Geom.dist(h.x, h.y, patient.x, patient.y);
        if (d > stop) {
          moveHumanToward(state, h, patient.x, patient.y, h.moveSpeed, dt);
          h.aiState = 'assist';
          return;
        }
      }
    }

    // 没有伤员时自卫射击
    const target = pickHumanTarget(state, h);
    if (target) {
      faceToward(h, target.x, target.y);
      if (h.cd <= 0) {
        const did = performHumanAttack(state, h, target);
        if (did) h.cd = Math.max(-STEP, h.cd) + ZG.Stats.human(state, h).interval;
      }
      h.aiState = h.careTargetId ? 'heal' : 'engage';
      return;
    }

    if (h.careTargetId) { h.aiState = 'heal'; h.moveX = 0; h.moveY = 0; return; }
    const c = ZG.Data.humanAi.squad;
    const slot = ZG.Squads.slotFor(state, h);
    const dSlot = ZG.Geom.dist(h.x, h.y, slot.x, slot.y);
    if (dSlot > c.arriveEps) {
      const speed = h.moveSpeed * (dSlot > c.catchUpDist ? c.catchUpMul : 1);
      moveHumanToward(state, h, slot.x, slot.y, speed, dt);
      h.aiState = 'advance';
    } else {
      h.moveX = 0; h.moveY = 0;
      h.aiState = 'hold';
    }
  }

  function stepFighter(state, h, dt) {
    const c = ZG.Data.humanAi.squad;
    const slot = ZG.Squads.slotFor(state, h);
    let moved = false;
    if (!h.careTargetId) {
      const d = ZG.Geom.dist(h.x, h.y, slot.x, slot.y);
      if (d > c.arriveEps) {
        const speed = h.moveSpeed * (d > c.catchUpDist ? c.catchUpMul : 1);
        moved = moveHumanToward(state, h, slot.x, slot.y, speed, dt);
        h.aiState = 'advance';
      } else {
        h.moveX = 0; h.moveY = 0;
        h.aiState = 'hold';
      }
    }
    const target = pickHumanTarget(state, h);
    if (target) {
      faceToward(h, target.x, target.y);
      if (h.cd <= 0 && target.alive) {
        const did = performHumanAttack(state, h, target);
        if (did) {
          h.cd = Math.max(-STEP, h.cd) + ZG.Stats.human(state, h).interval;
          if (h.heroId === 'samurai' && h.attack.kind === 'melee') {
            ZG.Skills.onSamuraiAttack(state, h);
          }
        }
      }
      h.aiState = moved ? 'advance' : 'engage';
      return;
    }
    if (!moved && !h.careTargetId) {
      const squad = state.squads.find(s => s.id === h.squadId);
      if (squad) h.facing = squad.faceAngle;
    }
  }

  function stepCivilian(state, h, dt) {
    let fx = 0, fy = 0, threat = false;
    for (const z of state.zombies) {
      if (!z.alive) continue;
      const dx = h.x - z.x, dy = h.y - z.y;
      const d = Math.hypot(dx, dy);
      const r = HAI.civilianFleeRadius + z.radius;
      if (d > r || d < 1e-6) continue;
      const w = (r - d) / r;
      fx += (dx / d) * w;
      fy += (dy / d) * w;
      threat = true;
    }
    if (threat) {
      const center = ZG.Geom.humanCentroid(state) || { x: ZG.Const.W / 2, y: ZG.Const.H / 2 };
      const dc = ZG.Geom.dist(h.x, h.y, center.x, center.y) || 1;
      fx += ((center.x - h.x) / dc) * 0.8;
      fy += ((center.y - h.y) / dc) * 0.8;
      if (Math.hypot(fx, fy) < 1e-6) {
        fx = h.x - center.x;
        fy = h.y - center.y;
      }
      moveHumanDir(state, h, fx, fy, h.moveSpeed * HAI.civilianFleeSpeedMul * dt);
      h.aiState = 'flee';
      return;
    }

    if (stepCare(state, h, dt)) return;
    if (h.careTargetId) { h.aiState = 'heal'; h.moveX = 0; h.moveY = 0; return; }
    const c = ZG.Data.humanAi.squad;
    const slot = ZG.Squads.slotFor(state, h);
    const dSlot = ZG.Geom.dist(h.x, h.y, slot.x, slot.y);
    if (dSlot > c.arriveEps) {
      moveHumanToward(state, h, slot.x, slot.y, h.moveSpeed, dt);
      h.aiState = 'advance';
    } else {
      h.moveX = 0; h.moveY = 0;
      h.aiState = 'hold';
    }
  }

  // 人类之间做轻微分离，避免全部挤在同一个目标/医疗点
  function separateHumans(state) {
    const list = state.humans;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (!b.alive) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        const min = a.radius + b.radius + HAI.separationGap;
        if (d2 >= min * min || d2 < 1e-12) continue;
        const d = Math.sqrt(d2);
        const push = (min - d) * HAI.separationPush;
        const ux = dx / d, uy = dy / d;

        const ax = a.x - ux * push, ay = a.y - uy * push;
        if (!blockedAt(state, ax, ay, a.radius)) { a.x = ax; a.y = ay; }

        const bx = b.x + ux * push, by = b.y + uy * push;
        if (!blockedAt(state, bx, by, b.radius)) { b.x = bx; b.y = by; }
      }
    }
    // 推挤仍可能把边缘单位挤到活动区外，最后统一投影回最近合法点
    if (ZG.MapZone.has(state.map)) {
      for (const u of list) {
        if (!u.alive) continue;
        const p = ZG.MapZone.clamp(state.map, u.x, u.y, u.radius);
        u.x = p.x; u.y = p.y;
      }
    }
  }

  function stepHumans(state) {
    const dt = STEP;
    const chargers = collectChargers(state);

    let dirty = false;
    for (const h of state.humans) {
      if (h.squadDirty) { dirty = true; h.squadDirty = false; }
    }
    if (dirty) ZG.Squads.markDirty(state);
    ZG.Squads.update(state);

    for (const h of state.humans.slice()) {
      if (!h.alive) continue;

      if (h.cd > 0) h.cd -= dt;
      if (h.serumCd > 0) h.serumCd -= dt;
      if (h.dispelCd > 0) h.dispelCd -= dt;
      if (h.dodgeCd > 0) h.dodgeCd -= dt;
      if (h.reloadT > 0) {
        h.reloadT -= dt;
        if (h.reloadT <= 0) {
          h.reloadT = 0;
          if (h.attack && h.attack.ammo) h.ammo = h.attack.ammo;
        }
      }
      if (h.warmup > 0) h.warmup -= dt;
      if (h.muzzleT > 0) h.muzzleT -= dt;
      if (h.flameT > 0) h.flameT -= dt;
      if (h.healBeamT > 0) h.healBeamT -= dt;

      tryStartDodge(h, chargers);
      if (stepDodge(state, h, dt)) {
        if (h.careTargetId) h.aiState = 'heal';
        continue;
      }

      ZG.Skills.stepHuman(state, h, dt);

      if (h.classId === 'civilian') {
        stepCivilian(state, h, dt);
        continue;
      }

      if (stepCare(state, h, dt)) continue;

      if (isMedicClass(h)) {
        stepMedic(state, h, dt);
      } else if (h.classId === 'shield' && !h.shieldBroken) {
        stepHeroAbilities(state, h, dt);
        stepShield(state, h, dt);
      } else {
        stepHeroAbilities(state, h, dt);
        stepFighter(state, h, dt);
      }

      if (h.careTargetId && h.aiState !== 'dodge') h.aiState = 'heal';
    }

    separateHumans(state);
  }

  /* ---------------- 僵尸 ---------------- */

  function usesFlowField(z) {
    return !(z.typeId === 'runner' || z.typeId === 'boomer' || z.typeId === 'shield');
  }

  // 一次扫描同时得到：最近人类 / 90 内最近盾兵 / 260 内最近非盾人类
  function humanScan(state, x, y) {
    let nearest = null, nd = Infinity;
    let shield = null, sd = 90 * 90;
    let nonShield = null, pd = 260 * 260;
    for (const h of state.humans) {
      if (!h.alive) continue;
      const d = ZG.Geom.dist2(x, y, h.x, h.y);
      if (d < nd || (d === nd && nearest && h.id < nearest.id)) { nd = d; nearest = h; }
      if (h.classId === 'shield') {
        if (d < sd || (d === sd && shield && h.id < shield.id)) { sd = d; shield = h; }
      } else if (d < pd || (d === pd && nonShield && h.id < nonShield.id)) {
        pd = d; nonShield = h;
      }
    }
    return { nearest, shield, nonShield };
  }

  function pickZombieTarget(state, z) {
    if (z.tauntT > 0) {
      const t = state.humans.find(u => u.alive && u.id === z.tauntTargetId);
      if (t) return { kind: 'human', target: t };
    }

    const zd = z.isBoss ? (ZG.Data.zombies[z.typeId] || {}).boss : null;
    // 裂爪：260 内优先非盾人类，绕过后排盾线
    if (zd && zd.kind === 'ripper') {
      const scan = humanScan(state, z.x, z.y);
      if (scan.nonShield) return { kind: 'human', target: scan.nonShield };
      if (scan.nearest) return { kind: 'human', target: scan.nearest };
      const c = ZG.Geom.humanCentroid(state) || { x: ZG.Const.W / 2, y: ZG.Const.H / 2 };
      return { kind: 'point', x: c.x, y: c.y, count: 0, target: null };
    }

    if (z.typeId === 'boomer' || z.isBoss) {
      const p = densestHumanPoint(state);
      return { kind: 'point', x: p.x, y: p.y, count: p.count, target: null };
    }

    const scan = humanScan(state, z.x, z.y);

    // 盾尸：始终扑向人类，主动顶到最前
    if (z.typeId === 'shield' && scan.nearest) {
      return { kind: 'human', target: scan.nearest };
    }

    // 狂尸：260px 内优先非盾人类，绕过盾线
    if (z.typeId === 'runner' && scan.nonShield) {
      return { kind: 'human', target: scan.nonShield };
    }

    if (scan.shield) return { kind: 'human', target: scan.shield };

    if (z.isSiege) {
      const b = nearestBuilding(state, z.x, z.y, 220);
      if (b) return { kind: 'building', target: b };
    }

    if (scan.nearest) return { kind: 'human', target: scan.nearest };

    const c = ZG.Geom.humanCentroid(state) || { x: ZG.Const.W / 2, y: ZG.Const.H / 2 };
    return { kind: 'point', x: c.x, y: c.y, count: 0, target: null };
  }

  function computeSlow(state, z) {
    let m = z.permSlow || 0;
    for (const b of state.buildings) {
      if (!b.alive) continue;
      const data = ZG.Data.buildings[b.typeId];
      if (!data.slow) continue;
      const d2 = ZG.Geom.dist2(z.x, z.y, b.x, b.y);
      const r = data.slow.radius + z.radius;
      if (d2 <= r * r) m = Math.max(m, data.slow.amount);
    }
    return m;
  }

  function pushOutRect(z, nx, ny, x, y, w, h) {
    const px = Math.max(x, Math.min(x + w, nx));
    const py = Math.max(y, Math.min(y + h, ny));
    const dx = nx - px, dy = ny - py;
    const d = Math.hypot(dx, dy);
    if (d > 1e-9) {
      if (d < z.radius) {
        nx = px + (dx / d) * (z.radius + 1);
        ny = py + (dy / d) * (z.radius + 1);
      }
    } else {
      const left = nx - x, right = x + w - nx;
      const top = ny - y, bottom = y + h - ny;
      const m = Math.min(left, right, top, bottom);
      if (m === left) nx = x - z.radius - 1;
      else if (m === right) nx = x + w + z.radius + 1;
      else if (m === top) ny = y - z.radius - 1;
      else ny = y + h + z.radius + 1;
    }
    return { x: nx, y: ny };
  }

  function moveZombie(state, z, tx, ty, speed, dt) {
    const dx = tx - z.x, dy = ty - z.y;
    const d = Math.hypot(dx, dy) || 1;
    const move = speed * dt;
    let nx = z.x + (dx / d) * move;
    let ny = z.y + (dy / d) * move;
    // 障碍物/建筑推离
    if (state.map && state.map.obstacles) {
      for (const ob of state.map.obstacles) {
        if (ob.kind === 'rect') {
          const p = pushOutRect(z, nx, ny, ob.x, ob.y, ob.w, ob.h);
          nx = p.x; ny = p.y;
          continue;
        }
        const dd = ZG.Geom.dist(nx, ny, ob.x, ob.y);
        if (dd < ob.r + z.radius) {
          const a = Math.atan2(ny - ob.y, nx - ob.x);
          nx = ob.x + Math.cos(a) * (ob.r + z.radius + 1);
          ny = ob.y + Math.sin(a) * (ob.r + z.radius + 1);
        }
      }
    }
    for (const b of state.buildings) {
      if (!b.alive) continue;
      const data = ZG.Data.buildings[b.typeId];
      if (data && data.blocks === false) continue;
      if (b.shape === 'rect') {
        const r = ZG.Geom.rectOfBuilding(b);
        const p = pushOutRect(z, nx, ny, r.x, r.y, r.w, r.h);
        nx = p.x; ny = p.y;
      } else {
        const dd = ZG.Geom.dist(nx, ny, b.x, b.y);
        const rr = (b.radius || 24) + z.radius;
        if (dd < rr) {
          const a = Math.atan2(ny - b.y, nx - b.x);
          nx = b.x + Math.cos(a) * (rr + 1);
          ny = b.y + Math.sin(a) * (rr + 1);
        }
      }
    }
    if (ZG.MapZone.has(state.map)) {
      const p = ZG.MapZone.clamp(state.map, nx, ny, z.radius);
      z.x = p.x; z.y = p.y;
    } else {
      const M = ZG.Const.SPAWN_WORLD_MARGIN;
      z.x = Math.max(-M, Math.min(ZG.Const.W + M, nx));
      z.y = Math.max(-M, Math.min(ZG.Const.H + M, ny));
    }
    z.facing = Math.atan2(dy, dx);
  }

  function zombieAttackTarget(state, z, target, dt) {
    if (z.cd > 0) return false;
    const baseInterval = z.attackInterval || 1;
    if (target.kind === 'building') {
      ZG.Combat.zombieHit(state, z, target);
      z.cd = Math.max(-STEP, z.cd) + baseInterval;
      return true;
    }
    if (target.kind === 'human') {
      ZG.Combat.zombieHit(state, z, target);
      z.cd = Math.max(-STEP, z.cd) + baseInterval;
      return true;
    }
    return false;
  }

  /* ---------------- BOSS 行为 ---------------- */

  // 固定步长下 2.5 - 150/60 可能留下 1e-15 的正残差；统一吸收
  function tickDown(t, dt) {
    const v = t - dt;
    return v > 1e-9 ? v : 0;
  }

  // 按 chance 累加抽取弹种；roll 由调用方提供以便测试
  function pickSpitKind(kinds, roll) {
    let r = roll;
    for (const k of kinds) {
      r -= k.chance;
      if (r < 0) return k;
    }
    return kinds[kinds.length - 1];
  }

  // 腐吐者距离带：太远接近、带内停步、太近后撤
  function spitterIntent(dist, spit) {
    if (dist < spit.retreatRange) return 'retreat';
    if (dist > spit.stopRange) return 'approach';
    return 'hold';
  }

  function stepBossTank(state, z, dt, bd) {
    const rock = bd.rock;
    if (z.rockCd > 0) z.rockCd = tickDown(z.rockCd, dt);
    if (z.stompCd > 0) z.stompCd = tickDown(z.stompCd, dt);

    if (z.rockCd <= 0) {
      const p = densestHumanPoint(state);
      ZG.Projectiles.spawn(state, {
        typeId: 'rock', x: p.x, y: p.y, tx: p.x, ty: p.y,
        radius: rock.radius, splash: rock.radius,
        damage: ZG.Balance.bossSkillDamage(rock.damageBase, rock.damageGrowth, state.round),
        warnT: rock.warn, infection: rock.infection,
        hitsHumans: true, ownerId: z.id, color: '#EF5350'
      });
      z.rockCd = rock.interval;
    }

    if (z.stompCd <= 0) {
      const stomp = bd.stomp;
      const near = state.humans.some(h => h.alive &&
        ZG.Geom.dist(z.x, z.y, h.x, h.y) <= stomp.radius + h.radius);
      if (near) {
        for (const h of state.humans.slice()) {
          if (!h.alive) continue;
          if (ZG.Geom.dist(z.x, z.y, h.x, h.y) <= stomp.radius + h.radius) {
            ZG.Combat.applyDamage(state, {
              target: h, amount: stomp.damage, damageKind: D.MELEE,
              fromX: z.x, fromY: z.y
            });
          }
        }
        z.stompCd = stomp.interval;
        state.bus.emit('fx:stomp', { x: z.x, y: z.y, radius: stomp.radius });
      }
    }
  }

  // 返回 true 表示本 tick 由状态机接管，跳过通用移动/攻击
  function stepBossRipper(state, z, dt, speed, bd) {
    const d = bd.dash;
    if (z.staggerT > 0) {
      z.staggerT = tickDown(z.staggerT, dt);
      return true;
    }
    if (z.dashWindupT > 0) {
      z.dashWindupT = tickDown(z.dashWindupT, dt);
      if (z.dashWindupT <= 0) {
        z.dashT = d.duration;
        z.dashHitIds = [];
        const a = Math.atan2(z.dashToY - z.y, z.dashToX - z.x);
        z.dashDirX = Math.cos(a);
        z.dashDirY = Math.sin(a);
        z.facing = a;
        state.bus.emit('fx:dash', {
          x: z.x, y: z.y,
          x2: z.x + z.dashDirX * 400, y2: z.y + z.dashDirY * 400
        });
      }
      return true;
    }
    if (z.dashT > 0) {
      z.dashT = tickDown(z.dashT, dt);
      moveZombie(state, z, z.x + z.dashDirX * 400, z.y + z.dashDirY * 400,
        d.speed * (1 - z.slowFactor), dt);
      for (const h of state.humans) {
        if (!h.alive || z.dashHitIds.indexOf(h.id) >= 0) continue;
        if (ZG.Geom.dist(z.x, z.y, h.x, h.y) > z.radius + h.radius + d.hitRadius) continue;
        z.dashHitIds.push(h.id);
        ZG.Combat.applyDamage(state, {
          target: h,
          amount: ZG.Balance.bossSkillDamage(d.damageBase, d.damageGrowth, state.round),
          damageKind: D.MELEE, fromX: z.x, fromY: z.y
        });
      }
      if (z.dashT <= 0) {
        z.staggerT = d.stagger;
        z.dashCd = d.cooldown;
      }
      return true;
    }

    if (z.dashCd > 0) z.dashCd = tickDown(z.dashCd, dt);
    const t = nearestHuman(state, z.x, z.y, d.maxRange);
    if (z.dashCd <= 0 && t) {
      const dist = ZG.Geom.dist(z.x, z.y, t.x, t.y);
      if (dist >= d.minRange && dist <= d.maxRange) {
        const dest = ZG.MapZone.clamp(state.map, t.x, t.y, z.radius);
        z.dashWindupT = d.windup;
        z.dashToX = dest.x;
        z.dashToY = dest.y;
        z.facing = Math.atan2(dest.y - z.y, dest.x - z.x);
        state.effects.push({
          kind: 'dash_warn', x1: z.x, y1: z.y, x2: dest.x, y2: dest.y,
          life: d.windup, maxLife: d.windup
        });
        return true;
      }
    }
    return false;
  }

  function fireSpit(state, z, bd) {
    const k = z.nextBullet;
    const t = state.humans.find(h => h.alive && h.id === z.spitTargetId);
    if (!k || !t) { z.spitCd = bd.interval; return; }
    const poison = k.id === 'poison' && k.dot ? {
      dps: ZG.Balance.bossSkillDamage(k.dot.dpsBase, k.dot.dpsGrowth, state.round),
      duration: k.dot.duration
    } : null;
    ZG.Projectiles.spawn(state, {
      typeId: 'spit', spitKind: k.id,
      x: z.x, y: z.y, tx: t.x, ty: t.y,
      targetId: t.id, speed: k.speed, life: 4,
      radius: k.radius, splash: k.splash,
      damage: ZG.Balance.bossSkillDamage(k.damageBase, k.damageGrowth, state.round),
      splashMul: k.splashMul, poison,
      damageKind: k.id === 'poison' ? D.POISON : D.RANGED,
      hitsHumans: true, ownerId: z.id, color: k.color
    });
    z.spitCd = bd.interval;
    state.bus.emit('fx:spit', { x: z.x, y: z.y, kind: k.id });
  }

  function stepBossSpitter(state, z, dt, speed, bd) {
    if (z.spitCd > 0) z.spitCd = tickDown(z.spitCd, dt);
    if (z.spitWindupT > 0) {
      z.spitWindupT = tickDown(z.spitWindupT, dt);
      if (z.spitWindupT <= 0) fireSpit(state, z, bd);
      return;
    }
    const t = nearestHuman(state, z.x, z.y, bd.range + 60);
    if (!t) {
      const p = densestHumanPoint(state);
      moveZombie(state, z, p.x, p.y, speed, dt);
      return;
    }
    z.facing = Math.atan2(t.y - z.y, t.x - z.x);
    const dist = ZG.Geom.dist(z.x, z.y, t.x, t.y);
    const intent = spitterIntent(dist, bd);
    if (intent === 'retreat') {
      const a = Math.atan2(z.y - t.y, z.x - t.x);
      moveZombie(state, z, z.x + Math.cos(a) * 200, z.y + Math.sin(a) * 200, speed, dt);
    } else if (intent === 'approach') {
      moveZombie(state, z, t.x, t.y, speed, dt);
    }
    if (z.spitCd <= 0 && dist <= bd.range) {
      z.spitWindupT = bd.windup;
      z.nextBullet = pickSpitKind(bd.bullets, state.rng.jitter.next());
      z.spitTargetId = t.id;
    }
  }

  function stepBossBrood(state, z, dt, bd) {
    const s = bd.summon;
    if (z.summonWindupT > 0) {
      z.summonWindupT = tickDown(z.summonWindupT, dt);
      if (z.summonWindupT <= 0) {
        const alive = state.zombies.filter(o => o.alive && o.typeId === s.type).length;
        const room = ZG.Spawner.zombieCap(state) -
          state.zombies.filter(o => o.alive).length;
        const n = Math.max(0, Math.min(s.count, s.maxAlive - alive,
          s.waveCap - (state.battle.babyCount || 0), room));
        for (let i = 0; i < n; i++) {
          const a = state.rng.spawn.next() * Math.PI * 2;
          const rr = s.radiusMin + state.rng.spawn.next() * (s.radiusMax - s.radiusMin);
          const bx = z.x + Math.cos(a) * rr;
          const by = z.y + Math.sin(a) * rr;
          const bd2 = ZG.Data.zombies[s.type] || {};
          const br = bd2.radius || 7;
          const p = ZG.MapZone.clamp(state.map, bx, by, br);
          const b = ZG.State.spawnZombie(state, s.type, p.x, p.y);
          b.wave = z.wave;
          state.battle.babyCount = (state.battle.babyCount || 0) + 1;
        }
        z.summonCd = s.interval;
        state.bus.emit('fx:summon', { x: z.x, y: z.y, count: n });
      }
      return true;
    }
    if (z.summonCd > 0) { z.summonCd = tickDown(z.summonCd, dt); return false; }
    const alive = state.zombies.filter(o => o.alive && o.typeId === s.type).length;
    if (alive < s.maxAlive) {
      z.summonWindupT = s.windup;
      state.effects.push({
        kind: 'summon', x: z.x, y: z.y, life: s.windup, maxLife: s.windup
      });
      return true;
    }
    z.summonCd = s.interval;
    return false;
  }

  function applyBroodAuras(state) {
    for (const z of state.zombies) {
      if (!z.alive) continue;
      z.buffSpeed = 1;
      z.buffDamage = 1;
    }
    for (const b of state.zombies) {
      if (!b.alive || !b.isBoss) continue;
      const bd = (ZG.Data.zombies[b.typeId] || {}).boss;
      if (!bd || !bd.aura) continue;
      const r2 = bd.aura.radius * bd.aura.radius;
      for (const o of state.zombies) {
        if (!o.alive || o.isBoss) continue;
        if (ZG.Geom.dist2(o.x, o.y, b.x, b.y) > r2) continue;
        o.buffSpeed = Math.max(o.buffSpeed, bd.aura.speedMul);
        o.buffDamage = Math.max(o.buffDamage, bd.aura.damageMul);
      }
    }
  }

  function stepZombies(state) {
    const dt = STEP;
    applyBroodAuras(state);

    // 盾尸 vanguard：预计算每只僵尸到最近人类的距离，避免循环内重复全扫
    let humanDistOf = null;
    let minHumanDist = Infinity;
    if (state.zombies.some(z => z.alive && z.typeId === 'shield')) {
      humanDistOf = new Map();
      for (const z of state.zombies) {
        if (!z.alive) continue;
        const h = nearestHuman(state, z.x, z.y, 4000);
        const d = h ? ZG.Geom.dist(z.x, z.y, h.x, h.y) : Infinity;
        humanDistOf.set(z.id, d);
        if (d < minHumanDist) minHumanDist = d;
      }
    }

    for (const z of state.zombies.slice()) {
      if (!z.alive) continue;
      if (z.cd > 0) z.cd -= dt;
      if (z.flashT > 0) z.flashT -= dt;
      if (z.tauntT > 0) z.tauntT -= dt;
      if (z.stunT > 0) {
        z.stunT -= dt;
        continue;
      }

      z.slowFactor = computeSlow(state, z);
      const st = ZG.Stats.zombie(state, z);
      let speed = st.speed;
      let attacking = false;

      // 盾尸主动顶前：还没成为最接近人类的僵尸时加速
      if (z.typeId === 'shield' && humanDistOf) {
        const zd = ZG.Data.zombies.shield;
        if (zd.vanguard) {
          const myD = humanDistOf.get(z.id);
          if (isFinite(myD) && myD > minHumanDist + zd.vanguardLeadGap) {
            speed *= zd.vanguardSpeedMul;
          }
        }
      }

      // 狂尸冲刺
      if (z.typeId === 'runner') {
        z.sprintTimer += dt;
        if (!z.sprinting && z.sprintTimer >= 4) {
          z.sprinting = true;
          z.sprintT = 0.8;
          z.sprintTimer = 0;
        }
        if (z.sprinting) {
          z.sprintT -= dt;
          speed = Math.max(speed, 150 * (z.speedScale || 1) * (1 - z.slowFactor));
          if (z.sprintT <= 0) z.sprinting = false;
        }
      }

      // BOSS 行为分派
      if (z.isBoss) {
        const bd = (ZG.Data.zombies[z.typeId] || {}).boss;
        if (bd && bd.kind === 'tank') {
          stepBossTank(state, z, dt, bd);
        } else if (bd && bd.kind === 'ripper') {
          if (stepBossRipper(state, z, dt, speed, bd)) continue;
        } else if (bd && bd.kind === 'spitter') {
          stepBossSpitter(state, z, dt, speed, bd);
          continue;
        } else if (bd && bd.kind === 'brood') {
          if (stepBossBrood(state, z, dt, bd)) continue;
        }
      }

      // 爆尸
      if (z.typeId === 'boomer') {
        const p = densestHumanPoint(state);
        const d = state.humans.length ? Math.sqrt(ZG.Geom.dist2(z.x, z.y, p.x, p.y)) : 9999;
        const edge = d - (p.human ? p.human.radius : 0);
        if (!z.fuseArmed && (edge <= 35 || z.hp <= z.maxHp * 0.2)) {
          z.fuseArmed = true;
          z.fuseT = 0.8;
        }
        if (z.fuseArmed) {
          z.fuseT -= dt;
          if (z.fuseT <= 0) {
            z.alive = false;
            const i = state.zombies.indexOf(z);
            if (i >= 0) state.zombies.splice(i, 1);
            state.battle.killCount++;
            ZG.Projectiles.explode(state, z.x, z.y, 80, 70, D.EXPLOSION, {
              hitsHumans: true, hitsBuildings: false, infection: 100,
              color: '#E53935', kind: 'boomer'
            });
            state.bus.emit(ZG.Events.ZOMBIE_DIED, { zombie: z });
            continue;
          }
        }
        if (d > 20) moveZombie(state, z, p.x, p.y, speed, dt);
        continue;
      }

      const tgt = pickZombieTarget(state, z);
      let tx, ty;
      if (tgt.target) { tx = tgt.target.x; ty = tgt.target.y; }
      else { tx = tgt.x; ty = tgt.y; }

      let dist, targetRadius = 0;
      if (tgt.kind === 'building') {
        const b = tgt.target;
        if (b.shape === 'rect') {
          const r = ZG.Geom.rectOfBuilding(b);
          dist = ZG.Geom.distPointToRect(z.x, z.y, r.x, r.y, r.w, r.h);
        } else {
          dist = ZG.Geom.dist(z.x, z.y, b.x, b.y);
          targetRadius = b.radius || 24;
        }
      } else {
        dist = ZG.Geom.dist(z.x, z.y, tx, ty);
        targetRadius = tgt.target ? tgt.target.radius : 0;
      }
      const range = z.radius + targetRadius + (tgt.kind === 'building' ? 8 : 4);

      if (dist <= range) {
        z.facing = Math.atan2(ty - z.y, tx - z.x);
        if (tgt.target) attacking = zombieAttackTarget(state, z, tgt.target, dt);
      } else {
        // 远处沿流场，近处直追
        let nx = tx, ny = ty;
        if (usesFlowField(z) && dist > 340 && tgt.kind !== 'building') {
          const dir = ZG.Pathing.directionAt(state.pathing, z.x, z.y);
          nx = z.x + dir.x * 100;
          ny = z.y + dir.y * 100;
        }
        moveZombie(state, z, nx, ny, speed, dt);
      }

      // 反卡死
      const moved = ZG.Geom.dist2(z.x, z.y, z.lastX, z.lastY);
      if (moved > 16) {
        z.lastX = z.x; z.lastY = z.y; z.stuckT = 0;
      } else if (!attacking) {
        z.stuckT += dt;
        if (z.stuckT >= ZG.Const.STUCK_SEC) {
          const p = ZG.Pathing.nearestReachable(state.pathing, z.x, z.y);
          let nx = p.x, ny = p.y;
          if (ZG.Geom.dist2(nx, ny, z.x, z.y) < 4) {
            const dir = ZG.Pathing.directionAt(state.pathing, z.x, z.y);
            nx = Math.max(8, Math.min(ZG.Const.W - 8, p.x + dir.x * 64));
            ny = Math.max(8, Math.min(ZG.Const.H - 8, p.y + dir.y * 64));
          }
          z.x = nx; z.y = ny;
          z.lastX = nx; z.lastY = ny;
          z.stuckT = 0;
          state.bus.emit('fx:teleport', { x: nx, y: ny });
        }
      }
    }

    // 分离：每只僵尸最多取 8 个邻居
    for (const z of state.zombies) {
      if (!z.alive) continue;
      const near = ZG.Spatial.queryCircle(state.spatial, z.x, z.y, z.radius * 2 + 10,
        e => e.kind === 'zombie' && e.alive && e.id !== z.id);
      let n = 0;
      for (const o of near) {
        if (n++ >= 8) break;
        const dx = z.x - o.x, dy = z.y - o.y;
        const d2 = dx * dx + dy * dy;
        const rr = z.radius + o.radius;
        if (d2 >= rr * rr) continue;
        const d = Math.sqrt(d2) || 0.01;
        const overlap = rr - d;
        const push = Math.min(overlap * 0.5, 2.2);
        z.x += (dx / d) * push;
        z.y += (dy / d) * push;
      }
      if (ZG.MapZone.has(state.map)) {
        const p = ZG.MapZone.clamp(state.map, z.x, z.y, z.radius);
        z.x = p.x; z.y = p.y;
      } else {
        const M = ZG.Const.SPAWN_WORLD_MARGIN;
        z.x = Math.max(-M, Math.min(ZG.Const.W + M, z.x));
        z.y = Math.max(-M, Math.min(ZG.Const.H + M, z.y));
      }
    }
  }

  /* ---------------- 建筑 ---------------- */

  function stepBuildings(state) {
    const dt = STEP;
    for (const b of state.buildings) {
      if (!b.alive) continue;
      const data = ZG.Data.buildings[b.typeId];
      if (b.cd > 0) b.cd -= dt;

      if (b.typeId === 'turret') {
        if (b.cd <= 0) {
          const z = ZG.Spatial.queryNearest(state.spatial, b.x, b.y, data.attack.range,
            e => e.kind === 'zombie' && e.alive);
          if (z) {
            const inter = ZG.Combat.interceptRay(state, b.x, b.y, z.x, z.y,
              { excludeId: z.id });
            const hit = inter || z;
            ZG.Combat.applyDamage(state, {
              target: hit, amount: data.attack.damage,
              damageKind: D.RANGED, fromX: b.x, fromY: b.y, sourceIsHuman: true
            });
            ZG.Projectiles.tracer(state, b.x, b.y, hit.x, hit.y, '#B0BEC5');
            b.cd = data.attack.interval;
          }
        }
      } else if (b.typeId === 'hospital') {
        for (const h of state.humans) {
          if (!h.alive) continue;
          if (ZG.Geom.dist2(h.x, h.y, b.x, b.y) <= data.heal.radius * data.heal.radius) {
            if (h.hp < h.maxHp) {
              const medMul = 1 + 0.08 * ZG.Tech.mods(state).hero.medicalRank;
              ZG.Combat.heal(state, h, data.heal.rate * medMul * dt);
            }
            if (h.infection > 0) ZG.Infection.dispel(state, h, data.heal.infection * dt);
          }
        }
      } else if (b.typeId === 'mine') {
        if (b.charges > 0) {
          const z = ZG.Spatial.queryNearest(state.spatial, b.x, b.y, data.mine.radius,
            e => e.kind === 'zombie' && e.alive);
          if (z) {
            b.charges--;
            state.battle.minesTriggered = (state.battle.minesTriggered || 0) + 1;
            ZG.Projectiles.explode(state, b.x, b.y, data.mine.radius,
              ZG.Balance.mineDamage(state.round), D.EXPLOSION, {
                color: '#FFB74D', kind: 'mine'
              });
            state.bus.emit('fx:mine', { x: b.x, y: b.y, charges: b.charges });
          }
        }
      }
    }
  }

  function step(state) {
    stepZombies(state);
    stepHumans(state);
    stepBuildings(state);
  }

  ZG.AI = {
    step, stepHumans, stepZombies, stepBuildings,
    pickHumanTarget, pickZombieTarget, usesFlowField,
    densestHumanPoint, densestZombieCluster, nearestHuman,
    pickSpitKind, spitterIntent
  };
})();
