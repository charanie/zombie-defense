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

  function nearestBuilding(state, x, y, maxR) {
    return ZG.Spatial.queryNearest(state.spatial, x, y, maxR || 220,
      e => e.kind === 'building' && e.alive);
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
      const c = state.map ? ZG.Geom.deployCenter(state.map.deploy) : { x: 640, y: 600 };
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
    return ZG.Spatial.queryCircle(state.spatial, h.x, h.y, range + 34,
      e => e.kind === 'zombie' && e.alive).filter(z => edgeDist(h, z) <= range);
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
      const nx = Math.max(8, Math.min(ZG.Const.W - 8, h.x + vx * step));
      const ny = Math.max(8, Math.min(ZG.Const.H - 8, h.y + vy * step));
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

  function leashPoint(h, x, y) {
    const dx = x - h.homeX, dy = y - h.homeY;
    const d = Math.hypot(dx, dy);
    if (d <= h.huntRadius || d < 1e-6) return { x, y };
    return {
      x: h.homeX + (dx / d) * h.huntRadius,
      y: h.homeY + (dy / d) * h.huntRadius
    };
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

  function returnHome(state, h, dt) {
    const d = ZG.Geom.dist(h.x, h.y, h.homeX, h.homeY);
    if (d <= HAI.homeEpsilon) {
      h.moveX = 0; h.moveY = 0;
      h.aiState = 'guard';
      return;
    }
    h.aiState = 'return';
    moveHumanToward(state, h, h.homeX, h.homeY, h.moveSpeed * HAI.returnSpeedMul, dt);
  }

  /* ---------------- 人类 ---------------- */

  function pickHumanTarget(state, h) {
    if (!h.attack || h.classId === 'shield' || h.classId === 'civilian') return null;
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

    const st = ZG.Stats.human(state, h);
    const list = zombiesInRange(state, h, st.range);
    if (!list.length) return null;

    const kind = h.attack.kind;
    if (kind === 'rocket') {
      const siege = list.filter(z => z.isSiege || z.isBoss);
      if (siege.length) {
        siege.sort((a, b) => edgeDist(h, a) - edgeDist(h, b));
        return siege[0];
      }
      let best = list[0], bestCount = -1;
      for (const z of list) {
        let count = 0;
        for (const o of list) {
          if (ZG.Geom.dist2(z.x, z.y, o.x, o.y) <= 60 * 60) count++;
        }
        if (count > bestCount) { bestCount = count; best = z; }
      }
      return best;
    }

    if (kind === 'shotgun' || kind === 'flame') {
      let best = list[0], bestCount = -1;
      for (const z of list) {
        let count = 0;
        for (const o of list) {
          if (ZG.Geom.dist2(z.x, z.y, o.x, o.y) <= 70 * 70) count++;
        }
        if (count > bestCount) { bestCount = count; best = z; }
      }
      return best;
    }

    list.sort((a, b) => edgeDist(h, a) - edgeDist(h, b));
    return list[0];
  }

  function performHumanAttack(state, h, target) {
    const st = ZG.Stats.human(state, h);
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
          const hit = spread ? pickAlongRay(state, h, ang, st.range) || target : target;
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
          const d = ZG.Geom.dist(h.x, h.y, z.x, z.y);
          const dmg = d > a.falloffStart ? st.damage * a.falloffMul : st.damage;
          ZG.Combat.applyDamage(state, {
            target: z, amount: dmg, damageKind: a.damageKind,
            fromX: h.x, fromY: h.y, sourceIsHuman: true
          });
          ZG.Projectiles.tracer(state, h.x, h.y,
            z.x + (state.rng.jitter.next() - 0.5) * 18,
            z.y + (state.rng.jitter.next() - 0.5) * 18, '#FFCC80');
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
          z.burnT = 3;
          z.burnDps = a.burnDps || 5;
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
        const dmg = st.damage * ((target.isSiege || target.isBoss) ? (a.siegeBonus || 1) : 1);
        ZG.Projectiles.spawn(state, {
          typeId: 'rocket', x: h.x, y: h.y, tx: target.x, ty: target.y,
          speed: a.speed || 420, splash: a.splash || 60, damage: dmg,
          damageKind: D.EXPLOSION,
          ownerId: h.id, color: '#CE93D8'
        });
        return true;
      }
      case 'vial': {
        ZG.Projectiles.spawn(state, {
          typeId: 'vial', x: h.x, y: h.y, tx: target.x, ty: target.y,
          speed: a.speed || 380, splash: a.splash || 50, damage: st.damage,
          damageKind: D.EXPLOSION, ownerId: h.id, color: '#B39DDB',
          targetId: target.id
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
    const serumMul = ZG.Balance.techMul('serum', state.tech.serum);
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
      ZG.Infection.dispel(state, best, 80);
      h.dispelCd = 8;
      emitHeal(h, best);
      return best;
    }
    const amt = rate * STEP;
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
    const t = state.battle.time;

    if (h.heroId === 'officer' && !h.abilityUsed) {
      const c = densestZombieCluster(state, h.x, h.y, 420);
      const bossNear = state.zombies.some(z => z.alive && z.isBoss &&
        ZG.Geom.dist(h.x, h.y, z.x, z.y) <= 460);
      if (c.count >= 8 || bossNear) {
        h.abilityUsed = true;
        const target = bossNear
          ? (state.zombies.find(z => z.alive && z.isBoss) || c)
          : c;
        for (let i = 0; i < 3; i++) {
          ZG.Projectiles.spawn(state, {
            typeId: 'missile', x: h.x, y: h.y,
            tx: target.x + (i - 1) * 40, ty: target.y + (i - 1) * 20,
            speed: 900, splash: 140, damage: 400, delay: i * 0.4,
            damageKind: D.EXPLOSION, ownerId: h.id, color: '#FFD54F'
          });
        }
        state.stats.missilesFired = (state.stats.missilesFired || 0) + 3;
        state.bus.emit('fx:ability', { kind: 'missiles', x: h.x, y: h.y, text: '导弹支援！' });
      }
    }

    if (h.heroId === 'gatling') {
      if (h.nextInspireAt === undefined) h.nextInspireAt = 45;
      if (t >= h.nextInspireAt) {
        const allies = state.humans.filter(u => u.alive &&
          ZG.Geom.dist2(u.x, u.y, h.x, h.y) <= 200 * 200);
        if (allies.length >= 4) {
          for (const u of allies) u.inspireT = 8;
          h.nextInspireAt = t + 45;
          state.bus.emit('fx:ability', { kind: 'inspire', x: h.x, y: h.y, text: '鼓舞！' });
        } else {
          h.nextInspireAt = t + 1;
        }
      }
    }

    if (h.heroId === 'plague') {
      if (h.nextGroupHealAt === undefined) h.nextGroupHealAt = 12;
      if (t >= h.nextGroupHealAt) {
        const injured = state.humans.filter(u => u.alive &&
          ZG.Geom.dist2(u.x, u.y, h.x, h.y) <= 180 * 180 &&
          (u.hp < u.maxHp || u.infection > 0));
        if (injured.length >= 3) {
          for (const u of injured) {
            ZG.Combat.heal(state, u, 70 * ZG.Balance.techMul('serum', state.tech.serum));
            ZG.Infection.dispel(state, u, 30);
          }
          h.nextGroupHealAt = t + 12;
          state.bus.emit('fx:ability', { kind: 'groupheal', x: h.x, y: h.y, text: '群体治疗' });
        } else {
          h.nextGroupHealAt = t + 1;
        }
      }
    }
  }

  function samuraiMove(state, h, target, dt) {
    const st = ZG.Stats.human(state, h);
    if (!target) return;
    const d = ZG.Geom.dist(h.x, h.y, target.x, target.y);
    const stop = st.range + target.radius - 6;
    if (d > stop) {
      const p = leashPoint(h, target.x, target.y);
      moveHumanToward(state, h, p.x, p.y, h.moveSpeed, dt);
    }
  }

  function samuraiSlash(state, h) {
    const ca = Math.cos(h.facing), sa = Math.sin(h.facing);
    for (const z of state.zombies.slice()) {
      if (!z.alive) continue;
      const dx = z.x - h.x, dy = z.y - h.y;
      const along = dx * ca + dy * sa;
      const lat = -dx * sa + dy * ca;
      if (along >= -10 && along <= 320 && Math.abs(lat) <= 40) {
        ZG.Combat.applyDamage(state, {
          target: z, amount: 300, damageKind: D.MELEE,
          fromX: h.x, fromY: h.y, sourceIsHuman: true
        });
      }
    }
    state.effects.push({
      kind: 'slash', x: h.x, y: h.y, facing: h.facing,
      length: 320, width: 80, life: 0.18, maxLife: 0.18
    });
  }

  function stepShield(state, h, dt) {
    const st = ZG.Stats.human(state, h);
    const z = nearestZombie(state, h.x, h.y, h.vision);
    if (!z) {
      if (h.careTargetId) { h.aiState = 'heal'; h.moveX = 0; h.moveY = 0; return; }
      returnHome(state, h, dt);
      return;
    }
    const d = ZG.Geom.dist(h.x, h.y, z.x, z.y);
    const stop = Math.max(12, st.range + z.radius - 2);
    faceToward(h, z.x, z.y);
    if (d > stop && !h.careTargetId) {
      const p = leashPoint(h, z.x, z.y);
      if (ZG.Geom.dist(h.x, h.y, p.x, p.y) > 0.5) {
        moveHumanToward(state, h, p.x, p.y, h.moveSpeed, dt);
        h.aiState = 'advance';
        return;
      }
      h.aiState = 'hold';
      return;
    }
    if (h.cd <= 0 && d <= stop) {
      ZG.Combat.applyDamage(state, {
        target: z, amount: st.damage,
        damageKind: D.MELEE, fromX: h.x, fromY: h.y, sourceIsHuman: true
      });
      h.cd = Math.max(-STEP, h.cd) + st.interval;
    }
    h.aiState = h.careTargetId ? 'heal' : 'engage';
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
          const p = leashPoint(h, patient.x, patient.y);
          if (ZG.Geom.dist(h.x, h.y, p.x, p.y) > 0.5) {
            moveHumanToward(state, h, p.x, p.y, h.moveSpeed, dt);
            h.aiState = 'assist';
            return;
          }
          h.aiState = 'hold';
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
    returnHome(state, h, dt);
  }

  function stepFighter(state, h, dt) {
    const target = pickHumanTarget(state, h);
    if (target) {
      if ((h.classId === 'samurai' || h.heroId === 'samurai') && !h.careTargetId) {
        samuraiMove(state, h, target, dt);
      }
      faceToward(h, target.x, target.y);
      if (h.cd <= 0 && target.alive) {
        const did = performHumanAttack(state, h, target);
        if (did) {
          h.cd = Math.max(-STEP, h.cd) + ZG.Stats.human(state, h).interval;
          if (h.heroId === 'samurai' && h.attack.kind === 'melee' &&
            state.rng.jitter.chance(0.25)) {
            samuraiSlash(state, h);
          }
        }
      }
      h.aiState = h.careTargetId ? 'heal' : 'engage';
      return;
    }

    // 视野内有敌人 → 离开站位追击；追击半径以 home 为锚点
    const z = nearestZombie(state, h.x, h.y, h.vision);
    if (z) {
      const d = ZG.Geom.dist(h.x, h.y, z.x, z.y);
      const stop = stopDistance(state, h, z);
      const p = leashPoint(h, z.x, z.y);
      faceToward(h, z.x, z.y);
      if (d > stop) {
        if (!h.careTargetId && ZG.Geom.dist(h.x, h.y, p.x, p.y) > 0.5) {
          moveHumanToward(state, h, p.x, p.y, h.moveSpeed, dt);
          h.aiState = 'advance';
          return;
        }
        h.aiState = h.careTargetId ? 'heal' : 'hold';
        return;
      }
      // 已在射程内但 pickHumanTarget 未选中（例如刚进入），下一次 tick 会开火
      h.aiState = h.careTargetId ? 'heal' : 'engage';
      return;
    }

    if (h.careTargetId) { h.aiState = 'heal'; h.moveX = 0; h.moveY = 0; return; }
    returnHome(state, h, dt);
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
      const center = ZG.Geom.deployCenter(state.map.deploy);
      if (!ZG.Geom.pointInDeploy(h.x, h.y, state.map.deploy)) {
        const dc = ZG.Geom.dist(h.x, h.y, center.x, center.y) || 1;
        fx += ((center.x - h.x) / dc) * 0.8;
        fy += ((center.y - h.y) / dc) * 0.8;
      }
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
    returnHome(state, h, dt);
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
        const d = Math.hypot(dx, dy);
        const min = a.radius + b.radius + HAI.separationGap;
        if (d >= min || d < 1e-6) continue;
        const push = (min - d) * HAI.separationPush;
        const ux = dx / d, uy = dy / d;

        const ax = a.x - ux * push, ay = a.y - uy * push;
        if (!blockedAt(state, ax, ay, a.radius)) { a.x = ax; a.y = ay; }

        const bx = b.x + ux * push, by = b.y + uy * push;
        if (!blockedAt(state, bx, by, b.radius)) { b.x = bx; b.y = by; }
      }
    }
  }

  function stepHumans(state) {
    const dt = STEP;
    const chargers = collectChargers(state);

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

      if (h.classId === 'civilian') {
        stepCivilian(state, h, dt);
        continue;
      }

      if (stepCare(state, h, dt)) continue;

      if (isMedicClass(h)) {
        stepMedic(state, h, dt);
      } else if (h.classId === 'shield') {
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

  function pickZombieTarget(state, z) {
    if (z.typeId === 'boomer' || z.isBoss) {
      const p = densestHumanPoint(state);
      return { kind: 'point', x: p.x, y: p.y, count: p.count, target: null };
    }

    const tank = nearestShield(state, z, 90);
    if (tank) return { kind: 'human', target: tank };

    if (z.isSiege) {
      const b = nearestBuilding(state, z.x, z.y, 220);
      if (b) return { kind: 'building', target: b };
    }

    const h = nearestHuman(state, z.x, z.y, 4000);
    if (h) return { kind: 'human', target: h };

    const c = state.map ? ZG.Geom.deployCenter(state.map.deploy) : { x: 640, y: 600 };
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

  function moveZombie(state, z, tx, ty, speed, dt) {
    const dx = tx - z.x, dy = ty - z.y;
    const d = Math.hypot(dx, dy) || 1;
    const move = speed * dt;
    let nx = z.x + (dx / d) * move;
    let ny = z.y + (dy / d) * move;
    // 障碍物简单滑动
    if (state.map && state.map.obstacles) {
      for (const ob of state.map.obstacles) {
        if (ob.kind !== 'circle') continue;
        const dd = ZG.Geom.dist(nx, ny, ob.x, ob.y);
        if (dd < ob.r + z.radius) {
          const a = Math.atan2(ny - ob.y, nx - ob.x);
          nx = ob.x + Math.cos(a) * (ob.r + z.radius + 1);
          ny = ob.y + Math.sin(a) * (ob.r + z.radius + 1);
        }
      }
    }
    z.x = Math.max(6, Math.min(ZG.Const.W - 6, nx));
    z.y = Math.max(6, Math.min(ZG.Const.H - 6, ny));
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

  function stepZombies(state) {
    const dt = STEP;

    for (const z of state.zombies.slice()) {
      if (!z.alive) continue;
      if (z.cd > 0) z.cd -= dt;
      if (z.flashT > 0) z.flashT -= dt;
      if (z.rockCd > 0) z.rockCd -= dt;
      if (z.stompCd > 0) z.stompCd -= dt;

      z.slowFactor = computeSlow(state, z);
      const st = ZG.Stats.zombie(state, z);
      let speed = st.speed;
      let attacking = false;

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

      // BOSS 技能
      if (z.isBoss) {
        if (z.rockCd <= 0) {
          const p = densestHumanPoint(state);
          const dmg = ZG.Balance.bossRockDamage(state.round);
          ZG.Projectiles.spawn(state, {
            typeId: 'rock', x: p.x, y: p.y, tx: p.x, ty: p.y,
            radius: 70, splash: 70, damage: dmg, warnT: 2.0,
            infection: 30, hitsHumans: true, ownerId: z.id, color: '#EF5350'
          });
          z.rockCd = 4;
        }
        if (z.stompCd <= 0) {
          const near = state.humans.find(h => h.alive &&
            ZG.Geom.dist(z.x, z.y, h.x, h.y) <= 60 + h.radius);
          if (near) {
            for (const h of state.humans.slice()) {
              if (!h.alive) continue;
              if (ZG.Geom.dist(z.x, z.y, h.x, h.y) <= 60 + h.radius) {
                ZG.Combat.applyDamage(state, {
                  target: h, amount: 80, damageKind: D.MELEE,
                  fromX: z.x, fromY: z.y
                });
              }
            }
            z.stompCd = 1.5;
            state.bus.emit('fx:stomp', { x: z.x, y: z.y, radius: 60 });
          }
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

      const dist = Math.hypot(tx - z.x, ty - z.y);
      const targetRadius = tgt.target ? tgt.target.radius : 0;
      const range = z.radius + targetRadius + (tgt.kind === 'building' ? 8 : 4);

      if (dist <= range) {
        z.facing = Math.atan2(ty - z.y, tx - z.x);
        if (tgt.target) attacking = zombieAttackTarget(state, z, tgt.target, dt);
      } else {
        // 远处沿流场，近处直追
        let nx = tx, ny = ty;
        const inDeploy = state.map && ZG.Geom.pointInDeploy(z.x, z.y, state.map.deploy);
        if (!inDeploy && dist > 340 && tgt.kind !== 'building') {
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
        const d = Math.hypot(dx, dy) || 0.01;
        const overlap = z.radius + o.radius - d;
        if (overlap > 0) {
          const push = Math.min(overlap * 0.5, 2.2);
          z.x += (dx / d) * push;
          z.y += (dy / d) * push;
        }
      }
      z.x = Math.max(6, Math.min(ZG.Const.W - 6, z.x));
      z.y = Math.max(6, Math.min(ZG.Const.H - 6, z.y));
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
            const tech = ZG.Balance.techMul('fire', state.tech.fire);
            ZG.Combat.applyDamage(state, {
              target: z, amount: data.attack.damage * tech,
              damageKind: D.RANGED, fromX: b.x, fromY: b.y, sourceIsHuman: true
            });
            ZG.Projectiles.tracer(state, b.x, b.y, z.x, z.y, '#B0BEC5');
            b.cd = data.attack.interval;
          }
        }
      } else if (b.typeId === 'hospital') {
        for (const h of state.humans) {
          if (!h.alive) continue;
          if (ZG.Geom.dist2(h.x, h.y, b.x, b.y) <= data.heal.radius * data.heal.radius) {
            if (h.hp < h.maxHp) {
              ZG.Combat.heal(state, h,
                data.heal.rate * ZG.Balance.techMul('serum', state.tech.serum) * dt);
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
    pickHumanTarget, pickZombieTarget,
    densestHumanPoint, densestZombieCluster, nearestHuman
  };
})();
