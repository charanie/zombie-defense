/* ZG.Fx — 技能/特殊攻击特效样式表与三层绘制。
 *
 * 模拟层只 push 几何、时长与颜色：
 *   kind, x, y, x1, y1, x2, y2, radius, facing, arc, ang, color,
 *   life, maxLife, seed, width, alpha
 * 绘制样式全部集中在本文件；分 world（地面）/ air（空中）/ screen（屏幕泛光）三层。
 *
 * 移动端降级：quality === 'mobile' 时关闭 screen 层，绘制器把粒子/装饰数量减半。
 */
(function () {
  'use strict';
  const ZG = globalThis.ZG = globalThis.ZG || {};

  const KINDS = [
    'missile_lock', 'shockwave', 'inspire', 'groupheal', 'slash', 'rock_warn',
    'rock_impact', 'stomp', 'boom', 'summon', 'poison_cloud', 'crack', 'burn_mark',
    'burrow', 'shield_flash', 'flame', 'tracer', 'dash_warn',
    // v1.4 已有特效，保留绘制
    'fire_ring', 'heal_ring', 'taunt_ring', 'support_heal', 'mg_sweep', 'support_warn'
  ];

  const LAYER = {
    missile_lock: 'world', shockwave: 'world', inspire: 'air', groupheal: 'air',
    slash: 'air', rock_warn: 'world', rock_impact: 'world', stomp: 'world',
    boom: 'world', summon: 'world', poison_cloud: 'world', crack: 'world',
    burn_mark: 'world', burrow: 'world', shield_flash: 'air', flame: 'air',
    tracer: 'air', dash_warn: 'world',
    fire_ring: 'world', heal_ring: 'world', taunt_ring: 'world',
    support_heal: 'world', mg_sweep: 'world', support_warn: 'world'
  };

  const COLOR = {
    missile_lock: '#FFD54F', shockwave: '#FFCC80', inspire: '#FFD54F',
    groupheal: '#66BB6A', slash: '#FFFFFF', rock_warn: '#EF5350',
    rock_impact: '#FF7043', stomp: '#FFB74D', boom: '#FF7043',
    summon: '#E1BEE7', poison_cloud: '#7CB342', crack: '#8D6E63',
    burn_mark: '#4E342E', burrow: '#A1887F', shield_flash: '#42A5F5',
    flame: '#FF7043', tracer: '#FFE082', dash_warn: '#EF5350',
    fire_ring: '#FF7043', heal_ring: '#66BB6A', taunt_ring: '#FFD54F',
    support_heal: '#66BB6A', mg_sweep: '#FFE082', support_warn: '#FF7043'
  };

  function alphaOf(e) {
    const a = (e.life || 0) / (e.maxLife || 0.1);
    return Math.max(0, Math.min(1, a));
  }

  function rgba(hex, a) {
    if (typeof hex !== 'string' || hex.charAt(0) !== '#') return 'rgba(255,255,255,' + a + ')';
    const n = parseInt(hex.slice(1), 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  function lcg(seed) {
    let s = (seed >>> 0) || 1;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function mobile(state) { return state && state.quality === 'mobile'; }

  function describe(e) {
    if (!e || !LAYER[e.kind]) return null;
    return {
      layer: LAYER[e.kind],
      color: e.color || COLOR[e.kind] || '#FFFFFF',
      radius: e.radius || e.range || 0,
      alpha: alphaOf(e)
    };
  }

  /* ---------------- world 层 ---------------- */

  function drawMissileLock(ctx, e, a, color) {
    const r = e.radius || 120;
    const pulse = 1 - a * 0.25;
    ctx.save();
    ctx.globalAlpha = 0.35 + 0.55 * a;
    ctx.strokeStyle = color;
    ctx.fillStyle = rgba(color, 0.09);
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(e.x, e.y, r * pulse, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(e.x, e.y, r * 0.45 * pulse, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(e.x - r * 0.7, e.y); ctx.lineTo(e.x - r * 0.25, e.y);
    ctx.moveTo(e.x + r * 0.25, e.y); ctx.lineTo(e.x + r * 0.7, e.y);
    ctx.moveTo(e.x, e.y - r * 0.7); ctx.lineTo(e.x, e.y - r * 0.25);
    ctx.moveTo(e.x, e.y + r * 0.25); ctx.lineTo(e.x, e.y + r * 0.7);
    ctx.stroke();
    ctx.strokeStyle = rgba('#FFFFFF', 0.45);
    ctx.beginPath(); ctx.arc(e.x, e.y, r * 0.14, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  function drawRockWarn(ctx, e, a, color) {
    const r = e.radius || 70;
    ctx.save();
    ctx.globalAlpha = 0.3 + 0.6 * a;
    // 落点阴影
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(e.x, e.y + 6, r * 0.5, r * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.fillStyle = rgba(color, 0.1);
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // 收缩环：越接近落地越小
    ctx.globalAlpha = 0.5 + 0.5 * a;
    ctx.beginPath(); ctx.arc(e.x, e.y, r * a, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(e.x - 12, e.y); ctx.lineTo(e.x + 12, e.y);
    ctx.moveTo(e.x, e.y - 12); ctx.lineTo(e.x, e.y + 12);
    ctx.stroke();
    ctx.restore();
  }

  function drawShockwave(ctx, e, a, color) {
    ctx.save();
    ctx.globalAlpha = a * 0.8;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    if (e.range) {
      // 旧数据：扇形冲击波
      ctx.translate(e.x, e.y);
      ctx.rotate(e.facing || 0);
      const half = ((e.coneDeg || 60) * Math.PI) / 360;
      ctx.fillStyle = rgba(color, 0.25 * a);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, e.range, -half, half);
      ctx.closePath();
      ctx.fill();
    } else {
      const r = (e.radius || 80) * (1.15 - a * 0.5);
      ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = a * 0.45;
      ctx.beginPath(); ctx.arc(e.x, e.y, r * 0.62, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }

  function drawRockImpact(ctx, e, a, color) {
    ctx.save();
    for (let i = 0; i < 3; i++) {
      ctx.globalAlpha = (a - i * 0.16) * 0.7;
      if (ctx.globalAlpha <= 0) continue;
      ctx.strokeStyle = i === 0 ? '#FFFFFF' : color;
      ctx.lineWidth = 4 - i;
      ctx.beginPath();
      ctx.arc(e.x, e.y, (e.radius || 70) * (0.35 + (1 - a) * 0.9) * (1 + i * 0.18), 0, Math.PI * 2);
      ctx.stroke();
    }
    // 碎石
    ctx.fillStyle = rgba(color, 0.8);
    const rnd = lcg((e.seed || 3) * 17 + 5);
    for (let i = 0; i < 6; i++) {
      const ang = rnd() * Math.PI * 2;
      const d = (e.radius || 70) * (0.3 + rnd() * 0.6);
      const s = 2 + rnd() * 3;
      ctx.fillRect(e.x + Math.cos(ang) * d, e.y + Math.sin(ang) * d, s, s);
    }
    ctx.restore();
  }

  function drawStomp(ctx, e, a, color) {
    ctx.save();
    const r = e.radius || 90;
    ctx.globalAlpha = a * 0.7;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(e.x, e.y, r * (1.05 - a * 0.45), 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(e.x, e.y, r * (0.7 - a * 0.25), 0, Math.PI * 2); ctx.stroke();
    // 尘土
    ctx.fillStyle = rgba('#C9A66B', 0.5 * a);
    for (let i = 0; i < 10; i++) {
      const ang = (i / 10) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(e.x + Math.cos(ang) * r * 0.9, e.y + Math.sin(ang) * r * 0.5, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawBoom(ctx, e, a, color) {
    const r = (e.radius || 60) * (0.6 + (1 - a) * 0.8);
    ctx.save();
    ctx.globalAlpha = a * 0.55;
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = a * 0.9;
    ctx.strokeStyle = '#FFE0B2';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(e.x, e.y, r * 0.85, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  function drawSummon(ctx, e, a, color) {
    const t = (e.life || 0) * 6;
    ctx.save();
    ctx.globalAlpha = 0.3 + 0.6 * a;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(e.x, e.y, 14 + (1 - a) * 52, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = rgba('#9CFF57', 0.7);
    ctx.beginPath(); ctx.arc(e.x, e.y, 8 + (1 - a) * 34, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = rgba(color, 0.85);
    for (let i = 0; i < 6; i++) {
      const ang = t + (i / 6) * Math.PI * 2;
      const rr = 20 + (1 - a) * 40;
      ctx.beginPath();
      ctx.arc(e.x + Math.cos(ang) * rr, e.y + Math.sin(ang) * rr * 0.6, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawPoisonCloud(ctx, e, a, color) {
    const r = e.radius || 70;
    ctx.save();
    const g = ctx.createRadialGradient(e.x, e.y, 4, e.x, e.y, r);
    g.addColorStop(0, 'rgba(124,179,66,' + (0.2 + 0.15 * a) + ')');
    g.addColorStop(0.7, 'rgba(46,125,50,' + (0.14 + 0.1 * a) + ')');
    g.addColorStop(1, 'rgba(46,125,50,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = rgba('#AED581', 0.25 * a + 0.12);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    const t = ((e.life || 0) * 1.7) + (e.seed || 0);
    const n = 5;
    for (let i = 0; i < n; i++) {
      const tt = t + i * 1.26;
      const rr = r * (0.25 + 0.55 * ((i * 0.37) % 1));
      ctx.fillStyle = rgba('#D5F5B8', 0.35 * a);
      ctx.beginPath();
      ctx.arc(e.x + Math.cos(tt) * rr, e.y + Math.sin(tt * 1.3) * rr, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawCrack(ctx, e, a, color) {
    const rnd = lcg((e.seed || 1) * 31 + 7);
    const r = e.radius || 40;
    ctx.save();
    ctx.globalAlpha = a * 0.75;
    ctx.strokeStyle = '#1A1210';
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      let ang = rnd() * Math.PI * 2;
      let x = e.x, y = e.y;
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let k = 0; k < 3; k++) {
        ang += (rnd() - 0.5) * 0.8;
        x += Math.cos(ang) * r * 0.4;
        y += Math.sin(ang) * r * 0.4;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawBurnMark(ctx, e, a, color) {
    const r = e.radius || 26;
    ctx.save();
    ctx.globalAlpha = a * 0.55;
    ctx.fillStyle = '#2A1C14';
    ctx.beginPath();
    ctx.ellipse(e.x, e.y, r, r * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = a * 0.35;
    ctx.fillStyle = 'rgba(255,120,40,0.6)';
    ctx.beginPath();
    ctx.arc(e.x, e.y, r * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawBurrow(ctx, e, a, color) {
    const rnd = lcg((e.seed || 2) * 13 + 3);
    ctx.save();
    ctx.globalAlpha = a * 0.85;
    ctx.fillStyle = color;
    for (let i = 0; i < 7; i++) {
      const ang = rnd() * Math.PI * 2;
      const d = 6 + rnd() * 22;
      const s = 2 + rnd() * 2.5;
      ctx.beginPath();
      ctx.moveTo(e.x + Math.cos(ang) * d, e.y + Math.sin(ang) * d);
      ctx.lineTo(e.x + Math.cos(ang) * d + s, e.y + Math.sin(ang) * d + s);
      ctx.lineTo(e.x + Math.cos(ang) * d - s, e.y + Math.sin(ang) * d + s);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function drawDashWarn(ctx, e, a, color) {
    const ang = Math.atan2((e.y2 || e.y) - (e.y1 || e.y), (e.x2 || e.x) - (e.x1 || e.x));
    ctx.save();
    ctx.globalAlpha = 0.45 + 0.55 * a;
    ctx.strokeStyle = color;
    ctx.lineWidth = 5;
    ctx.setLineDash([14, 8]);
    ctx.beginPath();
    ctx.moveTo(e.x1 !== undefined ? e.x1 : e.x, e.y1 !== undefined ? e.y1 : e.y);
    ctx.lineTo(e.x2 !== undefined ? e.x2 : e.x, e.y2 !== undefined ? e.y2 : e.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = rgba('#FF8A80', 0.95);
    const x2 = e.x2 !== undefined ? e.x2 : e.x;
    const y2 = e.y2 !== undefined ? e.y2 : e.y;
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - Math.cos(ang - 0.45) * 16, y2 - Math.sin(ang - 0.45) * 16);
    ctx.lineTo(x2 - Math.cos(ang + 0.45) * 16, y2 - Math.sin(ang + 0.45) * 16);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /* ---------------- air 层 ---------------- */

  function drawSlash(ctx, e, a, color) {
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(e.facing || 0);
    if (e.length) {
      // 旧数据：渐变矩形剑气
      const g = ctx.createLinearGradient(0, 0, e.length, 0);
      g.addColorStop(0, 'rgba(255,255,255,0.9)');
      g.addColorStop(1, 'rgba(255,138,101,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, -(e.width || 10) / 2, e.length, e.width || 10);
    } else {
      const r = e.radius || 90;
      const arc = e.arc || 0.9;
      ctx.globalAlpha = 1;
      for (let i = 0; i < 3; i++) {
        ctx.globalAlpha = (a - i * 0.18) * 0.9;
        if (ctx.globalAlpha <= 0) continue;
        ctx.strokeStyle = i === 0 ? '#FFFFFF' : (i === 1 ? '#FFD180' : '#FF8A65');
        ctx.lineWidth = 7 - i * 2;
        ctx.beginPath();
        ctx.arc(0, 0, r * (0.75 + i * 0.12), -arc / 2, arc / 2);
        ctx.stroke();
      }
      // 火星
      ctx.fillStyle = rgba('#FFE082', a * 0.8);
      for (let i = 0; i < 4; i++) {
        const ang = -arc / 2 + (arc / 5) * (i + 1);
        ctx.beginPath();
        ctx.arc(Math.cos(ang) * r, Math.sin(ang) * r, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawFlame(ctx, e, a, color) {
    const x = e.x1 !== undefined ? e.x1 : e.x;
    const y = e.y1 !== undefined ? e.y1 : e.y;
    const range = e.range || e.radius || 150;
    const half = ((e.coneDeg || e.arc * 57.3 || 50) * Math.PI) / 360;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(e.facing || 0);
    const layers = [
      { r: range, col: 'rgba(255,112,67,0.35)', w: 1 },
      { r: range * 0.72, col: 'rgba(255,167,38,0.5)', w: 1 },
      { r: range * 0.45, col: 'rgba(255,241,118,0.65)', w: 1 }
    ];
    for (const L of layers) {
      ctx.globalAlpha = a;
      ctx.fillStyle = L.col;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, L.r, -half, half);
      ctx.closePath();
      ctx.fill();
    }
    // 火星
    ctx.fillStyle = rgba('#FFD54F', a * 0.85);
    const rnd = lcg((e.seed || 9) * 7 + 1);
    for (let i = 0; i < 6; i++) {
      const ang = (rnd() - 0.5) * half * 2;
      const d = range * (0.4 + rnd() * 0.6);
      ctx.beginPath();
      ctx.arc(Math.cos(ang) * d, Math.sin(ang) * d, 1.6 + rnd() * 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawTracer(ctx, e, a, color) {
    const x1 = e.x1 !== undefined ? e.x1 : e.x;
    const y1 = e.y1 !== undefined ? e.y1 : e.y;
    const x2 = e.x2 !== undefined ? e.x2 : e.x;
    const y2 = e.y2 !== undefined ? e.y2 : e.y;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.strokeStyle = rgba(color, 0.35);
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.restore();
  }

  function drawInspire(ctx, e, a, color) {
    const r = e.radius || 200;
    ctx.save();
    ctx.globalAlpha = a * 0.7;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(e.x, e.y, r * (1.1 - a * 0.5), 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = a * 0.45;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(e.x, e.y, r * (0.8 - a * 0.3), 0, Math.PI * 2); ctx.stroke();
    // 上升金环
    ctx.fillStyle = rgba(color, a * 0.8);
    for (let i = 0; i < 5; i++) {
      const ang = (i / 5) * Math.PI * 2;
      const d = r * 0.55;
      const lift = (1 - a) * 24;
      ctx.beginPath();
      ctx.arc(e.x + Math.cos(ang) * d, e.y + Math.sin(ang) * d * 0.6 - lift, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawGroupHeal(ctx, e, a, color) {
    const r = e.radius || 180;
    ctx.save();
    ctx.globalAlpha = a * 0.65;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(e.x, e.y, r * (1.05 - a * 0.45), 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(e.x, e.y, r * (0.75 - a * 0.3), 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = rgba(color, a * 0.9);
    for (let i = 0; i < 5; i++) {
      const ang = (i / 5) * Math.PI * 2 + a;
      const d = r * 0.5;
      const cx = e.x + Math.cos(ang) * d;
      const cy = e.y + Math.sin(ang) * d * 0.7 - (1 - a) * 20;
      ctx.fillRect(cx - 2, cy - 6, 4, 12);
      ctx.fillRect(cx - 6, cy - 2, 12, 4);
    }
    ctx.restore();
  }

  function drawShieldFlash(ctx, e, a, color) {
    const r = e.radius || 26;
    ctx.save();
    ctx.globalAlpha = a * 0.9;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(e.x, e.y, r, (e.facing || 0) - 0.9, (e.facing || 0) + 0.9);
    ctx.stroke();
    ctx.strokeStyle = rgba('#FFFFFF', a * 0.7);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(e.x, e.y, r + 5, (e.facing || 0) - 0.55, (e.facing || 0) + 0.55);
    ctx.stroke();
    ctx.restore();
  }

  function drawRing(ctx, e, a, color) {
    ctx.save();
    ctx.globalAlpha = a * 0.75;
    ctx.strokeStyle = color;
    ctx.fillStyle = rgba(color, 0.16);
    ctx.lineWidth = 2;
    const r = (e.radius || 60) * (1 - a * 0.35);
    ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  function drawMgSweep(ctx, e, a, color) {
    ctx.save();
    ctx.globalAlpha = a * 0.5;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(e.x, e.y, e.radius || 150, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  function drawSupportWarn(ctx, e, a, color) {
    ctx.save();
    ctx.globalAlpha = 0.35 + 0.35 * (1 - a);
    ctx.strokeStyle = color;
    ctx.setLineDash([8, 6]);
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(e.x, e.y, e.radius || 130, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  const DRAWERS = {
    missile_lock: drawMissileLock,
    rock_warn: drawRockWarn,
    shockwave: drawShockwave,
    rock_impact: drawRockImpact,
    stomp: drawStomp,
    boom: drawBoom,
    summon: drawSummon,
    poison_cloud: drawPoisonCloud,
    crack: drawCrack,
    burn_mark: drawBurnMark,
    burrow: drawBurrow,
    dash_warn: drawDashWarn,
    slash: drawSlash,
    flame: drawFlame,
    tracer: drawTracer,
    inspire: drawInspire,
    groupheal: drawGroupHeal,
    shield_flash: drawShieldFlash,
    fire_ring: drawRing,
    heal_ring: drawRing,
    taunt_ring: drawRing,
    support_heal: drawRing,
    mg_sweep: drawMgSweep,
    support_warn: drawSupportWarn
  };

  function drawLayer(ctx, state, layer) {
    if (!ctx || !state || !state.effects) return;
    for (let i = 0; i < state.effects.length; i++) {
      const e = state.effects[i];
      const d = describe(e);
      if (!d || d.layer !== layer) continue;
      const fn = DRAWERS[e.kind];
      if (!fn) continue;
      ctx.save();
      fn(ctx, e, alphaOf(e), d.color);
      ctx.restore();
    }
  }

  function drawWorld(ctx, state) { drawLayer(ctx, state, 'world'); }
  function drawAir(ctx, state) { drawLayer(ctx, state, 'air'); }

  // 屏幕层：从 shockwave/boom 的剩余生命推导泛光，不新增全局状态。
  function drawScreen(ctx, state) {
    if (!ctx || !state || !state.effects) return;
    if (mobile(state)) return;
    let flash = 0;
    for (let i = 0; i < state.effects.length; i++) {
      const e = state.effects[i];
      if (e.kind !== 'boom' && e.kind !== 'shockwave' && e.kind !== 'rock_impact') continue;
      flash = Math.max(flash, alphaOf(e));
    }
    if (flash <= 0.02) return;
    const w = state.cssW || ZG.Const.W;
    const h = state.cssH || ZG.Const.H;
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(255,236,200,' + (flash * 0.14).toFixed(3) + ')';
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  ZG.Fx = { KINDS, describe, drawWorld, drawAir, drawScreen };
})();
