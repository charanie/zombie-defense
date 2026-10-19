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

    const deploy = map ? map.deploy : { kind: 'rect', x: 0, y: 0, w: 1280, h: 720 };
    const dist = new Uint16Array(COLS * ROWS).fill(INF);
    const dirX = new Int8Array(COLS * ROWS);
    const dirY = new Int8Array(COLS * ROWS);
    const queue = new Int32Array(COLS * ROWS);
    let head = 0, tail = 0;

    for (let cy = 0; cy < ROWS; cy++) {
      for (let cx = 0; cx < COLS; cx++) {
        const i = idx(cx, cy);
        if (blocked[i]) continue;
        if (ZG.Geom.pointInDeploy(cellCX(cx), cellCY(cy), deploy)) {
          dist[i] = 0;
          queue[tail++] = i;
        }
      }
    }

    const dcx = ZG.Geom.deployCenter(deploy).x;
    const dcy = ZG.Geom.deployCenter(deploy).y;

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

    // 部署区内 (含多源) 方向指向中心
    for (let cy = 0; cy < ROWS; cy++) {
      for (let cx = 0; cx < COLS; cx++) {
        const i = idx(cx, cy);
        if (dist[i] !== 0) continue;
        const vx = dcx - cellCX(cx), vy = dcy - cellCY(cy);
        const len = Math.hypot(vx, vy) || 1;
        // 在部署区内部不需要流场，留空由 AI 直追
        dirX[i] = Math.round(vx / len) || 0;
        dirY[i] = Math.round(vy / len) || 0;
      }
    }

    return { cols: COLS, rows: ROWS, cell: CELL, blocked, dist, dirX, dirY, deploy, mapId: map ? map.id : '' };
  }

  function cellOf(x, y) {
    const cx = Math.max(0, Math.min(COLS - 1, Math.floor(x / CELL)));
    const cy = Math.max(0, Math.min(ROWS - 1, Math.floor(y / CELL)));
    return { cx, cy, i: idx(cx, cy) };
  }

  function directionAt(pathing, x, y) {
    const c = cellOf(x, y);
    if (!pathing || pathing.dist[c.i] === INF) {
      const center = pathing ? ZG.Geom.deployCenter(pathing.deploy) : { x: 640, y: 600 };
      const dx = center.x - x, dy = center.y - y;
      const len = Math.hypot(dx, dy) || 1;
      return { x: dx / len, y: dy / len };
    }
    const dx = pathing.dirX[c.i], dy = pathing.dirY[c.i];
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
    const center = ZG.Geom.deployCenter(pathing.deploy);
    return { x: center.x, y: center.y };
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

  function nearestDeployPoint(map, x, y) {
    const d = map.deploy;
    if (d.kind === 'rect') {
      return { x: Math.max(d.x, Math.min(d.x + d.w, x)), y: Math.max(d.y, Math.min(d.y + d.h, y)) };
    }
    const dx = x - d.x, dy = y - d.y;
    const len = Math.hypot(dx, dy) || 1;
    if (len <= d.r) return { x, y };
    return { x: d.x + (dx / len) * d.r, y: d.y + (dy / len) * d.r };
  }

  function validate(map) {
    // Task 3 过渡实现：只用地图 + 地图中心源，边缘不可达即失败。
    const m = Object.assign({}, map, {
      deploy: { kind: 'circle', x: ZG.Const.W / 2, y: ZG.Const.H / 2, r: CELL }
    });
    const p = build({ map: m, humans: [], buildings: [] });
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
      const cx = zCenter(m).x, cy = zCenter(m).y;
      const straight = Math.max(1, ZG.Geom.dist(x, y, cx, cy));
      maxDetour = Math.max(maxDetour, (p.dist[c.i] * CELL) / straight);
    };
    for (let cx = 0; cx < COLS; cx++) { check(cellCX(cx), cellCY(0)); check(cellCX(cx), cellCY(ROWS - 1)); }
    for (let cy = 0; cy < ROWS; cy++) { check(cellCX(0), cellCY(cy)); check(cellCX(COLS - 1), cellCY(cy)); }
    check(m.deploy.x, m.deploy.y);
    return { ok, maxDetour, problems, detourOk: true };
  }

  function zCenter(map) {
    const d = map.deploy;
    if (d.kind === 'rect') return { x: d.x + d.w / 2, y: d.y + d.h / 2 };
    return { x: d.x, y: d.y };
  }

  ZG.Pathing = { build, directionAt, nearestReachable, nearestDeployPoint, pathToTarget, validate };
})();
