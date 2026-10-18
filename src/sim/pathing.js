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

  function build(state) {
    const blocked = new Uint8Array(COLS * ROWS);
    const map = state.map;

    if (map && map.obstacles) {
      for (const ob of map.obstacles) {
        if (ob.kind !== 'circle') continue;
        const x0 = Math.max(0, Math.floor((ob.x - ob.r - CELL) / CELL));
        const x1 = Math.min(COLS - 1, Math.ceil((ob.x + ob.r + CELL) / CELL));
        const y0 = Math.max(0, Math.floor((ob.y - ob.r - CELL) / CELL));
        const y1 = Math.min(ROWS - 1, Math.ceil((ob.y + ob.r + CELL) / CELL));
        for (let cy = y0; cy <= y1; cy++) {
          for (let cx = x0; cx <= x1; cx++) {
            const dx = cellCX(cx) - ob.x, dy = cellCY(cy) - ob.y;
            if (dx * dx + dy * dy < ob.r * ob.r) blocked[idx(cx, cy)] = 1;
          }
        }
      }
    }

    if (state.buildings) {
      for (const b of state.buildings) {
        if (!b.alive) continue;
        const data = ZG.Data.buildings[b.typeId];
        if (data && data.blocks === false) continue;
        const r = (data && data.radius) ? data.radius : 24;
        const x0 = Math.max(0, Math.floor((b.x - r - CELL) / CELL));
        const x1 = Math.min(COLS - 1, Math.ceil((b.x + r + CELL) / CELL));
        const y0 = Math.max(0, Math.floor((b.y - r - CELL) / CELL));
        const y1 = Math.min(ROWS - 1, Math.ceil((b.y + r + CELL) / CELL));
        for (let cy = y0; cy <= y1; cy++) {
          for (let cx = x0; cx <= x1; cx++) {
            const dx = cellCX(cx) - b.x, dy = cellCY(cy) - b.y;
            if (dx * dx + dy * dy < r * r) blocked[idx(cx, cy)] = 1;
          }
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
    const fake = {
      map,
      buildings: [],
      slots: map.slots.map(sl => ({ id: sl.id, x: sl.x, y: sl.y, buildingId: 'x', rubble: false }))
    };
    for (const sl of map.slots) {
      fake.buildings.push({ alive: true, x: sl.x, y: sl.y, typeId: 'barricade' });
    }
    const p = build(fake);

    let maxDetour = 0;
    let ok = true;
    const problems = [];

    for (const sp of map.spawns) {
      if (ZG.Geom.pointInDeploy(sp.x, sp.y, map.deploy)) {
        ok = false;
        problems.push('spawn inside deploy');
      }
      const c = cellOf(sp.x, sp.y);
      let d = p.dist[c.i];
      if (d === INF) {
        const nr = nearestReachable(p, sp.x, sp.y);
        const nc = cellOf(nr.x, nr.y);
        d = p.dist[nc.i];
      }
      const near = nearestDeployPoint(map, sp.x, sp.y);
      const straight = Math.max(1, ZG.Geom.dist(sp.x, sp.y, near.x, near.y));
      const len = d === INF ? Infinity : d * CELL;
      const ratio = len / straight;
      if (!isFinite(ratio)) { ok = false; problems.push('unreachable spawn ' + sp.x + ',' + sp.y); }
      else maxDetour = Math.max(maxDetour, ratio);
    }

    // 部署区容量（80 人 + 4 英雄 + 15 转化兵的最小估算）
    let deployArea = 0;
    if (map.deploy.kind === 'rect') deployArea = map.deploy.w * map.deploy.h;
    else deployArea = Math.PI * map.deploy.r * map.deploy.r;
    const needArea = 99 * Math.PI * 12 * 12 * 1.2;
    if (deployArea < needArea) { ok = false; problems.push('deploy too small'); }

    // 绕行上限
    if (maxDetour > 1.35) {
      // 记录但不直接判死；由调用方决定
      problems.push('detour ' + maxDetour.toFixed(2));
    }

    return { ok, maxDetour, problems, detourOk: maxDetour <= 1.35 };
  }

  ZG.Pathing = { build, directionAt, nearestReachable, nearestDeployPoint, pathToTarget, validate };
})();
