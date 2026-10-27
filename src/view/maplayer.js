/* ZG.MapLayer — 静态地图背景、区域压暗与缩略图。
 *
 * 绘制顺序（固定）：
 *   主题底色 → 大地面(roads) → 活动区底色(zones) → 标线 → 地面噪声/血迹
 *   → 大件装饰 → terrain → obstacles → 网格 → 区域外压暗 → 暗角 → 地图名
 *
 * 只读 map 数据，不依赖 renderer；背景画在离屏 canvas，一局只画一次。
 */
(function () {
  'use strict';
  const ZG = globalThis.ZG = globalThis.ZG || {};
  const W = ZG.Const.W, H = ZG.Const.H;

  const DECOR_KINDS = [
    'lane', 'doubleLine', 'zebra', 'shoulder', 'guardrail', 'lamp', 'cone',
    'billboard', 'grass', 'crack', 'oil', 'tire', 'track', 'platformLine',
    'tunnel', 'kiosk', 'lightbox', 'vending', 'bench', 'sign', 'gate',
    'plazaTiles', 'cross', 'parking', 'planter', 'planterDetails',
    'fountain', 'van', 'blood', 'puddle',
    // 障碍 theme（同样由 MapLayer 绘制）
    'car', 'truck', 'barrier', 'tires', 'pillar', 'tree'
  ];

  const LINE_KINDS = { lane: 1, doubleLine: 1, shoulder: 1, guardrail: 1, zebra: 1, track: 1, platformLine: 1 };
  const NOISE_KINDS = { grass: 1, crack: 1, oil: 1, tire: 1, blood: 1, puddle: 1 };

  function styleOf(map) {
    const t = (map && map.theme) || {};
    return {
      ground: t.ground || '#1A2233',
      road: t.road || '#232D42',
      accent: t.accent || '#2C3E57',
      obstacle: t.obstacle || '#4A4038',
      zone: t.zone || t.road || '#232D42',
      line: t.line || '#C9B458'
    };
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

  /* ---------------- 标线与噪声 ---------------- */

  function drawLane(ctx, d, st) {
    const y = d.y || 0, x = d.x || 0, w = d.w || W;
    const dash = d.dash || 48, gap = d.gap || 34;
    ctx.save();
    ctx.strokeStyle = rgba(st.line, 0.55);
    ctx.lineWidth = 2;
    ctx.setLineDash([dash, gap]);
    ctx.beginPath();
    ctx.moveTo(x, y + 0.5);
    ctx.lineTo(x + w, y + 0.5);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  function drawDoubleLine(ctx, d, st) {
    const y = d.y || 0, x = d.x || 0, w = d.w || W;
    ctx.save();
    ctx.fillStyle = rgba(st.line, 0.6);
    ctx.fillRect(x, y - 4, w, 2);
    ctx.fillRect(x, y + 2, w, 2);
    ctx.restore();
  }

  function drawShoulder(ctx, d, st) {
    ctx.save();
    ctx.fillStyle = rgba(st.accent, 0.6);
    ctx.fillRect(d.x || 0, (d.y || 0) - 6, d.w || W, 12);
    ctx.restore();
  }

  function drawGuardrail(ctx, d, st) {
    const y = d.y || 0, x = d.x || 0, w = d.w || W;
    ctx.save();
    ctx.strokeStyle = rgba('#9AA7B4', 0.35);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y + 0.5);
    ctx.lineTo(x + w, y + 0.5);
    ctx.stroke();
    ctx.fillStyle = rgba('#9AA7B4', 0.28);
    for (let px = x + 12; px < x + w; px += 48) ctx.fillRect(px, y - 4, 3, 8);
    ctx.restore();
  }

  function drawZebra(ctx, d, st) {
    const x = d.x || 0, y = d.y || 0, w = d.w || 60, h = d.h || 340;
    ctx.save();
    ctx.fillStyle = rgba('#E8EDF2', 0.22);
    for (let px = x; px < x + w; px += 18) ctx.fillRect(px, y, 10, h);
    ctx.restore();
  }

  function drawTrack(ctx, d, st) {
    const x = d.x || 0, y = d.y || 0, w = d.w || W, h = d.h || 160;
    const gap = d.gap || 22;
    ctx.save();
    ctx.fillStyle = rgba('#0A0E13', 0.9);
    ctx.fillRect(x, y, w, h);
    // 枕木
    ctx.fillStyle = rgba('#2B2620', 0.8);
    for (let py = y + 8; py < y + h; py += gap) ctx.fillRect(x, py, w, 6);
    // 钢轨
    ctx.fillStyle = rgba('#8A939C', 0.55);
    ctx.fillRect(x, y + h * 0.32, w, 3);
    ctx.fillRect(x, y + h * 0.68, w, 3);
    ctx.restore();
  }

  function drawPlatformLine(ctx, d, st) {
    const x = d.x || 0, y = d.y || 0, w = d.w || W, h = d.h || 8;
    ctx.save();
    ctx.fillStyle = rgba(st.line, 0.75);
    for (let px = x; px < x + w; px += (d.dash || 26) + (d.gap || 18)) {
      ctx.fillRect(px, y, d.dash || 26, h);
    }
    ctx.restore();
  }

  function drawGrass(ctx, d, st) {
    const rnd = lcg(d.seed || 1);
    const a = d.area || { x: 0, y: 0, w: W, h: H };
    ctx.save();
    ctx.strokeStyle = rgba(d.color || '#2E4630', 0.8);
    ctx.lineWidth = 1.5;
    for (let i = 0; i < (d.count || 12); i++) {
      const x = a.x + rnd() * a.w, y = a.y + rnd() * a.h;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - 3, y - 6);
      ctx.moveTo(x, y);
      ctx.lineTo(x + 2, y - 7);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawCrack(ctx, d, st) {
    const rnd = lcg(d.seed || 1);
    const a = d.area || { x: 0, y: 0, w: W, h: H };
    ctx.save();
    ctx.strokeStyle = 'rgba(8,10,12,0.55)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < (d.count || 8); i++) {
      let x = a.x + rnd() * a.w, y = a.y + rnd() * a.h;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let k = 0; k < 3; k++) {
        x += (rnd() - 0.5) * 26;
        y += (rnd() - 0.5) * 26;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawOil(ctx, d, st) {
    const rnd = lcg(d.seed || 1);
    const a = d.area || { x: 0, y: 0, w: W, h: H };
    ctx.save();
    ctx.fillStyle = rgba(d.color || '#15181A', 0.55);
    for (let i = 0; i < (d.count || 6); i++) {
      const x = a.x + rnd() * a.w, y = a.y + rnd() * a.h;
      const r = (d.r || 10) * (0.5 + rnd());
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.6, rnd() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawTire(ctx, d, st) {
    const rnd = lcg(d.seed || 1);
    const a = d.area || { x: 0, y: 0, w: W, h: H };
    ctx.save();
    ctx.strokeStyle = 'rgba(20,22,24,0.5)';
    ctx.lineWidth = 3;
    for (let i = 0; i < (d.count || 6); i++) {
      const x = a.x + rnd() * a.w, y = a.y + rnd() * a.h;
      ctx.beginPath();
      ctx.arc(x, y, 4 + rnd() * 3, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawBlood(ctx, d, st) {
    const rnd = lcg(d.seed || 1);
    const a = d.area || { x: 0, y: 0, w: W, h: H };
    ctx.save();
    ctx.fillStyle = rgba(d.color || '#5A1F22', 0.4);
    for (let i = 0; i < (d.count || 6); i++) {
      const x = a.x + rnd() * a.w, y = a.y + rnd() * a.h;
      const r = (d.r || 16) * (0.4 + rnd() * 0.8);
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.55, rnd() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawPuddle(ctx, d, st) {
    const rnd = lcg(d.seed || 1);
    const a = d.area || { x: 0, y: 0, w: W, h: H };
    ctx.save();
    for (let i = 0; i < (d.count || 8); i++) {
      const x = a.x + rnd() * a.w, y = a.y + rnd() * a.h;
      const r = (d.r || 18) * (0.4 + rnd() * 0.8);
      ctx.fillStyle = rgba(d.color || '#2C3B4C', 0.5);
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(200,220,240,0.18)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(x - r * 0.2, y - 1, r * 0.5, r * 0.2, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  /* ---------------- 大件装饰 ---------------- */

  function drawLamp(ctx, d, st) {
    const x = d.x || 0, y = d.y || 0;
    ctx.save();
    ctx.fillStyle = 'rgba(10,12,16,0.75)';
    ctx.fillRect(x - 2, y, 4, 26);
    ctx.fillStyle = rgba(st.line, 0.7);
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = rgba(st.line, 0.12);
    ctx.beginPath();
    ctx.arc(x, y, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawCone(ctx, d, st) {
    const x = d.x || 0, y = d.y || 0;
    ctx.save();
    ctx.fillStyle = 'rgba(230,110,40,0.85)';
    ctx.beginPath();
    ctx.moveTo(x, y - 9);
    ctx.lineTo(x + 6, y + 6);
    ctx.lineTo(x - 6, y + 6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(240,240,240,0.7)';
    ctx.fillRect(x - 4, y - 1, 8, 3);
    ctx.restore();
  }

  function drawBillboard(ctx, d, st) {
    const x = d.x || 0, y = d.y || 0, w = d.w || 120, h = d.h || 70;
    ctx.save();
    ctx.fillStyle = 'rgba(12,16,22,0.7)';
    ctx.fillRect(x + w * 0.2, y + h, 6, 40);
    ctx.fillRect(x + w * 0.7, y + h, 6, 40);
    ctx.fillStyle = 'rgba(28,34,44,0.95)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = rgba(st.line, 0.35);
    ctx.fillRect(x + 8, y + 10, w - 16, 8);
    ctx.fillRect(x + 8, y + 26, w * 0.55, 6);
    ctx.strokeStyle = 'rgba(180,200,220,0.25)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
    ctx.restore();
  }

  function drawSign(ctx, d, st) {
    const x = d.x || 0, y = d.y || 0;
    ctx.save();
    ctx.fillStyle = 'rgba(12,16,22,0.7)';
    ctx.fillRect(x - 2, y - 4, 4, 28);
    ctx.fillStyle = rgba(st.obstacle, 0.9);
    ctx.fillRect(x - 13, y - 24, 26, 20);
    ctx.fillStyle = 'rgba(230,240,250,0.6)';
    ctx.fillRect(x - 8, y - 19, 10, 3);
    ctx.fillRect(x - 8, y - 13, 16, 3);
    ctx.restore();
  }

  function drawKiosk(ctx, d, st) {
    const x = d.x || 0, y = d.y || 0, w = d.w || 70, h = d.h || 50;
    ctx.save();
    ctx.fillStyle = 'rgba(22,30,40,0.95)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = rgba(st.line, 0.25);
    ctx.fillRect(x + 6, y + 8, w - 12, h * 0.5);
    ctx.fillStyle = 'rgba(210,230,250,0.25)';
    ctx.fillRect(x + 8, y + h - 12, w - 16, 4);
    ctx.strokeStyle = 'rgba(160,190,220,0.35)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y, w, h);
    ctx.restore();
  }

  function drawLightbox(ctx, d, st) {
    const x = d.x || 0, y = d.y || 0, w = d.w || 90, h = d.h || 10;
    ctx.save();
    ctx.fillStyle = rgba(st.line, 0.6);
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = rgba(st.line, 0.15);
    ctx.fillRect(x - 4, y - 6, w + 8, h + 12);
    ctx.restore();
  }

  function drawVending(ctx, d, st) {
    const x = d.x || 0, y = d.y || 0, w = d.w || 36, h = d.h || 56;
    ctx.save();
    ctx.fillStyle = 'rgba(26,34,44,0.95)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = 'rgba(90,190,220,0.35)';
    ctx.fillRect(x + 5, y + 6, w - 10, h * 0.45);
    ctx.fillStyle = 'rgba(240,200,90,0.35)';
    ctx.fillRect(x + 5, y + h - 18, w - 10, 5);
    ctx.restore();
  }

  function drawBenchDecor(ctx, d, st) {
    const x = d.x || 0, y = d.y || 0, w = d.w || 64, h = d.h || 16;
    ctx.save();
    ctx.fillStyle = 'rgba(90,72,54,0.9)';
    ctx.fillRect(x, y, w, h * 0.5);
    ctx.fillRect(x, y + h * 0.7, w, h * 0.3);
    ctx.fillStyle = 'rgba(20,24,30,0.8)';
    ctx.fillRect(x + 4, y + h * 0.5, 3, h * 0.5);
    ctx.fillRect(x + w - 7, y + h * 0.5, 3, h * 0.5);
    ctx.restore();
  }

  function drawGate(ctx, d, st) {
    const x = d.x || 0, y = d.y || 0, w = d.w || 80, h = d.h || 24;
    ctx.save();
    const n = 3, gap = w / n;
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = 'rgba(60,78,96,0.9)';
      ctx.fillRect(x + i * gap + 4, y, gap - 8, h);
      ctx.fillStyle = rgba(st.line, 0.4);
      ctx.fillRect(x + i * gap + 10, y + 6, gap - 20, 3);
    }
    ctx.restore();
  }

  function drawPlazaTiles(ctx, d, st) {
    const x = d.x || 0, y = d.y || 0, w = d.w || 400, h = d.h || 200;
    const tile = d.tile || 32;
    ctx.save();
    ctx.strokeStyle = rgba('#D8E2EF', 0.08);
    ctx.lineWidth = 1;
    for (let px = x; px <= x + w; px += tile) {
      ctx.beginPath(); ctx.moveTo(px + 0.5, y); ctx.lineTo(px + 0.5, y + h); ctx.stroke();
    }
    for (let py = y; py <= y + h; py += tile) {
      ctx.beginPath(); ctx.moveTo(x, py + 0.5); ctx.lineTo(x + w, py + 0.5); ctx.stroke();
    }
    ctx.restore();
  }

  function drawCross(ctx, d, st) {
    const x = d.x || 0, y = d.y || 0, s = d.size || 24;
    ctx.save();
    ctx.fillStyle = 'rgba(220,80,80,0.55)';
    ctx.fillRect(x - s * 0.18, y - s * 0.5, s * 0.36, s);
    ctx.fillRect(x - s * 0.5, y - s * 0.18, s, s * 0.36);
    ctx.restore();
  }

  function drawParking(ctx, d, st) {
    const x = d.x || 0, y = d.y || 0, w = d.w || 120, h = d.h || 70;
    const slots = d.slots || 4;
    ctx.save();
    ctx.strokeStyle = rgba('#E8EDF2', 0.3);
    ctx.lineWidth = 2;
    for (let i = 0; i <= slots; i++) {
      const px = x + (w / slots) * i;
      ctx.beginPath(); ctx.moveTo(px, y); ctx.lineTo(px, y + h); ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.stroke();
    ctx.restore();
  }

  function drawPlanter(ctx, d, st) {
    const x = d.x || 0, y = d.y || 0, w = d.w || 70, h = d.h || 40;
    ctx.save();
    ctx.fillStyle = 'rgba(52,64,80,0.95)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = 'rgba(38,70,48,0.9)';
    ctx.fillRect(x + 5, y + 5, w - 10, h - 10);
    ctx.strokeStyle = 'rgba(150,170,190,0.3)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y, w, h);
    ctx.restore();
  }

  function drawPlanterDetails(ctx, d, st) {
    const x = d.x || 0, y = d.y || 0, w = d.w || 70, h = d.h || 40;
    const rnd = lcg((d.x || 1) + (d.y || 0) * 7);
    ctx.save();
    ctx.fillStyle = 'rgba(90,140,84,0.7)';
    for (let i = 0; i < 8; i++) {
      ctx.beginPath();
      ctx.arc(x + 8 + rnd() * (w - 16), y + 8 + rnd() * (h - 16), 3 + rnd() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawFountain(ctx, d, st) {
    const x = d.x || 0, y = d.y || 0, r = d.r || 46;
    ctx.save();
    ctx.fillStyle = 'rgba(34,48,64,0.95)';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(120,180,210,0.45)';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(x, y, r - 7, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(90,160,200,0.35)';
    ctx.beginPath(); ctx.arc(x, y, r * 0.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(180,220,240,0.6)';
    ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawVan(ctx, d, st) {
    const x = d.x || 0, y = d.y || 0, w = d.w || 100, h = d.h || 50;
    ctx.save();
    ctx.fillStyle = 'rgba(214,222,230,0.9)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = 'rgba(80,120,160,0.7)';
    ctx.fillRect(x + w - 28, y + 6, 20, h * 0.4);
    ctx.fillStyle = 'rgba(220,70,70,0.85)';
    ctx.fillRect(x + w * 0.42 - 3, y + 10, 6, 18);
    ctx.fillRect(x + w * 0.42 - 9, y + 16, 18, 6);
    ctx.fillStyle = 'rgba(20,24,30,0.9)';
    ctx.beginPath(); ctx.arc(x + 20, y + h, 8, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + w - 22, y + h, 8, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawTunnel(ctx, d, st) {
    const x = d.x || 0, y = d.y || 0, w = d.w || 80, h = d.h || 140;
    ctx.save();
    ctx.fillStyle = 'rgba(4,6,9,0.85)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(120,140,160,0.25)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x + w, y);
    ctx.lineTo(x + w, y + h);
    ctx.stroke();
    ctx.fillStyle = rgba(st.line, 0.18);
    ctx.fillRect(x + w - 6, y + h * 0.3, 3, h * 0.4);
    ctx.restore();
  }

  /* ---------------- 障碍 ---------------- */

  function drawCircleObstacle(ctx, ob, st) {
    const x = ob.x, y = ob.y, r = ob.r || 20;
    ctx.save();
    if (ob.theme === 'pillar') {
      ctx.fillStyle = 'rgba(120,144,156,0.35)';
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(176,190,197,0.55)';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, r * 0.55, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(176,190,197,0.28)';
      ctx.lineWidth = 2;
      ctx.stroke();
    } else if (ob.theme === 'tires') {
      ctx.fillStyle = 'rgba(18,20,22,0.9)';
      for (let i = 0; i < 3; i++) {
        ctx.beginPath(); ctx.arc(x, y, r - i * 5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(90,96,102,0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, r - i * 5, 0, Math.PI * 2); ctx.stroke();
      }
    } else if (ob.theme === 'fountain') {
      drawFountain(ctx, { x, y, r }, st);
    } else if (ob.theme === 'tree') {
      ctx.fillStyle = 'rgba(70,60,44,0.9)';
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(48,92,58,0.85)';
      ctx.beginPath(); ctx.arc(x, y - 4, r * 0.7, 0, Math.PI * 2); ctx.fill();
    } else {
      // 废弃轿车
      ctx.translate(x, y);
      ctx.fillStyle = 'rgba(74,64,56,0.95)';
      ctx.fillRect(-r - 8, -r * 0.6, (r + 8) * 2, r * 1.2);
      ctx.fillStyle = 'rgba(96,125,139,0.75)';
      ctx.fillRect(-r + 4, -r * 0.42, r * 0.9, r * 0.36);
      ctx.fillRect(r * 0.1, -r * 0.42, r * 0.9, r * 0.36);
      ctx.fillStyle = 'rgba(23,25,30,0.9)';
      ctx.beginPath(); ctx.arc(-r * 0.7, r * 0.6, 9, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(r * 0.7, r * 0.6, 9, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 1;
      ctx.strokeRect(-r - 8, -r * 0.6, (r + 8) * 2, r * 1.2);
    }
    ctx.restore();
  }

  function drawRectObstacle(ctx, ob, st) {
    const x = ob.x, y = ob.y, w = ob.w, h = ob.h;
    const theme = ob.theme || 'wall';
    ctx.save();
    if (theme === 'truck') {
      ctx.fillStyle = 'rgba(46,52,58,0.97)';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = 'rgba(90,110,130,0.8)';
      ctx.fillRect(x + w - 34, y + 4, 28, h - 8);
      ctx.fillStyle = 'rgba(20,22,26,0.95)';
      ctx.fillRect(x + 12, y + 6, w * 0.35, h - 12);
      ctx.fillStyle = 'rgba(16,18,22,0.9)';
      ctx.beginPath(); ctx.arc(x + 16, y + h, 8, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + w - 18, y + h, 8, 0, Math.PI * 2); ctx.fill();
    } else if (theme === 'barrier') {
      ctx.fillStyle = 'rgba(150,150,150,0.9)';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = 'rgba(210,120,40,0.85)';
      for (let px = x; px < x + w; px += 20) ctx.fillRect(px, y, 10, h);
      ctx.strokeStyle = 'rgba(60,60,60,0.6)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x, y, w, h);
    } else if (theme === 'bench') {
      ctx.fillStyle = 'rgba(92,74,54,0.95)';
      ctx.fillRect(x, y, w, h * 0.55);
      ctx.fillRect(x, y + h * 0.75, w, h * 0.25);
      ctx.fillStyle = 'rgba(24,28,34,0.9)';
      ctx.fillRect(x + 5, y + h * 0.55, 3, h * 0.45);
      ctx.fillRect(x + w - 8, y + h * 0.55, 3, h * 0.45);
    } else if (theme === 'planter') {
      drawPlanter(ctx, ob, st);
    } else if (theme === 'van') {
      drawVan(ctx, ob, st);
    } else {
      ctx.fillStyle = rgba(st.obstacle, 0.85);
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = 'rgba(200,215,230,0.2)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, w, h);
    }
    ctx.restore();
  }

  function drawObstacles(ctx, map, st) {
    if (!map.obstacles) return;
    for (const ob of map.obstacles) {
      if (ob.kind === 'rect') drawRectObstacle(ctx, ob, st);
      else drawCircleObstacle(ctx, ob, st);
    }
  }

  function drawTerrain(ctx, map) {
    if (!map.terrain) return;
    for (const t of map.terrain) {
      if (t.kind !== 'circle') continue;
      ctx.save();
      const g = ctx.createRadialGradient(t.x, t.y, 4, t.x, t.y, t.r);
      g.addColorStop(0, 'rgba(77, 182, 172, 0.22)');
      g.addColorStop(1, 'rgba(77, 182, 172, 0.03)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.setLineDash([6, 6]);
      ctx.strokeStyle = 'rgba(77, 182, 172, 0.45)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(128, 222, 214, 0.8)';
      ctx.font = '11px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('消毒池 · 感染 -50%', t.x, t.y + 4);
      ctx.restore();
    }
  }

  /* ---------------- 组合 ---------------- */

  function drawDecor(ctx, map, st) {
    const list = map.decor || [];
    let i;
    // 标线
    for (i = 0; i < list.length; i++) {
      const d = list[i];
      if (!LINE_KINDS[d.kind]) continue;
      if (d.kind === 'lane') drawLane(ctx, d, st);
      else if (d.kind === 'doubleLine') drawDoubleLine(ctx, d, st);
      else if (d.kind === 'shoulder') drawShoulder(ctx, d, st);
      else if (d.kind === 'guardrail') drawGuardrail(ctx, d, st);
      else if (d.kind === 'zebra') drawZebra(ctx, d, st);
      else if (d.kind === 'track') drawTrack(ctx, d, st);
      else if (d.kind === 'platformLine') drawPlatformLine(ctx, d, st);
    }
    // 噪声
    for (i = 0; i < list.length; i++) {
      const d = list[i];
      if (!NOISE_KINDS[d.kind]) continue;
      if (d.kind === 'grass') drawGrass(ctx, d, st);
      else if (d.kind === 'crack') drawCrack(ctx, d, st);
      else if (d.kind === 'oil') drawOil(ctx, d, st);
      else if (d.kind === 'tire') drawTire(ctx, d, st);
      else if (d.kind === 'blood') drawBlood(ctx, d, st);
      else if (d.kind === 'puddle') drawPuddle(ctx, d, st);
    }
    // 大件
    for (i = 0; i < list.length; i++) {
      const d = list[i];
      if (LINE_KINDS[d.kind] || NOISE_KINDS[d.kind]) continue;
      switch (d.kind) {
        case 'lamp': drawLamp(ctx, d, st); break;
        case 'cone': drawCone(ctx, d, st); break;
        case 'billboard': drawBillboard(ctx, d, st); break;
        case 'sign': drawSign(ctx, d, st); break;
        case 'kiosk': drawKiosk(ctx, d, st); break;
        case 'lightbox': drawLightbox(ctx, d, st); break;
        case 'vending': drawVending(ctx, d, st); break;
        case 'bench': drawBenchDecor(ctx, d, st); break;
        case 'gate': drawGate(ctx, d, st); break;
        case 'plazaTiles': drawPlazaTiles(ctx, d, st); break;
        case 'cross': drawCross(ctx, d, st); break;
        case 'parking': drawParking(ctx, d, st); break;
        case 'planter': drawPlanter(ctx, d, st); break;
        case 'planterDetails': drawPlanterDetails(ctx, d, st); break;
        case 'fountain': drawFountain(ctx, d, st); break;
        case 'van': drawVan(ctx, d, st); break;
        case 'tunnel': drawTunnel(ctx, d, st); break;
        default: break;
      }
    }
  }

  function drawGrid(ctx, map) {
    ctx.save();
    ctx.strokeStyle = ZG.Const.COLORS.grid;
    ctx.globalAlpha = 0.3;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= W; x += ZG.Const.GRID) {
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, H);
    }
    for (let y = 0; y <= H; y += ZG.Const.GRID) {
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(W, y + 0.5);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawArenaMask(ctx, map) {
    if (!ZG.MapZone.has(map)) return;
    const st = styleOf(map);
    ctx.save();
    // 全屏压暗，用 evenodd 挖掉活动区
    ctx.fillStyle = 'rgba(3,6,10,0.6)';
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    for (const z of map.zones) ctx.rect(z.x, z.y, z.w, z.h);
    ctx.fill('evenodd');
    // 活动区边界：黄色安全虚线
    ctx.strokeStyle = rgba(st.line, 0.3);
    ctx.lineWidth = 1.5;
    ctx.setLineDash([10, 8]);
    for (const z of map.zones) ctx.strokeRect(z.x, z.y, z.w, z.h);
    ctx.setLineDash([]);
    ctx.restore();
  }

  function drawBase(ctx, map) {
    const st = styleOf(map);
    ctx.fillStyle = st.ground;
    ctx.fillRect(0, 0, W, H);

    // 大地面
    ctx.fillStyle = st.road;
    for (const r of map.roads || []) ctx.fillRect(r.x, r.y, r.w, r.h);

    // 活动区底色
    if (ZG.MapZone.has(map)) {
      ctx.fillStyle = st.zone;
      for (const z of map.zones) ctx.fillRect(z.x, z.y, z.w, z.h);
    }

    drawDecor(ctx, map, st);
    drawTerrain(ctx, map);
    drawObstacles(ctx, map, st);
  }

  function draw(ctx, map) {
    if (!ctx || !map) return;
    const st = styleOf(map);
    drawBase(ctx, map);
    drawGrid(ctx, map);
    drawArenaMask(ctx, map);

    // 暗角
    const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.85);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(2, 6, 12, 0.55)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);

    // 地图名
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = '#DDEBFF';
    ctx.font = 'bold 46px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(map.name, W - 28, H - 24);
    ctx.restore();
    ctx.fillStyle = st.ground;
  }

  function drawMinimap(ctx, map, w, h) {
    if (!ctx || !map) return;
    const sx = w / W, sy = h / H;
    ctx.save();
    ctx.scale(sx, sy);
    const st = styleOf(map);
    ctx.fillStyle = st.ground;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = st.road;
    for (const r of map.roads || []) ctx.fillRect(r.x, r.y, r.w, r.h);
    if (ZG.MapZone.has(map)) {
      ctx.fillStyle = st.zone;
      for (const z of map.zones) ctx.fillRect(z.x, z.y, z.w, z.h);
      const info = map.spawns || [];
      ctx.fillStyle = 'rgba(239,83,80,0.85)';
      for (const sp of info) {
        ctx.beginPath();
        ctx.arc(10, sp.y, 16, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      ctx.fillStyle = 'rgba(239,83,80,0.75)';
      for (const sp of [{ x: 640, y: 12 }, { x: 640, y: 708 }, { x: 12, y: 360 }, { x: 1268, y: 360 }]) {
        ctx.beginPath(); ctx.arc(sp.x, sp.y, 14, 0, Math.PI * 2); ctx.fill();
      }
    }
    // 障碍
    ctx.fillStyle = rgba(st.obstacle, 0.95);
    for (const ob of map.obstacles || []) {
      if (ob.kind === 'rect') ctx.fillRect(ob.x, ob.y, ob.w, ob.h);
      else { ctx.beginPath(); ctx.arc(ob.x, ob.y, ob.r, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.restore();
  }

  function decorKinds() { return DECOR_KINDS.slice(); }

  ZG.MapLayer = { draw, drawBase, drawMinimap, drawArenaMask, styleOf, decorKinds };
})();
