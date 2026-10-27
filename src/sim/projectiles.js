/* 火箭 / 药瓶 / BOSS 石块 / 导弹支援 / 爆炸 */
(function () {
  'use strict';
  const ZG = globalThis.ZG = globalThis.ZG || {};
  const D = ZG.Const.DAMAGE;

  function spawn(state, opts) {
    const p = {
      id: ZG.State.nextId(state),
      kind: 'projectile',
      typeId: opts.typeId || 'rocket',
      x: opts.x || 0,
      y: opts.y || 0,
      tx: opts.tx === undefined ? opts.x : opts.tx,
      ty: opts.ty === undefined ? opts.y : opts.ty,
      speed: opts.speed || 420,
      life: opts.life === undefined ? 4 : opts.life,
      delay: opts.delay || 0,
      radius: opts.radius || 0,
      damage: opts.damage || 0,
      damageKind: opts.damageKind || D.EXPLOSION,
      infection: opts.infection || 0,
      hitsHumans: !!opts.hitsHumans,
      hitsBuildings: !!opts.hitsBuildings,
      siegeBonus: opts.siegeBonus || 1,
      ownerId: opts.ownerId || 0,
      color: opts.color || '#FF7043',
      warnT: opts.warnT || 0,
      sideStepped: false,
      alive: true,
      targetId: opts.targetId || 0,
      directTargetId: opts.directTargetId || opts.targetId || 0,
      splashMul: opts.splashMul,
      splash: opts.splash || opts.radius || 60,
      spitKind: opts.spitKind || null,
      poison: opts.poison || null,
      ignoreShield: !!opts.ignoreShield,
      trailMax: opts.trailMax !== undefined ? opts.trailMax
        : ((opts.typeId === 'rocket' || opts.typeId === 'vial' || opts.typeId === 'missile') ? 12 : 0),
      trail: [],
      trailT: 0
    };
    state.projectiles.push(p);
    if (opts.effect) state.effects.push(opts.effect);
    return p;
  }

  function explode(state, x, y, radius, damage, damageKind, opts) {
    const o = opts || {};
    const inRadius = (e) => ZG.Geom.dist2(e.x, e.y, x, y) <=
      (radius + (e.radius || 0)) * (radius + (e.radius || 0));
    let direct = null;
    if (!o.hitsHumans && o.splashMul !== undefined) {
      if (o.directTargetId) {
        direct = state.zombies.find(z => z.alive && z.id === o.directTargetId && inRadius(z)) || null;
      }
      if (!direct) {
        let bestD = Infinity;
        for (const z of state.zombies) {
          if (!z.alive || !inRadius(z)) continue;
          const d = ZG.Geom.dist2(z.x, z.y, x, y);
          if (d < bestD || (d === bestD && direct && z.id < direct.id)) {
            bestD = d; direct = z;
          }
        }
      }
    }
    if (!o.hitsHumans) {
      for (const z of state.zombies.slice()) {
        if (!z.alive || !inRadius(z)) continue;
        let dmg = damage;
        if (o.splashMul !== undefined) {
          if (direct && z.id === direct.id) {
            if (o.siegeBonus && (z.isSiege || z.isBoss)) dmg *= o.siegeBonus;
          } else {
            dmg *= o.splashMul;
          }
        } else if (o.siegeBonus && z.isSiege) {
          dmg *= o.siegeBonus;
        }
        ZG.Combat.applyDamage(state, {
          target: z, amount: dmg, damageKind: damageKind || D.EXPLOSION,
          fromX: x, fromY: y
        });
      }
    }
    if (o.hitsHumans) {
      // 仅带 splashMul 的爆炸区分直击目标与溅射；旧调用行为不变
      let direct = null;
      if (o.splashMul !== undefined) {
        direct = state.humans.find(h => h.alive && h.id === o.directTargetId) || null;
        if (direct && ZG.Geom.dist2(direct.x, direct.y, x, y) >
            (radius + direct.radius) * (radius + direct.radius)) direct = null;
      }
      for (const h of state.humans.slice()) {
        if (!h.alive) continue;
        const d2 = ZG.Geom.dist2(h.x, h.y, x, y);
        if (d2 <= (radius + h.radius) * (radius + h.radius)) {
          let dmg = damage;
          if (o.splashMul !== undefined && (!direct || h.id !== direct.id)) {
            dmg *= o.splashMul;
          }
          if (o.kind === 'boomer') dmg *= ZG.Combat.shieldGuardMul(state, h, x, y);
          ZG.Combat.applyDamage(state, {
            target: h, amount: dmg, damageKind: damageKind || D.EXPLOSION,
            fromX: x, fromY: y, ignoreShield: !!o.ignoreShield
          });
          if (h.alive && o.infection) ZG.Infection.add(state, h, o.infection);
        }
      }
    }
    if (o.hitsBuildings) {
      for (const b of state.buildings.slice()) {
        if (!b.alive) continue;
        const d2 = ZG.Geom.dist2(b.x, b.y, x, y);
        if (d2 <= (radius + b.radius) * (radius + b.radius)) {
          ZG.Combat.applyBuildingDamage(state, b, o.buildingDamage || damage);
        }
      }
    }
    state.bus.emit('fx:explosion', { x, y, radius, color: o.color || '#FF7043', kind: o.kind || 'normal' });
    if (o.kind === 'missile') {
      if (state.effects.length < 246) {
        state.effects.push({
          kind: 'boom', x, y, radius: 110, life: 0.45, maxLife: 0.45,
          color: '#FFD54F', seed: 1
        });
        state.effects.push({
          kind: 'rock_impact', x, y, radius: 90, life: 0.6, maxLife: 0.6,
          color: '#FF7043', seed: 2
        });
      }
      state.bus.emit('fx:missile', { x, y });
    }
  }

  // 腐吐者子弹到达结算：毒弹不走 explode（无爆炸音效/震屏）
  function impactSpit(state, p) {
    if (p.spitKind === 'normal') {
      const h = state.humans.find(x => x.alive && x.id === p.targetId);
      const r = p.splash || 16;
      if (h && ZG.Geom.dist2(h.x, h.y, p.x, p.y) <= (r + h.radius) * (r + h.radius)) {
        ZG.Combat.applyDamage(state, {
          target: h, amount: p.damage, damageKind: D.RANGED,
          fromX: p.x, fromY: p.y
        });
      }
      return;
    }

    if (p.spitKind === 'poison') {
      const r = p.splash || p.radius;
      for (const h of state.humans.slice()) {
        if (!h.alive) continue;
        if (ZG.Geom.dist2(h.x, h.y, p.x, p.y) > (r + h.radius) * (r + h.radius)) continue;
        ZG.Combat.applyDamage(state, {
          target: h, amount: p.damage, damageKind: D.POISON,
          fromX: p.x, fromY: p.y, ignoreShield: true
        });
        if (h.alive && p.poison) {
          ZG.Infection.poison(state, h, p.poison.dps, p.poison.duration);
        }
      }
      const life = p.poison ? p.poison.duration : 3.5;
      state.effects.push({
        kind: 'poison_cloud', x: p.x, y: p.y, radius: r,
        color: '#7CB342', life, maxLife: life, seed: p.id
      });
      state.bus.emit('fx:poison', { x: p.x, y: p.y, radius: r });
      return;
    }

    explode(state, p.x, p.y, p.splash || p.radius, p.damage, D.EXPLOSION, {
      hitsHumans: true, directTargetId: p.targetId,
      splashMul: p.splashMul, color: p.color, kind: 'spitter_boom'
    });
  }

  function step(state) {
    const dt = ZG.Const.STEP_SEC;

    for (const p of state.projectiles) {
      if (!p.alive) continue;
      if (p.delay > 0) { p.delay -= dt; continue; }

      if (p.typeId === 'rock') {
        p.warnT -= dt;
        if (!p.sideStepped && p.warnT <= 1.6) {
          p.sideStepped = true;
          for (const h of state.humans) {
            if (!h.alive || h.classId === 'shield') continue;
            const d2 = ZG.Geom.dist2(h.x, h.y, p.x, p.y);
            if (d2 <= p.radius * p.radius) {
              const dx = h.x - p.x, dy = h.y - p.y;
              const len = Math.hypot(dx, dy) || 1;
              const pos = ZG.Geom.clampToWorld(
                h.x + (dx / len) * 60,
                h.y + (dy / len) * 60,
                h.radius
              );
              if (!ZG.Geom.isBlockedAt(state, pos.x, pos.y, h.radius)) {
                h.x = pos.x; h.y = pos.y;
              }
            }
          }
        }
        if (p.warnT <= 0) {
          p.alive = false;
          explode(state, p.x, p.y, p.radius, p.damage, D.EXPLOSION, {
            hitsHumans: true, hitsBuildings: false, infection: p.infection,
            color: '#EF5350', kind: 'rock'
          });
          if (state.effects.length < 250) {
            state.effects.push({
              kind: 'rock_impact', x: p.x, y: p.y, radius: p.radius,
              life: 0.9, maxLife: 0.9, color: '#FF7043', seed: p.id
            });
            state.effects.push({
              kind: 'crack', x: p.x, y: p.y, radius: p.radius * 1.4,
              life: 6, maxLife: 6, color: '#8D6E63', seed: p.id
            });
          }
          state.bus.emit('fx:rockBreak', { x: p.x, y: p.y });
        }
        continue;
      }

      const dx = p.tx - p.x, dy = p.ty - p.y;
      const dist = Math.hypot(dx, dy);
      const move = p.speed * dt;
      if (dist <= move || p.life <= 0) {
        p.alive = false;
        p.x = p.tx;
        p.y = p.ty;
        if (p.typeId === 'vial' && p.targetId) {
          const z = state.zombies.find(q => q.id === p.targetId && q.alive);
          if (z) ZG.Combat.tryConvert(state, z);
        }
        if (p.typeId === 'spit') {
          impactSpit(state, p);
          continue;
        }
        explode(state, p.tx, p.ty, p.splash || p.radius, p.damage, p.damageKind, {
          hitsHumans: p.hitsHumans, hitsBuildings: p.hitsBuildings,
          siegeBonus: p.siegeBonus,
          directTargetId: p.directTargetId, splashMul: p.splashMul,
          ignoreShield: p.ignoreShield,
          color: p.color, kind: p.typeId
        });
        continue;
      }
      p.x += (dx / dist) * move;
      p.y += (dy / dist) * move;
      p.life -= dt;
      if (p.trailMax > 0) {
        p.trailT += dt;
        if (p.trailT >= 2 * dt) {
          p.trailT = 0;
          p.trail.push({ x: p.x, y: p.y });
          if (p.trail.length > p.trailMax) p.trail.shift();
        }
      }
    }

    // 淘汰
    for (let i = state.projectiles.length - 1; i >= 0; i--) {
      if (!state.projectiles[i].alive) state.projectiles.splice(i, 1);
    }

    // 特效寿命
    for (let i = state.effects.length - 1; i >= 0; i--) {
      const e = state.effects[i];
      e.life -= dt;
      if (e.life <= 0) state.effects.splice(i, 1);
    }
    if (state.effects.length > (state.quality === 'mobile'
      ? ZG.Const.MAX_EFFECTS_MOBILE : ZG.Const.MAX_EFFECTS)) {
      const cap = state.quality === 'mobile'
        ? ZG.Const.MAX_EFFECTS_MOBILE : ZG.Const.MAX_EFFECTS;
      state.effects.splice(0, state.effects.length - cap);
    }
  }

  function tracer(state, x1, y1, x2, y2, color, kind) {
    state.effects.push({
      kind: kind || 'tracer', x1, y1, x2, y2,
      color: color || '#BFE6FF', life: 0.05, maxLife: 0.05
    });
  }

  ZG.Projectiles = { spawn, step, explode, tracer };
})();
