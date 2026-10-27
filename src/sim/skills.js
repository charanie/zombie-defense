/* 职业技能、生命分支、复活/尸爆与场外援助（纯模拟） */
(function () {
  'use strict';
  const ZG = globalThis.ZG = globalThis.ZG || {};
  const STEP = ZG.Const.STEP_SEC;
  const D = ZG.Const.DAMAGE;

  const ABILITY_TEXT = {
    pistol: '快速拔枪',
    shotgun: '震慑射击',
    mg: '弹幕扫射',
    flame: '烈焰喷发',
    rocket: '双联齐射',
    shield: '盾墙',
    medic: '群体急救'
  };

  function mods(state) { return ZG.Tech.mods(state); }

  function resetRound(state) {
    const m = mods(state);
    for (const h of state.humans) {
      if (!h.alive) continue;
      h.skillT = 0;
      h.skillTickT = 0;
      h.skillTickN = 0;
      h.focusTargetId = 0;
      h.focusStacks = 0;
      h.focusT = 0;
      h.rocketDouble = 0;
      h.guardT = 0;
      h.guardMul = 1;
      h.reviveRound = 0;
      h.skillAtkMul = 1;
      if (h.heroId === 'officer') {
        // 每回合只齐射一次；officerUses 决定这一轮的导弹总数（3/5 发）
        h.skillUses = 1;
        h.skillCd = 0;
      } else if (h.heroId === 'gatling') {
        h.skillUses = 0;
        h.skillCd = m.hero.gatlingInterval * m.skillCdMul;
      } else if (h.heroId === 'plague') {
        h.skillUses = 0;
        h.skillCd = m.hero.plagueInterval * m.skillCdMul;
      } else {
        h.skillUses = 0;
        h.skillCd = 0;
      }
    }
  }

  function stepRegen(state) {
    const m = mods(state);
    if (!(m.regenPct > 0)) return;
    state.battle.regenT = (state.battle.regenT === undefined ? 5 : state.battle.regenT) - STEP;
    if (state.battle.regenT > 0) return;
    state.battle.regenT = 5;
    for (const h of state.humans) {
      if (!h.alive) continue;
      ZG.Combat.heal(state, h, h.maxHp * m.regenPct);
    }
  }

  function onDeath(state, h) {
    const m = mods(state);
    if (!h || h.hero || h.captain) return { revived: false, exploded: false };

    if (m.reviveChance > 0 && h.reviveRound !== state.round &&
        state.rng.tech.chance(m.reviveChance)) {
      h.reviveRound = state.round;
      h.hp = h.maxHp * 0.4;
      h.infection = 0;
      h.poisonT = 0;
      h.poisonDps = 0;
      h.burnT = 0;
      h.burnDps = 0;
      state.battle.revives = (state.battle.revives || 0) + 1;
      state.bus.emit('fx:revive', { x: h.x, y: h.y, human: h });
      return { revived: true, exploded: false };
    }

    if (m.boomChance > 0 && state.rng.tech.chance(m.boomChance)) {
      ZG.Projectiles.explode(state, h.x, h.y, m.boomRadius,
        ZG.Balance.deathBoomDamage(state.round), D.EXPLOSION,
        { color: '#66BB6A', kind: 'death_boom' });
      return { revived: false, exploded: true };
    }

    return { revived: false, exploded: false };
  }

  function zombiesWithin(state, x, y, radius) {
    const out = [];
    const r2 = radius * radius;
    for (const z of state.zombies) {
      if (!z.alive) continue;
      if (ZG.Geom.dist2(x, y, z.x, z.y) <= r2) out.push(z);
    }
    return out;
  }

  function hasZombieNear(state, h, radius) {
    const r2 = radius * radius;
    for (const z of state.zombies) {
      if (z.alive && ZG.Geom.dist2(h.x, h.y, z.x, z.y) <= r2) return true;
    }
    return false;
  }

  function emitAbility(state, h, classId, x, y) {
    state.bus.emit('fx:ability', {
      kind: 'skill-' + classId, x: x === undefined ? h.x : x,
      y: y === undefined ? h.y : y, text: ABILITY_TEXT[classId] || ''
    });
  }

  function tickMg(state, h, params) {
    const list = zombiesWithin(state, h.x, h.y, params.radius);
    for (const z of list) {
      ZG.Combat.applyDamage(state, {
        target: z, amount: params.tickDamage, damageKind: D.RANGED,
        fromX: h.x, fromY: h.y, sourceIsHuman: true
      });
    }
    if (state.effects.length < 250 && list.length) {
      state.effects.push({
        kind: 'mg_sweep', x: h.x, y: h.y, radius: params.radius,
        life: 0.08, maxLife: 0.08
      });
    }
  }

  function triggerActive(state, h, classId, params, m) {
    h.skillCd = params.cd * m.skillCdMul;
    if (classId === 'pistol') {
      h.skillT = params.duration;
      h.skillAtkMul = params.atkSpeedMul;
    } else if (classId === 'shotgun') {
      const half = params.coneDeg / 2;
      for (const z of state.zombies.slice()) {
        if (!z.alive) continue;
        if (!ZG.Geom.inCone(h.x, h.y, h.facing, z.x, z.y, params.range, half)) continue;
        if (!z.isBoss) z.stunT = Math.max(z.stunT || 0, params.stun);
        if (!z.knockbackImmune) {
          const d = ZG.Geom.dist(h.x, h.y, z.x, z.y) || 1;
          const p = ZG.Geom.clampToWorld(
            z.x + ((z.x - h.x) / d) * params.knockback,
            z.y + ((z.y - h.y) / d) * params.knockback, z.radius);
          z.x = p.x; z.y = p.y;
        }
      }
      if (state.effects.length < 250) {
        state.effects.push({
          kind: 'shockwave', x: h.x, y: h.y, facing: h.facing,
          range: params.range, coneDeg: params.coneDeg, life: 0.25, maxLife: 0.25
        });
      }
    } else if (classId === 'mg') {
      h.skillT = params.duration;
      h.skillTickN = params.ticks;
      h.skillTickT = 0;
    } else if (classId === 'flame') {
      for (const z of zombiesWithin(state, h.x, h.y, params.radius)) {
        ZG.Combat.applyDamage(state, {
          target: z, amount: params.damage, damageKind: D.FIRE,
          fromX: h.x, fromY: h.y, sourceIsHuman: true
        });
        z.burnT = params.burnTime;
        z.burnDps = params.burnDps;
        z.burnFromX = h.x;
        z.burnFromY = h.y;
      }
      if (state.effects.length < 250) {
        state.effects.push({
          kind: 'fire_ring', x: h.x, y: h.y, radius: params.radius,
          life: 0.4, maxLife: 0.4
        });
      }
    } else if (classId === 'rocket') {
      h.rocketDouble = 1;
    } else if (classId === 'shield') {
      for (const z of zombiesWithin(state, h.x, h.y, params.radius)) {
        z.tauntT = params.taunt;
        z.tauntTargetId = h.id;
      }
      h.guardT = params.reductionTime;
      h.guardMul = 1 - params.selfReduction;
      if (state.effects.length < 250) {
        state.effects.push({
          kind: 'taunt_ring', x: h.x, y: h.y, radius: params.radius,
          life: 0.4, maxLife: 0.4
        });
      }
    } else if (classId === 'medic') {
      for (const u of state.humans) {
        if (!u.alive) continue;
        if (ZG.Geom.dist2(h.x, h.y, u.x, u.y) > params.radius * params.radius) continue;
        ZG.Combat.heal(state, u, params.heal);
        ZG.Infection.dispel(state, u, params.dispel);
      }
      if (state.effects.length < 250) {
        state.effects.push({
          kind: 'heal_ring', x: h.x, y: h.y, radius: params.radius,
          life: 0.5, maxLife: 0.5
        });
      }
    }
    emitAbility(state, h, classId);
  }

  function readyCondition(state, h, classId, params) {
    if (classId === 'pistol') return hasZombieNear(state, h, 340);
    if (classId === 'shotgun' || classId === 'flame' || classId === 'mg') {
      return hasZombieNear(state, h, params.range || params.radius);
    }
    if (classId === 'rocket') return hasZombieNear(state, h, 400);
    if (classId === 'shield') return hasZombieNear(state, h, params.radius);
    if (classId === 'medic') {
      for (const u of state.humans) {
        if (!u.alive) continue;
        if (ZG.Geom.dist2(h.x, h.y, u.x, u.y) > params.radius * params.radius) continue;
        if (u.hp < u.maxHp || u.infection > 0) return true;
      }
      return false;
    }
    return false;
  }

  function stepHuman(state, h, dt) {
    const m = mods(state);
    if (h.skillCd > 0) h.skillCd -= dt;
    if (h.skillT > 0) h.skillT = Math.max(0, h.skillT - dt);
    if (h.guardT > 0) h.guardT = Math.max(0, h.guardT - dt);

    if (h.skillTickN > 0) {
      const mg = m.classActives.mg;
      const interval = mg ? mg.duration / mg.ticks : 1 / 12;
      h.skillTickT -= dt;
      while (h.skillTickN > 0 && h.skillTickT <= 0) {
        if (mg) tickMg(state, h, mg);
        h.skillTickN--;
        if (h.skillTickN > 0) h.skillTickT += interval;
      }
    }

    const passive = m.classPassives[h.classId];
    if (h.classId === 'mg' && passive && h.focusTargetId) {
      h.focusT += dt;
      h.focusStacks = Math.min(passive.maxStacks, Math.floor(h.focusT / passive.stepSec));
    }

    const active = m.classActives[h.classId];
    if (!active || h.skillCd > 0) return;
    if (!readyCondition(state, h, h.classId, active)) return;
    triggerActive(state, h, h.classId, active, m);
  }

  function onAttack(state, h, target) {
    if (!h || !target) return;
    const m = mods(state);
    const passive = m.classPassives[h.classId];
    if (!passive) return;
    if (h.classId === 'pistol') {
      if (h.focusTargetId === target.id) {
        h.focusStacks = Math.min(passive.maxStacks, (h.focusStacks || 0) + 1);
      } else {
        h.focusTargetId = target.id;
        h.focusStacks = 1;
      }
    } else if (h.classId === 'mg') {
      if (h.focusTargetId !== target.id) {
        h.focusTargetId = target.id;
        h.focusStacks = 0;
        h.focusT = 0;
      }
    }
  }

  function samuraiSlash(state, h, m) {
    const width = m.hero.samuraiWidth;
    const length = 320;
    const damage = 300 * (1 + m.hero.samuraiPower);
    const ca = Math.cos(h.facing), sa = Math.sin(h.facing);
    for (const z of state.zombies.slice()) {
      if (!z.alive) continue;
      const dx = z.x - h.x, dy = z.y - h.y;
      const along = dx * ca + dy * sa;
      const lat = -dx * sa + dy * ca;
      if (along >= -10 && along <= length && Math.abs(lat) <= width / 2) {
        ZG.Combat.applyDamage(state, {
          target: z, amount: damage, damageKind: D.MELEE,
          fromX: h.x, fromY: h.y, sourceIsHuman: true
        });
      }
    }
    if (state.effects.length < 250) {
      state.effects.push({
        kind: 'slash', x: h.x, y: h.y, facing: h.facing,
        length, width, radius: length, arc: 0.9, ang: h.facing,
        color: '#FFFFFF', life: 0.2, maxLife: 0.2
      });
    }
  }

  function onSamuraiAttack(state, h) {
    const m = mods(state);
    const base = ZG.Data.tech.heroDefaults.samuraiBaseChance;
    if (!state.rng.skills.chance(base)) return;
    let count = 0;
    do {
      samuraiSlash(state, h, m);
      count++;
    } while (count < 3 && m.hero.samuraiChain > 0 &&
      state.rng.skills.chance(m.hero.samuraiChain));
  }

  function castSupport(state, skillId, x, y) {
    const base = ZG.Data.tech.support[skillId];
    if (!base) return { ok: false, reason: 'unknown' };
    const m = mods(state);
    const unlocked = skillId === 'areaHeal' ? m.support.healUnlocked : m.support.bombUnlocked;
    if (!unlocked) return { ok: false, reason: 'locked' };
    if (state.status !== 'battle') return { ok: false, reason: 'not-battle' };
    if (!(x >= 0 && y >= 0 && x <= ZG.Const.W && y <= ZG.Const.H)) {
      return { ok: false, reason: 'outside' };
    }
    const maxUses = ZG.Tech.supportUsesMax(state, skillId);
    const used = state.supports.uses[skillId] || 0;
    if (used >= maxUses) return { ok: false, reason: 'uses' };
    const cost = ZG.Tech.supportCost(state, skillId);
    if (state.money < cost) return { ok: false, reason: 'money' };

    state.supports.uses[skillId] = used + 1;
    ZG.Economy.spend(state, cost);
    const radius = base.radius * m.support.radiusMul;

    if (skillId === 'areaHeal') {
      const heal = base.heal * m.support.powerMul;
      for (const h of state.humans) {
        if (!h.alive) continue;
        if (ZG.Geom.dist2(h.x, h.y, x, y) > radius * radius) continue;
        ZG.Combat.heal(state, h, heal);
        ZG.Infection.dispel(state, h, base.dispel);
      }
      if (state.effects.length < 250) {
        state.effects.push({
          kind: 'support_heal', x, y, radius, life: 0.6, maxLife: 0.6
        });
      }
      state.bus.emit('fx:support_heal', { x, y, radius });
    } else {
      const damage = ZG.Balance.supportDamage(state.round) * m.support.powerMul;
      const shells = base.shells;
      for (let i = 0; i < shells; i++) {
        const off = base.offsets[i % base.offsets.length];
        const tx = x + off.x;
        const ty = y + off.y;
        const delay = base.warnT + i * base.shellGap;
        ZG.Projectiles.spawn(state, {
          typeId: 'support_bomb', x: tx, y: ty, tx, ty,
          speed: 900, splash: radius, damage, damageKind: D.EXPLOSION,
          delay, life: 1, color: '#FF7043'
        });
        if (state.effects.length < 250) {
          state.effects.push({
            kind: 'support_warn', x: tx, y: ty, radius,
            life: delay, maxLife: delay
          });
        }
      }
      state.bus.emit('fx:support_bomb', { x, y, radius });
    }

    return { ok: true, skillId, cost, remaining: maxUses - used - 1 };
  }

  ZG.Skills = {
    resetRound, stepHuman, onAttack, onSamuraiAttack, onDeath, castSupport, stepRegen
  };
})();
