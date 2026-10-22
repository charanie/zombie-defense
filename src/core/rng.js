/* 确定性随机：mulberry32 + 命名随机流 */
(function () {
  'use strict';
  const ZG = globalThis.ZG = globalThis.ZG || {};

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hashString(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function stream(seed, name) {
    const mixed = (seed >>> 0) ^ hashString(name || 'default') ^ 0x9E3779B9;
    const next = mulberry32(mixed);
    return {
      next,
      int(min, max) {
        if (max === undefined) { max = min; min = 0; }
        return Math.floor(next() * (max - min + 1)) + min;
      },
      pick(arr) {
        if (!arr || !arr.length) return undefined;
        return arr[Math.floor(next() * arr.length)];
      },
      chance(p) {
        return next() < p;
      },
      shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
          const j = Math.floor(next() * (i + 1));
          const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
        }
        return arr;
      }
    };
  }

  function createStreams(seed) {
    const s = seed >>> 0;
    return {
      spawn: stream(s, 'spawn'),
      boss: stream(s, 'boss'),
      promote: stream(s, 'promote'),
      hero: stream(s, 'hero'),
      jitter: stream(s, 'jitter'),
      fx: stream(s, 'fx')
    };
  }

  ZG.Rng = { mulberry32, hashString, stream, createStreams };
})();
