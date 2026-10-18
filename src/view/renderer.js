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

  function slotSignature(state) {
    let s = state.mapId + '|';
    for (const sl of state.slots) {
      s += sl.id + ':' + (sl.buildingId || 0) + (sl.rubble ? 'R' : '') + ';';
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

    // 部署区
    const d = map.deploy;
    ctx.save();
    ctx.fillStyle = 'rgba(79, 195, 247, 0.07)';
    ctx.strokeStyle = C.deployEdge;
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 6]);
    if (d.kind === 'rect') {
      roundRect(ctx, d.x, d.y, d.w, d.h, 16);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(137, 216, 255, 0.55)';
    ctx.font = 'bold 12px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    if (d.kind === 'rect') ctx.fillText('部 署 区', d.x + d.w / 2, d.y + 20);
    else ctx.fillText('部 署 区', d.x, d.y - d.r + 22);
    ctx.restore();

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

    // 出生点
    for (let i = 0; i < map.spawns.length; i++) {
      const sp = map.spawns[i];
      ctx.save();
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 400 + i);
      ctx.strokeStyle = 'rgba(239, 83, 80, ' + (0.5 + pulse * 0.35) + ')';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, 18 + pulse * 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(239, 83, 80, 0.85)';
      ctx.fill();
      ctx.font = '10px "Microsoft YaHei", sans-serif';
      ctx.fillStyle = 'rgba(239, 160, 160, 0.85)';
      ctx.textAlign = 'center';
      ctx.fillText('出生点', sp.x, sp.y - 26);
      ctx.restore();
    }

    // 槽位
    for (const sl of state.slots) {
      const has = !!sl.buildingId;
      if (has) continue;
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = sl.rubble ? 'rgba(239, 83, 80, 0.5)' : 'rgba(144, 164, 174, 0.4)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(sl.x, sl.y, 16, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      if (sl.rubble) {
        ctx.strokeStyle = 'rgba(239, 83, 80, 0.6)';
        ctx.beginPath();
        ctx.moveTo(sl.x - 7, sl.y - 7); ctx.lineTo(sl.x + 7, sl.y + 7);
        ctx.moveTo(sl.x + 7, sl.y - 7); ctx.lineTo(sl.x - 7, sl.y + 7);
        ctx.stroke();
      } else {
        ctx.fillStyle = 'rgba(144, 164, 174, 0.45)';
        ctx.font = '11px "Microsoft YaHei", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('槽', sl.x, sl.y + 4);
      }
      ctx.restore();
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

  function drawHuman(ctx, h, state) {
    const color = (ZG.Data.humans[h.classId] || ZG.Data.heroes[h.heroId] || {}).color || C.human.pistol;
    const r = Math.max(10, h.radius * 1.45);

    // 队长金环 / 英雄外环
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
    if (b.typeId === 'barricade') {
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.fillStyle = 'rgba(109, 76, 65, 0.95)';
      roundRect(ctx, -26, -12, 52, 24, 4);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 224, 130, 0.55)';
      ctx.lineWidth = 2;
      for (let i = -18; i <= 18; i += 12) {
        ctx.beginPath();
        ctx.moveTo(i, -12);
        ctx.lineTo(i + 7, 12);
        ctx.stroke();
      }
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

    if (ui.selectedSlot) {
      ctx.save();
      const sl = state.slots.find(s => s.id === ui.selectedSlot);
      if (sl) {
        ctx.strokeStyle = 'rgba(102, 187, 106, 0.9)';
        ctx.lineWidth = 2.5;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.arc(sl.x, sl.y, 22, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    if (ui.selectedBuilding && ZG.Data.buildings[ui.selectedBuilding]) {
      ctx.save();
      ctx.strokeStyle = 'rgba(102, 187, 106, 0.35)';
      ctx.lineWidth = 2;
      for (const sl of state.slots) {
        if (sl.buildingId || sl.rubble) continue;
        ctx.setLineDash([3, 5]);
        ctx.beginPath();
        ctx.arc(sl.x, sl.y, 20, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  function drawPortals(ctx, state) {
    for (const p of state.spawner.portals) {
      const a = Math.min(1, p.ttl);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.strokeStyle = 'rgba(239, 83, 80, 0.95)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 24 + (1 - a) * 20, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(239, 83, 80, 0.2)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 30, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function draw(state) {
    if (!R.ready || !state) return;
    const canvas = R.canvas;
    const ctx = R.ctx;

    const rect = R.canvas.getBoundingClientRect();
    if (Math.abs(rect.width - R.cssW) > 0.5 || Math.abs(rect.height - R.cssH) > 0.5) resize();

    const sig = slotSignature(state);
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

  ZG.Renderer = { init, resize, draw, drawBackground, slotSignature };
})();
