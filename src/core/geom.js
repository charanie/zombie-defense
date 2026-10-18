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
  function pointInRect(x, y, r) {
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }
  function pointInCircle(x, y, c) {
    return dist2(x, y, c.x, c.y) <= c.r * c.r;
  }
  function pointInDeploy(x, y, deploy) {
    if (!deploy) return false;
    if (deploy.kind === 'rect') return pointInRect(x, y, deploy);
    if (deploy.kind === 'circle') return pointInCircle(x, y, deploy);
    return false;
  }
  function deployCenter(deploy) {
    if (deploy.kind === 'rect') return { x: deploy.x + deploy.w / 2, y: deploy.y + deploy.h / 2 };
    return { x: deploy.x, y: deploy.y };
  }
  function clampPoint(x, y, deploy, pad) {
    const p = pad || 0;
    if (deploy.kind === 'rect') {
      return {
        x: Math.max(deploy.x + p, Math.min(deploy.x + deploy.w - p, x)),
        y: Math.max(deploy.y + p, Math.min(deploy.y + deploy.h - p, y))
      };
    }
    const dx = x - deploy.x, dy = y - deploy.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    const max = Math.max(0, deploy.r - p);
    if (d <= max || d < 1e-9) return { x, y };
    return { x: deploy.x + (dx / d) * max, y: deploy.y + (dy / d) * max };
  }
  function clampToDeploy(x, y, deploy) {
    return clampPoint(x, y, deploy, 0);
  }

  ZG.Geom = {
    TAU, dist, dist2, angle, angleDiff, inCone,
    circleOverlapsCircle, pointInRect, pointInCircle,
    pointInDeploy, deployCenter, clampPoint, clampToDeploy
  };
})();
