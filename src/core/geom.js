/* 几何工具：距离、角度、锥形、部署区 */
(function () {
  'use strict';
  const ZG = globalThis.ZG = globalThis.ZG || {};

  const TAU = Math.PI * 2;

  function dist(ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    return Math.sqrt(dx * dx + dy * dy);
  }
  function dist2(ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    return dx * dx + dy * dy;
  }
  function angle(ax, ay, bx, by) {
    return Math.atan2(by - ay, bx - ax);
  }
  function angleDiff(a, b) {
    let d = (a - b) % TAU;
    if (d > Math.PI) d -= TAU;
    if (d < -Math.PI) d += TAU;
    return d;
  }
  function inCone(cx, cy, facing, x, y, range, halfAngleDeg) {
    const dx = x - cx, dy = y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 > range * range) return false;
    if (d2 < 1e-9) return true;
    const a = Math.atan2(dy, dx);
    const half = (halfAngleDeg * Math.PI) / 180;
    return Math.abs(angleDiff(a, facing)) <= half;
  }
  function circleOverlapsCircle(ax, ay, ar, bx, by, br, gap) {
    const g = gap || 0;
    const r = ar + br + g;
    return dist2(ax, ay, bx, by) < r * r;
  }
  function circleOverlapsRect(cx, cy, r, rx, ry, rw, rh, gap) {
    const g = gap || 0;
    const nx = Math.max(rx, Math.min(rx + rw, cx));
    const ny = Math.max(ry, Math.min(ry + rh, cy));
    return dist2(cx, cy, nx, ny) < (r + g) * (r + g);
  }
  function rectOverlapsRect(ax, ay, aw, ah, bx, by, bw, bh, gap) {
    const g = gap || 0;
    return ax < bx + bw + g && ax + aw + g > bx &&
           ay < by + bh + g && ay + ah + g > by;
  }
  function distPointToRect(x, y, rx, ry, rw, rh) {
    const nx = Math.max(rx, Math.min(rx + rw, x));
    const ny = Math.max(ry, Math.min(ry + rh, y));
    return dist(x, y, nx, ny);
  }
  function segmentCircleT(x1, y1, x2, y2, cx, cy, r) {
    const dx = x2 - x1, dy = y2 - y1;
    const fx = x1 - cx, fy = y1 - cy;
    const a = dx * dx + dy * dy;
    if (a < 1e-12) return (fx * fx + fy * fy <= r * r) ? 0 : null;
    const b = 2 * (fx * dx + fy * dy);
    const c = fx * fx + fy * fy - r * r;
    const disc = b * b - 4 * a * c;
    if (disc < 0) return null;
    const s = Math.sqrt(disc);
    const t1 = (-b - s) / (2 * a);
    const t2 = (-b + s) / (2 * a);
    if (t1 >= 0 && t1 <= 1) return t1;
    if (t2 >= 0 && t2 <= 1) return t2;
    return null;
  }
  function clampToWorld(x, y, radius) {
    const m = (radius || 0) + 4;
    return {
      x: Math.max(m, Math.min(ZG.Const.W - m, x)),
      y: Math.max(m, Math.min(ZG.Const.H - m, y))
    };
  }
  function humanCentroid(state) {
    let sx = 0, sy = 0, n = 0;
    for (const h of state.humans) {
      if (!h.alive) continue;
      sx += h.x; sy += h.y; n++;
    }
    return n ? { x: sx / n, y: sy / n } : null;
  }
  function rectOfCenter(x, y, w, h) {
    return { x: x - w / 2, y: y - h / 2, w, h };
  }
  function rectOfBuilding(b) {
    if (b.shape === 'rect') return rectOfCenter(b.x, b.y, b.w, b.h);
    return rectOfCenter(b.x, b.y, (b.radius || 24) * 2, (b.radius || 24) * 2);
  }
  function isBlockedAt(state, x, y, radius) {
    const r = radius || 0;
    const map = state.map;
    if (map && map.obstacles) {
      for (const ob of map.obstacles) {
        if (ob.kind === 'rect') {
          if (circleOverlapsRect(x, y, r, ob.x, ob.y, ob.w, ob.h, 0)) return true;
        } else if (circleOverlapsCircle(x, y, r, ob.x, ob.y, ob.r, 0)) {
          return true;
        }
      }
    }
    for (const b of state.buildings || []) {
      if (!b.alive) continue;
      const data = ZG.Data.buildings[b.typeId];
      if (data && data.blocks === false) continue;
      if (b.shape === 'rect') {
        const br = rectOfBuilding(b);
        if (circleOverlapsRect(x, y, r, br.x, br.y, br.w, br.h, 0)) return true;
      } else if (circleOverlapsCircle(x, y, r, b.x, b.y, b.radius || 24, 0)) {
        return true;
      }
    }
    return false;
  }
  function pointInRect(x, y, r) {
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }
  function pointInCircle(x, y, c) {
    return dist2(x, y, c.x, c.y) <= c.r * c.r;
  }
  ZG.Geom = {
    TAU, dist, dist2, angle, angleDiff, inCone,
    circleOverlapsCircle, circleOverlapsRect, rectOverlapsRect,
    distPointToRect, segmentCircleT, clampToWorld, humanCentroid,
    rectOfCenter, rectOfBuilding, isBlockedAt,
    pointInRect, pointInCircle
  };
})();
