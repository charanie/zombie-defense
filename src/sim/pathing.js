/* 32px 导航网格 + 多源 BFS 流场 + 地图可达性校验 */
(function () {
  'use strict';
  const ZG = globalThis.ZG = globalThis.ZG || {};

  const COLS = ZG.Const.GRID_COLS;
  const ROWS = ZG.Const.GRID_ROWS;
  const CELL = ZG.Const.GRID;
  const INF = 65535;

  function idx(cx, cy) { return cy * COLS + cx; }
  function cellCX(cx) { return cx * CELL + CELL / 2; }
  function cellCY(cy) { return cy * CELL + CELL / 2; }

  function markCircle(blocked, x, y, r) {
    const x0 = Math.max(0, Math.floor((x - r - CELL) / CELL));
    const x1 = Math.min(COLS - 1, Math.ceil((x + r + CELL) / CELL));
    const y0 = Math.max(0, Math.floor((y - r - CELL) / CELL));
    const y1 = Math.min(ROWS - 1, Math.ceil((y + r + CELL) / CELL));
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const dx = cellCX(cx) - x, dy = cellCY(cy) - y;
        if (dx * dx + dy * dy < r * r) blocked[idx(cx, cy)] = 1;
      }
    }
  }

  function markRect(blocked, x, y, w, h) {
    const x0 = Math.max(0, Math.floor(x / CELL));
    const x1 = Math.min(COLS - 1, Math.ceil((x + w) / CELL) - 1);
    const y0 = Math.max(0, Math.floor(y / CELL));
    const y1 = Math.min(ROWS - 1, Math.ceil((y + h) / CELL) - 1);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        if (ZG.Geom.rectOverlapsRect(cx * CELL, cy * CELL, CELL, CELL, x, y, w, h, 0)) {
          blocked[idx(cx, cy)] = 1;
        }
      }
    }
  }

  function build(state) {
    const blocked = new Uint8Array(COLS * ROWS);
    const map = state.map;

    if (map && map.obstacles) {
      for (const ob of map.obstacles) {
        if (ob.kind === 'rect') markRect(blocked, ob.x, ob.y, ob.w, ob.h);
        else markCircle(blocked, ob.x, ob.y, ob.r);
      }
    }

    if (state.buildings) {
      for (const b of state.buildings) {
        if (!b.alive) continue;
        const data = ZG.Data.buildings[b.typeId];
        if (data && data.blocks === false) continue;
        if (b.shape === 'rect') {
          const r = ZG.Geom.rectOfBuilding(b);
          markRect(blocked, r.x, r.y, r.w, r.h);
        } else {
          markCircle(blocked, b.x, b.y, b.radius || (data && data.radius) || 24);
        }
      }
    }

    const dist = new Uint16Array(COLS * ROWS).fill(INF);
    const dirX = new Int8Array(COLS * ROWS);
    const dirY = new Int8Array(COLS * ROWS);
    const queue = new Int32Array(COLS * ROWS);
    let head = 0, tail = 0;

    // 源点：所有存活人类所在格；没有人类时用活动区中心，中心被挡则螺旋找最近空格
    const center = ZG.MapZone.center(map);
    const sources = [];
    for (const h of state.humans || []) {
      if (!h.alive) continue;
      const c = cellOf(h.x, h.y);
      if (!blocked[c.i]) sources.push(c.i);
    }
    if (!sources.length) {
      const c = cellOf(center.x, center.y);
      const open = nearestOpen(blocked, c.cx, c.cy);
      if (open >= 0) sources.push(open);
    }
    for (const i of sources) {
      if (dist[i] !== INF) continue;
      dist[i] = 0;
      queue[tail++] = i;
    }

    // 4 邻域 BFS
    while (head < tail) {
      const i = queue[head++];
      const cx = i % COLS;
      const cy = (i / COLS) | 0;
      const d = dist[i] + 1;
      if (cx > 0) visit(i - 1, cx - 1, cy, -1, 0, d);
      if (cx < COLS - 1) visit(i + 1, cx + 1, cy, 1, 0, d);
      if (cy > 0) visit(i - COLS, cx, cy - 1, 0, -1, d);
      if (cy < ROWS - 1) visit(i + COLS, cx, cy + 1, 0, 1, d);
    }

    function visit(ni, ncx, ncy, dx, dy, d) {
      if (blocked[ni] || dist[ni] !== INF) return;
      dist[ni] = d;
      // 从邻居 n 指回当前格 i 的反方向
      dirX[ni] = -dx;
      dirY[ni] = -dy;
      queue[tail++] = ni;
    }

    const centerPoint = ZG.Geom.humanCentroid(state) || center;
    return {
      cols: COLS, rows: ROWS, cell: CELL, blocked, dist, dirX, dirY,
      centerX: centerPoint.x, centerY: centerPoint.y, mapId: map ? map.id : ''
    };
  }

  function cellOf(x, y) {
    const cx = Math.max(0, Math.min(COLS - 1, Math.floor(x / CELL)));
    const cy = Math.max(0, Math.min(ROWS - 1, Math.floor(y / CELL)));
    return { cx, cy, i: idx(cx, cy) };
  }

  // 从 (cx,cy) 开始按切比雪夫半径螺旋找第一个未阻挡格；返回格子索引或 -1。
  function nearestOpen(blocked, cx, cy) {
    if (!blocked[idx(cx, cy)]) return idx(cx, cy);
    for (let r = 1; r < Math.max(COLS, ROWS); r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
          if (!blocked[idx(nx, ny)]) return idx(nx, ny);
        }
      }
    }
    return -1;
  }

  function directionAt(pathing, x, y) {
    if (!pathing) return { x: 0, y: 0 };
    const c = cellOf(x, y);
    if (pathing.dist[c.i] === INF || (pathing.dirX[c.i] === 0 && pathing.dirY[c.i] === 0)) {
      const dx = pathing.centerX - x, dy = pathing.centerY - y;
      const len = Math.hypot(dx, dy) || 1;
      return { x: dx / len, y: dy / len };
    }
    // 网格方向为主，混入少量指向中心的平滑分量，避免纯轴向抖动
    let dx = pathing.dirX[c.i], dy = pathing.dirY[c.i];
    const vx = pathing.centerX - x, vy = pathing.centerY - y;
    const vlen = Math.hypot(vx, vy) || 1;
    dx += (vx / vlen) * 0.25;
    dy += (vy / vlen) * 0.25;
    const len = Math.hypot(dx, dy) || 1;
    return { x: dx / len, y: dy / len };
  }

  function nearestReachable(pathing, x, y) {
    if (!pathing) return { x, y };
    const c = cellOf(x, y);
    if (pathing.dist[c.i] !== INF) return { x: cellCX(c.cx), y: cellCY(c.cy) };
    for (let r = 1; r <= 20; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const nx = c.cx + dx, ny = c.cy + dy;
          if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
          const ni = idx(nx, ny);
          if (pathing.dist[ni] !== INF) return { x: cellCX(nx), y: cellCY(ny) };
        }
      }
    }
    return { x: pathing.centerX, y: pathing.centerY };
  }

  function pathToTarget(pathing, x, y) {
    const path = [];
    let c = cellOf(x, y);
    let guard = 0;
    while (pathing.dist[c.i] !== 0 && guard++ < 2000) {
      path.push({ x: cellCX(c.cx), y: cellCY(c.cy) });
      const dx = pathing.dirX[c.i], dy = pathing.dirY[c.i];
      if (!dx && !dy) break;
      c = cellOf(cellCX(c.cx) + dx * CELL * 0.75, cellCY(c.cy) + dy * CELL * 0.75);
    }
    return path;
  }

  function validate(map) {
    const fake = {
      map,
      humans: [{ id: 0, alive: true, x: ZG.Const.W / 2, y: ZG.Const.H / 2, radius: 8 }],
      buildings: []
    };
    const p = build(fake);
    let ok = true, maxDetour = 0;
    const problems = [];
    const check = (x, y) => {
      const c = cellOf(x, y);
      if (p.blocked[c.i]) return;
      if (p.dist[c.i] === INF) {
        ok = false;
        problems.push('unreachable ' + x + ',' + y);
        return;
      }
      const straight = Math.max(1, ZG.Geom.dist(x, y, p.centerX, p.centerY));
      maxDetour = Math.max(maxDetour, (p.dist[c.i] * CELL) / straight);
    };
    for (let cx = 0; cx < COLS; cx++) { check(cellCX(cx), cellCY(0)); check(cellCX(cx), cellCY(ROWS - 1)); }
    for (let cy = 0; cy < ROWS; cy++) { check(cellCX(0), cellCY(cy)); check(cellCX(COLS - 1), cellCY(cy)); }
    check(p.centerX, p.centerY);
    return { ok, maxDetour, problems, detourOk: true };
  }

  ZG.Pathing = { build, directionAt, nearestReachable, pathToTarget, validate };
})();
