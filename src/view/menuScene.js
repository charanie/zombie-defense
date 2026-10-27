/* ZG.MenuScene — 主菜单背景场景、战区缩略图、监视画面
 *
 * 纯绘制：不碰 DOM、不读写 localStorage、不调用 Math.random()。
 * 坐标一律用 CSS 像素（调用方已按 DPR 设置好 transform）。
 * 只用 fillRect / 路径 / 渐变；不用 ctx.filter、roundRect、createPattern（旧 Safari 与测试 stub 都不支持）。
 */
(function () {
  'use strict';
  const ZG = globalThis.ZG = globalThis.ZG || {};
  const W = (ZG.Const && ZG.Const.W) || 1280;
  const H = (ZG.Const && ZG.Const.H) || 720;

  const SEED = 0x5EED;
  const CACHE_LIMIT = 4;
  const sceneCache = [];
  const rgbaCache = Object.create(null);

  function rnd(seed) {
    let s = seed >>> 0;
    return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  }

  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }

  function rgba(hex, a) {
    const key = hex + '|' + a;
    const hit = rgbaCache[key];
    if (hit) return hit;
    let h = String(hex || '').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    const n = parseInt(h, 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const out = 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
    rgbaCache[key] = out;
    return out;
  }

  function styleOf(map) {
    return (map && map.theme) || {
      ground: '#1A2233', road: '#22304A', accent: '#33404F',
      obstacle: '#4C566A', zone: '#2A3442', line: '#D8E2EF'
    };
  }

  // ---------- 场景装饰：按尺寸缓存 ----------
  function buildScene(w, h) {
    const r = rnd(SEED);
    const skylineA = [], skylineB = [], rain = [], embers = [], walkers = [], windows = [];
    let x = -40;
    while (x < w + 60) {
      const bw = 28 + r() * 80;
      skylineA.push({ x, w: bw, h: 40 + r() * 150, ant: r() > 0.72 });
      x += bw + 2 + r() * 7;
    }
    x = -40;
    while (x < w + 60) {
      const bw = 40 + r() * 120;
      skylineB.push({ x, w: bw, h: 20 + r() * 90, ant: r() > 0.82 });
      x += bw + 3 + r() * 12;
    }
    // 窗灯预先算好位置：每帧只画矩形，不做循环除法
    for (let i = 0; i < skylineA.length; i++) {
      const b = skylineA[i];
      const cols = Math.max(1, Math.floor(b.w / 14));
      const rows = Math.max(1, Math.floor(b.h / 22));
      for (let c = 0; c < cols; c++) {
        for (let rr = 0; rr < rows; rr++) {
          if ((c * 7 + rr * 5 + Math.floor(b.x)) % 11 > 3) continue;
          windows.push({
            bx: b.x + 5 + c * 13, row: rr,
            color: (c + Math.floor(b.x)) % 17 === 0 ? 'rgba(239,83,80,.5)' : 'rgba(120,170,205,.18)'
          });
        }
      }
    }
    for (let i = 0; i < 95; i++) rain.push({ x: r() * w, y: r() * h, l: 8 + r() * 22, s: 0.22 + r() * 0.5 });
    for (let i = 0; i < 26; i++) embers.push({ x: r() * w, y: h * 0.66 + r() * h * 0.33, s: 0.2 + r() * 0.6, p: r() * 6.28 });
    for (let i = 0; i < 5; i++) walkers.push({ x: w * 0.1 + r() * w * 0.8, y: h * 0.68 + r() * h * 0.05, s: 0.5 + r() * 0.5, p: r() * 8 });
    return { w, h, skylineA, skylineB, windows, rain, embers, walkers };
  }

  function cacheFor(w, h) {
    const key = w + 'x' + h;
    for (let i = 0; i < sceneCache.length; i++) {
      if (sceneCache[i].key === key) return sceneCache[i].scene;
    }
    const scene = buildScene(w, h);
    if (sceneCache.length >= CACHE_LIMIT) sceneCache.shift();
    sceneCache.push({ key, scene });
    return scene;
  }

  // ---------- 背景场景 ----------
  function draw(ctx, w, h, nowMs, opts) {
    if (!ctx || !(w > 0) || !(h > 0)) return;
    const o = opts || {};
    const scene = cacheFor(w, h);
    // reduced motion：冻结在固定帧，保留构图，不保留雨/雾/游荡
    const t = o.reduced ? 0 : (nowMs || 0) / 1000;

    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#050a12');
    sky.addColorStop(0.42, '#0a1420');
    sky.addColorStop(0.68, '#0c1724');
    sky.addColorStop(1, '#05080d');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    // 远处红色余晖
    const glow = ctx.createRadialGradient(w * 0.68, h * 0.58, 10, w * 0.68, h * 0.58, w * 0.62);
    glow.addColorStop(0, 'rgba(120,44,38,.20)');
    glow.addColorStop(0.55, 'rgba(70,28,30,.06)');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);

    // 远景天际线
    ctx.fillStyle = '#0a1420';
    for (let i = 0; i < scene.skylineB.length; i++) {
      const b = scene.skylineB[i];
      const y = h * 0.64 - b.h;
      ctx.fillRect(b.x, y, b.w, b.h + 2);
      if (b.ant) ctx.fillRect(b.x + b.w * 0.62, y - 18, 2, 18);
    }

    // 近景天际线 + 窗灯
    for (let i = 0; i < scene.skylineA.length; i++) {
      const b = scene.skylineA[i];
      const y = h * 0.69 - b.h;
      ctx.fillStyle = '#070f19';
      ctx.fillRect(b.x, y, b.w, b.h + 2);
      if (b.ant) {
        ctx.fillStyle = '#0a1521';
        ctx.fillRect(b.x + b.w * 0.5, y - 26, 2, 26);
        ctx.fillStyle = 'rgba(239,83,80,.5)';
        ctx.fillRect(b.x + b.w * 0.5, y - 27, 2, 2);
      }
    }
    for (let i = 0; i < scene.windows.length; i++) {
      const win = scene.windows[i];
      // 窗灯依附于建筑顶部（按近景 y 计算）
      let top = h * 0.69;
      for (let k = 0; k < scene.skylineA.length; k++) {
        const b = scene.skylineA[k];
        if (win.bx >= b.x && win.bx < b.x + b.w) { top = h * 0.69 - b.h; break; }
      }
      ctx.fillStyle = win.color;
      ctx.fillRect(win.bx, top + 8 + win.row * 20, 2, 3);
    }

    // 地面透视网格
    const horizon = h * 0.70;
    ctx.strokeStyle = 'rgba(79,195,247,.10)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 11; i++) {
      const yy = horizon + Math.pow(i / 10, 1.8) * (h - horizon);
      ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(w, yy); ctx.stroke();
    }
    for (let i = -8; i <= 8; i++) {
      const bx = w / 2 + i * w * 0.14;
      ctx.beginPath();
      ctx.moveTo(w / 2 + i * w * 0.008, horizon);
      ctx.lineTo(bx, h);
      ctx.stroke();
    }

    // 三层雾带
    for (let i = 0; i < 3; i++) {
      const y = horizon - 30 + i * 36 + Math.sin(t * 0.18 + i) * 8;
      const g = ctx.createLinearGradient(0, y, 0, y + 100);
      g.addColorStop(0, 'rgba(80,120,160,0)');
      g.addColorStop(0.5, 'rgba(80,130,170,' + (0.035 + i * 0.012).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(80,120,160,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, y, w, 100);
    }

    // 远处游荡的僵尸剪影
    ctx.save();
    ctx.fillStyle = 'rgba(3,7,11,.72)';
    for (let i = 0; i < scene.walkers.length; i++) {
      const z = scene.walkers[i];
      const zx = z.x + Math.sin(t * 0.12 * z.s + z.p) * 26;
      const zy = z.y;
      const s = z.s;
      ctx.beginPath();
      ctx.arc(zx, zy - 26 * s, 4.5 * s, 0, 6.283);
      ctx.fill();
      ctx.fillRect(zx - 4 * s, zy - 21 * s, 8 * s, 17 * s);
      ctx.fillRect(zx - 7 * s, zy - 18 * s, 3 * s, 13 * s);
      ctx.fillRect(zx + 4 * s, zy - 19 * s, 3 * s, 10 * s);
      ctx.fillRect(zx - 4 * s, zy - 5 * s, 3 * s, 8 * s);
      ctx.fillRect(zx + 1 * s, zy - 5 * s, 3 * s, 8 * s);
    }
    ctx.restore();

    // 雨
    ctx.save();
    ctx.strokeStyle = 'rgba(150,190,220,.10)';
    ctx.lineWidth = 1;
    for (let i = 0; i < scene.rain.length; i++) {
      const d = scene.rain[i];
      const y = (d.y + t * 900 * d.s) % (h + 40);
      ctx.beginPath();
      ctx.moveTo(d.x, y);
      ctx.lineTo(d.x - 3, y + d.l);
      ctx.stroke();
    }
    ctx.restore();

    // 余烬
    for (let i = 0; i < scene.embers.length; i++) {
      const e = scene.embers[i];
      const ey = e.y - ((t * 18 * e.s) % 260);
      const a = clamp01(0.18 + 0.12 * Math.sin(t * 2 + e.p));
      ctx.fillStyle = 'rgba(255,145,80,' + a.toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(e.x, ey, 1.3, 0, 6.283);
      ctx.fill();
    }

    // 每 30 秒一次扫描光带
    const sweepX = ((t * 0.035) % 1.4 - 0.2) * w;
    const sweep = ctx.createLinearGradient(sweepX - 80, 0, sweepX + 80, 0);
    sweep.addColorStop(0, 'rgba(79,195,247,0)');
    sweep.addColorStop(0.5, 'rgba(79,195,247,.035)');
    sweep.addColorStop(1, 'rgba(79,195,247,0)');
    ctx.fillStyle = sweep;
    ctx.fillRect(0, 0, w, h);
  }

  // ---------- 缩略图 ----------
  function overlayThumb(ctx, w, h) {
    // 64px 青色网格
    ctx.strokeStyle = 'rgba(79,195,247,.07)';
    ctx.lineWidth = 1;
    const step = w / 20;
    for (let x = 0; x <= w; x += step) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = 0; y <= h; y += step) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
    // 扫描线
    ctx.fillStyle = 'rgba(255,255,255,.018)';
    for (let y = 0; y < h; y += 6) ctx.fillRect(0, y, w, 1);
    // 暗角 + 底部渐变，保证卡片文字可读
    const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, w * 0.62);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,.55)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
    const foot = ctx.createLinearGradient(0, h * 0.55, 0, h);
    foot.addColorStop(0, 'rgba(3,8,14,0)');
    foot.addColorStop(1, 'rgba(3,8,14,.62)');
    ctx.fillStyle = foot;
    ctx.fillRect(0, h * 0.55, w, h * 0.45);
  }

  function spawnPoints(map) {
    const list = (map && map.spawns) || [];
    const pts = [];
    if (list.length) {
      for (let i = 0; i < list.length; i++) {
        pts.push({ x: Math.max(10, list[i].x), y: list[i].y });
      }
      return pts;
    }
    return [{ x: W / 2, y: 12 }, { x: W - 12, y: H / 2 }, { x: W / 2, y: H - 12 }, { x: 12, y: H / 2 }];
  }

  function drawFallbackThumb(ctx, map, w, h) {
    if (!ctx || !map || !(w > 0) || !(h > 0)) return;
    const st = styleOf(map);
    ctx.save();
    ctx.scale(w / W, h / H);
    ctx.fillStyle = st.ground;
    ctx.fillRect(0, 0, W, H);

    const roads = map.roads || [];
    ctx.fillStyle = st.road;
    for (let i = 0; i < roads.length; i++) {
      const r = roads[i];
      ctx.fillRect(r.x, r.y, r.w, r.h);
    }

    // 活动区（地铁的通道 + 大厅）
    if (ZG.MapZone && ZG.MapZone.has(map)) {
      ctx.fillStyle = st.zone;
      for (let i = 0; i < map.zones.length; i++) {
        const z = map.zones[i];
        ctx.fillRect(z.x, z.y, z.w, z.h);
      }
    }

    // 地形（消毒池等），不阻挡
    const terrain = map.terrain || [];
    for (let i = 0; i < terrain.length; i++) {
      const t = terrain[i];
      const g = ctx.createRadialGradient(t.x, t.y, Math.max(2, (t.r || 20) * 0.1), t.x, t.y, t.r || 20);
      g.addColorStop(0, 'rgba(80,170,190,.28)');
      g.addColorStop(1, 'rgba(40,90,110,.07)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.r || 20, 0, 6.283);
      ctx.fill();
    }

    // 障碍
    const obs = map.obstacles || [];
    for (let i = 0; i < obs.length; i++) {
      const ob = obs[i];
      ctx.fillStyle = st.obstacle;
      if (ob.kind === 'rect') ctx.fillRect(ob.x, ob.y, ob.w, ob.h);
      else { ctx.beginPath(); ctx.arc(ob.x, ob.y, ob.r, 0, 6.283); ctx.fill(); }
    }

    // 入口红点
    const pts = spawnPoints(map);
    ctx.fillStyle = 'rgba(239,83,80,.85)';
    for (let i = 0; i < pts.length; i++) {
      ctx.beginPath();
      ctx.arc(pts[i].x, pts[i].y, 11, 0, 6.283);
      ctx.fill();
    }
    ctx.restore();
    overlayThumb(ctx, w, h);
  }

  function drawThumb(ctx, map, w, h) {
    if (!ctx || !map || !(w > 0) || !(h > 0)) return;
    const layer = ZG.MapLayer;
    if (layer && typeof layer.drawMinimap === 'function' && ZG.MapZone) {
      try {
        layer.drawMinimap(ctx, map, w, h);
        overlayThumb(ctx, w, h);
        return;
      } catch (e) { /* 回退到简化缩略图 */ }
    }
    drawFallbackThumb(ctx, map, w, h);
  }

  // ---------- 战区监视 ----------
  function drawFeed(ctx, map, w, h, nowMs, opts) {
    if (!ctx || !map || !(w > 0) || !(h > 0)) return;
    const o = opts || {};
    drawThumb(ctx, map, w, h);

    // 移动扫描线（reduced 时静止）
    const t = o.reduced ? 0 : (nowMs || 0) / 1000;
    const sy = ((t * 0.16) % 1) * h;
    const band = ctx.createLinearGradient(0, sy - h * 0.12, 0, sy + h * 0.12);
    band.addColorStop(0, 'rgba(79,195,247,0)');
    band.addColorStop(0.5, 'rgba(79,195,247,.10)');
    band.addColorStop(1, 'rgba(79,195,247,0)');
    ctx.fillStyle = band;
    ctx.fillRect(0, sy - h * 0.12, w, h * 0.24);

    // 四角细线框
    const cl = Math.max(10, Math.round(Math.min(w, h) * 0.07));
    ctx.strokeStyle = 'rgba(79,195,247,.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0.5, 0.5 + cl); ctx.lineTo(0.5, 0.5); ctx.lineTo(0.5 + cl, 0.5);
    ctx.moveTo(w - 0.5 - cl, 0.5); ctx.lineTo(w - 0.5, 0.5); ctx.lineTo(w - 0.5, 0.5 + cl);
    ctx.moveTo(0.5, h - 0.5 - cl); ctx.lineTo(0.5, h - 0.5); ctx.lineTo(0.5 + cl, h - 0.5);
    ctx.moveTo(w - 0.5 - cl, h - 0.5); ctx.lineTo(w - 0.5, h - 0.5); ctx.lineTo(w - 0.5, h - 0.5 - cl);
    ctx.stroke();

    // 入口红色箭头（不画文字，文字交给 DOM）
    const pts = spawnPoints(map);
    const sx = w / W, syScale = h / H;
    ctx.fillStyle = 'rgba(239,83,80,.8)';
    for (let i = 0; i < pts.length; i++) {
      const px = pts[i].x * sx, py = pts[i].y * syScale;
      ctx.beginPath();
      ctx.moveTo(px - 8, py);
      ctx.lineTo(px + 8, py - 6);
      ctx.lineTo(px + 8, py + 6);
      ctx.closePath();
      ctx.fill();
    }
  }

  ZG.MenuScene = { draw, drawFeed, drawThumb, drawFallbackThumb, styleOf, rgba, sceneSeed: SEED };
})();
