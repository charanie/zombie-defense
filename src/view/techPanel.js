/* 科技树大窗口：DOM 构建、节点状态、详情与购买（顶层不访问 document） */
(function () {
  'use strict';
  const ZG = globalThis.ZG = globalThis.ZG || {};

  const H = { state: null, cb: null, root: null, refs: {}, sig: '', keyBound: false };

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function fmt(n) {
    return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function isMobile() {
    if (typeof window === 'undefined') return false;
    if (ZG.Platform && ZG.Platform.isMobile) return true;
    if (window.innerWidth <= 900) return true;
    return !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  }

  function branchModel(state, branchId) {
    const t = ZG.Data.tech;
    const tiers = [];
    for (let tier = 1; tier <= 6; tier++) tiers.push([]);
    for (const id of t.nodeOrder) {
      const n = t.nodes[id];
      if (n.branch !== branchId) continue;
      tiers[n.tier - 1].push(id);
    }
    return { id: branchId, tiers };
  }

  function ownedTotal(state) {
    let n = 0;
    for (const id of ZG.Data.tech.nodeOrder) if (ZG.Tech.rank(state, id) > 0) n++;
    return n;
  }

  function nodeStateClass(view) {
    if (view.maxed) return 'maxed';
    if (view.locked) return 'locked';
    if (view.owned) return 'owned';
    return 'available';
  }

  function nodeStateIcon(cls) {
    return cls === 'maxed' ? '★' : (cls === 'owned' ? '✓' : (cls === 'locked' ? '🔒' : '◇'));
  }

  function reasonText(reason) {
    const map = {
      locked: '需要同分支上一层节点',
      maxed: '已满级',
      money: '金钱不足',
      'not-prep': '仅整备期可购买'
    };
    return map[reason] || '不可购买';
  }

  function init(state, cb) {
    H.state = state;
    H.cb = cb || {};
    const hud = document.getElementById('hud');
    if (!hud) return H;

    const root = el('div', 'tech-modal hidden');
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', '科技树');

    const win = el('div', 'tech-window');
    const head = el('div', 'tech-head');
    const title = el('div', 'tech-title', '科技树');
    const money = el('span', 'tech-money', '🪙 0');
    const progress = el('span', 'tech-progress', '已购 0/47');
    const close = el('button', 'btn btn-close tech-close', '×');
    close.setAttribute('aria-label', '关闭科技树');
    head.append(title, money, progress, close);

    const tabs = el('div', 'tech-tabs');
    const tabEls = {};
    for (const id of ZG.Data.tech.branchOrder) {
      const b = el('button', 'tab-btn tech-tab', ZG.Data.tech.branches[id].name);
      b.dataset.branch = id;
      b.onclick = () => {
        H.state.ui.techBranch = id;
        H.state.ui.techNodeId = null;
        H.sig = '';
        render(H.state);
      };
      tabEls[id] = b;
      tabs.appendChild(b);
    }

    const body = el('div', 'tech-body');
    const detail = el('div', 'tech-detail');
    const detailText = el('div', 'tech-detail-text', '点击节点查看详情');
    const buy = el('button', 'btn tech-buy', '购买');
    buy.disabled = true;
    detail.append(detailText, buy);

    win.append(head, tabs, body, detail);
    root.appendChild(win);
    hud.appendChild(root);

    close.onclick = () => closePanel();
    buy.onclick = () => {
      const id = H.state && H.state.ui.techNodeId;
      if (id && H.cb.onTechBuy) H.cb.onTechBuy(id);
    };
    root.addEventListener('pointerdown', ev => {
      if (ev.target === root && H.cb.onTechClose) H.cb.onTechClose();
    });

    H.root = root;
    H.refs = { win, head, money, progress, tabs, tabEls, body, detail, detailText, buy, close };

    if (!H.keyBound) {
      document.addEventListener('keydown', onKeydown, true);
      H.keyBound = true;
    }
    return H;
  }

  function onKeydown(ev) {
    if (!H.state || !H.state.ui.showTech || !H.root) return;
    if (ev.key === 'Escape') {
      ev.preventDefault();
      ev.stopPropagation();
      closePanel();
      return;
    }
    if (ev.key === 'Tab') {
      const focusable = Array.from(H.root.querySelectorAll('button'))
        .filter(b => !b.disabled && !b.classList.contains('hidden'));
      if (!focusable.length) return;
      ev.preventDefault();
      const i = focusable.indexOf(document.activeElement);
      const next = ev.shiftKey
        ? (i <= 0 ? focusable.length - 1 : i - 1)
        : (i === focusable.length - 1 ? 0 : i + 1);
      focusable[next].focus();
      return;
    }
    const blocked = [' ', '1', '2', '3', 'h', 'H', 'r', 'R', 't', 'T', 'm', 'M'];
    if (blocked.indexOf(ev.key) >= 0) {
      ev.preventDefault();
      ev.stopPropagation();
    }
  }

  function closePanel() {
    if (H.cb.onTechClose) H.cb.onTechClose();
    setTimeout(() => {
      const b = document.querySelector('.tab-tech');
      if (b) b.focus();
    }, 0);
  }

  function open(state) {
    state.ui.showTech = true;
    if (!state.ui.techBranch) state.ui.techBranch = 'fire';
    H.sig = '';
    render(state);
  }

  function close(state) {
    state.ui.showTech = false;
    state.ui.techNodeId = null;
    H.sig = '';
    render(state);
  }

  function makeSvg(L, color) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', 'tech-links');
    svg.setAttribute('width', L.width);
    svg.setAttribute('height', L.height);
    svg.setAttribute('viewBox', '0 0 ' + L.width + ' ' + L.height);
    for (const link of L.links) {
      const p = document.createElementNS(ns, 'path');
      p.setAttribute('d', link.d);
      p.setAttribute('fill', 'none');
      p.setAttribute('stroke', color);
      p.setAttribute('stroke-width', '1.5');
      p.setAttribute('stroke-opacity', '0.55');
      p.setAttribute('stroke-linecap', 'round');
      p.setAttribute('stroke-linejoin', 'round');
      svg.appendChild(p);
    }
    return svg;
  }

  function buildCanvas(state, branchId, direction) {
    const model = branchModel(state, branchId);
    const opts = direction === 'horizontal'
      ? { direction: 'horizontal', nodeW: 132, nodeH: 60, gap: 8, tierGap: 36, pad: 26, cols: 1 }
      : { direction: 'vertical', nodeW: 118, nodeH: 66, gap: 8, tierGap: 40, pad: 26, cols: 2 };
    const L = ZG.TechLayout.compute(model, opts);
    const canvas = el('div', 'tech-canvas');
    canvas.style.width = L.width + 'px';
    canvas.style.height = L.height + 'px';
    const branch = ZG.Data.tech.branches[branchId];
    canvas.appendChild(makeSvg(L, branch.color));

    for (const tier of L.tiers) {
      const label = el('span', 'tech-tier-label', 'T' + tier.tier);
      label.style.left = '2px';
      label.style.top = (tier.y + 6) + 'px';
      canvas.appendChild(label);
    }

    for (const id of ZG.Data.tech.nodeOrder) {
      const n = ZG.Data.tech.nodes[id];
      if (n.branch !== branchId || !L.nodes[id]) continue;
      const box = L.nodes[id];
      const view = ZG.Tech.nodeView(state, id);
      const cls = nodeStateClass(view);
      const b = el('button', 'tech-node ' + cls);
      b.style.left = box.x + 'px';
      b.style.top = box.y + 'px';
      b.style.width = box.w + 'px';
      b.style.height = box.h + 'px';
      b.dataset.id = id;
      b.setAttribute('aria-label',
        view.name + '，' + (cls === 'maxed' ? '已满级' : (view.locked ? '锁定' : (view.owned ? '已购买' : '可购买'))) +
        '，' + (view.cost === null ? '已满级' : view.cost + ' 金'));
      b.classList.toggle('selected', state.ui.techNodeId === id);
      const icon = el('span', 'tech-node-icon', nodeStateIcon(cls));
      const name = el('span', 'tech-node-name', view.name);
      const meta = el('span', 'tech-node-meta',
        view.maxed ? '已满级' : (view.rank > 0 ? 'Lv ' + view.rank + '/' + view.maxRank : view.cost + ' 金'));
      b.append(icon, name, meta);
      b.onclick = () => {
        state.ui.techNodeId = state.ui.techNodeId === id ? null : id;
        H.sig = '';
        render(state);
      };
      canvas.appendChild(b);
    }
    return { canvas, L };
  }

  function buildTree(state, mobile) {
    const body = H.refs.body;
    body.innerHTML = '';
    if (mobile) {
      const branchId = state.ui.techBranch || 'fire';
      const wrap = el('div', 'tech-hscroll');
      const built = buildCanvas(state, branchId, 'horizontal');
      wrap.appendChild(built.canvas);
      body.appendChild(wrap);
      // 自动滚到第一个可购买层，否则滚到最高已购层
      let tier = 1;
      const model = branchModel(state, branchId);
      for (let t = 0; t < model.tiers.length; t++) {
        const hasBuy = model.tiers[t].some(id => ZG.Tech.nodeView(state, id).canBuy);
        if (hasBuy) { tier = t + 1; break; }
        const hasOwned = model.tiers[t].some(id => ZG.Tech.rank(state, id) > 0);
        if (hasOwned) tier = t + 1;
      }
      const step = 132 + 36;
      wrap.scrollLeft = Math.max(0, (tier - 1) * step);
    } else {
      const cols = el('div', 'tech-columns');
      for (const branchId of ZG.Data.tech.branchOrder) {
        const branch = ZG.Data.tech.branches[branchId];
        const col = el('div', 'tech-col');
        const head = el('div', 'tech-col-head');
        const dot = el('span', 'tech-col-dot');
        dot.style.background = branch.color;
        const name = el('span', 'tech-col-name', branch.name);
        const prog = ZG.Tech.branchProgress(state, branchId);
        const count = el('span', 'tech-col-progress', prog.owned + '/' + prog.total);
        head.append(dot, name, count);
        const built = buildCanvas(state, branchId, 'vertical');
        col.append(head, built.canvas);
        cols.appendChild(col);
      }
      body.appendChild(cols);
    }
  }

  function renderDetail(state) {
    const refs = H.refs;
    const id = state.ui.techNodeId;
    const view = id ? ZG.Tech.nodeView(state, id) : null;
    if (!view) {
      refs.detailText.textContent = '点击节点查看详情；购买前可先选中，避免误触。';
      refs.buy.textContent = '购买';
      refs.buy.disabled = true;
      return;
    }
    const lines = [
      view.name + '　T' + view.tier + ' · ' + (view.rank > 0 ? ('Lv ' + view.rank + '/' + view.maxRank) : '未购买'),
      view.summary,
      view.detail,
      view.maxed ? '已满级' : ('下一级费用 ' + view.cost + ' 金')
    ];
    refs.detailText.textContent = lines.join('\n');
    refs.buy.textContent = view.maxed ? '已满级' : (view.canBuy ? '购买 · ' + view.cost + ' 金' : reasonText(view.reason));
    refs.buy.disabled = !view.canBuy;
  }

  function render(state) {
    if (!H.root) return;
    H.state = state;
    const show = !!state.ui.showTech;
    H.root.classList.toggle('hidden', !show);
    if (!show) return;

    const mobile = isMobile();
    const sig = [
      state.ui.techBranch, state.money, state.ui.techNodeId,
      mobile ? 'm' : 'd', state.status,
      ZG.Data.tech.nodeOrder.map(id => ZG.Tech.rank(state, id)).join(',')
    ].join('|');
    if (sig === H.sig) return;
    H.sig = sig;

    H.refs.money.textContent = '🪙 ' + fmt(state.money);
    H.refs.progress.textContent = '已购 ' + ownedTotal(state) + '/47';
    for (const id of ZG.Data.tech.branchOrder) {
      H.refs.tabEls[id].classList.toggle('active', state.ui.techBranch === id);
    }
    H.refs.tabs.classList.toggle('mobile', mobile);
    buildTree(state, mobile);
    renderDetail(state);
  }

  ZG.TechPanel = { init, render, open, close, branchModel, isMobile };
})();
