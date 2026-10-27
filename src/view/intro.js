/* ZG.Intro — 开场演出：时间轴、程序化裂纹/碎片、黑幕、标题层、跳过
 *
 * 纯几何与时间轴是纯函数（可单测）；DOM 只在 play()/resize()/tick() 里创建与更新。
 * 不引用 ZG.Menu；建局与隐藏菜单通过 onBuild / onDone 回调交给 main.js。
 * 不使用 Math.random()：裂纹、咬痕、碎片都用固定种子 LCG。
 */
(function () {
  'use strict';
  const ZG = globalThis.ZG = globalThis.ZG || {};

  const SEED = 20261027;
  const STAGE_CLASS_SHAKE = 'intro-shake';
  const HUD_CLASS_REVEAL = 'intro-reveal';

  // 时间轴唯一数值表（ms）
  const TABLES = {
    full: {
      total: 4200, buildAt: 1900, skipAfter: 350,
      phases: [
        ['windup', 0, 250], ['impact', 250, 350], ['spread', 350, 1300],
        ['blackout', 1300, 1950], ['hold', 1950, 2300], ['title', 2300, 3100],
        ['hold2', 3100, 3350], ['reveal', 3350, 4050], ['settle', 4050, 4200]
      ],
      cues: [
        [0, 'impact'], [250, 'glass'], [350, 'bite'], [1950, 'heartbeat'],
        [2300, 'stinger'], [3350, 'reveal'], [3350, 'whoosh']
      ]
    },
    skip: {
      total: 550, buildAt: 0, skipAfter: Infinity,
      phases: [['blackout', 0, 80], ['title', 80, 330], ['reveal', 330, 550]],
      cues: [[0, 'impact'], [80, 'glass'], [330, 'reveal']]
    },
    quick: {
      total: 1000, buildAt: 0, skipAfter: Infinity,
      phases: [['blackout', 0, 150], ['title', 150, 600], ['reveal', 600, 1000]],
      cues: [[0, 'impact'], [600, 'reveal']]
    },
    reduced: {
      total: 1400, buildAt: 0, skipAfter: 350,
      phases: [['blackout', 0, 200], ['title', 200, 1000], ['reveal', 1000, 1400]],
      cues: [[0, 'impact'], [200, 'reveal']]
    },
    off: {
      total: 250, buildAt: 0, skipAfter: Infinity,
      phases: [['reveal', 0, 250]],
      cues: []
    }
  };

  const I = {
    active: false, done: false, built: false,
    mapId: null, variant: 'full', tl: null,
    start: null, last: null, cueIndex: 0, lastPhase: '',
    cbs: {}, settings: {},
    reduced: false, mobile: false,
    root: null, canvas: null, ctx: null,
    veil: null, flash: null, title: null, skipBtn: null, progress: null, progressBar: null,
    w: 0, h: 0, dpr: 1,
    cracks: [], bite: null, debris: null
  };

  // ---------- 小工具 ----------
  function lcg(seed) {
    let s = seed >>> 0;
    return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  }

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  // ---------- 纯函数 ----------
  function timeline(variant, reduced) {
    let key;
    if (variant === 'off') key = 'off';
    else if (reduced) key = 'reduced';
    else key = TABLES[variant] ? variant : 'full';
    const t = TABLES[key];
    return {
      variant: key,
      total: t.total,
      buildAt: t.buildAt,
      skipAfter: t.skipAfter,
      phases: t.phases.map(p => ({ id: p[0], start: p[1], end: p[2] })),
      cues: t.cues.map(c => ({ at: c[0], name: c[1] }))
    };
  }

  function variantFor(requested, settings, reduced) {
    if (reduced) return 'reduced';
    if (settings && settings.intro === false) return 'off';
    if (requested === 'quick') return 'quick';
    return 'full';
  }

  function skipDecision(elapsedMs, phaseId, variant) {
    if (variant !== 'full' && variant !== 'reduced') return 'finish';
    if (elapsedMs < 350) return 'ignore';
    if (phaseId === 'reveal' || phaseId === 'settle') return 'finish';
    return 'shorten';
  }

  function copyFor(mapId) {
    const order = ZG.Data.mapOrder || [];
    const idx = Math.max(0, order.indexOf(mapId));
    const map = ZG.Data.maps[mapId] || {};
    const brief = (ZG.Data.menu && ZG.Data.menu.mapBriefs[mapId]) || {};
    const stars = map.difficulty || 1;
    return {
      sector: '第 ' + pad2(idx + 1) + ' 号战区 / SECTOR ' + pad2(idx + 1),
      name: map.name || mapId,
      en: brief.codename || '',
      stars,
      threatText: '威胁等级 ' + '★'.repeat(stars) + '☆'.repeat(Math.max(0, 3 - stars)),
      desc: map.desc || ''
    };
  }

  // 裂纹：6 条主裂纹 + 支裂纹，固定在像素坐标内并 clamp 到画布
  function crackPaths(seed, w, h) {
    const r = lcg(seed >>> 0);
    const ox = 0.14 * w;
    const oy = 0.09 * h;
    const m = Math.min(w, h);
    const out = [];
    const clx = v => clamp(v, 0, w);
    const cly = v => clamp(v, 0, h);

    for (let i = 0; i < 6; i++) {
      let base = -0.35 + i * 0.62;
      if (i === 0) base = -2.45;   // 左上
      if (i === 5) base = 1.35;    // 向下
      const len = (0.38 + r() * 0.55) * m;
      const steps = 11;
      const pts = [{ x: clx(ox), y: cly(oy) }];
      const branches = [];
      let x = ox, y = oy;
      for (let s = 1; s <= steps; s++) {
        const f = s / steps;
        const ang = base + (r() - 0.5) * 0.35;
        const seg = (len / steps) * (1 - f * 0.25);
        x += Math.cos(ang) * seg;
        y += Math.sin(ang) * seg;
        pts.push({ x: clx(x), y: cly(y) });
        if (r() > 0.72 && s < steps - 1) {
          const bAng = ang + (r() > 0.5 ? 1 : -1) * (0.4 + r() * 0.5);
          const bLen = len * (0.2 + r() * 0.25);
          const bPts = [{ x: clx(x), y: cly(y) }];
          let bx = x, by = y;
          for (let k = 1; k <= 6; k++) {
            const a = bAng + (r() - 0.5) * 0.5;
            bx += Math.cos(a) * bLen / 6;
            by += Math.sin(a) * bLen / 6;
            bPts.push({ x: clx(bx), y: cly(by) });
          }
          branches.push({ pts: bPts, width: 0.8 });
        }
      }
      out.push({ pts, width: 4.4, branches });
    }
    return out;
  }

  // ---------- 几何缓存 ----------
  function buildBite(w, h) {
    const r = lcg(SEED + 1);
    const R = Math.min(w, h) * 0.085;
    const cx = 0.14 * w;
    const cy = 0.09 * h;
    const pts = [];
    const n = 26;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      // 牙印：交替长短 + 抖动，再加 8 个内凹
      const notch = (i % 2 === 0) ? 1 : 0.72;
      const dip = (i % 3 === 0) ? 0.86 : 1;
      const rr = R * notch * dip * (0.94 + r() * 0.12);
      pts.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr });
    }
    return { cx, cy, R, pts };
  }

  function buildDebris(w, h, mobile) {
    const r = lcg(SEED + 2);
    const ox = 0.14 * w, oy = 0.09 * h;
    const frags = [];
    const fragCount = mobile ? 18 : 26;
    for (let i = 0; i < fragCount; i++) {
      const a = r() * Math.PI * 2;
      const d = (0.04 + r() * 0.32) * Math.min(w, h);
      frags.push({
        x: ox + Math.cos(a) * d, y: oy + Math.sin(a) * d,
        s: 2 + r() * 7, rot: r() * 6.283,
        tone: 160 + Math.floor(r() * 80)
      });
    }
    const blood = [];
    const bloodCount = mobile ? 6 : 10;
    for (let i = 0; i < bloodCount; i++) {
      const a = r() * Math.PI * 2;
      const d = (0.05 + r() * 0.18) * Math.min(w, h);
      blood.push({
        x: ox + Math.cos(a) * d, y: oy + Math.sin(a) * d,
        r: 1 + r() * 3
      });
    }
    const dust = [];
    for (let i = 0; i < 12; i++) {
      const a = r() * Math.PI * 2;
      const d = (0.06 + r() * 0.24) * Math.min(w, h);
      dust.push({ x: ox + Math.cos(a) * d, y: oy + Math.sin(a) * d, r: 4 + r() * 10 });
    }
    return { frags, blood, dust, ox, oy };
  }

  // ---------- 绘制 ----------
  function drawBite(ctx, p) {
    const b = I.bite;
    if (!b) return;
    ctx.save();
    // 红光
    const glow = ctx.createRadialGradient(b.cx, b.cy, 2, b.cx, b.cy, b.R * (1.6 + p * 1.4));
    glow.addColorStop(0, 'rgba(239,83,80,' + (0.34 * p).toFixed(3) + ')');
    glow.addColorStop(0.4, 'rgba(150,30,30,' + (0.16 * p).toFixed(3) + ')');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(b.cx, b.cy, b.R * (1.6 + p * 1.4), 0, 6.283);
    ctx.fill();

    // 破口本体
    ctx.beginPath();
    for (let i = 0; i < b.pts.length; i++) {
      const pt = b.pts[i];
      const x = b.cx + (pt.x - b.cx) * p;
      const y = b.cy + (pt.y - b.cy) * p;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = '#010204';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.85)';
    ctx.lineWidth = 7;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(235,245,255,.55)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.restore();
  }

  function drawCracks(ctx, p) {
    const paths = I.cracks;
    if (!paths || !paths.length) return;
    const ox = 0.14 * I.w, oy = 0.09 * I.h;
    const f = Math.min(1, p * 1.15);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let i = 0; i < paths.length; i++) {
      const path = paths[i];
      ctx.beginPath();
      for (let k = 0; k < path.pts.length; k++) {
        const pt = path.pts[k];
        const x = ox + (pt.x - ox) * f;
        const y = oy + (pt.y - oy) * f;
        if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = 'rgba(0,0,0,.95)';
      ctx.lineWidth = 7;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(8,12,18,.95)';
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(225,240,255,.62)';
      ctx.lineWidth = 1.1;
      ctx.stroke();
    }
    // 支裂纹
    ctx.globalAlpha = 0.6;
    for (let i = 0; i < paths.length; i++) {
      const brs = paths[i].branches;
      for (let j = 0; j < brs.length; j++) {
        const br = brs[j];
        ctx.beginPath();
        for (let k = 0; k < br.pts.length; k++) {
          const pt = br.pts[k];
          const x = ox + (pt.x - ox) * f;
          const y = oy + (pt.y - oy) * f;
          if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = 'rgba(0,0,0,.8)';
        ctx.lineWidth = 2.4;
        ctx.stroke();
        ctx.strokeStyle = 'rgba(230,240,255,.55)';
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawDebris(ctx, p) {
    const d = I.debris;
    if (!d) return;
    ctx.save();
    for (let i = 0; i < d.frags.length; i++) {
      const f = d.frags[i];
      const x = d.ox + (f.x - d.ox) * p;
      const y = d.oy + (f.y - d.oy) * p;
      const a = clamp(0.72 - p * 0.55, 0.08, 0.7);
      ctx.fillStyle = 'rgba(' + f.tone + ',' + (f.tone + 25) + ',220,' + a.toFixed(3) + ')';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + f.s, y + f.s * 0.35);
      ctx.lineTo(x + f.s * 0.3, y + f.s);
      ctx.closePath();
      ctx.fill();
    }
    for (let i = 0; i < d.blood.length; i++) {
      const b = d.blood[i];
      const x = d.ox + (b.x - d.ox) * p;
      const y = d.oy + (b.y - d.oy) * p;
      ctx.fillStyle = 'rgba(150,25,25,.5)';
      ctx.beginPath();
      ctx.arc(x, y, b.r, 0, 6.283);
      ctx.fill();
    }
    for (let i = 0; i < d.dust.length; i++) {
      const s = d.dust[i];
      const x = d.ox + (s.x - d.ox) * p;
      const y = d.oy + (s.y - d.oy) * p;
      ctx.fillStyle = 'rgba(200,210,220,.10)';
      ctx.beginPath();
      ctx.arc(x, y, s.r * (0.6 + p * 0.6), 0, 6.283);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawFrame(t) {
    if (!I.ctx) return;
    const ctx = I.ctx;
    ctx.clearRect(0, 0, I.w, I.h);
    if (I.variant !== 'full' || I.reduced) return;
    if (t < 250 || t >= 1950) return;
    let p;
    if (t < 350) p = 0.1 + 0.45 * ((t - 250) / 100);
    else p = 0.55 + 0.45 * Math.min(1, (t - 350) / 950);
    drawBite(ctx, Math.min(1, p * 1.7));
    drawCracks(ctx, p);
    drawDebris(ctx, p);
  }

  // ---------- 时间轴辅助 ----------
  function phaseAt(tl, t) {
    for (let i = 0; i < tl.phases.length; i++) {
      if (t < tl.phases[i].end) return tl.phases[i];
    }
    return tl.phases[tl.phases.length - 1];
  }

  function veilFor(t, tl, variant, built) {
    if (variant === 'off') return clamp(1 - t / tl.total, 0, 1);
    if (variant !== 'full') return 1;
    if (built || t >= tl.buildAt) return 1;
    if (t < 350) return 0;
    if (t < 1300) return 0.6 * ((t - 350) / 950);
    return 0.6 + 0.4 * clamp((t - 1300) / 600, 0, 1);
  }

  function revealFor(t, tl, variant) {
    if (variant === 'off') return 0;
    const rp = tl.phases.find(p => p.id === 'reveal');
    if (!rp) return 1;
    if (t <= rp.start) return 0;
    if (t >= rp.end) return 1;
    return (t - rp.start) / (rp.end - rp.start);
  }

  // ---------- DOM ----------
  function buildRoot(mapId) {
    const copy = copyFor(mapId);
    const root = document.createElement('div');
    root.className = 'intro-root';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', '进入战场');
    root.setAttribute('data-phase', '');
    root.setAttribute('data-skip', '0');

    const canvas = document.createElement('canvas');
    canvas.className = 'intro-crack';
    canvas.setAttribute('aria-hidden', 'true');
    root.appendChild(canvas);
    I.canvas = canvas;
    I.ctx = canvas.getContext('2d');

    const flash = document.createElement('div');
    flash.className = 'intro-flash';
    flash.setAttribute('aria-hidden', 'true');
    root.appendChild(flash);
    I.flash = flash;

    const veil = document.createElement('div');
    veil.className = 'intro-veil';
    veil.setAttribute('aria-hidden', 'true');
    root.appendChild(veil);
    I.veil = veil;

    const title = document.createElement('div');
    title.className = 'intro-title';
    title.appendChild(el('div', 'intro-sector', copy.sector));
    title.appendChild(el('div', 'intro-name', copy.name));
    title.appendChild(el('div', 'intro-en', copy.en));
    title.appendChild(el('div', 'intro-threat', copy.threatText));
    title.appendChild(el('div', 'intro-rule'));
    title.appendChild(el('div', 'intro-desc', copy.desc));
    root.appendChild(title);
    I.title = title;

    const skipBtn = document.createElement('button');
    skipBtn.type = 'button';
    skipBtn.className = 'intro-skip';
    skipBtn.textContent = (ZG.Data.menu && ZG.Data.menu.copy && ZG.Data.menu.copy.skip) || '跳过 ▸';
    skipBtn.addEventListener('click', () => { skip(); });
    root.appendChild(skipBtn);
    I.skipBtn = skipBtn;

    const progress = document.createElement('div');
    progress.className = 'intro-progress';
    const bar = document.createElement('i');
    progress.appendChild(bar);
    root.appendChild(progress);
    I.progress = progress;
    I.progressBar = bar;

    root.addEventListener('pointerdown', ev => {
      if (ev.target && ev.target.closest && ev.target.closest('.intro-skip')) return;
      skip();
    });
    root.addEventListener('keydown', onKeyDown);
    document.addEventListener('keydown', onKeyDown, true);

    return root;
  }

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function onKeyDown(ev) {
    if (!I.active || I.done) return;
    if (ev.key === 'Escape' || ev.key === ' ' || ev.key === 'Spacebar' || ev.key === 'Enter') {
      ev.preventDefault();
      skip();
    }
  }

  // ---------- 播放 ----------
  function play(mapId, opts) {
    if (I.active) return false;
    const o = opts || {};
    I.active = true;
    I.done = false;
    I.built = false;
    I.mapId = mapId;
    I.cbs = { onBuild: o.onBuild, onDone: o.onDone };
    I.settings = o.settings || {};
    I.mobile = !!(ZG.Platform && ZG.Platform.isMobile);
    try {
      I.reduced = !!(typeof matchMedia !== 'undefined' &&
        matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (e) { I.reduced = false; }
    I.variant = variantFor(o.variant, I.settings, I.reduced);
    I.tl = timeline(I.variant, I.reduced);
    I.start = null;
    I.last = null;
    I.cueIndex = 0;
    I.lastPhase = '';

    const hud = document.getElementById('hud');
    if (!hud) { I.active = false; return false; }
    I.root = buildRoot(mapId);
    hud.appendChild(I.root);
    resize();
    // 初始黑幕状态
    applyFrame(0);
    return true;
  }

  function resize() {
    if (!I.active || !I.root) return;
    let w = 0, h = 0;
    try {
      const stage = document.getElementById('stage');
      const rect = stage ? stage.getBoundingClientRect() : null;
      w = Math.round((rect && rect.width) || window.innerWidth || 1280);
      h = Math.round((rect && rect.height) || window.innerHeight || 720);
    } catch (e) {
      w = 1280; h = 720;
    }
    I.w = w; I.h = h;
    const cap = I.mobile ? 1.25 : 1.5;
    let dpr = 1;
    try { dpr = Math.min(window.devicePixelRatio || 1, cap); } catch (e) { dpr = 1; }
    I.dpr = dpr;
    if (I.canvas) {
      I.canvas.width = Math.max(1, Math.round(w * dpr));
      I.canvas.height = Math.max(1, Math.round(h * dpr));
      I.canvas.style.width = w + 'px';
      I.canvas.style.height = h + 'px';
      if (I.ctx) I.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    I.cracks = crackPaths(SEED, w, h);
    I.bite = buildBite(w, h);
    I.debris = buildDebris(w, h, I.mobile);
    if (I.start !== null) drawFrame(I.last - I.start);
  }

  function applyFrame(t) {
    if (!I.root) return;
    const tl = I.tl;
    const ph = phaseAt(tl, t);

    if (ph.id !== I.lastPhase) {
      const prev = I.lastPhase;
      I.lastPhase = ph.id;
      I.root.setAttribute('data-phase', ph.id);
      if (ph.id === 'impact' && prev !== 'impact') triggerImpact();
      if (ph.id === 'reveal') triggerReveal();
    }

    I.root.style.setProperty('--veil', String(veilFor(t, tl, I.variant, I.built)));
    I.root.style.setProperty('--reveal', String(revealFor(t, tl, I.variant)));

    const showSkip = t >= tl.skipAfter && tl.skipAfter !== Infinity &&
      t < tl.total - 50 &&
      (ph.id === 'windup' || ph.id === 'impact' || ph.id === 'spread' ||
        ph.id === 'blackout' || ph.id === 'hold');
    I.root.setAttribute('data-skip', showSkip ? '1' : '0');

    if (I.progressBar) {
      const pct = Math.min(1, t / tl.total) * 100;
      I.progressBar.style.width = pct.toFixed(2) + '%';
    }
  }

  function triggerImpact() {
    if (I.flash) {
      I.flash.classList.remove('on');
      // 强制回流以重启动画
      void I.flash.offsetWidth;
      I.flash.classList.add('on');
    }
    if (I.settings.shake === false) return;
    if (ZG.Platform && ZG.Platform.quality && ZG.Platform.quality.shake === false) return;
    try {
      const stage = document.getElementById('stage');
      if (stage) {
        stage.classList.add(STAGE_CLASS_SHAKE);
        setTimeout(() => { try { stage.classList.remove(STAGE_CLASS_SHAKE); } catch (e) {} }, 150);
      }
    } catch (e) { /* 忽略 */ }
  }

  function triggerReveal() {
    if (I.flash) {
      I.flash.classList.remove('on');
      void I.flash.offsetWidth;
      I.flash.classList.add('on');
    }
    try {
      const hud = document.getElementById('hud');
      if (hud) hud.classList.add(HUD_CLASS_REVEAL);
    } catch (e) { /* 忽略 */ }
  }

  function tick(nowMs) {
    if (!I.active || I.done) return;
    if (I.start === null) {
      I.start = nowMs;
      I.last = nowMs;
    }
    I.last = nowMs;
    const t = nowMs - I.start;

    if (!I.built && t >= I.tl.buildAt) {
      I.built = true;
      if (I.cbs.onBuild) I.cbs.onBuild();
    }

    while (I.cueIndex < I.tl.cues.length && I.tl.cues[I.cueIndex].at <= t) {
      const cue = I.tl.cues[I.cueIndex];
      I.cueIndex++;
      ZG.Audio.play(cue.name);
    }

    drawFrame(t);
    applyFrame(t);

    if (t >= I.tl.total) finish();
  }

  function skip() {
    if (!I.active || I.done || I.last === null) return;
    if (I.variant === 'skip') return;
    const elapsed = I.last - I.start;
    const ph = phaseAt(I.tl, elapsed);
    const decision = skipDecision(elapsed, ph.id, I.variant);
    if (decision === 'ignore') return;
    if (decision === 'finish') { finish(); return; }

    if (!I.built) {
      I.built = true;
      if (I.cbs.onBuild) I.cbs.onBuild();
    }
    I.variant = 'skip';
    I.tl = timeline('skip', I.reduced);
    I.start = I.last;
    I.cueIndex = 0;
    I.lastPhase = '';
    if (I.root) {
      I.root.setAttribute('data-phase', 'blackout');
      I.root.setAttribute('data-skip', '0');
    }
    applyFrame(0);
  }

  function cleanup() {
    try {
      const hud = document.getElementById('hud');
      if (hud) hud.classList.remove(HUD_CLASS_REVEAL);
      const stage = document.getElementById('stage');
      if (stage) stage.classList.remove(STAGE_CLASS_SHAKE);
      if (I.root && I.root.parentNode) I.root.parentNode.removeChild(I.root);
    } catch (e) { /* 忽略 */ }
    try { document.removeEventListener('keydown', onKeyDown, true); } catch (e) { /* 忽略 */ }
    I.root = null;
    I.canvas = null;
    I.ctx = null;
    I.veil = null;
    I.flash = null;
    I.title = null;
    I.skipBtn = null;
    I.progress = null;
    I.progressBar = null;
    I.active = false;
  }

  function finish() {
    if (!I.active || I.done) return;
    I.done = true;
    if (!I.built) {
      I.built = true;
      if (I.cbs.onBuild) I.cbs.onBuild();
    }
    const done = I.cbs.onDone;
    cleanup();
    if (done) done();
  }

  function active() { return I.active && !I.done; }

  ZG.Intro = {
    play, tick, skip, resize, active,
    timeline, crackPaths, variantFor, skipDecision, copyFor,
    _state: I
  };
})();
