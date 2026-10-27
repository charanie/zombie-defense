/* 粒子、伤害数字、震屏（对象池 + 上限） */
(function () {
  'use strict';
  const ZG = globalThis.ZG = globalThis.ZG || {};

  function drawShape(ctx, p, size) {
    const s = Math.max(0.4, size);
    if (p.shape === 'spark') {
      const ang = Math.atan2(p.vy, p.vx) || p.rot;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - Math.cos(ang) * s * 4, p.y - Math.sin(ang) * s * 4);
      ctx.stroke();
    } else if (p.shape === 'smoke') {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, s * 1.6, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.shape === 'shard') {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.moveTo(p.x + Math.cos(p.rot) * s * 2, p.y + Math.sin(p.rot) * s * 2);
      ctx.lineTo(p.x + Math.cos(p.rot + 2.4) * s, p.y + Math.sin(p.rot + 2.4) * s);
      ctx.lineTo(p.x + Math.cos(p.rot - 2.4) * s, p.y + Math.sin(p.rot - 2.4) * s);
      ctx.closePath();
      ctx.fill();
    } else if (p.shape === 'star') {
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const ang = p.rot + (i * Math.PI) / 2;
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + Math.cos(ang) * s * 3, p.y + Math.sin(ang) * s * 3);
      }
      ctx.stroke();
    } else {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, s, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function create(opts) {
    const o = opts || {};
    const cap = o.cap || ZG.Const.PARTICLE_CAP_DESKTOP;
    const damageCap = o.damageCap || ZG.Const.DAMAGE_NUMBER_CAP;
    const particles = [];
    const damage = [];
    let cursor = 0;
    let dmgCursor = 0;
    let shakeT = 0, shakePower = 0, shakeX = 0, shakeY = 0;
    let burstScale = 1;

    const api = {
      cap,
      damageCap,
      spawn(kind, x, y, opts2) {
        const p = opts2 || {};
        const item = {
          kind: kind || 'spark',
          x, y,
          vx: p.vx !== undefined ? p.vx : (Math.random() - 0.5) * 120,
          vy: p.vy !== undefined ? p.vy : (Math.random() - 0.5) * 120,
          life: p.life || 0.45,
          maxLife: p.life || 0.45,
          color: p.color || '#FFE082',
          size: p.size || 2.4,
          gravity: p.gravity || 0,
          ring: !!p.ring,
          shape: p.shape || 'circle',
          rot: p.rot || 0,
          spin: p.spin || 0,
          scaleTo: p.scaleTo || 1,
          additive: !!p.additive,
          text: p.text || null
        };
        if (particles.length < cap) particles.push(item);
        else {
          particles[cursor % cap] = item;
          cursor++;
        }
        return item;
      },
      addDamageNumber(x, y, amount, color) {
        const item = {
          x, y, amount: Math.max(1, Math.round(amount)),
          life: 0.5, maxLife: 0.5,
          color: color || '#FFFFFF',
          vy: -36
        };
        if (damage.length < damageCap) damage.push(item);
        else {
          damage[dmgCursor % damageCap] = item;
          dmgCursor++;
        }
      },
      burst(x, y, color, n) {
        const count = Math.max(1, Math.round((n || 8) * burstScale));
        for (let i = 0; i < count; i++) {
          const a = Math.random() * Math.PI * 2;
          const sp = 40 + Math.random() * 130;
          api.spawn('spark', x, y, {
            vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
            color, life: 0.3 + Math.random() * 0.35, size: 1.5 + Math.random() * 2
          });
        }
      },
      explosion(x, y, radius, color) {
        api.spawn('ring', x, y, {
          color: color || '#FF7043', life: 0.4, ring: true,
          size: radius || 60, vx: 0, vy: 0
        });
        api.burst(x, y, color || '#FF7043', 14);
      },
      coin(x, y) {
        api.spawn('coin', x, y, { color: '#FFD54F', life: 0.9, vy: -70, size: 5 });
      },
      step() {
        const dt = 1 / 60;
        for (let i = particles.length - 1; i >= 0; i--) {
          const p = particles[i];
          p.life -= dt;
          if (p.life <= 0) { particles.splice(i, 1); continue; }
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.vy += p.gravity * dt;
          p.vx *= 0.98;
          p.rot += p.spin * dt;
        }
        for (let i = damage.length - 1; i >= 0; i--) {
          const d = damage[i];
          d.life -= dt;
          if (d.life <= 0) { damage.splice(i, 1); continue; }
          d.y += d.vy * dt;
          d.vy *= 0.94;
        }
        if (shakeT > 0) {
          shakeT -= dt;
          const k = Math.max(0, shakeT) * shakePower;
          shakeX = (Math.random() - 0.5) * 2 * k;
          shakeY = (Math.random() - 0.5) * 2 * k;
        } else {
          shakeX = 0; shakeY = 0;
        }
      },
      draw(ctx, settings) {
        for (const p of particles) {
          const a = Math.max(0, p.life / p.maxLife);
          const scale = 1 + (p.scaleTo - 1) * (1 - a);
          ctx.globalAlpha = a;
          if (p.additive) ctx.globalCompositeOperation = 'lighter';
          if (p.kind === 'ring') {
            ctx.globalAlpha = a * 0.55;
            ctx.strokeStyle = p.color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * (0.7 + 0.6 * (1 - a)), 0, Math.PI * 2);
            ctx.stroke();
          } else if (p.kind === 'coin') {
            ctx.fillStyle = p.color;
            ctx.font = 'bold 12px "Microsoft YaHei", sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('+', p.x, p.y);
          } else {
            drawShape(ctx, p, p.size * a * scale);
          }
          if (p.additive) ctx.globalCompositeOperation = 'source-over';
        }
        ctx.globalAlpha = 1;

        if (settings && settings.damageNumbers === false) return;
        ctx.textAlign = 'center';
        for (const d of damage) {
          const a = Math.max(0, d.life / d.maxLife);
          ctx.globalAlpha = a;
          ctx.fillStyle = d.color;
          ctx.font = 'bold 11px "Microsoft YaHei", sans-serif';
          ctx.fillText(String(d.amount), d.x, d.y);
        }
        ctx.globalAlpha = 1;
      },
      shake(power) {
        shakeT = Math.max(shakeT, 0.2);
        shakePower = Math.max(shakePower, power || 4);
      },
      setQuality(q) { burstScale = q === 'mobile' ? 0.5 : 1; },
      getOffset() { return { x: shakeX, y: shakeY }; },
      activeCount() { return particles.length; },
      damageCount() { return damage.length; },
      reset() { particles.length = 0; damage.length = 0; shakeT = 0; }
    };
    return api;
  }

  const defaultInstance = create({ cap: 250, damageCap: 50 });

  ZG.Particles = Object.assign({ create }, {
    spawn: (...a) => defaultInstance.spawn(...a),
    addDamageNumber: (...a) => defaultInstance.addDamageNumber(...a),
    burst: (...a) => defaultInstance.burst(...a),
    explosion: (...a) => defaultInstance.explosion(...a),
    coin: (...a) => defaultInstance.coin(...a),
    step: () => defaultInstance.step(),
    draw: (...a) => defaultInstance.draw(...a),
    shake: (...a) => defaultInstance.shake(...a),
    setQuality: (...a) => defaultInstance.setQuality(...a),
    getOffset: () => defaultInstance.getOffset(),
    activeCount: () => defaultInstance.activeCount(),
    damageCount: () => defaultInstance.damageCount(),
    reset: () => defaultInstance.reset(),
    instance: defaultInstance
  });
})();
