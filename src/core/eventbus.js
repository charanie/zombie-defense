/* 轻量事件总线：模拟层只发射，表现层订阅 */
(function () {
  'use strict';
  const ZG = globalThis.ZG = globalThis.ZG || {};

  const Events = Object.freeze({
    ROUND_STARTED: 'round:started',
    ROUND_SETTLED: 'round:settled',
    BATTLE_CLEARED: 'battle:cleared',
    GAME_OVER: 'game:over',
    HUMAN_SPAWNED: 'human:spawned',
    HUMAN_DIED: 'human:died',
    ZOMBIE_SPAWNED: 'zombie:spawned',
    ZOMBIE_DIED: 'zombie:died',
    BUILDING_BUILT: 'building:built',
    BUILDING_DESTROYED: 'building:destroyed',
    CAPTAIN_PROMOTED: 'captain:promoted',
    HERO_GRANTED: 'hero:granted',
    HERO_WOUNDED: 'hero:wounded',
    BOSS_SPAWNED: 'boss:spawned',
    MONEY_CHANGED: 'money:changed',
    INFECTION_TREATED: 'infection:treated',
    PORTAL_WARNING: 'portal:warning',
    UI_TOAST: 'ui:toast'
  });

  function create() {
    const map = new Map();
    return {
      on(name, fn) {
        if (!map.has(name)) map.set(name, []);
        map.get(name).push(fn);
        return fn;
      },
      once(name, fn) {
        const wrap = payload => { this.off(name, wrap); fn(payload); };
        return this.on(name, wrap);
      },
      off(name, fn) {
        const list = map.get(name);
        if (!list) return;
        const i = list.indexOf(fn);
        if (i >= 0) list.splice(i, 1);
      },
      emit(name, payload) {
        const list = map.get(name);
        if (!list || !list.length) return;
        const copy = list.slice();
        for (let i = 0; i < copy.length; i++) {
          try { copy[i](payload); } catch (e) { console.error(e); }
        }
      },
      clear() { map.clear(); }
    };
  }

  ZG.Events = Events;
  ZG.EventBus = { create };
})();
