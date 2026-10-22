/* 科技 / 队长 / 英雄 / 光环后的有效属性 */
(function () {
  'use strict';
  const ZG = globalThis.ZG = globalThis.ZG || {};

  function ammoBuff(state, h) {
    let speed = 1, range = 1;
    for (const b of state.buildings) {
      if (!b.alive || b.typeId !== 'ammo') continue;
      const data = ZG.Data.buildings.ammo;
      if (ZG.Geom.dist2(h.x, h.y, b.x, b.y) <= data.buff.radius * data.buff.radius) {
        speed = Math.max(speed, 1 + data.buff.attackSpeed);
        range = Math.max(range, 1 + data.buff.range);
      }
    }
    return { speed, range };
  }

  // 只算射程（无对象分配），供编队/索敌的高频路径使用
  function range(state, h) {
    const a = h.attack;
    if (!a) return 0;
    let mul = 1;
    for (const b of state.buildings) {
      if (!b.alive || b.typeId !== 'ammo') continue;
      const data = ZG.Data.buildings.ammo;
      if (ZG.Geom.dist2(h.x, h.y, b.x, b.y) <= data.buff.radius * data.buff.radius) {
        mul = Math.max(mul, 1 + data.buff.range);
      }
    }
    return a.range * mul;
  }

  function human(state, h) {
    const a = h.attack;
    if (!a) return { damage: 0, interval: 1, range: 0, attackSpeed: 1, maxHp: h.maxHp, dps: 0 };
    const m = ZG.Tech ? ZG.Tech.mods(state) : null;
    let dmg = a.damage * (m ? m.dmgMul : 1) * h.dmgMul;
    if (h.hero && m) dmg *= m.hero.dmgMul;
    if (h.captain) {
      dmg *= 1.3 * (1 + 0.10 * (state.stats.captainOverflow || 0));
    }
    const buff = ammoBuff(state, h);
    let aspd = h.atkSpeedMul * buff.speed * (m ? m.atkSpeedMul : 1);
    if (h.captain) aspd *= 1.4;
    if (h.inspireT > 0) aspd *= 1.3;
    const interval = a.interval / Math.max(0.1, aspd);
    const range = a.range * buff.range;
    const pellets = a.pellets || 1;
    const dps = (dmg * pellets) / Math.max(0.001, interval);
    return { damage: dmg, interval, range, attackSpeed: aspd, maxHp: h.maxHp, dps };
  }

  function zombie(state, z) {
    const slow = 1 - Math.min(0.75, z.slowFactor || 0);
    const berserk = Math.pow(1.3, state.battle.berserkTier || 0);
    const baseSpeed = (z.speed !== undefined ? z.speed : z.speedBase);
    const baseDamage = (z.damage !== undefined ? z.damage : z.damageBase);
    const speed = baseSpeed * (z.speedScale || 1) * slow * berserk;
    const damage = baseDamage * (z.damageScale || 1) * berserk;
    return { damage, speed, maxHp: z.maxHp, slow, berserk };
  }

  function recomputeMaxHp(state, h) {
    if (!h.baseMaxHp) h.baseMaxHp = h.maxHp;
    const ratio = ZG.Tech ? ZG.Tech.mods(state).hpMul : 1;
    const target = h.baseMaxHp * ratio;
    if (target > 0) {
      h.hp = h.hp * (target / h.maxHp);
      h.maxHp = target;
    }
  }

  ZG.Stats = { human, range, zombie, recomputeMaxHp, ammoBuff };
})();
