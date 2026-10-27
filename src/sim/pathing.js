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

  // v1.4 基线：4 邻域 BFS，只在无 zones 地图使用
  function fillBFS(blocked, sources, dist, dirX, dirY) {
    const queue = new Int32Array(COLS * ROWS);
    let head = 0, tail = 0;
    for (const i of sources) {
      if (dist[i] !== INF) continue;
      dist[i] = 0;
      queue[tail++] = i;
    }
    while (head < tail) {
      const i = queue[head++];
      const cx = i % COLS;
      const cy = (i / COLS) | 0;
      const d = dist[i] + 1;
      if (cx > 0) visit(i - 1, -1, 0, d);
      if (cx < COLS - 1) visit(i + 1, 1, 0, d);
      if (cy > 0) visit(i - COLS, 0, -1, d);
      if (cy < ROWS - 1) visit(i + COLS, 0, 1, d);
    }
    function visit(ni, dx, dy, d) {
      if (blocked[ni] || dist[ni] !== INF) return;
      dist[ni] = d;
      // 从邻居指回当前格的反方向
      dirX[ni] = -dx;
      dirY[ni] = -dy;
      queue[tail++] = ni;
    }
  }

  // 活动区地图：水平移动 10、垂直移动 12 的加权最短路（bucket Dijkstra）。
  // 通道内水平更便宜，父节点稳定沿通道轴，僵尸不会贴着通道边挤成一排。
  function fillWeighted(blocked, sources, dist, dirX, dirY) {
    const HW = ZG.Const.PATH_H_WEIGHT || 10;
    const VW = ZG.Const.PATH_V_WEIGHT || 12;
    const maxD = (COLS + ROWS) * VW + 8;
    const buckets = new Array(maxD + 1);
    for (let i = 0; i <= maxD; i++) buckets[i] = [];
    for (const i of sources) {
      if (dist[i] === 0) continue;
      dist[i] = 0;
      buckets[0].push(i);
    }
    for (let d = 0; d <= maxD; d++) {
      const b = buckets[d];
      while (b.length) {
        const i = b.pop();
        if (dist[i] !== d) continue;
        const cx = i % COLS;
        const cy = (i / COLS) | 0;
        if (cx > 0) relax(i - 1, -1, 0, HW, d);
        if (cx < COLS - 1) relax(i + 1, 1, 0, HW, d);
        if (cy > 0) relax(i - COLS, 0, -1, VW, d);
        if (cy < ROWS - 1) relax(i + COLS, 0, 1, VW, d);
      }
    }
    function relax(ni, dx, dy, w, d) {
      if (blocked[ni]) return;
      const nd = d + w;
      if (nd >= dist[ni]) return;
      dist[ni] = nd;
      dirX[ni] = -dx;
      dirY[ni] = -dy;
      if (nd <= maxD) buckets[nd].push(ni);
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

    // 活动区遮罩：区域外的格子一律不可走（地铁图的设备带与轨道）
    if (ZG.MapZone.has(map)) {
      const zmask = ZG.MapZone.mask(state);
      for (let i = 0; i < blocked.length; i++) {
        if (!zmask[i]) blocked[i] = 1;
      }
    }

    const dist = new Uint16Array(COLS * ROWS).fill(INF);
    const dirX = new Int8Array(COLS * ROWS);
    const dirY = new Int8Array(COLS * ROWS);

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

    // 无 zones 地图保持 v1.4 的 4 邻域 BFS（确定性基线）；
    // 有 zones 的窄通道地图用水平优先的加权最短路，避免 BFS 父节点在宽通道里
    // 出现上下锯齿、把僵尸挤到通道边界。
    if (ZG.MapZone.has(map)) fillWeighted(blocked, sources, dist, dirX, dirY);
    else fillBFS(blocked, sources, dist, dirX, dirY);

    const centerPoint = ZG.Geom.humanCentroid(state) || center;
    return {
      cols: COLS, rows: ROWS, cell: CELL, blocked, dist, dirX, dirY,
      centerX: centerPoint.x, centerY: centerPoint.y,
      zoneMap: (map && map.zones) ? { zones: map.zones } : null,
      // 窄通道地图（有 zones）不混入指向中心的平滑分量：否则僵尸会被拉向通道边界、
      // 挤成一排互相推挤，推进速度跌到 2px/s 并把回合拖到硬上限。
      smoothing: ZG.MapZone.has(map) ? 0 : 0.25,
      mapId: map ? map.id : ''
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

  // 贴边/跨格时的备选方向：在邻格里挑一个 dist 更低、且带半径能直线走到的格子。
  // 返回单位向量或 null（没有合适邻格）。
  function boundaryDirection(pathing, c, x, y, radius) {
    if (pathing.smoothing !== 0) return null;
    const rad = radius || 0;
    const zm = pathing.zoneMap;
    let bestI = -1, bestD = INF;
    for (let r = 1; r <= 4; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const nx = c.cx + dx, ny = c.cy + dy;
          if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
          const ni = idx(nx, ny);
          if (pathing.dist[ni] === INF) continue;
          if (pathing.dist[ni] >= bestD) continue;
          if (zm) {
            const bx = cellCX(nx), by = cellCY(ny);
            let ok = true;
            for (let s = 1; s <= 4 && ok; s++) {
              const t = s / 4;
              if (!ZG.MapZone.containsCircle(zm, x + (bx - x) * t, y + (by - y) * t, rad)) ok = false;
            }
            if (!ok) continue;
          }
          bestD = pathing.dist[ni];
          bestI = ni;
        }
      }
      if (bestI >= 0) break;
    }
    if (bestI < 0) return null;
    const bx = cellCX(bestI % COLS), by = cellCY((bestI / COLS) | 0);
    const bdx = bx - x, bdy = by - y;
    const blen = Math.hypot(bdx, bdy) || 1;
    return { x: bdx / blen, y: bdy / blen };
  }

  function directionAt(pathing, x, y, radius) {
    if (!pathing) return { x: 0, y: 0 };
    const c = cellOf(x, y);
    if (pathing.dist[c.i] === INF) {
      const alt = boundaryDirection(pathing, c, x, y, radius);
      if (alt) return alt;
      const dx = pathing.centerX - x, dy = pathing.centerY - y;
      const len = Math.hypot(dx, dy) || 1;
      return { x: dx / len, y: dy / len };
    }
    if (pathing.dirX[c.i] === 0 && pathing.dirY[c.i] === 0) {
      const alt = boundaryDirection(pathing, c, x, y, radius);
      if (alt) return alt;
      const dx = pathing.centerX - x, dy = pathing.centerY - y;
      const len = Math.hypot(dx, dy) || 1;
      return { x: dx / len, y: dy / len };
    }
    // 网格方向为主，混入少量指向中心的平滑分量，避免纯轴向抖动
    let dx = pathing.dirX[c.i], dy = pathing.dirY[c.i];
    const smooth = pathing.smoothing === undefined ? 0.25 : pathing.smoothing;
    const vx = pathing.centerX - x, vy = pathing.centerY - y;
    const vlen = Math.hypot(vx, vy) || 1;
    dx += (vx / vlen) * smooth;
    dy += (vy / vlen) * smooth;
    const len = Math.hypot(dx, dy) || 1;
    const dir = { x: dx / len, y: dy / len };
    // 格心落在接缝另一侧时，网格方向可能指向设备带拐角；探针越界就改用邻格引导。
    if (radius && pathing.zoneMap) {
      const px = x + dir.x * 16, py = y + dir.y * 16;
      if (!ZG.MapZone.containsCircle(pathing.zoneMap, px, py, radius)) {
        const alt = boundaryDirection(pathing, c, x, y, radius);
        if (alt) return alt;
      }
    }
    return dir;
  }

  function nearestReachable(pathing, x, y, opts) {
    if (!pathing) return { x, y };
    const c = cellOf(x, y);
    if (pathing.dist[c.i] !== INF && !(opts && opts.advance)) {
      return { x: cellCX(c.cx), y: cellCY(c.cy) };
    }
    // 卡死救援：优先朝流场下坡方向前进几格，避免把僵尸原样送回原地
    if (opts && opts.advance && pathing.dist[c.i] !== INF) {
      let bestI = c.i, bestD = pathing.dist[c.i];
      for (let r = 1; r <= 10; r++) {
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
            const nx = c.cx + dx, ny = c.cy + dy;
            if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
            const ni = idx(nx, ny);
            if (pathing.dist[ni] === INF || pathing.dist[ni] >= bestD) continue;
            bestD = pathing.dist[ni];
            bestI = ni;
          }
        }
        if (bestI !== c.i) return { x: cellCX(bestI % COLS), y: cellCY((bestI / COLS) | 0) };
      }
    }
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
      humans: [],
      buildings: []
    };
    const p = build(fake);
    let ok = true, maxDetour = 0;
    const problems = [];
    const zoned = !!(map.zones && map.validationPoints);
    const check = (x, y) => {
      if (zoned && !ZG.MapZone.contains(map, x, y)) {
        ok = false;
        problems.push('outside-zone ' + x + ',' + y);
        return;
      }
      const c = cellOf(x, y);
      if (p.blocked[c.i]) {
        if (zoned) {
          ok = false;
          problems.push('blocked ' + x + ',' + y);
        }
        return;
      }
      if (p.dist[c.i] === INF) {
        ok = false;
        problems.push('unreachable ' + x + ',' + y);
        return;
      }
      const straight = Math.max(1, ZG.Geom.dist(x, y, p.centerX, p.centerY));
      maxDetour = Math.max(maxDetour, (p.dist[c.i] * CELL) / straight);
    };
    if (zoned) {
      for (const pt of map.validationPoints) check(pt.x, pt.y);
    } else {
      for (let cx = 0; cx < COLS; cx++) { check(cellCX(cx), cellCY(0)); check(cellCX(cx), cellCY(ROWS - 1)); }
      for (let cy = 0; cy < ROWS; cy++) { check(cellCX(0), cellCY(cy)); check(cellCX(COLS - 1), cellCY(cy)); }
    }
    check(p.centerX, p.centerY);
    return { ok, maxDetour, problems, detourOk: true };
  }

  ZG.Pathing = { build, directionAt, nearestReachable, pathToTarget, validate };
})();
