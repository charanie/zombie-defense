/* 感染、灼烧、血清与回合隔离 */
(function () {
  'use strict';
  const ZG = globalThis.ZG = globalThis.ZG || {};

  function terrainMul(state, h) {
    const map = state.map;
    if (!map || !map.terrain) return 1;
    let mul = 1;
    for (const t of map.terrain) {
      if (t.infectionMul === undefined) continue;
      if (ZG.Geom.pointInCircle(h.x, h.y, t)) mul = Math.min(mul, t.infectionMul);
    }
    return mul;
  }

  function add(state, human, amount) {
    if (!human || !human.alive) return 0;
    if (ZG.Combat.isImmuneToInfection(human)) return 0;
    const mul = terrainMul(state, human);
    const resist = ZG.Tech ? ZG.Tech.mods(state).infectResist : 0;
    const before = human.infection;
    human.infection = Math.max(0, Math.min(100,
      human.infection + amount * mul * (1 - resist)));
    return human.infection - before;
  }

  function dispel(state, human, amount) {
    if (!human || !human.alive) return 0;
    const before = human.infection;
    human.infection = Math.max(0, human.infection - amount);
    if (before > human.infection) {
      state.bus.emit(ZG.Events.INFECTION_TREATED, { human, amount: before - human.infection });
    }
    return before - human.infection;
  }

  // 毒云 DOT：刷新持续时间与较高 DPS，不叠层
  function poison(state, human, dps, duration) {
    if (!human || !human.alive) return 0;
    human.poisonT = Math.max(human.poisonT || 0, duration);
    human.poisonDps = Math.max(human.poisonDps || 0, dps);
    return human.poisonDps;
  }

  function tick(state) {
    const dt = ZG.Const.STEP_SEC;

    for (const h of state.humans.slice()) {
      if (!h.alive) continue;
      if (h.inspireT > 0) h.inspireT = Math.max(0, h.inspireT - dt);
      if (h.infection > 0 && !ZG.Combat.isImmuneToInfection(h)) {
        const dmg = h.maxHp * 0.0002 * h.infection * dt;
        h.hp -= dmg;
        if (h.hp <= 0) {
          h.hp = 0;
          ZG.Combat.killHuman(state, h);
        }
      }
      if (h.alive && h.poisonT > 0) {
        h.poisonT = h.poisonT - dt > 1e-9 ? h.poisonT - dt : 0;
        ZG.Combat.applyDamage(state, {
          target: h, amount: (h.poisonDps || 0) * dt,
          damageKind: ZG.Const.DAMAGE.POISON,
          silent: true, ignoreShield: true
        });
        if (h.poisonT <= 0) {
          h.poisonT = 0;
          h.poisonDps = 0;
        }
      }
    }

    for (const z of state.zombies.slice()) {
      if (!z.alive) continue;
      if (z.burnT > 0) {
        z.burnT -= dt;
        ZG.Combat.applyDamage(state, {
          target: z, amount: (z.burnDps || 0) * dt,
          damageKind: ZG.Const.DAMAGE.FIRE,
          fromX: z.burnFromX, fromY: z.burnFromY, silent: true
        });
      }
    }
  }

  function anyMedic(state) {
    return state.humans.some(h => h.alive && (h.classId === 'medic' || h.heroId === 'plague'));
  }

  function settlementClamp(state) {
    const clear = anyMedic(state);
    for (const h of state.humans) {
      if (!h.alive) continue;
      h.infection = clear ? 0 : Math.min(30, h.infection);
    }
  }

  ZG.Infection = { add, dispel, poison, tick, settlementClamp, terrainMul, anyMedic };
})();
