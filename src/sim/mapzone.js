/* ZG.MapZone — 活动区（zones）判定、最近合法点、区域遮罩。
 * 地图没有 zones 时全部回退到世界矩形，保持 v1.4 行为。 */
(function () {
  'use strict';
  const ZG = globalThis.ZG = globalThis.ZG || {};

  function zonesOf(map) {
    return (map && Array.isArray(map.zones) && map.zones.length) ? map.zones : null;
  }

  function has(map) { return !!zonesOf(map); }

  // 矩形并集，半开区间 [x, x+w) / [y, y+h)，相邻矩形在边界首尾相接不重叠。
  function contains(map, x, y) {
    const zs = zonesOf(map);
    if (!zs) return x >= 0 && y >= 0 && x < ZG.Const.W && y < ZG.Const.H;
    for (let i = 0; i < zs.length; i++) {
      const z = zs[i];
      if (x >= z.x && x < z.x + z.w && y >= z.y && y < z.y + z.h) return true;
    }
    return false;
  }

  // 圆心 + 8 方位采样；圆允许跨相邻矩形，但不允许伸到区域外。
  function containsCircle(map, x, y, r) {
    if (!contains(map, x, y)) return false;
    const rad = r || 0;
    if (rad <= 0) return true;
    // 采样半径留 0.5px 容差：圆刚好与区域边界相切（闭包内）时不应被判为越界，
    // 否则僵尸会卡在通道拐角反复被 clamp 推回。
    const sr = Math.max(0, rad - 0.5);
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4;
      if (!contains(map, x + Math.cos(a) * sr, y + Math.sin(a) * sr)) return false;
    }
    return true;
  }

  // 投影到最近矩形的内缩边界（不搜索路径）；调用方随后再查障碍。
  // 圆跨相邻矩形（如通道 x=1000 接缝）时允许原样通过，否则按单个矩形内缩会在
  // 接缝处留下 2r 的不可通行缝隙。
  function clamp(map, x, y, r) {
    const zs = zonesOf(map);
    if (!zs) return ZG.Geom.clampToWorld(x, y, r);
    const rad = r || 0;
    if (containsCircle(map, x, y, rad)) return { x, y };

    // 轴向滑动：优先只回退一个轴（通常是撞到通道边），避免在接缝处把单位
    // 沿另一轴整段拉回、来回振荡。
    let slide = null, slideD = Infinity;
    for (let i = 0; i < zs.length; i++) {
      const z = zs[i];
      const minX = z.x + rad, maxX = z.x + z.w - rad;
      const minY = z.y + rad, maxY = z.y + z.h - rad;
      if (x >= minX && x <= maxX) {
        const cy = minY > maxY ? z.y + z.h / 2 : Math.max(minY, Math.min(maxY, y));
        if (cy !== y && containsCircle(map, x, cy, rad)) {
          const d = Math.abs(cy - y);
          if (d < slideD) { slideD = d; slide = { x, y: cy }; }
        }
      }
      if (y >= minY && y <= maxY) {
        const cx = minX > maxX ? z.x + z.w / 2 : Math.max(minX, Math.min(maxX, x));
        if (cx !== x && containsCircle(map, cx, y, rad)) {
          const d = Math.abs(cx - x);
          if (d < slideD) { slideD = d; slide = { x: cx, y }; }
        }
      }
    }
    if (slide) return slide;

    let best = null, bestD = Infinity;
    for (let i = 0; i < zs.length; i++) {
      const z = zs[i];
      const minX = z.x + rad, maxX = z.x + z.w - rad;
      const minY = z.y + rad, maxY = z.y + z.h - rad;
      const cx = minX > maxX ? z.x + z.w / 2 : Math.max(minX, Math.min(maxX, x));
      const cy = minY > maxY ? z.y + z.h / 2 : Math.max(minY, Math.min(maxY, y));
      const dx = cx - x, dy = cy - y;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = { x: cx, y: cy }; }
    }
    return best || ZG.Geom.clampToWorld(x, y, r);
  }

  // 面积最大矩形的中心；并列取数组靠前者。U 形并集的质心不可用。
  function center(map) {
    const zs = zonesOf(map);
    if (!zs) return { x: ZG.Const.W / 2, y: ZG.Const.H / 2 };
    let best = zs[0];
    let bestArea = best.w * best.h;
    for (let i = 1; i < zs.length; i++) {
      const a = zs[i].w * zs[i].h;
      if (a > bestArea) { bestArea = a; best = zs[i]; }
    }
    return { x: best.x + best.w / 2, y: best.y + best.h / 2 };
  }

  // 1 = 可走；按格子中心取样。只在 has(map) 时被 Pathing 使用。
  function mask(state) {
    const cols = ZG.Const.GRID_COLS;
    const rows = ZG.Const.GRID_ROWS;
    const cell = ZG.Const.GRID;
    const half = cell / 2;
    const map = state.map;
    const out = new Uint8Array(cols * rows);
    for (let cy = 0; cy < rows; cy++) {
      for (let cx = 0; cx < cols; cx++) {
        out[cy * cols + cx] = contains(map, cx * cell + half, cy * cell + half) ? 1 : 0;
      }
    }
    return out;
  }

  ZG.MapZone = { has, contains, containsCircle, clamp, center, mask };
})();
