/* 64px 空间哈希：索敌 / AOE / 分离 */
(function () {
  'use strict';
  const ZG = globalThis.ZG = globalThis.ZG || {};

  function create() {
    return {
      cell: ZG.Const.HASH_CELL,
      cells: new Map(),
      cols: Math.ceil(ZG.Const.W / ZG.Const.HASH_CELL),
      rows: Math.ceil(ZG.Const.H / ZG.Const.HASH_CELL),
      stamp: 0
    };
  }

  function key(cx, cy) { return (cx + 64) * 4096 + (cy + 64); }

  function rebuild(hash, state) {
    hash.cells.clear();
    addAll(hash, state.humans);
    addAll(hash, state.zombies);
    addAll(hash, state.buildings);
  }

  function addAll(hash, list) {
    const cell = hash.cell;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e.alive) continue;
      const cx = Math.floor(e.x / cell);
      const cy = Math.floor(e.y / cell);
      const k = key(cx, cy);
      let arr = hash.cells.get(k);
      if (!arr) { arr = []; hash.cells.set(k, arr); }
      arr.push(e);
    }
  }

  function queryCircle(hash, x, y, r, filter) {
    const cell = hash.cell;
    const out = [];
    const x0 = Math.floor((x - r) / cell), x1 = Math.floor((x + r) / cell);
    const y0 = Math.floor((y - r) / cell), y1 = Math.floor((y + r) / cell);
    const r2 = r * r;
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const arr = hash.cells.get(key(cx, cy));
        if (!arr) continue;
        for (let i = 0; i < arr.length; i++) {
          const e = arr[i];
          if (!e.alive) continue;
          const dx = e.x - x, dy = e.y - y;
          const rr = r + (e.radius || 0);
          if (dx * dx + dy * dy <= rr * rr) {
            if (!filter || filter(e)) out.push(e);
          }
        }
      }
    }
    return out;
  }

  function queryNearest(hash, x, y, maxR, filter) {
    const cell = hash.cell;
    const x0 = Math.floor((x - maxR) / cell), x1 = Math.floor((x + maxR) / cell);
    const y0 = Math.floor((y - maxR) / cell), y1 = Math.floor((y + maxR) / cell);
    let best = null;
    let bestD = maxR * maxR;
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const arr = hash.cells.get(key(cx, cy));
        if (!arr) continue;
        for (let i = 0; i < arr.length; i++) {
          const e = arr[i];
          if (!e.alive) continue;
          if (filter && !filter(e)) continue;
          const dx = e.x - x, dy = e.y - y;
          const d = dx * dx + dy * dy;
          if (d < bestD) { bestD = d; best = e; }
        }
      }
    }
    return best;
  }

  function queryDensest(hash, cx, cy, radius, filter) {
    // 简化：返回半径内邻居最多的实体位置
    const list = queryCircle(hash, cx, cy, radius, filter);
    if (!list.length) return null;
    let best = null, bestCount = -1;
    for (let i = 0; i < list.length; i += Math.max(1, Math.floor(list.length / 8))) {
      const a = list[i];
      let count = 0;
      for (let j = 0; j < list.length; j++) {
        const b = list[j];
        const dx = a.x - b.x, dy = a.y - b.y;
        if (dx * dx + dy * dy <= 90 * 90) count++;
      }
      if (count > bestCount) { bestCount = count; best = a; }
    }
    return best;
  }

  ZG.Spatial = { create, rebuild, addAll, queryCircle, queryNearest, queryDensest };
})();
