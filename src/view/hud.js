/* DOM HUD：菜单、顶栏、招募/建筑/科技、结算、图鉴、设置 */
(function () {
  'use strict';
  const ZG = globalThis.ZG = globalThis.ZG || {};
  const C = ZG.Const.COLORS;

  const H = {
    state: null,
    cb: null,
    root: null,
    refs: {},
    cardEls: {},
    techEls: {},
    buildEls: {},
    panelBuilt: '',
    lastLogCount: 0
  };

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function fmt(n) {
    return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function dpsOf(data) {
    if (!data || !data.attack) return 0;
    const a = data.attack;
    return (a.damage * (a.pellets || 1)) / a.interval;
  }

  function reasonText(reason) {
    const map = {
      money: '金钱不足',
      population: '人口已满',
      'civilian-cap': '平民已满',
      outside: '地图外',
      overlap: '位置重叠',
      obstacle: '障碍阻挡',
      limit: '已达上限',
      'not-prep': '战斗中',
      unknown: '不可用'
    };
    return map[reason] || '不可用';
  }

  function init(state, callbacks) {
    H.state = state;
    H.cb = callbacks || {};
    H.root = document.getElementById('hud');
    H.root.innerHTML = '';
    H.cardEls = {};
    H.techEls = {};
    H.buildEls = {};
    H.panelBuilt = '';

    buildTop();
    buildBottom();
    buildBossBar();
    buildTooltip();
    buildToasts();
    buildMenu();
    buildSettlement();
    buildGameOver();
    buildModals();
    buildTutorial();
    buildOrientation();
    return H;
  }

  function buildTop() {
    const top = el('div', 'hud-top');
    const left = el('div', 'hud-stats');
    H.refs.round = el('span', 'stat-round', '回合 1');
    H.refs.money = el('span', 'stat-money', '🪙 400');
    H.refs.pop = el('span', 'stat-pop', '人口 0/10');
    H.refs.zombies = el('span', 'stat-zombies', '僵尸 0');
    H.refs.alive = el('span', 'stat-alive', '存活 0');
    left.append(H.refs.round, H.refs.money, H.refs.pop, H.refs.alive, H.refs.zombies);

    const right = el('div', 'hud-controls');
    H.refs.speedBtns = {};
    for (const n of [1, 2, 3]) {
      const b = el('button', 'btn btn-speed', n + 'x');
      b.onclick = () => { H.cb.onSpeed && H.cb.onSpeed(n); };
      H.refs.speedBtns[n] = b;
      right.appendChild(b);
    }
    H.refs.pause = el('button', 'btn btn-pause', '⏸');
    H.refs.pause.onclick = () => { H.cb.onPause && H.cb.onPause(); };
    right.appendChild(H.refs.pause);

    const help = el('button', 'btn btn-icon', '?');
    help.title = '图鉴 / 帮助 (H)';
    help.onclick = () => { H.cb.onHelp && H.cb.onHelp(); };
    const settings = el('button', 'btn btn-icon', '⚙');
    settings.title = '设置';
    settings.onclick = () => { H.cb.onSettings && H.cb.onSettings(); };
    right.append(help, settings);

    top.append(left, right);
    H.root.appendChild(top);
  }

  function buildBossBar() {
    const wrap = el('div', 'boss-bar hidden');
    H.refs.bossWrap = wrap;
    H.refs.bossName = el('div', 'boss-name', 'BOSS 坦克');
    const track = el('div', 'boss-track');
    H.refs.bossFill = el('div', 'boss-fill');
    track.appendChild(H.refs.bossFill);
    wrap.append(H.refs.bossName, track);
    H.root.appendChild(wrap);
  }

  function buildBottom() {
    const bottom = el('div', 'hud-bottom');
    H.refs.bottom = bottom;

    const tabs = el('div', 'hud-tabs');
    H.refs.tabEls = {};
    for (const [id, label] of [['recruit', '招募'], ['building', '建筑'], ['tech', '科技']]) {
      const b = el('button', 'tab-btn', label);
      b.onclick = () => {
        H.cb.onPanel && H.cb.onPanel(id);
      };
      H.refs.tabEls[id] = b;
      tabs.appendChild(b);
    }
    H.refs.tabLine = el('span', 'tab-line');
    tabs.appendChild(H.refs.tabLine);

    const battleStrip = el('div', 'battle-strip hidden');
    H.refs.battleStrip = battleStrip;
    H.refs.battleText = el('span', '', '战斗进行中');
    const progress = el('div', 'wave-progress');
    H.refs.waveFill = el('div', 'wave-fill');
    progress.appendChild(H.refs.waveFill);
    battleStrip.append(H.refs.battleText, progress);

    const body = el('div', 'panel-body');
    H.refs.panelBody = body;
    H.refs.recruitGrid = el('div', 'card-grid');
    H.refs.buildGrid = el('div', 'card-grid');
    H.refs.techGrid = el('div', 'tech-grid');
    for (const g of [H.refs.recruitGrid, H.refs.buildGrid, H.refs.techGrid]) {
      g.classList.add('hidden');
    }
    body.append(H.refs.recruitGrid, H.refs.buildGrid, H.refs.techGrid);

    const footer = el('div', 'hud-footer');
    H.refs.sellBtn = el('button', 'btn btn-sell hidden', '出售选中单位');
    H.refs.sellBtn.onclick = () => { H.cb.onSell && H.cb.onSell(); };
    H.refs.wavePreview = el('span', 'wave-preview', '下一波：');
    H.refs.wallBtn = el('button', 'btn btn-wall hidden', '横墙');
    H.refs.wallBtn.title = '切换围墙横/竖（R）';
    H.refs.wallBtn.onclick = () => { H.cb.onToggleWall && H.cb.onToggleWall(); };
    H.refs.startBtn = el('button', 'btn btn-start', '开始回合');
    H.refs.startBtn.onclick = () => { H.cb.onStartRound && H.cb.onStartRound(); };
    const spacer = el('span', 'footer-spacer');
    footer.append(H.refs.sellBtn, H.refs.wavePreview, H.refs.wallBtn, spacer, H.refs.startBtn);

    const log = el('div', 'battle-log');
    H.refs.log = log;

    bottom.append(tabs, battleStrip, body, footer, log);

    H.root.appendChild(bottom);

    buildRecruitCards();
    buildBuildingCards();
    buildTechRows();
  }

  function buildRecruitCards() {
    const grid = H.refs.recruitGrid;
    grid.innerHTML = '';
    for (const id of ZG.Data.humanOrder) {
      const d = ZG.Data.humans[id];
      const card = el('div', 'unit-card');
      card.dataset.id = id;
      const symbol = el('div', 'card-symbol', d.symbol);
      symbol.style.background = d.color;
      const head = el('div', 'card-head');
      const name = el('span', 'card-name', d.name);
      const cost = el('span', 'card-cost', d.cost);
      head.append(name, cost);
      const stats = el('div', 'card-stats',
        'HP ' + d.hp + ' · DPS ' + Math.round(dpsOf(d)) +
        (d.attack ? ' · 射程 ' + d.attack.range : ''));
      const blurb = el('div', 'card-blurb', d.blurb);
      const reason = el('div', 'card-reason hidden', '金钱不足');
      card.append(symbol, head, stats, blurb, reason);
      card.onclick = () => { if (!card.classList.contains('disabled')) H.cb.onRecruit && H.cb.onRecruit(id); };
      card.onmouseenter = () => showCardTip(id, card);
      card.onmouseleave = hideTip;
      grid.appendChild(card);
      H.cardEls[id] = { card, cost, reason, name };
    }
  }

  function showCardTip(id, card) {
    const d = ZG.Data.humans[id];
    if (!d) return;
    const st = H.state;
    const info = [];
    info.push(d.name + '　' + d.cost + ' 金 / ' + d.pop + ' 人口');
    info.push('HP ' + d.hp + (d.shieldHp ? ' + ' + d.shieldHp + ' 盾' : ''));
    if (d.attack) info.push('伤害 ' + d.attack.damage + ' × ' + (d.attack.pellets || 1) + ' / ' + d.attack.interval.toFixed(2) + 's');
    if (d.healRate) info.push('治疗 ' + d.healRate + '/s · 血清 ' + ZG.Balance.serumCount(st.tech.serum) + ' 次');
    if (d.income) info.push('每回合 +' + d.income + ' 金');
    info.push('克制：' + d.counters);
    info.push('弱点：' + d.weak);
    showTip(info.join('\n'), card);
  }

  function buildBuildingCards() {
    const grid = H.refs.buildGrid;
    grid.innerHTML = '';
    for (const id of ZG.Data.buildingOrder) {
      const d = ZG.Data.buildings[id];
      const card = el('div', 'unit-card build-card');
      const symbol = el('div', 'card-symbol', d.symbol);
      symbol.style.background = d.color;
      const head = el('div', 'card-head');
      const name = el('span', 'card-name', d.name);
      const cost = el('span', 'card-cost', d.cost);
      head.append(name, cost);
      const stats = el('div', 'card-stats', 'HP ' + d.hp);
      const blurb = el('div', 'card-blurb', d.blurb);
      const reason = el('div', 'card-reason hidden', '金钱不足');
      card.append(symbol, head, stats, blurb, reason);
      card.onclick = () => {
        if (card.classList.contains('disabled')) return;
        H.cb.onSelectBuilding && H.cb.onSelectBuilding(id);
      };
      card.onmouseenter = () => {
        showTip(d.name + '\n' + d.blurb + '\n克制：' + d.counters + '\n弱点：' + d.weak, card);
      };
      card.onmouseleave = hideTip;
      grid.appendChild(card);
      H.buildEls[id] = { card, reason, stats };
    }
  }

  function buildTechRows() {
    const grid = H.refs.techGrid;
    grid.innerHTML = '';
    for (const line of ['fire', 'armor', 'econ', 'serum']) {
      const row = el('div', 'tech-row');
      const name = el('span', 'tech-name', '');
      const lvl = el('span', 'tech-level', '');
      const effect = el('span', 'tech-effect', '');
      const btn = el('button', 'btn btn-buy', '');
      btn.onclick = () => { if (!btn.disabled) H.cb.onTech && H.cb.onTech(line); };
      row.append(name, lvl, effect, btn);
      grid.appendChild(row);
      H.techEls[line] = { row, name, lvl, effect, btn };
    }
  }

  function buildTooltip() {
    H.refs.tip = el('div', 'tooltip hidden');
    H.root.appendChild(H.refs.tip);
  }

  function showTip(text, anchorEl) {
    const tip = H.refs.tip;
    if (!tip) return;
    tip.textContent = text;
    tip.classList.remove('hidden');
    const r = anchorEl.getBoundingClientRect();
    const stage = document.getElementById('stage').getBoundingClientRect();
    tip.style.left = Math.min(stage.width - 270, r.left - stage.left + 10) + 'px';
    tip.style.top = Math.max(8, r.top - stage.top - 8) + 'px';
  }

  function hideTip() {
    if (H.refs.tip) H.refs.tip.classList.add('hidden');
  }

  function buildToasts() {
    H.refs.toasts = el('div', 'toast-stack');
    H.root.appendChild(H.refs.toasts);
  }

  function buildMenu() {
    const menu = el('div', 'overlay menu hidden');
    H.refs.menu = menu;
    const box = el('div', 'menu-box');
    const title = el('div', 'game-title', '尸潮防线');
    const sub = el('div', 'game-sub', '2D 圆形单位 · 人类 vs 僵尸 · 无尽防守');
    const how = el('div', 'menu-how', '选一张地图：布阵、招募、建建筑、升科技，然后开战。战斗全自动。');
    const maps = el('div', 'map-grid');
    H.refs.mapCards = {};
    for (const id of ZG.Data.mapOrder) {
      const m = ZG.Data.maps[id];
      const card = el('div', 'map-card');
      const canvas = document.createElement('canvas');
      canvas.width = 220; canvas.height = 110;
      drawMapThumb(canvas, m);
      const name = el('div', 'map-name', m.name);
      const stars = el('div', 'map-stars', '★'.repeat(m.difficulty) + '☆'.repeat(3 - m.difficulty));
      const desc = el('div', 'map-desc', m.desc);
      const best = el('div', 'map-best', '最佳：0 回合');
      card.append(canvas, name, stars, desc, best);
      card.onclick = () => { H.cb.onSelectMap && H.cb.onSelectMap(id); };
      maps.appendChild(card);
      H.refs.mapCards[id] = { card, best };
    }
    const actions = el('div', 'menu-actions');
    const helpBtn = el('button', 'btn', '图鉴 / 操作');
    helpBtn.onclick = () => { H.cb.onHelp && H.cb.onHelp(); };
    const settingsBtn = el('button', 'btn', '设置');
    settingsBtn.onclick = () => { H.cb.onSettings && H.cb.onSettings(); };
    H.refs.installBtn = el('button', 'btn hidden', '安装到桌面');
    H.refs.installBtn.onclick = () => { H.cb.onInstall && H.cb.onInstall(); };
    H.refs.shareBtn = el('button', 'btn', '分享');
    H.refs.shareBtn.onclick = () => { H.cb.onShare && H.cb.onShare(); };
    actions.append(helpBtn, settingsBtn, H.refs.installBtn, H.refs.shareBtn);
    const ver = el('div', 'version', '尸潮防线 ' + ZG.Const.VERSION);
    box.append(title, sub, how, maps, actions, ver);
    menu.appendChild(box);
    H.root.appendChild(menu);
  }

  function drawMapThumb(canvas, map) {
    const ctx = canvas.getContext('2d');
    const sx = canvas.width / 1280, sy = canvas.height / 720;
    ctx.save();
    ctx.scale(sx, sy);
    ctx.fillStyle = map.theme.ground;
    ctx.fillRect(0, 0, 1280, 720);
    ctx.fillStyle = map.theme.road;
    for (const r of map.roads || []) ctx.fillRect(r.x, r.y, r.w, r.h);
    const d = map.deploy;
    ctx.fillStyle = 'rgba(79,195,247,0.25)';
    ctx.strokeStyle = 'rgba(79,195,247,0.8)';
    ctx.lineWidth = 6;
    if (d.kind === 'rect') {
      ctx.fillRect(d.x, d.y, d.w, d.h);
      ctx.strokeRect(d.x, d.y, d.w, d.h);
    } else {
      ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(239,83,80,0.9)';
    for (const sp of map.spawns) {
      ctx.beginPath(); ctx.arc(sp.x, sp.y, 22, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = 'rgba(84,110,122,0.9)';
    for (const ob of map.obstacles || []) {
      ctx.beginPath(); ctx.arc(ob.x, ob.y, ob.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function buildSettlement() {
    const ov = el('div', 'overlay settlement hidden');
    H.refs.settlement = ov;
    const box = el('div', 'modal-box settlement-box');
    H.refs.settleTitle = el('div', 'modal-title', '回合结算');
    H.refs.settleBody = el('div', 'settle-body');
    const btn = el('button', 'btn btn-primary', '进入整备');
    btn.onclick = () => { H.cb.onSettleContinue && H.cb.onSettleContinue(); };
    box.append(H.refs.settleTitle, H.refs.settleBody, btn);
    ov.appendChild(box);
    H.root.appendChild(ov);
  }

  function buildGameOver() {
    const ov = el('div', 'overlay gameover hidden');
    H.refs.gameover = ov;
    const box = el('div', 'modal-box gameover-box');
    const title = el('div', 'modal-title danger', '防线失守');
    H.refs.overRound = el('div', 'over-round', '坚持到第 1 回合');
    H.refs.overStats = el('div', 'over-stats', '');
    const row = el('div', 'modal-actions');
    const again = el('button', 'btn btn-primary', '再来一局');
    again.onclick = () => { H.cb.onRestart && H.cb.onRestart(); };
    const menu = el('button', 'btn', '返回选图');
    menu.onclick = () => { H.cb.onMenu && H.cb.onMenu(); };
    row.append(again, menu);
    box.append(title, H.refs.overRound, H.refs.overStats, row);
    ov.appendChild(box);
    H.root.appendChild(ov);
  }

  function buildModals() {
    // 图鉴 / 帮助
    const help = el('div', 'overlay modal hidden');
    H.refs.help = help;
    const hbox = el('div', 'modal-box help-box');
    const ht = el('div', 'modal-title', '图鉴 / 帮助');
    const tabs = el('div', 'help-tabs');
    const codexTab = el('button', 'tab-btn active', '图鉴');
    const helpTab = el('button', 'tab-btn', '操作');
    const close1 = el('button', 'btn btn-close', '×');
    close1.onclick = () => { H.cb.onCloseModal && H.cb.onCloseModal('help'); };
    tabs.append(codexTab, helpTab, close1);
    const content = el('div', 'help-content');
    hbox.append(ht, tabs, content);
    help.appendChild(hbox);
    H.root.appendChild(help);
    H.refs.helpContent = content;

    const codexHtml = [];
    codexHtml.push('<h4>人类</h4><div class="codex-grid">');
    for (const id of ZG.Data.humanOrder) {
      const d = ZG.Data.humans[id];
      codexHtml.push('<div class="codex-item"><b style="color:' + d.color + '">' + d.name + '</b>' +
        '　' + d.cost + ' 金 · HP ' + d.hp + ' · ' + d.blurb +
        '<br><span class="dim">克制：' + d.counters + ' ｜ 弱点：' + d.weak + '</span></div>');
    }
    codexHtml.push('</div><h4>僵尸</h4><div class="codex-grid">');
    for (const id of ['walker', 'runner', 'shield', 'boomer', 'mother', 'giant']) {
      const d = ZG.Data.zombies[id];
      codexHtml.push('<div class="codex-item"><b style="color:' + d.color + '">' + d.name + '</b>' +
        '　HP ' + d.hp + ' · ' + d.special + '</div>');
    }
    codexHtml.push('<div class="codex-item"><b style="color:#EF5350">BOSS 坦克</b>　每 7 回合出现；石块预警 2 秒，请分散站位。</div></div>');
    codexHtml.push('<h4>英雄</h4><div class="codex-grid">');
    for (const id of ZG.Data.heroOrder) {
      const d = ZG.Data.heroes[id];
      codexHtml.push('<div class="codex-item"><b style="color:' + d.color + '">' + d.name + '</b>　' + d.blurb + '</div>');
    }
    codexHtml.push('</div><h4>建筑</h4><div class="codex-grid">');
    for (const id of ZG.Data.buildingOrder) {
      const d = ZG.Data.buildings[id];
      codexHtml.push('<div class="codex-item"><b style="color:' + d.color + '">' + d.name + '</b>　' + d.cost + ' 金 · ' + d.blurb + '</div>');
    }
    codexHtml.push('</div>');
    const helpHtml = '<h4>操作</h4><table class="key-table">' +
      '<tr><td>鼠标左键</td><td>选卡 / 放置 / 选中单位 / 拖动</td></tr>' +
      '<tr><td>右键 / Esc</td><td>取消选卡或放置</td></tr>' +
      '<tr><td>空格</td><td>暂停 / 继续</td></tr>' +
      '<tr><td>1 / 2 / 3</td><td>1x / 2x / 3x 速度</td></tr>' +
      '<tr><td>Tab</td><td>切换招募 / 建筑 / 科技</td></tr>' +
      '<tr><td>M</td><td>静音</td></tr>' +
      '<tr><td>H</td><td>图鉴 / 帮助</td></tr></table>' +
      '<h4>规则摘要</h4><p class="dim">战前布阵、开战全自动。每 3 回合晋升队长，每 7 回合 BOSS 出现并赠送英雄。' +
      '人类死亡会变成丧尸；感染到 100 会持续掉血。回合结算回血 30%，感染压到 30。</p>' +
      '<h4>人类自主 AI</h4><p class="dim">开战后人类会自行移动：视野内出现僵尸就离开部署区追击，' +
      '追击距离受各自的活动半径限制；没有目标时回到原位。HP 低于 60% 或感染达到 30 时，' +
      '会主动前往医疗站或治疗兵；治疗兵也会迎向伤员。狂尸冲刺迎面而来时，非盾单位会侧移闪避，' +
      '盾兵则据守硬吃。头顶的状态箭头与绿色十字表示当前行动。</p>';
    codexTab.onclick = () => {
      codexTab.classList.add('active'); helpTab.classList.remove('active');
      content.innerHTML = codexHtml.join('');
    };
    helpTab.onclick = () => {
      helpTab.classList.add('active'); codexTab.classList.remove('active');
      content.innerHTML = helpHtml;
    };
    content.innerHTML = codexHtml.join('');

    // 设置
    const settings = el('div', 'overlay modal hidden');
    H.refs.settings = settings;
    const sbox = el('div', 'modal-box settings-box');
    const st = el('div', 'modal-title', '设置');
    const close2 = el('button', 'btn btn-close', '×');
    close2.onclick = () => { H.cb.onCloseModal && H.cb.onCloseModal('settings'); };
    const srow = el('div', 'settings-rows');
    H.refs.setRows = {};
    const options = [
      ['damageNumbers', '显示伤害数字'],
      ['shake', '屏幕震动'],
      ['muted', '静音']
    ];
    for (const [key, label] of options) {
      const row = el('div', 'settings-row');
      const l = el('span', '', label);
      const b = el('button', 'btn toggle', '开');
      b.onclick = () => { H.cb.onToggleSetting && H.cb.onToggleSetting(key); };
      H.refs.setRows[key] = b;
      row.append(l, b);
      srow.appendChild(row);
    }
    const replay = el('button', 'btn', '重播新手引导');
    replay.onclick = () => { H.cb.onReplayTutorial && H.cb.onReplayTutorial(); };
    const exportBtn = el('button', 'btn', '导出存档');
    exportBtn.onclick = () => { H.cb.onExportSave && H.cb.onExportSave(); };
    const importBtn = el('button', 'btn', '导入存档');
    importBtn.onclick = () => { H.cb.onImportSave && H.cb.onImportSave(); };
    const shareBtn = el('button', 'btn', '分享游戏');
    shareBtn.onclick = () => { H.cb.onShare && H.cb.onShare(); };
    const fsBtn = el('button', 'btn', '全屏');
    fsBtn.onclick = () => { H.cb.onFullscreen && H.cb.onFullscreen(); };
    srow.append(replay, exportBtn, importBtn, shareBtn, fsBtn);
    sbox.append(st, close2, srow);
    settings.appendChild(sbox);
    H.root.appendChild(settings);
  }

  function buildTutorial() {
    const t = el('div', 'tutorial hidden');
    H.refs.tutorial = t;
    H.refs.tutorialText = el('div', 'tutorial-text', '');
    H.refs.tutorialStep = el('span', 'tutorial-step', '1/4');
    const next = el('button', 'btn btn-primary', '下一步');
    next.onclick = () => { H.cb.onTutorialNext && H.cb.onTutorialNext(); };
    const skip = el('button', 'btn', '跳过');
    skip.onclick = () => { H.cb.onTutorialSkip && H.cb.onTutorialSkip(); };
    t.append(H.refs.tutorialStep, H.refs.tutorialText, next, skip);
    H.root.appendChild(t);
  }

  function buildOrientation() {
    const o = el('div', 'orientation');
    o.innerHTML = '<div class="orient-box"><div class="orient-icon">⟳</div><div>请横屏游玩</div><div class="dim">旋转设备以获得完整战场视野</div></div>';
    H.root.appendChild(o);
  }

  /* ---------------- 渲染 ---------------- */

  function render(state) {
    if (!state) return;
    H.state = state;
    const ui = state.ui;

    // 菜单
    if (H.refs.menu) H.refs.menu.classList.toggle('hidden', !ui.showMenu);
    if (ui.showMenu) {
      const best = ZG.Platform.loadAllBest ? ZG.Platform.loadAllBest() : {};
      for (const id of ZG.Data.mapOrder) {
        const mc = H.refs.mapCards[id];
        if (mc) mc.best.textContent = '最佳：' + (best[id] || 0) + ' 回合';
      }
      if (H.refs.installBtn) H.refs.installBtn.classList.toggle('hidden', !ZG.__installPrompt);
      return;
    }

    // 顶栏
    const bar = ZG.Model.topBar(state);
    H.refs.round.textContent = '回合 ' + bar.round;
    H.refs.money.textContent = '🪙 ' + fmt(bar.money);
    H.refs.pop.textContent = '人口 ' + bar.pop + '/' + bar.popCap +
      (bar.heroes ? '（英雄 ' + bar.heroes + '）' : '');
    H.refs.alive.textContent = '存活 ' + bar.alive;
    H.refs.zombies.textContent = '僵尸 ' + bar.zombies;

    for (const n of [1, 2, 3]) {
      H.refs.speedBtns[n].classList.toggle('active', state.ui.speed === n);
    }
    H.refs.pause.textContent = state.ui.paused ? '▶' : '⏸';
    H.refs.pause.classList.toggle('active', state.ui.paused);

    // BOSS 血条
    if (bar.boss) {
      H.refs.bossWrap.classList.remove('hidden');
      H.refs.bossFill.style.width = Math.max(0, (bar.boss.hp / bar.boss.maxHp) * 100) + '%';
      H.refs.bossName.textContent = 'BOSS 坦克　' + fmt(bar.boss.hp) + ' / ' + fmt(bar.boss.maxHp);
    } else {
      H.refs.bossWrap.classList.add('hidden');
    }

    // 面板
    const battle = state.status === 'battle';
    H.refs.bottom.classList.toggle('battle-mode', battle);
    H.refs.battleStrip.classList.toggle('hidden', !battle);
    H.refs.panelBody.classList.toggle('hidden', battle);
    H.refs.tabEls.recruit.parentElement.classList.toggle('hidden', battle);
    H.refs.startBtn.classList.toggle('hidden', battle);
    H.refs.wavePreview.classList.toggle('hidden', battle);
    H.refs.log.classList.toggle('hidden', !battle);

    for (const id of ['recruit', 'building', 'tech']) {
      H.refs.tabEls[id].classList.toggle('active', ui.panel === id);
    }
    H.refs.recruitGrid.classList.toggle('hidden', ui.panel !== 'recruit');
    H.refs.buildGrid.classList.toggle('hidden', ui.panel !== 'building');
    H.refs.techGrid.classList.toggle('hidden', ui.panel !== 'tech');

    if (battle) {
      const total = state.battle.waveTotal || 1;
      const killedOrLeft = Math.max(0, total - ZG.Spawner.remaining(state));
      H.refs.battleText.textContent = '战斗进行中 · 剩余僵尸 ' + bar.zombies + ' · 击杀 ' + state.battle.killCount;
      H.refs.waveFill.style.width = Math.min(100, (killedOrLeft / total) * 100) + '%';
    } else {
      updateCards(state);
      updateTech(state);
      updateWavePreview(state);
      H.refs.startBtn.disabled = state.humans.filter(h => h.alive).length === 0;
    }

    // 出售 / 拆除
    const sel = state.humans.find(h => h.id === ui.selectedHumanId && h.alive);
    const selB = state.buildings.find(b => b.id === ui.selectedBuildingId && b.alive);
    if (selB && !battle) {
      const bd = ZG.Data.buildings[selB.typeId];
      H.refs.sellBtn.classList.remove('hidden');
      H.refs.sellBtn.textContent = '拆除 ' + selB.name + '（+' + Math.floor((bd ? bd.cost : 0) * 0.5) + ' 金）';
      H.refs.sellBtn.disabled = false;
    } else if (sel && !battle) {
      H.refs.sellBtn.classList.remove('hidden');
      H.refs.sellBtn.textContent = '出售 ' + sel.name + '（+' + Math.floor((sel.cost || 0) * 0.5) + ' 金）';
      H.refs.sellBtn.disabled = state.humans.filter(h => h.alive).length <= 1;
    } else {
      H.refs.sellBtn.classList.add('hidden');
    }

    const showWall = !battle && ui.selectedBuilding === 'barricade';
    H.refs.wallBtn.classList.toggle('hidden', !showWall);
    if (showWall) H.refs.wallBtn.textContent = ui.wallVertical ? '竖墙' : '横墙';

    // 结算 / 失败
    H.refs.settlement.classList.toggle('hidden', !ui.showSettlement || state.status === 'over');
    if (ui.showSettlement && state.lastSettlement) renderSettlement(state);
    H.refs.gameover.classList.toggle('hidden', state.status !== 'over');
    if (state.status === 'over') renderGameOver(state);

    // 帮助 / 设置
    H.refs.help.classList.toggle('hidden', !ui.showHelp);
    H.refs.settings.classList.toggle('hidden', !ui.showSettings);
    if (H.refs.setRows) {
      for (const key of Object.keys(H.refs.setRows)) {
        const b = H.refs.setRows[key];
        const on = key === 'muted' ? state.settings.muted : state.settings[key] !== false;
        b.textContent = on ? '开' : '关';
        b.classList.toggle('off', !on);
      }
    }

    // 新手引导
    const showTut = ui.tutorialStep >= 0 && !ui.showMenu && state.status === 'prep';
    H.refs.tutorial.classList.toggle('hidden', !showTut);
    if (showTut) {
      const steps = ZG.Model.tutorialSteps();
      H.refs.tutorialStep.textContent = (ui.tutorialStep + 1) + '/' + steps.length;
      H.refs.tutorialText.textContent = steps[ui.tutorialStep] || '';
    }

    // 悬停 tooltip
    renderHoverTooltip(state);
    renderLog(state);
  }

  function updateCards(state) {
    const battle = state.status !== 'prep';
    for (const id of ZG.Data.humanOrder) {
      const ref = H.cardEls[id];
      if (!ref) continue;
      const cs = ZG.Model.cardState(state, id);
      ref.card.classList.toggle('disabled', cs.disabled || battle);
      ref.card.classList.toggle('selected', state.ui.selectedCard === id);
      if (cs.disabled) {
        ref.reason.classList.remove('hidden');
        ref.reason.textContent = reasonText(battle ? 'not-prep' : cs.reason);
      } else {
        ref.reason.classList.add('hidden');
      }
    }
    for (const id of ZG.Data.buildingOrder) {
      const ref = H.buildEls[id];
      if (!ref) continue;
      const cs = ZG.Model.buildingCard(state, id);
      if (ref.stats) {
        const d = ZG.Data.buildings[id];
        const lim = cs.limit === Infinity ? '∞' : cs.limit;
        ref.stats.textContent = 'HP ' + d.hp + ' · 现存 ' + cs.count + '/' + lim;
      }
      ref.card.classList.toggle('disabled', cs.disabled || battle);
      ref.card.classList.toggle('selected', state.ui.selectedBuilding === id);
      if (cs.disabled) {
        ref.reason.classList.remove('hidden');
        ref.reason.textContent = reasonText(battle ? 'not-prep' : cs.reason);
      } else {
        ref.reason.classList.add('hidden');
      }
    }
  }

  function updateTech(state) {
    for (const line of ['fire', 'armor', 'econ', 'serum']) {
      const ref = H.techEls[line];
      if (!ref) continue;
      const row = ZG.Model.techRow(state, line);
      ref.name.textContent = row.name;
      ref.lvl.textContent = 'Lv ' + row.level + '/' + row.max;
      ref.effect.textContent = row.effect;
      if (row.maxed) {
        ref.btn.textContent = '已满级';
        ref.btn.disabled = true;
      } else {
        ref.btn.textContent = row.cost + ' 金';
        ref.btn.disabled = state.money < row.cost || state.status !== 'prep';
      }
    }
  }

  function updateWavePreview(state) {
    const p = ZG.Model.wavePreview(state);
    const parts = [];
    for (const f of p.formation) parts.push(f.name + '×' + f.count);
    let text = '下一波 R' + state.round + '：' + parts.join(' ');
    if (p.newTypes.length) text += '　🆕 ' + p.newTypes.map(t => ZG.Data.zombies[t].name).join('、');
    H.refs.wavePreview.textContent = text;
  }

  function renderSettlement(state) {
    const s = state.lastSettlement;
    H.refs.settleTitle.textContent = '第 ' + s.round + ' 回合结算';
    const lines = [];
    if (s.killIncome) lines.push(['击杀 / BOSS 收入', '+' + s.killIncome]);
    lines.push(['通关奖励', '+' + s.passReward]);
    if (s.civilianIncome) lines.push(['平民收入', '+' + s.civilianIncome]);
    lines.push(['本回合总收入', '+' + s.total]);
    if (s.promoted && s.promoted.length) {
      const names = s.promoted.map(id => {
        const h = state.humans.find(u => u.id === id);
        return h ? h.name : '队长';
      });
      lines.push(['队长晋升', names.join('、')]);
    }
    lines.push(['存活人类回血', '30% 最大生命']);
    const body = H.refs.settleBody;
    body.innerHTML = '';
    for (const [k, v] of lines) {
      const row = el('div', 'settle-row');
      row.append(el('span', 'settle-k', k), el('span', 'settle-v', v));
      body.appendChild(row);
    }
  }

  function renderGameOver(state) {
    H.refs.overRound.textContent = '坚持到第 ' + state.round + ' 回合';
    const kills = state.stats.totalKills || 0;
    const bosses = state.stats.bossKills || 0;
    const best = Math.max(state.stats.bestRound || 1, state.round);
    H.refs.overStats.innerHTML =
      '<div>击杀僵尸 <b>' + kills + '</b>　击杀 BOSS <b>' + bosses + '</b></div>' +
      '<div>本局最佳 <b>' + best + '</b> 回合　地图：' + state.map.name + '</div>';
  }

  function renderHoverTooltip(state) {
    const hover = state.ui.hover;
    const tip = H.refs.tip;
    if (!hover) { tip.classList.add('hidden'); return; }
    let text = '';
    if (hover.kind === 'human') {
      const info = ZG.Model.humanInfo(state, hover.id);
      if (info) {
        text = info.name + '\nHP ' + Math.ceil(info.hp) + '/' + Math.ceil(info.maxHp) +
          (info.shield ? '　盾 ' + Math.ceil(info.shield) : '') +
          '\nDPS ' + info.dps.toFixed(1) + '　射程 ' + Math.round(info.range) +
          (info.infection ? '\n感染 ' + Math.round(info.infection) : '') +
          '\n' + info.state;
      }
    } else if (hover.kind === 'zombie') {
      const info = ZG.Model.zombieInfo(state, hover.id);
      if (info) {
        text = info.name + '\nHP ' + Math.ceil(info.hp) + '/' + Math.ceil(info.maxHp) +
          (info.shield ? '　盾 ' + Math.ceil(info.shield) : '') +
          '\n伤害 ' + info.damage.toFixed(1) + '　速度 ' + info.speed.toFixed(1) +
          '\n赏金 ' + info.bounty + '　' + info.special;
      }
    } else if (hover.kind === 'building') {
      const info = ZG.Model.buildingInfo(state, hover.id);
      if (info) {
        text = info.name + '\nHP ' + Math.ceil(info.hp) + '/' + info.maxHp +
          (info.charges !== undefined ? '\n剩余次数 ' + info.charges : '') +
          '\n' + info.blurb;
      }
    }
    if (!text) { tip.classList.add('hidden'); return; }
    tip.textContent = text;
    tip.classList.remove('hidden');
    const stage = document.getElementById('stage').getBoundingClientRect();
    tip.style.left = Math.min(stage.width - 250, (hover.x / ZG.Const.W) * stage.width + 14) + 'px';
    tip.style.top = Math.max(6, (hover.y / ZG.Const.H) * stage.height - 20) + 'px';
  }

  function renderLog(state) {
    if (!state.log) return;
    if (state.log.length === H.lastLogCount) return;
    H.lastLogCount = state.log.length;
    const last = state.log.slice(-6);
    H.refs.log.innerHTML = '';
    for (const item of last) {
      const row = el('div', 'log-row log-' + (item.kind || 'info'), item.text);
      H.refs.log.appendChild(row);
    }
  }

  function toast(text, kind) {
    if (!H.refs.toasts) return;
    const t = el('div', 'toast ' + (kind || ''), text);
    H.refs.toasts.appendChild(t);
    while (H.refs.toasts.children.length > 5) H.refs.toasts.removeChild(H.refs.toasts.firstChild);
    setTimeout(() => { if (t.parentNode) t.parentNode.removeChild(t); }, 3200);
  }

  ZG.HUD = { init, render, toast, showTip, hideTip, renderSettlement, renderGameOver };
})();
