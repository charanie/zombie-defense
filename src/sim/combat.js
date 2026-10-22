/* 伤害管线、护盾、死亡效果、赏金与转化 */
(function () {
  'use strict';
  const ZG = globalThis.ZG = globalThis.ZG || {};
  const D = ZG.Const.DAMAGE;

  function isImmuneToInfection(h) {
    return !!(h.captain || h.hero);
  }

  function resolveShield(target, amount, damageKind, fromX, fromY) {
    const hasSource = fromX !== undefined && fromY !== undefined;
    const dx = hasSource ? fromX - target.x : 0;
    const dy = hasSource ? fromY - target.y : 0;
    const d = hasSource ? Math.hypot(dx, dy) : Infinity;
    const shieldHalf = (target.kind === 'zombie' && target.typeId === 'shield')
      ? ((ZG.Data.zombies.shield.shieldAngle || 120) / 2) * Math.PI / 180
      : Math.PI / 3;
    // 爆炸中心与目标重合（直击）时没有方向信息，视为正面承受
    const facing = !hasSource || d <= 1e-6
      ? true
      : Math.abs(ZG.Geom.angleDiff(Math.atan2(dy, dx), target.facing)) <= shieldHalf;

    if (target.kind === 'zombie' && target.typeId === 'shield') {
      const zd = ZG.Data.zombies.shield || {};
      const fireMul = zd.fireShieldMul || 2;
      const dmgMul = zd.shieldDamageMul === undefined ? 0.5 : zd.shieldDamageMul;
      if (target.shield <= 0) return { shieldDamage: 0, hpDamage: amount };
      if (damageKind === D.MELEE && d <= 40) return { shieldDamage: 0, hpDamage: amount };
      if (!facing) return { shieldDamage: 0, hpDamage: amount };
      if (damageKind === D.FIRE) {
        const shieldCost = amount * fireMul;
        if (target.shield >= shieldCost) {
          target.shield -= shieldCost;
          if (target.shield <= 0) onShieldBreak(target);
          return { shieldDamage: shieldCost, hpDamage: 0 };
        }
        const used = target.shield;
        target.shield = 0;
        const hpDamage = amount - used / fireMul;
        onShieldBreak(target);
        return { shieldDamage: used, hpDamage };
      }
      const eff = amount * dmgMul;
      const shieldDamage = Math.min(target.shield, eff);
      target.shield -= shieldDamage;
      const hpDamage = eff - shieldDamage;
      if (target.shield <= 0) onShieldBreak(target);
      return { shieldDamage, hpDamage };
    }

    if (target.kind === 'human' && target.shield > 0 && damageKind !== D.MELEE &&
        d > 40 && facing) {
      let reduction = target.shieldReduction !== undefined ? target.shieldReduction : 0.4;
      if (damageKind === D.FIRE || damageKind === D.EXPLOSION) reduction *= 0.5;
      const eff = amount * (1 - reduction);
      const shieldDamage = Math.min(target.shield, eff);
      target.shield -= shieldDamage;
      const hpDamage = eff - shieldDamage;
      if (target.shield <= 0) {
        target.shield = 0;
        if (!target.shieldBroken) {
          target.shieldBroken = true;
          if (target.fallbackAttack) target.attack = Object.assign({}, target.fallbackAttack);
          target.role = 'rifle';
          target.squadDirty = true;
        }
      }
      return { shieldDamage, hpDamage };
    }

    return { shieldDamage: 0, hpDamage: amount };
  }

  function onShieldBreak(z) {
    z.permSlow = Math.max(z.permSlow || 0, 0.2);
    z.shieldBroken = true;
  }

  // 盾尸拦截：找出射线路径上最近的、正面且盾值未破的盾尸
  function interceptRay(state, x1, y1, x2, y2, opts) {
    const o = opts || {};
    const zd = ZG.Data.zombies.shield || {};
    const pad = o.pad === undefined ? 4 : o.pad;
    const halfDeg = o.halfAngleDeg === undefined
      ? (zd.interceptFacingHalfAngle || 60)
      : o.halfAngleDeg;
    const half = halfDeg * Math.PI / 180;
    let best = null, bestT = 1;
    for (const z of state.zombies) {
      if (!z.alive || z.typeId !== 'shield' || z.shield <= 0) continue;
      if (o.excludeId && z.id === o.excludeId) continue;
      const t = ZG.Geom.segmentCircleT(x1, y1, x2, y2, z.x, z.y,
        (z.radius || 10) + pad);
      if (t === null || t <= 0 || t >= bestT) continue;
      const toShooter = Math.atan2(y1 - z.y, x1 - z.x);
      if (Math.abs(ZG.Geom.angleDiff(toShooter, z.facing)) > half) continue;
      best = z; bestT = t;
    }
    return best;
  }

  // 爆尸爆炸：盾兵盾值 >0 且面朝爆心时，背后扇形内的队友只受 50%
  function shieldGuardMul(state, h, ex, ey) {
    if (!h || h.classId === 'shield') return 1;
    const g = ZG.Data.humans.shield.guard;
    for (const s of state.humans) {
      if (!s.alive || s.classId !== 'shield' || s.shield <= 0) continue;
      if (ZG.Geom.dist(s.x, s.y, ex, ey) > g.maxDist) continue;
      const toEx = Math.atan2(ey - s.y, ex - s.x);
      if (Math.abs(ZG.Geom.angleDiff(toEx, s.facing)) > g.facingHalfAngle * Math.PI / 180) continue;
      if (ZG.Geom.dist(s.x, s.y, h.x, h.y) > g.allyRadius) continue;
      const toAlly = Math.atan2(h.y - s.y, h.x - s.x);
      if (Math.abs(ZG.Geom.angleDiff(toAlly, s.facing + Math.PI)) >
          g.allyHalfAngle * Math.PI / 180) continue;
      if (ZG.Geom.dist(ex, ey, s.x, s.y) >= ZG.Geom.dist(ex, ey, h.x, h.y)) continue;
      return g.mul;
    }
    return 1;
  }

  function applyDamage(state, opts) {
    const target = opts.target;
    if (!target || !target.alive) return { shieldDamage: 0, hpDamage: 0, killed: false };
    if (target.kind === 'human' && (opts.friendly || opts.sourceIsHuman)) {
      return { shieldDamage: 0, hpDamage: 0, killed: false };
    }
    if (target.kind === 'building') {
      return applyBuildingDamage(state, target, opts.amount);
    }

    const amount = Math.max(0, opts.amount || 0);
    const damageKind = opts.damageKind || D.RANGED;
    const r = opts.ignoreShield
      ? { shieldDamage: 0, hpDamage: amount }
      : resolveShield(target, amount, damageKind, opts.fromX, opts.fromY);
    target.hp -= r.hpDamage;
    if (!opts.silent) {
      target.flashT = 0.08;
      if (r.hpDamage > 0) {
        state.bus.emit('fx:hit', {
          x: target.x, y: target.y, amount: r.hpDamage,
          kind: target.kind, damageKind, shield: r.shieldDamage > 0
        });
      }
    }

    if (target.hp <= 0 && target.alive) {
      target.hp = 0;
      if (target.kind === 'zombie') killZombie(state, target);
      else killHuman(state, target);
      return { shieldDamage: r.shieldDamage, hpDamage: r.hpDamage, killed: true };
    }
    return { shieldDamage: r.shieldDamage, hpDamage: r.hpDamage, killed: false };
  }

  function applyBuildingDamage(state, b, amount) {
    if (!b.alive) return { shieldDamage: 0, hpDamage: 0, killed: false };
    b.hp -= amount;
    if (b.hp <= 0) {
      b.hp = 0;
      b.alive = false;
      const i = state.buildings.indexOf(b);
      if (i >= 0) state.buildings.splice(i, 1);
      state.stats.buildingsLost = (state.stats.buildingsLost || 0) + 1;
      state.bus.emit(ZG.Events.BUILDING_DESTROYED, { building: b });
      if (state.pathing) {
        state.pathing = ZG.Pathing.build(state);
      }
      return { shieldDamage: 0, hpDamage: amount, killed: true };
    }
    return { shieldDamage: 0, hpDamage: amount, killed: false };
  }

  function spawnBabies(state, z, n, cap, minR, maxR) {
    let spawned = 0;
    for (let k = 0; k < n; k++) {
      if ((state.battle.babyCount || 0) >= cap) break;
      const a = state.rng.spawn.next() * Math.PI * 2;
      const rr = minR + state.rng.spawn.next() * (maxR - minR);
      const bz = ZG.State.spawnZombie(state, 'baby',
        z.x + Math.cos(a) * rr, z.y + Math.sin(a) * rr);
      bz.wave = z.wave;
      state.battle.babyCount = (state.battle.babyCount || 0) + 1;
      spawned++;
    }
    return spawned;
  }

  function killZombie(state, z) {
    if (!z.alive) return;
    z.alive = false;
    const i = state.zombies.indexOf(z);
    if (i >= 0) state.zombies.splice(i, 1);
    state.battle.killCount++;
    state.stats.totalKills++;
    const t = z.typeId;
    state.stats.zombieKillsByType[t] = (state.stats.zombieKillsByType[t] || 0) + 1;

    // 母体死亡效果
    if (t === 'mother') {
      const data = ZG.Data.zombies.mother;
      const n = 3 + Math.floor(state.rng.spawn.next() * 3);
      let spawned = 0;
      const cap = data.babies.waveCap;
      for (let k = 0; k < n; k++) {
        if ((state.battle.babyCount || 0) >= cap) break;
        const a = state.rng.spawn.next() * Math.PI * 2;
        const rr = 10 + state.rng.spawn.next() * 24;
        const bz = ZG.State.spawnZombie(state, 'baby', z.x + Math.cos(a) * rr, z.y + Math.sin(a) * rr);
        bz.wave = z.wave;
        state.battle.babyCount = (state.battle.babyCount || 0) + 1;
        spawned++;
      }
      // 死亡爆炸：人类 80 / 建筑 200，半径 120
      const R = data.deathExplosion.radius;
      for (const h of state.humans.slice()) {
        if (!h.alive) continue;
        if (ZG.Geom.dist2(h.x, h.y, z.x, z.y) <= (R + h.radius) * (R + h.radius)) {
          applyDamage(state, { target: h, amount: data.deathExplosion.human, damageKind: D.EXPLOSION, fromX: z.x, fromY: z.y });
        }
      }
      for (const b of state.buildings.slice()) {
        if (!b.alive) continue;
        if (ZG.Geom.dist2(b.x, b.y, z.x, z.y) <= (R + b.radius) * (R + b.radius)) {
          applyBuildingDamage(state, b, data.deathExplosion.building);
        }
      }
      state.bus.emit('fx:explosion', { x: z.x, y: z.y, radius: R, color: '#8E24AA', kind: 'mother' });
    }

    if (z.isBoss) {
      const bd = (ZG.Data.zombies[t] || {}).boss;
      if (bd && bd.kind === 'brood') {
        const s = bd.summon;
        spawnBabies(state, z, bd.deathBabies, s.waveCap, s.radiusMin, s.radiusMax);
        state.bus.emit('fx:explosion', {
          x: z.x, y: z.y, radius: bd.deathFxRadius, color: '#8E24AA', kind: 'brood'
        });
      }
      state.stats.bossKills = (state.stats.bossKills || 0) + 1;
      if (state.battle.bossId === z.id) state.battle.bossId = null;
      state.bus.emit('fx:explosion', { x: z.x, y: z.y, radius: 140, color: '#FF7043', kind: 'boss' });
      if (ZG.Heroes) ZG.Heroes.grant(state);
    }

    // 赏金
    if (z.bountyBase > 0) {
      let amount;
      if (z.isBoss) amount = Math.floor(z.bountyBase);
      else {
        const econ = state.tech.econ || 0;
        amount = ZG.Balance.bounty(z.bountyBase, state.round, econ);
      }
      if (amount > 0) {
        state.money += amount;
        state.stats.totalEarned += amount;
        state.battle.killIncome = (state.battle.killIncome || 0) + amount;
        state.bus.emit('fx:coin', { x: z.x, y: z.y, amount });
        state.bus.emit(ZG.Events.MONEY_CHANGED, { money: state.money, delta: amount });
      }
    }

    state.bus.emit(ZG.Events.ZOMBIE_DIED, { zombie: z });
  }

  function captainExplosion(state, h) {
    const radius = 90;
    for (const z of state.zombies.slice()) {
      if (!z.alive) continue;
      if (ZG.Geom.dist2(z.x, z.y, h.x, h.y) <= (radius + z.radius) * (radius + z.radius)) {
        const pct = Math.min(0.15 * z.maxHp, 800);
        applyDamage(state, { target: z, amount: 120 + pct, damageKind: D.EXPLOSION, fromX: h.x, fromY: h.y });
      }
    }
    state.bus.emit('fx:explosion', { x: h.x, y: h.y, radius: 90, color: '#FFC107', kind: 'captain' });
  }

  function killHuman(state, h) {
    if (!h.alive) return;
    h.alive = false;
    if (h.classId === 'shield') state.squadDirty = true;

    if (h.captain) {
      captainExplosion(state, h);
    }

    if (h.hero) {
      h.wounded = true;
      h.woundedUntilRound = state.round + 1;
      const i = state.humans.indexOf(h);
      if (i >= 0) state.humans.splice(i, 1);
      state.woundedHeroes.push(h);
      state.bus.emit(ZG.Events.HERO_WOUNDED, { human: h });
      state.bus.emit(ZG.Events.HUMAN_DIED, { human: h });
      return;
    }

    if (h.captain) {
      // 队长不转化，只爆炸
      const i = state.humans.indexOf(h);
      if (i >= 0) state.humans.splice(i, 1);
      state.bus.emit(ZG.Events.HUMAN_DIED, { human: h });
      return;
    }

    // 普通人类 / 平民 / 转化兵 -> 当回合普通丧尸 50% HP
    const walkerHp = ZG.Balance.zombieHp(ZG.Data.zombies.walker.hp, state.round) * 0.5;
    const tuned = ZG.State.spawnZombie(state, 'walker', h.x, h.y, {
      maxHp: walkerHp, hp: walkerHp, bounty: 0, turnedFromHuman: true
    });
    tuned.wave = state.battle.waveId || null;

    const i = state.humans.indexOf(h);
    if (i >= 0) state.humans.splice(i, 1);
    state.bus.emit(ZG.Events.HUMAN_DIED, { human: h });
  }

  function attack(state, attacker, target) {
    if (!attacker || !target || !attacker.alive || !target.alive) return;
    if (attacker.kind === 'human') {
      const st = ZG.Stats.human(state, attacker);
      const fromX = attacker.x, fromY = attacker.y;
      applyDamage(state, {
        target, amount: st.damage, damageKind: attacker.attack.damageKind,
        fromX, fromY, sourceIsHuman: true
      });
    } else if (attacker.kind === 'zombie') {
      zombieHit(state, attacker, target);
    }
  }

  function zombieHit(state, z, target) {
    if (!target.alive) return;
    const st = ZG.Stats.zombie(state, z);
    if (target.kind === 'building') {
      const mul = z.typeId === 'giant' ? ZG.Data.zombies.giant.buildingMultiplier : 1;
      applyBuildingDamage(state, target, st.damage * mul);
      return;
    }
    applyDamage(state, {
      target, amount: st.damage, damageKind: D.MELEE, fromX: z.x, fromY: z.y
    });
    // 感染
    if (target.kind === 'human' && target.alive && !isImmuneToInfection(target) && z.infection && z.infection.chance > 0) {
      if (state.rng.jitter.chance(z.infection.chance)) {
        ZG.Infection.add(state, target, z.infection.amount);
      }
    }
  }

  function heal(state, target, amount) {
    if (!target || !target.alive) return 0;
    const before = target.hp;
    target.hp = Math.min(target.maxHp, target.hp + amount);
    return target.hp - before;
  }

  function earn(state, amount, reason) {
    const v = Math.max(0, Math.round(amount));
    if (!v) return;
    state.money += v;
    state.stats.totalEarned += v;
    state.bus.emit(ZG.Events.MONEY_CHANGED, { money: state.money, delta: v, reason });
  }

  function tryConvert(state, z, roll) {
    if (!z || !z.alive || z.isBoss) return false;
    const r = roll === undefined ? state.rng.jitter.next() : roll;
    if (r >= 0.15) return false;
    if ((state.battle.convertedThisRound || 0) >= ZG.Const.CONVERT_PER_ROUND) return false;
    const totalConverted = state.humans.filter(h => h.alive && h.converted).length;
    if (totalConverted >= ZG.Const.MAX_CONVERTED) return false;
    convertZombie(state, z);
    return true;
  }

  function convertZombie(state, z) {
    if (!z || !z.alive || z.isBoss) return null;
    z.alive = false;
    const i = state.zombies.indexOf(z);
    if (i >= 0) state.zombies.splice(i, 1);
    const h = ZG.State.spawnHuman(state, 'pistol', z.x, z.y, {
      converted: true,
      expireRound: state.round + 2
    });
    state.battle.convertedThisRound = (state.battle.convertedThisRound || 0) + 1;
    state.bus.emit('fx:convert', { x: z.x, y: z.y });
    return h;
  }

  ZG.Combat = {
    applyDamage, applyBuildingDamage, killZombie, killHuman, attack, zombieHit,
    heal, earn, resolveShield, interceptRay, shieldGuardMul, tryConvert, convertZombie, captainExplosion,
    isImmuneToInfection
  };
})();
