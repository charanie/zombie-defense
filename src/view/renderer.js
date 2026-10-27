/* Canvas 2D 渲染：静态层 + 动态层 */
(function () {
  'use strict';
  const ZG = globalThis.ZG = globalThis.ZG || {};
  const C = ZG.Const.COLORS;
  const W = ZG.Const.W, H = ZG.Const.H;

  const R = {
    canvas: null, bg: null, ctx: null, bgctx: null,
    dpr: 1, scale: 1, offX: 0, offY: 0, cssW: 0, cssH: 0,
    worldScale: 1, worldOffX: 0, worldOffY: 0,
    bgSig: '',
    ready: false
  };

  function fitWorldRect(cssW, cssH) {
    const scale = Math.min(cssW / W, cssH / H);
    return {
      scale,
      offsetX: (cssW - W * scale) / 2,
      offsetY: (cssH - H * scale) / 2,
      worldW: W * scale,
      worldH: H * scale
    };
  }

  function worldRect() {
    return {
      scale: R.worldScale || 1,
      offsetX: R.worldOffX || 0,
      offsetY: R.worldOffY || 0
    };
  }

  function init(canvas, bgCanvas, state) {
    R.canvas = canvas;
    R.bg = bgCanvas || document.getElementById('game-bg');
    R.ctx = canvas.getContext('2d');
    R.bgctx = R.bg.getContext('2d');
    R.ready = true;
    resize();
    return R;
  }

  function stageLayout(vw, vh, topH, coarse, portrait) {
    let panelH;
    if (coarse && portrait) panelH = Math.max(170, Math.min(250, vh * 0.30));
    else if (coarse) panelH = Math.max(120, Math.min(190, vh * 0.22));
    else panelH = Math.max(150, Math.min(210, vh * 0.207));
    let canvasH = Math.max(160, vh - topH - panelH);
    if (canvasH + topH + panelH > vh) {
      panelH = Math.max(100, vh - topH - canvasH);
      canvasH = Math.max(160, vh - topH - panelH);
    }
    return { vw, vh, topH, panelH, canvasH };
  }

  function layoutStage() {
    const stage = document.getElementById('stage');
    if (!stage) return null;
    // 取视觉视口（动态地址栏/手势条），避免底部按钮被裁掉
    const vv = (typeof window !== 'undefined' && window.visualViewport) || null;
    const vw = Math.round(vv && vv.width ? vv.width
      : (stage.clientWidth || window.innerWidth || 1280));
    const vh = Math.round(vv && vv.height ? vv.height
      : (stage.clientHeight || window.innerHeight || 720));
    const topEl = document.querySelector('.hud-top');
    const topH = topEl ? topEl.getBoundingClientRect().height : (vw < 900 ? 40 : 46);
    const portrait = vh > vw;
    const coarse = (ZG.Platform && ZG.Platform.isMobile) || vw < 900 ||
      (typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches);
    const geo = stageLayout(vw, vh, topH, coarse, portrait);
    stage.style.setProperty('--top-h', Math.round(topH) + 'px');
    stage.style.setProperty('--panel-h', Math.round(geo.panelH) + 'px');
    stage.style.setProperty('--canvas-h', Math.round(geo.canvasH) + 'px');
    return { cssW: vw, cssH: geo.canvasH, topH, panelH: geo.panelH, portrait };
  }

  function resize() {
    if (!R.ready) return;
    const geo = layoutStage();
    if (!geo) return;
    const cap = (ZG.Platform && ZG.Platform.quality && ZG.Platform.quality.dprCap) || 2;
    const dpr = Math.min(window.devicePixelRatio || 1, cap);
    const bw = Math.max(1, Math.round(geo.cssW * dpr));
    const bh = Math.max(1, Math.round(geo.cssH * dpr));
    for (const cv of [R.canvas, R.bg]) {
      if (!cv) continue;
      if (cv.width !== bw || cv.height !== bh) {
        cv.width = bw;
        cv.height = bh;
      }
    }
    const fit = fitWorldRect(geo.cssW, geo.cssH);
    R.dpr = dpr;
    R.cssW = geo.cssW;
    R.cssH = geo.cssH;
    R.worldScale = fit.scale;
    R.worldOffX = fit.offsetX;
    R.worldOffY = fit.offsetY;
    R.scale = fit.scale * dpr;
    R.offX = fit.offsetX * dpr;
    R.offY = fit.offsetY * dpr;
    R.bgSig = '';
  }

  function setTransform(ctx) {
    ctx.setTransform(R.scale, 0, 0, R.scale, R.offX, R.offY);
  }

  function clearCanvas(ctx) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    setTransform(ctx);
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
    clearCanvas(ctx);
    ZG.MapLayer.draw(ctx, map);
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
        ctx.strokeStyle = 'rgba(102, 187, 106, 0.18)';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(h.x, h.y);
        ctx.lineTo(t.x, t.y);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(102, 187, 106, 0.7)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(h.x, h.y);
        ctx.lineTo(t.x, t.y);
        ctx.stroke();
        // 光束上的十字
        const pulse = (state.battle.time * 2) % 1;
        const mx = h.x + (t.x - h.x) * pulse;
        const my = h.y + (t.y - h.y) * pulse;
        ctx.fillStyle = 'rgba(178, 255, 189, 0.85)';
        ctx.fillRect(mx - 1, my - 5, 2, 10);
        ctx.fillRect(mx - 5, my - 1, 10, 2);
        ctx.restore();
      }
    }

    // 头顶技能状态：鼓舞金环 / 盾墙蓝环 / 职业主动黄点
    if (h.inspireT > 0 || h.guardT > 0 || h.skillT > 0) {
      ctx.save();
      if (h.inspireT > 0) {
        ctx.strokeStyle = 'rgba(255, 213, 79, 0.8)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(h.x, h.y, r + 12, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (h.guardT > 0) {
        ctx.strokeStyle = 'rgba(66, 165, 245, 0.55)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(h.x, h.y, r + 9, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (h.skillT > 0) {
        ctx.fillStyle = 'rgba(255, 213, 79, 0.95)';
        ctx.beginPath();
        ctx.arc(h.x, h.y - r - 14, 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
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

  // BOSS 像素精灵：按 typeId 的字符网格逐格绘制，水平翻转表现朝向
  const BOSS_SPRITES = {
    boss: {
      palette: { '#': '#263238', '=': '#607D8B', e: '#FFEB3B' },
      grid: [
        '...#####...',
        '..#######..',
        '.##=====##.',
        '.#==eee==#.',
        '##=======##',
        '##==###==##',
        '##=======##',
        '.#=======#.',
        '.##=====##.',
        '..#######..',
        '...#####...'
      ]
    },
    boss_ripper: {
      palette: { '#': '#5D0F0F', '=': '#B71C1C', e: '#FFEB3B', c: '#FF8A80' },
      grid: [
        '.....cc....',
        '...##.##...',
        '..#######..',
        '.##=====##.',
        '.#==eee==#.',
        '##=======##',
        '.##=====##.',
        '..##===##..',
        '..##...##..',
        '.###...###.',
        '.cc.....cc.'
      ]
    },
    boss_spitter: {
      palette: { '#': '#37421F', '=': '#7A8F45', e: '#9CFF57' },
      grid: [
        '....###....',
        '..#######..',
        '.##=====##.',
        '.#==###==#.',
        '##==eee==##',
        '##=======##',
        '##==###==##',
        '.##=====##.',
        '..##===##..',
        '..##...##..',
        '.###...###.'
      ]
    },
    boss_brood: {
      palette: { '#': '#3E2340', '=': '#8E5A8E', e: '#E1BEE7' },
      grid: [
        '...#####...',
        '..##===##..',
        '.##=====##.',
        '##==e=e==##',
        '##=======##',
        '##==e=e==##',
        '##=======##',
        '.##=====##.',
        '..##===##..',
        '...#####...',
        '....###....'
      ]
    }
  };

  function drawBossSprite(ctx, z, r, alpha) {
    const sp = BOSS_SPRITES[z.typeId] || BOSS_SPRITES.boss;
    const rows = sp.grid.length;
    const cols = sp.grid[0].length;
    const cell = (r * 2) / Math.max(rows, cols);
    const x0 = -cols * cell / 2;
    const y0 = -rows * cell / 2;
    ctx.save();
    ctx.globalAlpha = alpha === undefined ? 1 : alpha;
    ctx.translate(z.x, z.y);
    if (Math.cos(z.facing) < 0) ctx.scale(-1, 1);
    for (let y = 0; y < rows; y++) {
      const row = sp.grid[y];
      for (let x = 0; x < cols; x++) {
        const ch = row[x];
        const col = sp.palette[ch];
        if (!col) continue;
        ctx.fillStyle = col;
        ctx.fillRect(x0 + x * cell, y0 + y * cell, cell + 0.6, cell + 0.6);
      }
    }
    if (z.flashT > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.fillRect(x0, y0, cols * cell, rows * cell);
    }
    ctx.restore();
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

    if (z.isBoss) {
      // 母巢光环
      if (z.typeId === 'boss_brood') {
        const bd = (ZG.Data.zombies.boss_brood || {}).boss;
        const aura = bd && bd.aura ? bd.aura : { radius: 150 };
        const pulse = 0.5 + 0.5 * Math.sin(state.battle.time * 3);
        ctx.save();
        ctx.fillStyle = 'rgba(142, 90, 142, ' + (0.06 + 0.06 * pulse) + ')';
        ctx.strokeStyle = 'rgba(225, 190, 231, ' + (0.25 + 0.2 * pulse) + ')';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(z.x, z.y, aura.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
      // 冲刺残影：2 帧
      if (z.dashT > 0) {
        const col = data.color || '#B71C1C';
        for (let i = 1; i <= 2; i++) {
          ctx.save();
          ctx.globalAlpha = 0.22 * (3 - i);
          ctx.fillStyle = col;
          ctx.beginPath();
          ctx.arc(z.x - z.dashDirX * 14 * i, z.y - z.dashDirY * 14 * i,
            r * (1 - 0.12 * i), 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }
      drawBossSprite(ctx, z, r);
      // 腐吐者蓄力：口部按下一发弹种亮起，球体随蓄力变大
      if (z.typeId === 'boss_spitter' && z.spitWindupT > 0 && z.nextBullet) {
        const mx = z.x + Math.cos(z.facing) * r * 0.95;
        const my = z.y + Math.sin(z.facing) * r * 0.95;
        const bd = (ZG.Data.zombies.boss_spitter || {}).boss || {};
        const win = bd.windup || 0.35;
        const k = 1 - Math.max(0, Math.min(1, z.spitWindupT / win));
        ctx.save();
        ctx.fillStyle = z.nextBullet.color || '#9CFF57';
        ctx.shadowColor = ctx.fillStyle;
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(mx, my, 3 + k * 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(mx, my, 8 + k * 6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    } else {
      drawUnitBase(ctx, z.x, z.y, r, color, data.symbol || '·', z.isBoss);
      // 母巢光环受益标记
      if (z.buffSpeed > 1) {
        ctx.save();
        ctx.fillStyle = 'rgba(225, 190, 231, 0.9)';
        ctx.beginPath();
        ctx.arc(z.x + r * 0.75, z.y - r * 0.75, 2.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    // 盾尸护盾弧
    if (z.typeId === 'shield' && z.shield > 0) {
      drawShieldArc(ctx, z, 'rgba(66, 165, 245, 0.9)', r);
    }

    // 爆尸引信：脉冲 + 进度环 + 膨胀
    if (z.fuseArmed) {
      const pulse = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(state.battle.time * 10));
      const fuseMax = (ZG.Data.zombies.boomer && ZG.Data.zombies.boomer.fuse) || 0.8;
      const prog = Math.max(0, Math.min(1, 1 - z.fuseT / fuseMax));
      const grow = 1 + prog * 0.22;
      ctx.save();
      // 膨胀红晕
      ctx.fillStyle = 'rgba(229, 57, 53, ' + (0.10 + 0.12 * prog) + ')';
      ctx.beginPath();
      ctx.arc(z.x, z.y, r * grow + 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(239, 83, 80, ' + pulse + ')';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(z.x, z.y, r + 6, 0, Math.PI * 2);
      ctx.stroke();
      // 引信进度环
      ctx.strokeStyle = 'rgba(255, 235, 238, 0.95)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(z.x, z.y, r + 11, -Math.PI / 2, -Math.PI / 2 + prog * Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255, 138, 128, ' + pulse + ')';
      ctx.font = 'bold 11px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('!', z.x, z.y - r - 14);
      ctx.restore();
    }

    // 眩晕标记
    if (z.stunT > 0) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 213, 79, 0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(z.x, z.y - r - 6, 4.5, state.battle.time * 8, state.battle.time * 8 + Math.PI * 1.4);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255, 213, 79, 0.95)';
      ctx.font = 'bold 9px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('晕', z.x, z.y - r - 14);
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
        // 火箭/毒瓶/导弹拖尾：渐隐折线
        if (p.trail && p.trail.length > 1) {
          ctx.save();
          ctx.strokeStyle = p.color;
          ctx.lineWidth = p.typeId === 'missile' ? 3 : 2;
          for (let i = 1; i < p.trail.length; i++) {
            const t0 = p.trail[i - 1], t1 = p.trail[i];
            ctx.globalAlpha = (i / p.trail.length) * 0.5;
            ctx.beginPath();
            ctx.moveTo(t0.x, t0.y);
            ctx.lineTo(t1.x, t1.y);
            ctx.stroke();
          }
          ctx.restore();
        }
        ctx.save();
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius || (p.typeId === 'missile' ? 4.5 : 4), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
  }

  function drawEffects(ctx, state) {
    ZG.Fx.drawWorld(ctx, state);
    ZG.Fx.drawAir(ctx, state);
  }

  function drawSupportAim(ctx, state) {
    const ui = state.ui;
    if (!ui.pendingSupport || !ui.supportAim) return;
    const radius = ZG.Tech.supportRadius(state, ui.pendingSupport);
    const heal = ui.pendingSupport === 'areaHeal';
    const color = heal ? '102, 187, 106' : '255, 112, 67';
    const p = ui.supportAim;
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = 'rgba(' + color + ', 0.16)';
    ctx.strokeStyle = 'rgba(' + color + ', 0.95)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(p.x - 14, p.y); ctx.lineTo(p.x + 14, p.y);
    ctx.moveTo(p.x, p.y - 14); ctx.lineTo(p.x, p.y + 14);
    ctx.stroke();
    ctx.restore();
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

    clearCanvas(ctx);

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
    drawSupportAim(ctx, state);

    ZG.Particles.draw(ctx, state.settings);
    ZG.Fx.drawScreen(ctx, state);
    ctx.restore();
  }

  ZG.Renderer = {
    init, resize, draw, drawBackground, mapSignature,
    fitWorldRect, worldRect, stageLayout
  };
})();
