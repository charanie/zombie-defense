/* ZG.Menu — 主菜单 / 无尽模式选图
 *
 * 分工：本文件只负责 DOM 结构、页面切换、导航/键盘/焦点、卡片与简报、剧情占位弹窗。
 * 背景与缩略图绘制在 ZG.MenuScene；不引用 ZG.Intro，编排只在 main.js。
 * 顶层不访问 document / window / localStorage / matchMedia。
 */
(function () {
  'use strict';
  const ZG = globalThis.ZG = globalThis.ZG || {};

  const SELECT_DEBOUNCE_MS = 400;
  const FEED_SWITCH_MS = 7000;

  const M = {
    root: null, modal: null,
    sceneCanvas: null, sceneCtx: null,
    feedCanvas: null, feedCtx: null,
    pages: { main: null, maps: null },
    navEls: [],
    cardsWrap: null,
    cardEls: [],
    briefEls: {},
    feedEls: {},
    installBtn: null,
    cb: {},
    page: 'hidden',
    visible: false,
    frozen: false,
    w: 0, h: 0, dpr: 1,
    reduced: false,
    sceneT0: null,
    feedIndex: 0,
    feedSwitchAt: 0,
    lastSelectAt: -1e9,
    teaserOpen: false,
    briefMapId: null
  };

  // ---------- 纯函数（测试用） ----------
  function menuLayout(w, h, coarse) {
    let mode;
    if (h < 520) mode = 'short';
    else if (w < 900 || coarse) mode = 'narrow';
    else if (w < 1100) mode = 'mid';
    else if (h < 800) mode = 'compact';
    else mode = 'wide';
    const showFeed = mode === 'wide' || mode === 'compact';
    return { mode, showFeed, cardFlow: showFeed ? 'grid' : 'snap' };
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function navItems() {
    const d = ZG.Data.menu;
    const out = [];
    let i = 0;
    const modes = d.modes || [];
    for (let k = 0; k < modes.length; k++) {
      const m = modes[k];
      out.push({
        id: m.id, index: pad2(++i), name: m.name, en: m.en, sub: m.sub,
        badge: m.badge, locked: !m.available, soon: m.soon || '',
        action: m.id === 'endless' ? 'maps' : m.id
      });
    }
    const actions = d.actions || [];
    for (let k = 0; k < actions.length; k++) {
      const a = actions[k];
      out.push({
        id: a.id, index: pad2(++i), name: a.name, en: a.en, sub: a.sub,
        badge: a.badge, locked: false, soon: '', action: a.action
      });
    }
    return out;
  }

  function mapCardModel(mapId, best, last) {
    const map = ZG.Data.maps[mapId];
    const brief = ZG.Data.menu.mapBriefs[mapId] || {};
    const idx = ZG.Data.mapOrder.indexOf(mapId);
    const b = best || 0;
    const l = last || 0;
    const stars = (map && map.difficulty) || 1;
    const name = map ? map.name : mapId;
    const bestText = b > 0 ? '最佳 ' + b + ' 回合' : '最佳 —';
    const lastText = l > 0 ? '上次抵达 ' + l + ' 回合' : '上次抵达 —';
    return {
      id: mapId,
      code: 'AO-' + pad2(idx + 1),
      name,
      codename: brief.codename || '',
      tags: (brief.tags || []).slice(),
      desc: map ? map.desc : '',
      loadout: brief.loadout || '',
      note: brief.note || '',
      tip: brief.tip || '',
      mix: (brief.mix || []).slice(),
      hostiles: brief.hostiles || '',
      stars,
      accent: (map && map.theme && (map.theme.line || map.theme.accent)) || '#4FC3F7',
      bestText,
      lastText,
      best: b,
      last: l,
      ariaLabel: name + '，难度 ' + stars + ' 星' +
        (b > 0 ? '，最佳 ' + b + ' 回合' : '') + '，进入'
    };
  }

  function acceptsSelect(nowMs, lastMs, busy) {
    if (busy) return false;
    return (nowMs - lastMs) >= SELECT_DEBOUNCE_MS;
  }

  // ---------- DOM 小工具 ----------
  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function button(cls, text) {
    const b = el('button', cls, text);
    b.type = 'button';
    return b;
  }

  // ---------- 构建 ----------
  function buildScene() {
    const root = el('div', 'menu-root hidden');
    root.setAttribute('data-page', 'main');
    root.setAttribute('data-layout', 'wide');

    const canvas = el('canvas', 'menu-scene');
    canvas.setAttribute('aria-hidden', 'true');
    root.appendChild(canvas);
    M.sceneCanvas = canvas;
    M.sceneCtx = canvas.getContext('2d');

    const vignette = el('div', 'menu-fx vignette');
    const scanlines = el('div', 'menu-fx scanlines');
    const grain = el('div', 'menu-fx grain');
    vignette.setAttribute('aria-hidden', 'true');
    scanlines.setAttribute('aria-hidden', 'true');
    grain.setAttribute('aria-hidden', 'true');
    root.appendChild(vignette);
    root.appendChild(scanlines);
    root.appendChild(grain);

    root.appendChild(buildMainPage());
    root.appendChild(buildMapsPage());
    M.root = root;
    return root;
  }

  function buildMainPage() {
    const d = ZG.Data.menu;
    const page = el('section', 'menu-page page-main');
    page.setAttribute('aria-label', '主菜单');

    // 左上角标
    const brand = el('div', 'corner-brand');
    const kicker = el('div', 'menu-kicker');
    kicker.appendChild(el('span', 'menu-dot'));
    kicker.appendChild(document.createTextNode(d.topBadge.zone));
    brand.appendChild(kicker);
    brand.appendChild(el('div', 'brand-zone',
      d.topBadge.signal + ' · ' + d.topBadge.clock + ' · ' + d.topBadge.temp));
    page.appendChild(brand);

    // 标题区
    const hero = el('div', 'menu-hero');
    hero.appendChild(el('div', 'hero-title', d.hero.title));
    hero.appendChild(el('div', 'hero-en', d.hero.en));
    hero.appendChild(el('div', 'hero-tagline', d.hero.tagline));
    page.appendChild(hero);

    // 主导航
    const nav = el('nav', 'menu-nav');
    nav.setAttribute('aria-label', '主菜单导航');
    const items = navItems();
    M.navEls = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const btn = button('menu-nav-item' + (it.locked ? ' locked' : ''));
      btn.setAttribute('data-id', it.id);
      btn.setAttribute('data-action', it.action);
      if (it.locked) {
        btn.setAttribute('aria-disabled', 'true');
        btn.setAttribute('aria-label', it.name + '，' + (it.soon || '锁定'));
      } else {
        btn.setAttribute('aria-label', it.name + '，' + it.sub);
      }
      btn.appendChild(el('span', 'nav-num', it.index));
      const body = el('span', 'nav-body');
      const label = el('span', 'nav-label', it.name);
      if (it.soon) label.appendChild(el('span', 'nav-locktag', it.soon));
      body.appendChild(label);
      body.appendChild(el('span', 'nav-sub', it.en + ' · ' + it.sub));
      btn.appendChild(body);
      btn.appendChild(el('span', 'nav-tail', it.badge));
      btn.addEventListener('click', onNavClick);
      nav.appendChild(btn);
      M.navEls.push(btn);
    }
    page.appendChild(nav);

    page.appendChild(buildFeed());

    // 底部工具条
    const bottom = el('footer', 'menu-bottom');
    const left = el('div', 'bottom-left');
    left.appendChild(el('span', '', d.copy.keys));
    bottom.appendChild(left);
    const right = el('div', 'bottom-right');

    const share = button('menu-util', '分享');
    share.addEventListener('click', () => { ZG.Audio.play('click'); if (M.cb.onShare) M.cb.onShare(); });
    right.appendChild(share);

    const install = button('menu-util hidden', '安装');
    install.addEventListener('click', () => { ZG.Audio.play('click'); if (M.cb.onInstall) M.cb.onInstall(); });
    M.installBtn = install;
    right.appendChild(install);

    const full = button('menu-util', '全屏');
    full.addEventListener('click', () => { ZG.Audio.play('click'); if (M.cb.onFullscreen) M.cb.onFullscreen(); });
    right.appendChild(full);

    right.appendChild(el('span', 'menu-ver', '尸潮防线 ' + ZG.Const.VERSION));
    bottom.appendChild(right);
    page.appendChild(bottom);
    M.pages.main = page;
    return page;
  }

  function buildFeed() {
    const d = ZG.Data.menu;
    const feed = el('aside', 'menu-feed');
    feed.setAttribute('aria-label', '战区监视');

    const head = el('div', 'feed-head');
    head.appendChild(el('div', 'feed-title', d.feed.title + ' / ' + d.feed.en));
    const live = el('div', 'live');
    live.appendChild(el('span', 'menu-dot'));
    live.appendChild(document.createTextNode('LIVE'));
    head.appendChild(live);
    feed.appendChild(head);

    const wrap = el('div', 'feed-canvas-wrap');
    const canvas = el('canvas', 'feed-canvas');
    canvas.width = 376; canvas.height = 212;
    wrap.appendChild(canvas);
    M.feedCanvas = canvas;
    M.feedCtx = canvas.getContext('2d');

    const tags = el('div', 'feed-tags');
    tags.appendChild(el('span', '', d.feed.cam));
    tags.appendChild(el('span', '', d.feed.mode));
    wrap.appendChild(tags);
    feed.appendChild(wrap);

    const meta = el('div', 'feed-meta');
    const keys = [
      ['sector', 'CURRENT SECTOR', ''],
      ['threat', 'THREAT LEVEL', 'red'],
      ['best', 'PERSONAL BEST', 'gold'],
      ['hostiles', 'HOSTILES', '']
    ];
    M.feedEls = {};
    for (let i = 0; i < keys.length; i++) {
      const cell = el('div', '');
      cell.appendChild(el('div', 'meta-k', keys[i][1]));
      const v = el('div', 'meta-v' + (keys[i][2] ? ' ' + keys[i][2] : ''), '—');
      cell.appendChild(v);
      meta.appendChild(cell);
      M.feedEls[keys[i][0]] = v;
    }
    feed.appendChild(meta);

    const signal = el('div', 'signal');
    signal.appendChild(el('span', 'signal-txt', 'UPLINK'));
    const bars = el('span', 'signal-bars');
    const heights = [4, 6, 9, 5, 11, 7, 12, 8, 4, 6, 10, 3];
    for (let i = 0; i < heights.length; i++) {
      const bar = el('i', '');
      bar.style.height = heights[i] + 'px';
      // 末尾几根压暗，形成“93%”的视觉暗示
      bar.style.opacity = String(0.35 + (heights[i] / 12) * 0.65);
      bars.appendChild(bar);
    }
    signal.appendChild(bars);
    signal.appendChild(el('span', 'signal-txt', d.feed.uplink + '%'));
    feed.appendChild(signal);
    M.pages.feed = feed;
    return feed;
  }

  function buildMapsPage() {
    const d = ZG.Data.menu;
    const page = el('section', 'menu-page page-maps');
    page.setAttribute('aria-label', d.copy.selectTitle);

    const head = el('div', 'maps-head');
    const back = button('menu-back', d.copy.selectBack);
    back.addEventListener('click', () => { ZG.Audio.play('click'); show('main'); });
    head.appendChild(back);
    head.appendChild(el('div', 'menu-crumb', d.copy.selectCrumb));
    head.appendChild(el('div', 'maps-title', d.copy.selectTitle));
    head.appendChild(el('div', 'maps-sub', d.copy.selectSub));
    page.appendChild(head);

    const cards = el('div', 'menu-cards');
    M.cardsWrap = cards;
    buildCards(cards);
    page.appendChild(cards);

    const brief = el('section', 'menu-brief');
    brief.setAttribute('aria-live', 'polite');
    M.briefEls = buildBrief(brief);
    page.appendChild(brief);

    const foot = el('footer', 'maps-foot');
    foot.appendChild(el('span', '', d.copy.selectFootLeft));
    foot.appendChild(el('span', '', d.copy.selectFootRight));
    page.appendChild(foot);
    M.pages.maps = page;
    return page;
  }

  // ---------- 地图卡 ----------
  function buildCards(container) {
    M.cardEls = [];
    M.thumbs = [];
    const order = ZG.Data.mapOrder;
    for (let i = 0; i < order.length; i++) {
      const id = order[i];
      const model = mapCardModel(id, 0, 0);
      const card = button('map-card');
      card.setAttribute('data-id', id);
      card.style.setProperty('--accent', model.accent);

      const thumb = el('div', 'map-thumb');
      const canvas = el('canvas', '');
      thumb.appendChild(canvas);
      thumb.appendChild(el('span', 'mc-ao', model.code));
      const threat = el('span', 'mc-threat');
      for (let k = 1; k <= 3; k++) {
        const bar = el('i', k <= model.stars ? 'on' : '');
        bar.style.height = (5 + k * 3) + 'px';
        threat.appendChild(bar);
      }
      thumb.appendChild(threat);
      const tags = el('span', 'mc-tags');
      for (let k = 0; k < model.tags.length; k++) tags.appendChild(el('span', '', model.tags[k]));
      thumb.appendChild(tags);
      card.appendChild(thumb);

      const body = el('div', 'mc-body');
      body.appendChild(el('div', 'mc-name', model.name));
      body.appendChild(el('div', 'mc-en', model.codename));
      body.appendChild(el('div', 'mc-desc', model.desc));
      body.appendChild(el('div', 'mc-loadout', '推荐开局：' + model.loadout));
      const foot = el('div', 'mc-foot');
      const best = el('span', 'mc-best', model.bestText);
      foot.appendChild(best);
      foot.appendChild(el('span', 'mc-go', ZG.Data.menu.copy.enter));
      body.appendChild(foot);
      card.appendChild(body);

      card.setAttribute('aria-label', model.ariaLabel);
      card.addEventListener('click', () => onCardActivate(card));
      card.addEventListener('mouseenter', () => {
        card.classList.add('hover');
        updateBrief(id);
      });
      card.addEventListener('mouseleave', () => card.classList.remove('hover'));
      card.addEventListener('focus', () => updateBrief(id));

      container.appendChild(card);
      M.cardEls.push(card);
      M.thumbs.push({ id, canvas });
    }

    // 触控横滑：位移超过 8px 时抑制随后的 click，避免滑动误进图
    let swipe = null;
    container.addEventListener('pointerdown', ev => {
      swipe = { x: ev.clientX, y: ev.clientY };
    });
    container.addEventListener('click', ev => {
      if (!swipe) return;
      const dx = ev.clientX - swipe.x;
      const dy = ev.clientY - swipe.y;
      swipe = null;
      if (Math.sqrt(dx * dx + dy * dy) > 8) {
        ev.preventDefault();
        ev.stopPropagation();
      }
    }, true);
  }

  function onCardActivate(card) {
    if (M.frozen) return;
    const id = card.getAttribute('data-id');
    const busy = M.cb.isBusy ? !!M.cb.isBusy() : false;
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    if (!acceptsSelect(now, M.lastSelectAt, busy)) return;
    M.lastSelectAt = now;
    card.classList.add('flash');
    setTimeout(() => card.classList.remove('flash'), 120);
    ZG.Audio.play('click');
    if (M.cb.onSelectMap) M.cb.onSelectMap(id);
  }

  // ---------- 行动简报 ----------
  function buildBrief(container) {
    const refs = {};

    // 1. 行动简报
    const c1 = el('div', 'brief-cell');
    const k1 = el('div', 'brief-k', '行动简报 / OPERATION BRIEF · ');
    refs.name = el('span', '', '');
    k1.appendChild(refs.name);
    c1.appendChild(k1);
    refs.loadout = el('div', 'brief-v', '—');
    c1.appendChild(refs.loadout);
    refs.note = el('div', 'brief-note', '—');
    c1.appendChild(refs.note);
    container.appendChild(c1);

    // 2. 威胁构成（估计）
    const c2 = el('div', 'brief-cell');
    c2.appendChild(el('div', 'brief-k', '威胁构成（估计） / HOSTILE MIX'));
    const bars = el('div', 'brief-bars');
    const labels = ['普通', '冲刺', '特殊'];
    const colors = ['', '#C0CA33', '#EF5350'];
    refs.bars = [];
    for (let i = 0; i < 3; i++) {
      const row = el('div', 'brief-bar');
      row.appendChild(el('span', '', labels[i]));
      const track = el('i', '');
      if (colors[i]) track.style.setProperty('--c', colors[i]);
      row.appendChild(track);
      const num = el('b', '', '0%');
      row.appendChild(num);
      bars.appendChild(row);
      refs.bars.push({ track, num });
    }
    c2.appendChild(bars);
    container.appendChild(c2);

    // 3. 个人记录
    const c3 = el('div', 'brief-cell');
    c3.appendChild(el('div', 'brief-k', '个人记录 / PERSONAL BEST'));
    const record = el('div', 'brief-record');
    refs.best = el('b', '', '—');
    record.appendChild(refs.best);
    record.appendChild(el('span', '', '回合'));
    c3.appendChild(record);
    refs.last = el('div', 'brief-note', '上次抵达 — 回合 · 记录自动保存');
    c3.appendChild(refs.last);
    container.appendChild(c3);

    // 4. 行动提示
    const c4 = el('div', 'brief-cell');
    c4.appendChild(el('div', 'brief-k', '行动提示 / FIELD NOTE'));
    refs.tip = el('div', 'brief-v', '—');
    refs.tip.style.fontSize = '11px';
    refs.tip.style.lineHeight = '1.65';
    c4.appendChild(refs.tip);
    const hint = el('div', 'brief-note', '开场动画可按任意键跳过');
    hint.style.color = '#526A87';
    c4.appendChild(hint);
    container.appendChild(c4);

    return refs;
  }

  function updateBrief(mapId) {
    if (!M.briefEls.name) return;
    const best = bestOf(mapId);
    const last = lastOf(mapId);
    if (M.briefMapId === mapId) return;
    M.briefMapId = mapId;
    const m = mapCardModel(mapId, best, last);
    M.briefEls.name.textContent = m.name;
    M.briefEls.loadout.textContent = m.loadout;
    M.briefEls.note.textContent = m.note;
    M.briefEls.tip.textContent = m.tip;
    M.briefEls.best.textContent = best > 0 ? String(best) : '—';
    M.briefEls.last.textContent = '上次抵达 ' + (last > 0 ? last + ' 回合' : '—') + ' · 记录自动保存';
    for (let i = 0; i < M.briefEls.bars.length; i++) {
      const p = (m.mix && m.mix[i]) || 0;
      M.briefEls.bars[i].track.style.setProperty('--p', p + '%');
      M.briefEls.bars[i].num.textContent = p + '%';
    }
  }

  // ---------- 页面 ----------
  function currentNavIndex() {
    for (let i = 0; i < M.navEls.length; i++) {
      if (M.navEls[i] === document.activeElement) return i;
    }
    return -1;
  }

  function setPageInert(page, inert) {
    const node = M.pages[page];
    if (!node) return;
    if (inert) {
      node.setAttribute('inert', '');
      node.setAttribute('aria-hidden', 'true');
    } else {
      node.removeAttribute('inert');
      node.removeAttribute('aria-hidden');
    }
  }

  function safeFocus(node) {
    try { if (node && node.focus) node.focus({ preventScroll: true }); } catch (e) { /* 忽略 */ }
  }

  function show(page) {
    if (!M.root) return;
    closeTeaser();
    M.page = page === 'maps' ? 'maps' : 'main';
    M.visible = true;
    M.frozen = false;
    M.root.classList.remove('hidden', 'frozen');
    M.root.setAttribute('data-page', M.page);
    setPageInert('main', M.page !== 'main');
    setPageInert('maps', M.page !== 'maps');
    M.sceneT0 = null;
    if (!M.w) resize();
    refreshRecords();
    refreshInstall();
    redrawThumbs();
    if (M.page === 'main') safeFocus(M.navEls[0]);
    else if (M.cardEls.length) safeFocus(M.cardEls[0]);
    drawFeed(true);
  }

  function hide() {
    if (!M.root) return;
    closeTeaser();
    M.root.classList.add('hidden');
    M.root.classList.remove('frozen');
    M.visible = false;
    M.frozen = false;
    M.page = 'hidden';
    M.root.setAttribute('data-page', 'hidden');
    try {
      const active = document.activeElement;
      if (active && M.root.contains(active) && active.blur) active.blur();
    } catch (e) { /* 忽略 */ }
  }

  function freeze() {
    if (!M.root) return;
    M.frozen = true;
    M.root.classList.add('frozen');
  }

  function unfreeze() {
    if (!M.root) return;
    M.frozen = false;
    M.root.classList.remove('frozen');
  }

  // ---------- 尺寸与绘制 ----------
  function stageSize() {
    let w = 0, h = 0;
    try {
      const stage = document.getElementById('stage');
      if (stage) {
        const r = stage.getBoundingClientRect();
        w = Math.round(r.width); h = Math.round(r.height);
      }
      if (!w || !h) { w = window.innerWidth; h = window.innerHeight; }
    } catch (e) { /* 忽略 */ }
    return { w: w || 1280, h: h || 720 };
  }

  function resize() {
    if (!M.root) return;
    const size = stageSize();
    M.w = size.w; M.h = size.h;
    const layout = menuLayout(M.w, M.h, !!(ZG.Platform && ZG.Platform.isMobile));
    M.root.setAttribute('data-layout', layout.mode);
    const cap = (ZG.Platform && ZG.Platform.isMobile) ? 1.25 : 1.5;
    const dpr = Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, cap);
    M.dpr = dpr;

    const canvas = M.sceneCanvas;
    if (canvas && M.sceneCtx) {
      canvas.width = Math.max(1, Math.round(M.w * dpr));
      canvas.height = Math.max(1, Math.round(M.h * dpr));
      canvas.style.width = M.w + 'px';
      canvas.style.height = M.h + 'px';
      M.sceneCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ZG.MenuScene.draw(M.sceneCtx, M.w, M.h, 0, { reduced: true });
    }

    drawFeed(true);
    redrawThumbs();
  }

  function drawFeed(staticFrame) {
    if (!M.feedCanvas || !M.feedCtx) return;
    const mapId = ZG.Data.mapOrder[M.feedIndex % ZG.Data.mapOrder.length];
    const map = ZG.Data.maps[mapId];
    if (!map) return;
    const cssW = M.feedCanvas.clientWidth || 376;
    const cssH = Math.round(cssW * 9 / 16);
    const dpr = 2;
    if (M.feedCanvas.width !== Math.round(cssW * dpr) || M.feedCanvas.height !== Math.round(cssH * dpr)) {
      M.feedCanvas.width = Math.round(cssW * dpr);
      M.feedCanvas.height = Math.round(cssH * dpr);
    }
    M.feedCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ZG.MenuScene.drawFeed(M.feedCtx, map, cssW, cssH, staticFrame ? 0 : (M.sceneT0 ? performance.now() - M.sceneT0 : 0), { reduced: !!staticFrame || M.reduced });
  }

  function redrawThumbs() {
    if (!M.thumbs.length) return;
    const dpr = Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, 2);
    for (let i = 0; i < M.thumbs.length; i++) {
      const t = M.thumbs[i];
      const host = t.canvas.parentNode;
      const cssW = Math.round((host ? host.clientWidth : 0) || 0);
      if (cssW <= 0) continue;
      const cssH = Math.round((host ? host.clientHeight : 0) || Math.round(cssW * 9 / 16));
      if (t.canvas.width !== Math.round(cssW * dpr) || t.canvas.height !== Math.round(cssH * dpr)) {
        t.canvas.width = Math.round(cssW * dpr);
        t.canvas.height = Math.round(cssH * dpr);
      }
      const ctx = t.canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ZG.MenuScene.drawThumb(ctx, ZG.Data.maps[t.id], cssW, cssH);
    }
  }

  function tick(nowMs) {
    if (!M.visible || M.frozen || !M.sceneCtx) return;
    if (M.sceneT0 === null) M.sceneT0 = nowMs;
    const t = nowMs - M.sceneT0;
    ZG.MenuScene.draw(M.sceneCtx, M.w, M.h, t, { reduced: M.reduced });
    if (M.page === 'main') {
      if (!M.feedSwitchAt) M.feedSwitchAt = t;
      if (t - M.feedSwitchAt >= FEED_SWITCH_MS) {
        M.feedSwitchAt = t;
        M.feedIndex = (M.feedIndex + 1) % ZG.Data.mapOrder.length;
        const wrap = M.feedCanvas ? M.feedCanvas.parentNode : null;
        if (wrap) {
          wrap.classList.add('glitch');
          setTimeout(() => { if (wrap) wrap.classList.remove('glitch'); }, 280);
        }
        drawFeed(false);
        updateFeedMeta();
      }
    }
  }

  // ---------- 记录 ----------
  function bestOf(id) {
    try { return ZG.Platform.loadBest(id) || 0; } catch (e) { return 0; }
  }

  function lastOf(id) {
    try { return ZG.Platform.loadLast(id) || 0; } catch (e) { return 0; }
  }

  function threatText(stars) {
    const n = Math.max(1, Math.min(3, stars || 1));
    let out = '';
    for (let i = 0; i < n; i++) out += '★';
    for (let i = n; i < 3; i++) out += '☆';
    return out;
  }

  function updateFeedMeta() {
    const mapId = ZG.Data.mapOrder[M.feedIndex % ZG.Data.mapOrder.length];
    const map = ZG.Data.maps[mapId];
    if (!map || !M.feedEls.sector) return;
    const brief = ZG.Data.menu.mapBriefs[mapId] || {};
    const best = bestOf(mapId);
    M.feedEls.sector.textContent = map.name;
    M.feedEls.threat.textContent = threatText(map.difficulty);
    M.feedEls.best.textContent = best > 0 ? pad2(best) + ' 回合' : '—';
    M.feedEls.hostiles.textContent = brief.hostiles || '未知';
  }

  function refreshRecords() {
    if (!M.root) return;
    updateFeedMeta();
    for (let i = 0; i < M.cardEls.length; i++) {
      const id = M.cardEls[i].getAttribute('data-id');
      const m = mapCardModel(id, bestOf(id), lastOf(id));
      const bestEl = M.cardEls[i].querySelector('.mc-best');
      if (bestEl) bestEl.textContent = m.bestText;
      M.cardEls[i].setAttribute('aria-label', m.ariaLabel);
    }
    M.briefMapId = null;
    if (M.page === 'maps' && ZG.Data.mapOrder.length) updateBrief(ZG.Data.mapOrder[0]);
  }

  function refreshInstall() {
    if (M.installBtn) M.installBtn.classList.toggle('hidden', !ZG.__installPrompt);
  }

  // ---------- 交互 ----------
  function onNavClick(ev) {
    const btn = ev.currentTarget || ev.target.closest('.menu-nav-item');
    if (!btn) return;
    ZG.Audio.play('click');
    const action = btn.getAttribute('data-action');
    if (action === 'maps') { show('maps'); return; }
    if (action === 'story') { openTeaser(); return; }
    if (action === 'help') { if (M.cb.onHelp) M.cb.onHelp(); return; }
    if (action === 'settings') { if (M.cb.onSettings) M.cb.onSettings(); return; }
  }

  function moveFocus(list, delta) {
    if (!list || !list.length) return;
    let idx = -1;
    for (let i = 0; i < list.length; i++) if (list[i] === document.activeElement) idx = i;
    if (idx < 0) idx = 0;
    else idx = (idx + delta + list.length) % list.length;
    safeFocus(list[idx]);
  }

  function onKeyDown(ev) {
    if (!M.visible || M.frozen) return;
    if (M.cb.isOverlayOpen && M.cb.isOverlayOpen()) return;
    const tag = (ev.target && ev.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (M.teaserOpen) {
      if (ev.key === 'Escape') { ev.preventDefault(); closeTeaser(); }
      return;
    }
    if (ev.key === 'Escape') {
      if (M.page === 'maps') { ev.preventDefault(); show('main'); }
      return;
    }
    if (M.page === 'main') {
      if (ev.key === 'ArrowDown') { ev.preventDefault(); moveFocus(M.navEls, 1); }
      else if (ev.key === 'ArrowUp') { ev.preventDefault(); moveFocus(M.navEls, -1); }
      return;
    }
    if (M.page === 'maps') {
      if (ev.key === 'ArrowRight') { ev.preventDefault(); moveFocus(M.cardEls, 1); }
      else if (ev.key === 'ArrowLeft') { ev.preventDefault(); moveFocus(M.cardEls, -1); }
    }
  }

  // Task 6 填充内容；这里先留空实现，保证 click 不报错
  function openTeaser() { /* Task 6 */ }
  function closeTeaser() { M.teaserOpen = false; }

  function buildModal() {
    const modal = el('div', 'menu-modal hidden');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', '档案封存');
    M.modal = modal;
    return modal;
  }

  function init(cb) {
    M.cb = cb || {};
    try {
      M.reduced = !!(typeof matchMedia !== 'undefined' &&
        matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (e) { M.reduced = false; }

    const hud = document.getElementById('hud');
    if (!hud) return;
    const root = buildScene();
    const modal = buildModal();
    hud.appendChild(root);
    hud.appendChild(modal);

    if (!M.feedIndex) M.feedIndex = ZG.Data.mapOrder.length - 1;
    document.addEventListener('keydown', onKeyDown);
    resize();
    refreshRecords();
    refreshInstall();
  }

  ZG.Menu = {
    init, show, hide, page: () => M.page, isVisible: () => M.visible,
    freeze, unfreeze, resize, tick, refreshRecords, refreshInstall,
    menuLayout, navItems, mapCardModel, acceptsSelect,
    // 测试与调试用
    _state: M
  };
})();
