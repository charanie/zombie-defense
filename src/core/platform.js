/* 平台抽象：存档、设备、画质档、分享（浏览器优先） */
(function () {
  'use strict';
  const ZG = globalThis.ZG = globalThis.ZG || {};

  const SETTINGS_KEY = 'zd_settings';
  const SAVE_VERSION = 1;

  function memoryStorage() {
    const mem = {};
    return {
      getItem(k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
      setItem(k, v) { mem[k] = String(v); },
      removeItem(k) { delete mem[k]; }
    };
  }

  function defaultStorage() {
    try {
      if (typeof localStorage !== 'undefined') return localStorage;
    } catch (e) { /* 隐私模式 */ }
    return memoryStorage();
  }

  function qualityFor(device) {
    if (device === 'mobile') {
      return { dprCap: 1.5, particleCap: 120, zombieCap: 200, shake: false, damageNumbers: false };
    }
    return { dprCap: 2, particleCap: 250, zombieCap: 300, shake: true, damageNumbers: true };
  }

  function create(opts) {
    const o = opts || {};
    const storage = o.storage || defaultStorage();

    const api = {
      storage,
      save(data) {
        try {
          storage.setItem(SETTINGS_KEY, JSON.stringify(data));
          if (data && data.best && typeof data.best === 'object') {
            for (const k of Object.keys(data.best)) {
              const v = parseInt(data.best[k], 10);
              if (v > 0) storage.setItem('zd_best_' + k, String(v));
            }
          }
          return true;
        } catch (e) {
          return false;
        }
      },
      load() {
        try {
          const raw = storage.getItem(SETTINGS_KEY);
          if (!raw) return null;
          const data = JSON.parse(raw);
          if (data && typeof data === 'object') return data;
          return null;
        } catch (e) {
          return null;
        }
      },
      saveBest(mapId, round) {
        try {
          const key = 'zd_best_' + mapId;
          const prev = parseInt(storage.getItem(key) || '0', 10) || 0;
          if (round > prev) {
            storage.setItem(key, String(round));
            return true;
          }
          return false;
        } catch (e) { return false; }
      },
      loadBest(mapId) {
        try {
          const v = parseInt(storage.getItem('zd_best_' + mapId) || '0', 10);
          return isNaN(v) ? 0 : v;
        } catch (e) { return 0; }
      },
      loadAllBest() {
        const out = {};
        const maps = (ZG.Data.maps && ZG.Data.mapOrder) || [];
        for (const id of maps) out[id] = api.loadBest(id);
        return out;
      },
      exportSave() {
        const payload = {
          version: SAVE_VERSION,
          exportedAt: new Date().toISOString(),
          settings: api.load() || {},
          best: api.loadAllBest()
        };
        return JSON.stringify(payload, null, 2);
      },
      importSave(text) {
        let data;
        try { data = JSON.parse(text); } catch (e) {
          return { ok: false, reason: 'JSON 解析失败' };
        }
        if (!data || typeof data !== 'object') return { ok: false, reason: '存档格式不正确' };
        try {
          if (data.settings && typeof data.settings === 'object') api.save(data.settings);
          if (data.best && typeof data.best === 'object') {
            for (const k of Object.keys(data.best)) {
              const v = parseInt(data.best[k], 10);
              if (v > 0) storage.setItem('zd_best_' + k, String(v));
            }
          }
          return { ok: true, version: data.version || 1 };
        } catch (e) {
          return { ok: false, reason: '写入存档失败' };
        }
      },
      share(text, url) {
        try {
          if (typeof navigator !== 'undefined' && navigator.share) {
            return navigator.share({ title: '尸潮防线', text, url });
          }
          if (typeof navigator !== 'undefined' && navigator.clipboard) {
            return navigator.clipboard.writeText(url || text);
          }
        } catch (e) { /* 忽略 */ }
        return Promise.resolve(false);
      },
      vibrate(ms) {
        try {
          if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(ms);
        } catch (e) { /* 忽略 */ }
      },
      requestFullscreen() {
        try {
          const el = typeof document !== 'undefined' ? document.documentElement : null;
          if (el && el.requestFullscreen) {
            const p = el.requestFullscreen();
            if (p && p.catch) p.catch(() => {});
            try {
              if (screen.orientation && screen.orientation.lock) {
                screen.orientation.lock('landscape').catch(() => {});
              }
            } catch (e2) { /* 忽略 */ }
          }
        } catch (e) { /* 忽略 */ }
      }
    };
    return api;
  }

  const singleton = create();

  let isMobile = false, isWeChat = false, isStandalone = false;
  try {
    if (typeof navigator !== 'undefined') {
      const ua = navigator.userAgent || '';
      isMobile = /Android|iPhone|iPad|iPod|Mobile|HarmonyOS/i.test(ua) ||
        (typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches);
      isWeChat = /MicroMessenger/i.test(ua);
      isStandalone = (typeof matchMedia !== 'undefined' && matchMedia('(display-mode: standalone)').matches) ||
        (typeof navigator.standalone !== 'undefined' && navigator.standalone);
    }
  } catch (e) { /* 忽略 */ }

  const quality = qualityFor(isMobile ? 'mobile' : 'desktop');

  ZG.Platform = Object.assign(singleton, {
    create, qualityFor,
    isMobile, isWeChat, isStandalone,
    isDesktop: !isMobile,
    quality,
    SAVE_VERSION
  });
})();
