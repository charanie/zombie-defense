/* Canvas 2D 渲染：静态层 + 动态层 */
(function () {
  'use strict';
  const ZG = globalThis.ZG = globalThis.ZG || {};
  const C = ZG.Const.COLORS;
  const W = ZG.Const.W, H = ZG.Const.H;

  const R = {
    canvas: null, bg: null, ctx: null, bgctx: null,
    dpr: 1, scale: 1, cssW: 0, cssH: 0,
    bgSig: '',
    ready: false
  };

  function init(canvas, bgCanvas, state) {
    R.canvas = canvas;
    R.bg = bgCanvas || document.getElementById('game-bg');
    R.ctx = canvas.getContext('2d');
    R.bgctx = R.bg.getContext('2d');
    R.ready = true;
    resize();
    return R;
  }

  function layoutStage() {
    const stage = document.getElementById('stage');
    if (!stage) return null;
    const vw = window.innerWidth || 1280;
    const vh = window.innerHeight || 720;
    const coarse = (ZG.Platform && ZG.Platform.isMobile) || vw < 900 ||
      (typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches);
    // 底部面板独立占位，不遮挡战场
    let panelH;
    if (coarse) panelH = Math.max(112, Math.min(150, vh * 0.30));
    else panelH = Math.max(150, Math.min(210, vh * 0.207));
    let canvasW = Math.min(vw, ((vh - panelH) * 16) / 9);
    let canvasH = (canvasW * 9) / 16;
    if (canvasH < 200) {
      canvasH = Math.max(160, vh - panelH);
      canvasW = (canvasH * 16) / 9;
    }
    stage.style.width = Math.round(canvasW) + 'px';
    stage.style.height = Math.round(canvasH + panelH) + 'px';
    stage.style.setProperty('--canvas-h', Math.round(canvasH) + 'px');
    stage.style.setProperty('--panel-h', Math.round(panelH) + 'px');
    return { canvasW, canvasH, panelH };
  }

  function resize() {
    if (!R.ready) return;
    const geo = layoutStage();
    if (!geo) return;
    const cap = (ZG.Platform && ZG.Platform.quality && ZG.Platform.quality.dprCap) || 2;
    const dpr = Math.min(window.devicePixelRatio || 1, cap);
    const bw = Math.max(1, Math.round(geo.canvasW * dpr));
    const bh = Math.max(1, Math.round(geo.canvasH * dpr));
    for (const cv of [R.canvas, R.bg]) {
      if (!cv) continue;
      if (cv.width !== bw || cv.height !== bh) {
        cv.width = bw;
        cv.height = bh;
      }
    }
    R.dpr = dpr;
    R.cssW = geo.canvasW;
    R.cssH = geo.canvasH;
    R.scale = bw / W;
    R.bgSig = '';
  }

  function setTransform(ctx) {
    ctx.setTransform(R.scale, 0, 0, R.scale, 0, 0);
  }

  function roundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function mapSignature(state) {
    let s = state.mapId + '|';
    for (const b of state.buildings) {
      if (!b.alive) continue;
      s += b.id + ':' + b.typeId + ':' + b.x + ',' + b.y +
        ',' + b.w + ',' + b.h + ';';
    }
    return s;
  }

  /* ---------------- 静态背景 ---------------- */

  function drawBackground(state) {
    const ctx = R.bgctx;
    const map = state.map;
    if (!ctx || !map) return;
    setTransform(ctx);
    ctx.clearRect(0, 0, W, H);

    const theme = map.theme || {};
    ctx.fillStyle = theme.ground || C.ground;
    ctx.fillRect(0, 0, W, H);

    // 道路
    if (map.roads) {
      ctx.fillStyle = theme.road || C.road;
      for (const r of map.roads) {
        ctx.fillRect(r.x, r.y, r.w, r.h);
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.035)';
      ctx.lineWidth = 1;
      for (const r of map.roads) {
        if (r.w > r.h) {
          ctx.beginPath();
          ctx.moveTo(r.x, r.y + r.h / 2);
          ctx.lineTo(r.x + r.w, r.y + r.h / 2);
          ctx.stroke();
        }
      }
    }

    // 网格
    ctx.strokeStyle = C.grid;
    ctx.globalAlpha = 0.35;
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
    ctx.globalAlpha = 1;

    // 地形（消毒池）
    if (map.terrain) {
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

    // 障碍
    if (map.obstacles) {
      for (const ob of map.obstacles) {
        if (ob.kind !== 'circle') continue;
        if (ob.theme === 'pillar') {
          ctx.save();
          ctx.fillStyle = 'rgba(120, 144, 156, 0.35)';
          ctx.beginPath();
          ctx.arc(ob.x, ob.y, ob.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = 'rgba(176, 190, 197, 0.55)';
          ctx.lineWidth = 3;
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(ob.x, ob.y, ob.r * 0.55, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(176, 190, 197, 0.28)';
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.restore();
        } else {
          ctx.save();
          ctx.translate(ob.x, ob.y);
          ctx.fillStyle = 'rgba(74, 64, 56, 0.95)';
          roundRect(ctx, -44, -22, 88, 44, 9);
          ctx.fill();
          ctx.fillStyle = 'rgba(96, 125, 139, 0.75)';
          roundRect(ctx, -30, -16, 24, 14, 4);
          ctx.fill();
          roundRect(ctx, 6, -16, 24, 14, 4);
          ctx.fill();
          ctx.fillStyle = 'rgba(23, 25, 30, 0.9)';
          ctx.beginPath();
          ctx.arc(-26, 22, 9, 0, Math.PI * 2);
          ctx.arc(26, 22, 9, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.12)';
          ctx.lineWidth = 1;
          roundRect(ctx, -44, -22, 88, 44, 9);
          ctx.stroke();
          ctx.restore();
        }
      }
    }

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
  }

  /* ---------------- 动态层 ---------------- */

  function drawUnitBase(ctx, x, y, r, color, symbol, glow) {
    ctx.save();
    // 阴影
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    ctx.beginPath();
    ctx.ellipse(x, y + r * 0.72, r * 0.95, r * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();

    if (glow) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 10;
    }
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(10, 16, 26, 0.85)';
    ctx.stroke();

    if (symbol) {
      ctx.fillStyle = 'rgba(8, 14, 22, 0.88)';
      ctx.font = 'bold ' + Math.max(9, Math.round(r * 1.02)) + 'px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(symbol, x, y + 0.5);
    }
    ctx.restore();
  }

  function drawBar(ctx, x, y, w, h, ratio, color, bg) {
    ctx.fillStyle = bg || 'rgba(0,0,0,0.55)';
    ctx.fillRect(x - w / 2, y, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(x - w / 2, y, w * Math.max(0, Math.min(1, ratio)), h);
  }

  function drawShieldArc(ctx, e, color, r) {
    if (!e.shield || e.shield <= 0) return;
    ctx.save();
    ctx.strokeStyle = color || 'rgba(66, 165, 245, 0.9)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(e.x, e.y, r + 3, e.facing - Math.PI / 3, e.facing + Math.PI / 3);
    ctx.stroke();
    ctx.restore();
  }

  function careTargetOf(state, h) {
    if (!h.careTargetId) return null;
    if (h.careKind === 'hospital') {
      return state.buildings.find(b => b.id === h.careTargetId && b.alive) || null;
    }
    if (h.careKind === 'medic') {
      return state.humans.find(u => u.id === h.careTargetId && u.alive) || null;
    }
    return null;
  }

  function drawAiMarker(ctx, h, r) {
    const mx = h.moveX || 0, my = h.moveY || 0;
    const moving = Math.abs(mx) + Math.abs(my) > 0.001;

    // 闪避：身后速度线
    if (h.dodgeT > 0 && moving) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 1.5;
      const len = Math.hypot(mx, my) || 1;
      const ux = mx / len, uy = my / len;
      const px = -uy, py = ux;
      for (let i = -1; i <= 1; i++) {
        const ox = px * i * 3.2, oy = py * i * 3.2;
        ctx.beginPath();
        ctx.moveTo(h.x - ux * (r + 3) + ox, h.y - uy * (r + 3) + oy);
        ctx.lineTo(h.x - ux * (r + 12) + ox, h.y - uy * (r + 12) + oy);
        ctx.stroke();
      }
      ctx.restore();
    }

    // 移动方向小箭头
    if (moving && h.aiState !== 'dodge') {
      const a = Math.atan2(my, mx);
      const tx = h.x + Math.cos(a) * (r + 9);
      const ty = h.y + Math.sin(a) * (r + 9);
      ctx.save();
      ctx.strokeStyle = h.aiState === 'return'
        ? 'rgba(144, 164, 174, 0.60)'
        : (h.aiState === 'flee' ? 'rgba(255, 213, 79, 0.70)' : 'rgba(230, 237, 247, 0.55)');
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(tx - Math.cos(a - 0.55) * 5, ty - Math.sin(a - 0.55) * 5);
      ctx.lineTo(tx, ty);
      ctx.lineTo(tx - Math.cos(a + 0.55) * 5, ty - Math.sin(a + 0.55) * 5);
      ctx.stroke();
      ctx.restore();
    }

    // 寻医：右上角绿色十字徽标
    if (h.careTargetId) {
      const bx = h.x + r + 7, by = h.y - r - 2;
      ctx.save();
      ctx.fillStyle = 'rgba(10, 16, 26, 0.78)';
      ctx.beginPath();
      ctx.arc(bx, by, 5.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(102, 187, 106, 0.9)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(bx - 2.6, by); ctx.lineTo(bx + 2.6, by);
      ctx.moveTo(bx, by - 2.6); ctx.lineTo(bx, by + 2.6);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawHuman(ctx, h, state) {
    const color = (ZG.Data.humans[h.classId] || ZG.Data.heroes[h.heroId] || {}).color || C.human.pistol;
    const r = Math.max(10, h.radius * 1.45);

    // 寻医路线：绿色虚线指向医疗站 / 治疗兵
    const care = careTargetOf(state, h);
    if (care) {
      ctx.save();
      ctx.strokeStyle = 'rgba(102, 187, 106, 0.28)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(h.x, h.y);
      ctx.lineTo(care.x, care.y);
      ctx.stroke();
      ctx.restore();
    }

    if (h.captain) {
      ctx.save();
      ctx.strokeStyle = C.captain;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(h.x, h.y, r + 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255, 193, 7, 0.35)';
      ctx.beginPath();
      ctx.arc(h.x, h.y, r + 9, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    if (h.hero) {
      ctx.save();
      ctx.strokeStyle = C.hero;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(h.x, h.y, r + 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = C.gold;
      ctx.font = 'bold 10px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('★', h.x, h.y - r - 10);
      ctx.restore();
    }

    drawUnitBase(ctx, h.x, h.y, r, color, (ZG.Data.humans[h.classId] || ZG.Data.heroes[h.heroId] || {}).symbol || '?', h.hero || h.captain);

    // 朝向
    if (h.attack && (h.attack.kind === 'ranged' || h.attack.kind === 'shotgun' ||
      h.attack.kind === 'rocket' || h.attack.kind === 'vial' || h.attack.kind === 'flame')) {
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.beginPath();
      const a = h.facing;
      ctx.moveTo(h.x + Math.cos(a) * (r + 6), h.y + Math.sin(a) * (r + 6));
      ctx.lineTo(h.x + Math.cos(a + 2.5) * (r + 2), h.y + Math.sin(a + 2.5) * (r + 2));
      ctx.lineTo(h.x + Math.cos(a - 2.5) * (r + 2), h.y + Math.sin(a - 2.5) * (r + 2));
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // 枪口闪光
    if (h.muzzleT > 0) {
      const mx = h.x + Math.cos(h.facing) * (r + 7);
      const my = h.y + Math.sin(h.facing) * (r + 7);
      ctx.save();
      ctx.fillStyle = 'rgba(255, 236, 179, 0.9)';
      ctx.beginPath();
      ctx.arc(mx, my, 3.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 治疗光束
    if (h.healBeamT > 0) {
      const t = state.humans.find(u => u.id === h.healTargetId && u.alive);
      if (t) {
        ctx.save();
        ctx.strokeStyle = 'rgba(102, 187, 106, 0.7)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(h.x, h.y);
        ctx.lineTo(t.x, t.y);
        ctx.stroke();
        ctx.restore();
      }
    }

    drawShieldArc(ctx, h, 'rgba(66, 165, 245, 0.95)', r);

    // 感染环
    if (h.infection > 0) {
      ctx.save();
      ctx.strokeStyle = 'rgba(171, 71, 188, ' + (0.35 + 0.01 * h.infection) + ')';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(h.x, h.y, r + 3.5, 0, Math.PI * 2);
      ctx.stroke();
      drawBar(ctx, h.x, h.y + r + 6, 22, 3, h.infection / 100, C.infection);
      ctx.restore();
    }

    // 血条
    if (h.hp < h.maxHp - 0.01) {
      drawBar(ctx, h.x, h.y - r - 9, 24, 3.5, h.hp / h.maxHp,
        h.hp / h.maxHp < 0.3 ? C.danger : C.heal);
    }

    drawAiMarker(ctx, h, r);

    // 选中
    if (state.ui.selectedHumanId === h.id) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.arc(h.x, h.y, r + 12, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawZombie(ctx, z, state) {
    const data = ZG.Data.zombies[z.typeId] || {};
    let color = data.color || '#7CB342';
    if (z.turnedFromHuman) color = C.zombie.turned;
    const r = Math.max(10, z.radius * 1.35);

    // BOSS 红边 / 威胁
    if (z.isBoss) {
      ctx.save();
      ctx.strokeStyle = 'rgba(239, 83, 80, ' + (0.55 + 0.25 * Math.sin(state.battle.time * 4)) + ')';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(z.x, z.y, r + 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    if (z.typeId === 'mother') {
      ctx.save();
      ctx.strokeStyle = 'rgba(171, 71, 188, 0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(z.x, z.y, r + 5 + Math.sin(state.battle.time * 3) * 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // 狂尸残影
    if (z.sprinting) {
      ctx.save();
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(z.x - Math.cos(z.facing) * 12, z.y - Math.sin(z.facing) * 12, r * 0.9, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    drawUnitBase(ctx, z.x, z.y, r, color, data.symbol || '·', z.isBoss);

    // 盾尸护盾弧
    if (z.typeId === 'shield' && z.shield > 0) {
      drawShieldArc(ctx, z, 'rgba(66, 165, 245, 0.9)', r);
    }

    // 爆尸引信
    if (z.fuseArmed) {
      const pulse = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(state.battle.time * 18));
      ctx.save();
      ctx.strokeStyle = 'rgba(239, 83, 80, ' + pulse + ')';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(z.x, z.y, r + 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255, 138, 128, ' + pulse + ')';
      ctx.font = 'bold 11px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('!', z.x, z.y - r - 12);
      ctx.restore();
    }

    // 护盾值条 / 血条（仅受伤）
    if (z.shield > 0 && z.maxShield > 0) {
      drawBar(ctx, z.x, z.y + r + 6, 22, 3, z.shield / z.maxShield, 'rgba(66, 165, 245, 0.95)');
    }
    if (z.hp < z.maxHp - 0.01) {
      drawBar(ctx, z.x, z.y - r - 9, z.isBoss ? 46 : 24, z.isBoss ? 5 : 3.5,
        z.hp / z.maxHp, z.isBoss ? '#EF5350' : (z.hp / z.maxHp < 0.3 ? '#FF7043' : '#8BC34A'));
    }

    if (state.ui.hoverKind === 'zombie' && state.ui.hoverId === z.id) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(z.x, z.y, r + 10, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawBuilding(ctx, b, state) {
    const data = ZG.Data.buildings[b.typeId];
    if (!data) return;
    if (b.shape === 'rect') {
      const w = b.w || data.w || 64;
      const h = b.h || data.h || 24;
      const vertical = (w < h);
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.fillStyle = 'rgba(109, 76, 65, 0.95)';
      roundRect(ctx, -w / 2, -h / 2, w, h, 4);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 224, 130, 0.55)';
      ctx.lineWidth = 2;
      if (vertical) {
        for (let i = -h / 2 + 6; i <= h / 2 - 6; i += 12) {
          ctx.beginPath();
          ctx.moveTo(-w / 2, i);
          ctx.lineTo(w / 2, i + 7);
          ctx.stroke();
        }
      } else {
        for (let i = -w / 2 + 8; i <= w / 2 - 8; i += 12) {
          ctx.beginPath();
          ctx.moveTo(i, -h / 2);
          ctx.lineTo(i + 7, h / 2);
          ctx.stroke();
        }
      }
      ctx.strokeStyle = 'rgba(62, 39, 35, 0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.rect(-w / 2, -h / 2, w, h);
      ctx.stroke();
      ctx.restore();
    } else {
      drawUnitBase(ctx, b.x, b.y, 17, data.color, data.symbol, false);
      ctx.save();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(230, 240, 255, 0.35)';
      ctx.beginPath();
      ctx.arc(b.x, b.y, 23, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // 光环范围（淡）
    if (data.slow) {
      ctx.save();
      ctx.setLineDash([10, 10]);
      ctx.strokeStyle = 'rgba(121, 134, 203, 0.22)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(b.x, b.y, data.slow.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    } else if (data.heal) {
      ctx.save();
      ctx.setLineDash([10, 10]);
      ctx.strokeStyle = 'rgba(77, 182, 172, 0.20)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(b.x, b.y, data.heal.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    } else if (data.buff) {
      ctx.save();
      ctx.setLineDash([10, 10]);
      ctx.strokeStyle = 'rgba(255, 179, 0, 0.16)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(b.x, b.y, data.buff.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    if (b.hp < b.maxHp - 0.01) {
      drawBar(ctx, b.x, b.y - 27, 34, 4, b.hp / b.maxHp, '#8BC34A');
    }
    if (b.typeId === 'mine') {
      ctx.save();
      ctx.fillStyle = 'rgba(255, 213, 79, 0.9)';
      ctx.font = 'bold 10px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('×' + b.charges, b.x, b.y + 30);
      ctx.restore();
    }
  }

  function drawProjectiles(ctx, state) {
    for (const p of state.projectiles) {
      if (!p.alive) continue;
      if (p.typeId === 'rock') {
        // 红圈预警 + 倒计时收缩
        const t = Math.max(0, p.warnT);
        const k = 1 - t / 2;
        ctx.save();
        ctx.fillStyle = 'rgba(239, 83, 80, 0.13)';
        ctx.strokeStyle = 'rgba(239, 83, 80, 0.85)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255, 138, 128, 0.9)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius * (1 - k), 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255, 205, 210, 0.95)';
        ctx.font = 'bold 12px "Microsoft YaHei", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('石块来袭', p.x, p.y - p.radius - 8);
        ctx.restore();
      } else if (p.delay > 0) {
        continue;
      } else {
        ctx.save();
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.typeId === 'missile' ? 4.5 : 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
  }

  function drawEffects(ctx, state) {
    for (const e of state.effects) {
      const a = Math.max(0, e.life / (e.maxLife || 0.1));
      if (e.kind === 'tracer') {
        ctx.save();
        ctx.globalAlpha = a;
        ctx.strokeStyle = e.color;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(e.x1, e.y1);
        ctx.lineTo(e.x2, e.y2);
        ctx.stroke();
        ctx.restore();
      } else if (e.kind === 'flame') {
        ctx.save();
        ctx.globalAlpha = a * 0.55;
        const g = ctx.createRadialGradient(e.x1, e.y1, 8, e.x1, e.y1, e.range);
        g.addColorStop(0, 'rgba(255, 183, 77, 0.9)');
        g.addColorStop(1, 'rgba(239, 83, 80, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(e.x1, e.y1);
        ctx.arc(e.x1, e.y1, e.range, e.facing - (e.coneDeg * Math.PI) / 360,
          e.facing + (e.coneDeg * Math.PI) / 360);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else if (e.kind === 'slash') {
        ctx.save();
        ctx.globalAlpha = a;
        ctx.translate(e.x, e.y);
        ctx.rotate(e.facing);
        const g = ctx.createLinearGradient(0, 0, e.length, 0);
        g.addColorStop(0, 'rgba(255,255,255,0.9)');
        g.addColorStop(1, 'rgba(255, 138, 101, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, -e.width / 2, e.length, e.width);
        ctx.restore();
      }
    }
  }

  function drawPlacement(ctx, state) {
    const ui = state.ui;
    if (ui.selectedCard && ZG.Data.humans[ui.selectedCard]) {
      const data = ZG.Data.humans[ui.selectedCard];
      const m = ui.mouse;
      if (!m) return;
      const fits = ZG.Economy.canPlace(state, m.x, m.y, data.radius || 8).ok;
      const color = fits ? 'rgba(102, 187, 106, 0.9)' : 'rgba(239, 83, 80, 0.9)';
      ctx.save();
      if (data.attack) {
        ctx.strokeStyle = fits ? 'rgba(79, 195, 247, 0.5)' : 'rgba(239, 83, 80, 0.4)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.arc(m.x, m.y, data.attack.range, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(m.x, m.y, data.radius || 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(m.x, m.y, (data.radius || 8) + 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    if (ui.selectedBuilding && ZG.Data.buildings[ui.selectedBuilding] && ui.mouse) {
      const m = ui.mouse;
      const d = ZG.Data.buildings[ui.selectedBuilding];
      const vert = !!ui.wallVertical;
      const ok = ZG.Economy.canPlaceBuilding(state, ui.selectedBuilding, m.x, m.y,
        { vertical: vert }).ok;
      const color = ok ? 'rgba(102,187,106,0.85)' : 'rgba(239,83,80,0.85)';
      ctx.save();
      if ((d.shape || 'circle') === 'rect') {
        const w = vert ? d.h : d.w;
        const h = vert ? d.w : d.h;
        ctx.globalAlpha = 0.45;
        ctx.fillStyle = color;
        ctx.fillRect(m.x - w / 2, m.y - h / 2, w, h);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.strokeRect(m.x - w / 2, m.y - h / 2, w, h);
      } else {
        ctx.globalAlpha = 0.45;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(m.x, m.y, d.radius || 24, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(m.x, m.y, (d.radius || 24) + 3, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  function drawPortals(ctx, state) {
    for (const p of state.spawner.portals) {
      const a = Math.min(1, p.ttl);
      const x = Math.max(20, Math.min(ZG.Const.W - 20, p.x));
      const y = Math.max(20, Math.min(ZG.Const.H - 20, p.y));
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(239,83,80,0.16)';
      ctx.beginPath();
      ctx.arc(x, y, 30, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(239,83,80,0.95)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, 24 + (1 - a) * 20, 0, Math.PI * 2);
      ctx.stroke();
      // 朝内的箭头
      let ax = 0, ay = 0;
      if (p.edge === 'top') ay = 1;
      else if (p.edge === 'bottom') ay = -1;
      else if (p.edge === 'left') ax = 1;
      else ax = -1;
      ctx.strokeStyle = 'rgba(255,205,210,0.95)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x - ax * 12, y - ay * 12);
      ctx.lineTo(x + ax * 10, y + ay * 10);
      ctx.stroke();
      ctx.restore();
    }
  }

  function draw(state) {
    if (!R.ready || !state) return;
    const canvas = R.canvas;
    const ctx = R.ctx;

    const rect = R.canvas.getBoundingClientRect();
    if (Math.abs(rect.width - R.cssW) > 0.5 || Math.abs(rect.height - R.cssH) > 0.5) resize();

    const sig = mapSignature(state);
    if (sig !== R.bgSig) {
      drawBackground(state);
      R.bgSig = sig;
    }

    setTransform(ctx);
    ctx.clearRect(0, 0, W, H);

    const off = state.settings.shake === false ? { x: 0, y: 0 } : ZG.Particles.getOffset();
    ctx.save();
    ctx.translate(off.x, off.y);

    drawPortals(ctx, state);

    for (const b of state.buildings) if (b.alive) drawBuilding(ctx, b, state);
    for (const z of state.zombies) if (z.alive) drawZombie(ctx, z, state);
    for (const h of state.humans) if (h.alive) drawHuman(ctx, h, state);
    drawProjectiles(ctx, state);
    drawEffects(ctx, state);
    drawPlacement(ctx, state);

    ZG.Particles.draw(ctx, state.settings);
    ctx.restore();
  }

  ZG.Renderer = { init, resize, draw, drawBackground, mapSignature };
})();
