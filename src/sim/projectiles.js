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
      splash: opts.splash || opts.radius || 60
    };
    state.projectiles.push(p);
    if (opts.effect) state.effects.push(opts.effect);
    return p;
  }

  function explode(state, x, y, radius, damage, damageKind, opts) {
    const o = opts || {};
    if (!o.hitsHumans) {
      for (const z of state.zombies.slice()) {
        if (!z.alive) continue;
        const d2 = ZG.Geom.dist2(z.x, z.y, x, y);
        if (d2 <= (radius + z.radius) * (radius + z.radius)) {
          let dmg = damage;
          if (o.siegeBonus && z.isSiege) dmg *= o.siegeBonus;
          ZG.Combat.applyDamage(state, {
            target: z, amount: dmg, damageKind: damageKind || D.EXPLOSION,
            fromX: x, fromY: y
          });
        }
      }
    }
    if (o.hitsHumans) {
      for (const h of state.humans.slice()) {
        if (!h.alive) continue;
        const d2 = ZG.Geom.dist2(h.x, h.y, x, y);
        if (d2 <= (radius + h.radius) * (radius + h.radius)) {
          ZG.Combat.applyDamage(state, {
            target: h, amount: damage, damageKind: damageKind || D.EXPLOSION,
            fromX: x, fromY: y
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
              const pos = ZG.Geom.clampPoint(
                h.x + (dx / len) * 60,
                h.y + (dy / len) * 60,
                state.map.deploy, h.radius
              );
              h.x = pos.x; h.y = pos.y;
            }
          }
        }
        if (p.warnT <= 0) {
          p.alive = false;
          explode(state, p.x, p.y, p.radius, p.damage, D.EXPLOSION, {
            hitsHumans: true, hitsBuildings: false, infection: p.infection,
            color: '#EF5350', kind: 'rock'
          });
        }
        continue;
      }

      const dx = p.tx - p.x, dy = p.ty - p.y;
      const dist = Math.hypot(dx, dy);
      const move = p.speed * dt;
      if (dist <= move || p.life <= 0) {
        p.alive = false;
        if (p.typeId === 'vial' && p.targetId) {
          const z = state.zombies.find(q => q.id === p.targetId && q.alive);
          if (z) ZG.Combat.tryConvert(state, z);
        }
        explode(state, p.tx, p.ty, p.splash || p.radius, p.damage, p.damageKind, {
          hitsHumans: false, hitsBuildings: false, siegeBonus: p.siegeBonus,
          color: p.color, kind: p.typeId
        });
        continue;
      }
      p.x += (dx / dist) * move;
      p.y += (dy / dist) * move;
      p.life -= dt;
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
    if (state.effects.length > ZG.Const.MAX_EFFECTS) {
      state.effects.splice(0, state.effects.length - ZG.Const.MAX_EFFECTS);
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
