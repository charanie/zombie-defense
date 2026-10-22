/* 启动、主循环、输入回调、事件订阅、PWA */
(function () {
  'use strict';
  const ZG = globalThis.ZG = globalThis.ZG || {};

  let state = null;
  let last = 0;
  let acc = 0;
  let loopStopped = false;
  let modalWasPaused = false;

  function newState(mapId, seed) {
    const s = ZG.Sim.createGame({
      mapId,
      seed: seed === undefined ? ((Date.now() % 1000000000) ^ ((Math.random() * 1e9) | 0)) | 0 : seed,
      quality: ZG.Platform.isMobile ? 'mobile' : 'desktop'
    });
    if (ZG.Platform.quality.damageNumbers === false) {
      s.settings.damageNumbers = false;
      s.settings.shake = false;
    }
    applySavedSettings(s);
    subscribe(s);
    return s;
  }

  function applySavedSettings(s) {
    try {
      const raw = ZG.Platform.load();
      if (!raw) return;
      const set = raw.settings && typeof raw.settings === 'object' ? raw.settings : raw;
      for (const k of Object.keys(s.settings)) {
        if (typeof set[k] === typeof s.settings[k]) s.settings[k] = set[k];
      }
    } catch (e) { /* 忽略 */ }
  }

  function saveSettings() {
    try {
      ZG.Platform.save({ version: ZG.Platform.SAVE_VERSION, settings: state.settings });
    } catch (e) { /* 忽略 */ }
  }

  function log(text, kind) {
    if (!state) return;
    state.log.push({ text, kind: kind || 'info', t: state.battle ? state.battle.time : 0 });
    if (state.log.length > 20) state.log.shift();
  }

  function subscribe(s) {
    const bus = s.bus;
    bus.on(ZG.Events.UI_TOAST, p => {
      log(p.text, p.kind);
      ZG.HUD.toast(p.text, p.kind);
    });
    bus.on(ZG.Events.HUMAN_SPAWNED, () => {
      const alive = s.humans.filter(h => h.alive).length;
      if (s.ui.tutorialStep === 0 && s.round === 1 && s.status === 'prep' && alive >= 4) {
        s.ui.tutorialStep = 1;
      }
    });
    bus.on(ZG.Events.ROUND_STARTED, () => {
      log('第 ' + s.round + ' 回合开始', 'round');
      ZG.Audio.play('horn');
      if (s.ui.tutorialStep === 1) s.ui.tutorialStep = 2;
    });
    bus.on(ZG.Events.ROUND_SETTLED, p => {
      s.ui.showSettlement = true;
      if (s.ui.tutorialStep === 2) s.ui.tutorialStep = 3;
      log('第 ' + p.round + ' 回合结算：+' + p.total + ' 金', 'econ');
      ZG.Platform.saveBest(s.mapId, p.round);
    });
    bus.on(ZG.Events.GAME_OVER, () => {
      ZG.Platform.saveBest(s.mapId, s.round);
      log('防线失守：第 ' + s.round + ' 回合', 'danger');
    });
    bus.on(ZG.Events.BOSS_SPAWNED, () => {
      ZG.HUD.toast('BOSS 坦克出现！', 'danger');
      ZG.Audio.play('bossRoar');
      ZG.Particles.shake(7);
      log('BOSS 坦克出现', 'danger');
    });
    bus.on(ZG.Events.HUMAN_DIED, p => {
      if (p.human && p.human.hero) log(p.human.name + ' 重伤撤离', 'danger');
      else if (p.human) log(p.human.name + ' 阵亡并转化', 'danger');
      ZG.Particles.burst(p.human.x, p.human.y, '#AB47BC', 8);
    });
    bus.on(ZG.Events.CAPTAIN_PROMOTED, p => {
      ZG.Particles.burst(p.human.x, p.human.y, '#FFC107', 14);
      ZG.Particles.shake(2);
      log(p.human.name + ' 晋升队长', 'captain');
    });
    bus.on(ZG.Events.HERO_GRANTED, p => {
      ZG.Particles.burst(p.human.x, p.human.y, '#FF8A65', 18);
      log(p.human.name + ' 加入战场', 'hero');
    });
    bus.on(ZG.Events.HERO_WOUNDED, p => {
      ZG.Particles.shake(4);
      ZG.Particles.burst(p.human.x, p.human.y, '#FF8A65', 16);
      ZG.HUD.toast(p.human.name + ' 重伤撤离，休整 1 回合', 'hero');
    });
    bus.on(ZG.Events.BUILDING_DESTROYED, p => {
      ZG.Particles.explosion(p.building.x, p.building.y, 50, '#FF7043');
      ZG.Particles.shake(5);
      ZG.HUD.toast(p.building.name + ' 被摧毁', 'warn');
      log(p.building.name + ' 被摧毁', 'danger');
    });
    bus.on(ZG.Events.ZOMBIE_DIED, p => {
      const z = p.zombie;
      ZG.Particles.burst(z.x, z.y, z.isBoss ? '#FF7043' : '#8BC34A', z.isBoss ? 26 : 5);
    });
    bus.on('fx:hit', p => {
      if (s.settings.damageNumbers !== false) {
        ZG.Particles.addDamageNumber(p.x, p.y - 8, p.amount,
          p.damageKind === 'fire' ? '#FFB74D' : (p.kind === 'human' ? '#FF8A80' : '#FFFFFF'));
      }
      if (p.damageKind === 'fire') ZG.Audio.play('flame');
      else if (p.damageKind === 'explosion') ZG.Audio.play('explosion');
      else ZG.Audio.play('pistol');
    });
    bus.on('fx:explosion', p => {
      ZG.Particles.explosion(p.x, p.y, p.radius, p.color);
      if (p.kind === 'boss') {
        ZG.Particles.shake(8);
        ZG.Audio.play('bossRoar');
      } else if (p.radius >= 60) ZG.Particles.shake(3);
      ZG.Audio.play('explosion');
    });
    bus.on('fx:coin', p => { ZG.Particles.coin(p.x, p.y); });
    bus.on('fx:mine', () => { ZG.Particles.shake(4); });
    bus.on('fx:stomp', p => {
      ZG.Particles.explosion(p.x, p.y, p.radius, '#FF7043');
      ZG.Particles.shake(5);
    });
    bus.on('fx:convert', p => {
      ZG.Particles.burst(p.x, p.y, '#B39DDB', 12);
      ZG.HUD.toast('疫医转化了一只丧尸', 'hero');
    });
    bus.on('fx:ability', p => {
      if (p.text) { ZG.HUD.toast(p.text, 'hero'); log(p.text, 'hero'); }
      ZG.Audio.play('horn');
    });
    bus.on('fx:support_heal', p => {
      ZG.Particles.burst(p.x, p.y, '#66BB6A', 18);
      ZG.Audio.play('horn');
    });
    bus.on('fx:support_bomb', p => {
      ZG.Particles.explosion(p.x, p.y, p.radius, '#FF7043');
      ZG.Particles.shake(5);
      ZG.Audio.play('explosion');
    });
    bus.on('fx:teleport', p => ZG.Particles.burst(p.x, p.y, '#90CAF9', 6));
    bus.on('fx:shieldbreak', p => ZG.Particles.burst(p.x, p.y, '#42A5F5', 8));
  }

  function startGame(mapId) {
    state = newState(mapId);
    state.ui.showMenu = false;
    state.ui.showSettlement = false;
    state.ui.tutorialStep = (mapId === 'suburban' && !state.settings.tutorialSeen) ? 0 : -1;
    ZG.HUD.hideTip();
    ZG.Audio.init();
    ZG.Audio.play('click');
  }

  function restartGame() {
    const mapId = state ? state.mapId : 'suburban';
    state = newState(mapId);
    state.ui.showMenu = false;
    state.ui.showSettlement = false;
    state.ui.tutorialStep = -1;
    ZG.Audio.init();
  }

  function nextPanel() {
    if (!state) return;
    const order = ['recruit', 'building'];
    const i = order.indexOf(state.ui.panel);
    state.ui.panel = order[(i + 1) % order.length];
    state.ui.selectedCard = null;
    state.ui.selectedBuilding = null;
  }

  function toggleOverlay(kind) {
    if (!state) return;
    const open = kind === 'help' ? state.ui.showHelp : state.ui.showSettings;
    if (!open) {
      modalWasPaused = state.status === 'battle' && state.ui.paused;
      state.ui.showHelp = kind === 'help';
      state.ui.showSettings = kind === 'settings';
      if (state.status === 'battle') state.ui.paused = true;
    } else {
      closeOverlay();
    }
    ZG.Audio.play('click');
  }

  function closeOverlay() {
    if (!state) return;
    state.ui.showHelp = false;
    state.ui.showSettings = false;
    if (state.status === 'battle' && !modalWasPaused) state.ui.paused = false;
    modalWasPaused = false;
  }

  function exportSave() {
    try {
      const text = ZG.Platform.exportSave();
      const blob = new Blob([text], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'zombie-defense-save.json';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
      ZG.HUD.toast('存档已导出', 'ok');
    } catch (e) {
      ZG.HUD.toast('导出失败', 'warn');
    }
  }

  function importSave() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = () => {
      const file = input.files && input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const r = ZG.Platform.importSave(String(reader.result || ''));
        if (r.ok) {
          ZG.HUD.toast('存档导入成功', 'ok');
          if (state) applySavedSettings(state);
        } else {
          ZG.HUD.toast('导入失败：' + r.reason, 'warn');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  const callbacks = {
    onSelectMap(id) { startGame(id); },
    onRecruit(id) {
      if (!state || state.status !== 'prep') return;
      state.ui.selectedCard = state.ui.selectedCard === id ? null : id;
      state.ui.selectedBuilding = null;
      ZG.Audio.play('click');
    },
    onSelectBuilding(id) {
      if (!state || state.status !== 'prep') return;
      state.ui.selectedBuilding = state.ui.selectedBuilding === id ? null : id;
      state.ui.selectedCard = null;
      if (id !== 'barricade') state.ui.wallVertical = false;
      ZG.Audio.play('click');
    },
    onToggleWall() {
      if (!state || state.status !== 'prep') return;
      state.ui.wallVertical = !state.ui.wallVertical;
      ZG.HUD.toast(state.ui.wallVertical ? '竖墙' : '横墙', 'info');
    },
    onTechOpen() {
      if (!state) return;
      if (state.status !== 'prep') { ZG.HUD.toast('只能在整备期打开科技树', 'warn'); return; }
      ZG.HUD.toast('科技树界面开发中', 'info');
    },
    onSupport(skillId) {
      if (!state || state.status !== 'battle') return;
      const m = ZG.Tech.mods(state).support;
      const unlocked = skillId === 'areaHeal' ? m.healUnlocked : m.bombUnlocked;
      if (!unlocked) return;
      if (state.ui.pendingSupport === skillId) {
        state.ui.pendingSupport = null;
        state.ui.supportAim = null;
        ZG.HUD.toast('已取消施放', 'info');
        return;
      }
      state.ui.pendingSupport = skillId;
      state.ui.supportAim = state.ui.mouse || null;
      ZG.HUD.toast('点击地图选点施放', 'info');
      ZG.Audio.play('click');
    },
    onSupportCancel() {
      if (!state) return;
      state.ui.pendingSupport = null;
      state.ui.supportAim = null;
    },
    onStartRound() {
      if (!state || state.status !== 'prep') return;
      state.ui.showSettlement = false;
      state.ui.selectedCard = null;
      state.ui.selectedBuilding = null;
      state.ui.selectedHumanId = null;
      state.ui.drag = null;
      state.ui.pendingSupport = null;
      state.ui.supportAim = null;
      const r = ZG.Sim.applyCommand(state, { op: 'startRound' });
      if (!r.ok) ZG.HUD.toast(r.reason === 'no-humans' ? '至少需要一名人类' : '无法开始', 'warn');
      ZG.Audio.init();
    },
    onSell() {
      if (!state) return;
      if (state.ui.selectedBuildingId) {
        const r = ZG.Sim.applyCommand(state, { op: 'demolish', buildingId: state.ui.selectedBuildingId });
        if (r.ok) { ZG.HUD.toast('已拆除，返还 ' + r.refund + ' 金', 'ok'); state.ui.selectedBuildingId = null; }
        else ZG.HUD.toast('无法拆除', 'warn');
        return;
      }
      if (state.ui.selectedHumanId) {
        const r = ZG.Sim.applyCommand(state, { op: 'sell', humanId: state.ui.selectedHumanId });
        if (r.ok) { ZG.HUD.toast('已出售，返还 ' + r.refund + ' 金', 'ok'); state.ui.selectedHumanId = null; }
        else ZG.HUD.toast(r.reason === 'last-human' ? '最后一名人类不能出售' : '无法出售', 'warn');
      }
    },
    onSpeed(n) {
      if (!state) return;
      state.ui.speed = n;
      ZG.Audio.play('click');
    },
    onPause() {
      if (!state) return;
      if (state.status === 'battle') {
        state.ui.paused = !state.ui.paused;
        ZG.Audio.play('click');
      }
    },
    onPanel(id) {
      if (!state) return;
      state.ui.panel = id;
      state.ui.selectedCard = null;
      state.ui.selectedBuilding = null;
      ZG.Audio.play('click');
    },
    onPanelNext: nextPanel,
    onSettleContinue() {
      if (!state) return;
      state.ui.showSettlement = false;
      ZG.Audio.play('click');
    },
    onRestart: restartGame,
    onMenu() {
      if (!state) return;
      state.ui.showMenu = true;
      state.ui.showSettlement = false;
      state.ui.showHelp = false;
      state.ui.showSettings = false;
      state.ui.paused = false;
      state.ui.selectedCard = null;
      state.ui.selectedBuilding = null;
      state.ui.selectedHumanId = null;
      state.ui.pendingSupport = null;
      state.ui.supportAim = null;
      state.ui.tutorialStep = -1;
      ZG.Audio.play('click');
    },
    onHelp() { toggleOverlay('help'); },
    onSettings() { toggleOverlay('settings'); },
    onCloseModal() { closeOverlay(); },
    onToggleSetting(key) {
      if (!state) return;
      if (key === 'muted') {
        state.settings.muted = !state.settings.muted;
        ZG.Audio.setMuted(state.settings.muted);
      } else {
        state.settings[key] = state.settings[key] === false;
      }
      saveSettings();
      ZG.Audio.play('click');
    },
    onReplayTutorial() {
      if (!state) return;
      state.settings.tutorialSeen = false;
      state.ui.tutorialStep = 0;
      state.ui.showSettings = false;
      saveSettings();
    },
    onTutorialNext() {
      if (!state) return;
      state.ui.tutorialStep++;
      if (state.ui.tutorialStep >= ZG.Model.tutorialSteps().length) {
        state.ui.tutorialStep = -1;
        state.settings.tutorialSeen = true;
        saveSettings();
      }
    },
    onTutorialSkip() {
      if (!state) return;
      state.ui.tutorialStep = -1;
      state.settings.tutorialSeen = true;
      saveSettings();
    },
    onExportSave: exportSave,
    onImportSave: importSave,
    onFullscreen() {
      ZG.Platform.requestLandscape().then(r => {
        if (!r.ok) ZG.HUD.toast('浏览器不支持自动横屏，已切换竖屏布局', 'info');
      });
      ZG.Audio.play('click');
    },
    onDismissOrientation() {
      if (!state) return;
      state.settings.orientationHintDismissed = true;
      saveSettings();
    },
    onShare() {
      const url = typeof location !== 'undefined' ? location.href : '';
      ZG.Platform.share('尸潮防线：点开就能玩，横屏更佳', url);
      ZG.HUD.toast('链接已复制 / 已打开分享', 'ok');
    },
    onMute() {
      if (!state) return;
      state.settings.muted = !state.settings.muted;
      ZG.Audio.setMuted(state.settings.muted);
      saveSettings();
      ZG.HUD.toast(state.settings.muted ? '已静音' : '已开启声音', 'info');
    },
    onInstall() {
      const prompt = ZG.__installPrompt;
      if (prompt) {
        prompt.prompt();
        if (prompt.userChoice) {
          prompt.userChoice.then(() => { ZG.__installPrompt = null; });
        }
      }
    }
  };

  function loop(now) {
    if (!last) last = now;
    const dt = Math.min(now - last, 250);
    last = now;

    if (state && state.status === 'prep') {
      ZG.Heroes.returnWounded(state);
    }

    if (state && !loopStopped && state.status === 'battle' && !state.ui.paused) {
      acc += dt * (state.ui.speed || 1);
      let steps = 0;
      while (acc >= ZG.Const.STEP_MS && steps < ZG.Const.MAX_STEPS_PER_FRAME) {
        ZG.Sim.step(state);
        acc -= ZG.Const.STEP_MS;
        steps++;
      }
      if (steps >= ZG.Const.MAX_STEPS_PER_FRAME) acc = 0;
    } else {
      acc = 0;
    }

    ZG.Particles.step();
    if (state) {
      ZG.Renderer.draw(state);
      ZG.HUD.render(state);
    }
    requestAnimationFrame(loop);
  }

  function registerPWA() {
    try {
      if (typeof location !== 'undefined' && /[?&]dev=1/.test(location.search)) return;
      if (typeof location !== 'undefined' && /^https?:$/.test(location.protocol) && !ZG.Platform.isWeChat) {
        const link = document.createElement('link');
        link.rel = 'manifest';
        link.href = 'manifest.webmanifest';
        document.head.appendChild(link);
      }
      if (typeof location !== 'undefined' && location.protocol === 'file:') return;
      if ('serviceWorker' in navigator && location.protocol !== 'file:' &&
        !ZG.Platform.isWeChat) {
        navigator.serviceWorker.register('sw.js').then(reg => {
          reg.addEventListener('updatefound', () => {
            const nw = reg.installing;
            if (!nw) return;
            nw.addEventListener('statechange', () => {
              if (nw.state === 'installed' && navigator.serviceWorker.controller) {
                ZG.HUD.toast('新版本已就绪，刷新页面即可更新', 'info');
              }
            });
          });
        }).catch(() => {});
      }
      window.addEventListener('beforeinstallprompt', ev => {
        ev.preventDefault();
        ZG.__installPrompt = ev;
      });
      window.addEventListener('appinstalled', () => {
        ZG.__installPrompt = null;
        ZG.HUD.toast('已安装到桌面', 'ok');
      });
    } catch (e) { /* 忽略 */ }
  }

  function init() {
    const canvas = document.getElementById('game');
    const bg = document.getElementById('game-bg');
    state = newState('suburban', 20261018);
    state.ui.showMenu = true;

    ZG.Renderer.init(canvas, bg, state);
    ZG.HUD.init(state, callbacks);
    ZG.Renderer.resize();
    ZG.Input.init(canvas, () => state, callbacks);
    ZG.Audio.setMuted(!!state.settings.muted);
    if (ZG.Particles && ZG.Particles.instance && ZG.Platform.quality.particleCap) {
      ZG.Particles.instance.cap = ZG.Platform.quality.particleCap;
    }

    ZG.Game = {
      get state() { return state; },
      setState(s) { state = s; subscribe(s); },
      get loopStopped() { return loopStopped; },
      setLoopStopped(v) { loopStopped = !!v; }
    };

    window.addEventListener('resize', () => ZG.Renderer.resize());
    window.addEventListener('orientationchange', () => ZG.Renderer.resize());
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', () => ZG.Renderer.resize());
    }
    window.addEventListener('pointerdown', () => {
      ZG.Audio.init();
      ZG.Audio.resume();
    }, { once: false });

    let orientationAsked = false;
    function maybeRequestOrientation() {
      if (orientationAsked) return;
      orientationAsked = true;
      const plan = ZG.Platform.orientationPlan({
        isMobile: ZG.Platform.isMobile,
        portrait: window.innerHeight > window.innerWidth,
        supportsLock: !!(typeof screen !== 'undefined' && screen.orientation && screen.orientation.lock),
        fullscreenEnabled: !!(document.documentElement && document.documentElement.requestFullscreen)
      });
      if (plan === 'lock') {
        ZG.Platform.requestLandscape().then(r => {
          if (!r.ok) ZG.HUD.toast('浏览器不支持自动横屏，已切换竖屏布局', 'info');
        });
      }
    }
    window.addEventListener('pointerdown', maybeRequestOrientation, { once: true });

    if (ZG.Platform.isWeChat) {
      setTimeout(() => {
        ZG.HUD.toast('微信内建议用浏览器打开：可安装到主屏并离线游玩', 'info');
      }, 900);
    }
    registerPWA();
    requestAnimationFrame(loop);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
