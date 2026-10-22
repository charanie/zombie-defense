/* 科技树纯函数布局：不读 DOM、不读全局状态 */
(function () {
  'use strict';
  const ZG = globalThis.ZG = globalThis.ZG || {};

  const DEFAULTS = {
    direction: 'vertical',
    nodeW: 118, nodeH: 66, gap: 8, tierGap: 40, pad: 12, cols: 2
  };

  function compute(branch, opts) {
    const o = Object.assign({}, DEFAULTS, opts || {});
    const tiers = branch.tiers || [];
    const horizontal = o.direction === 'horizontal';
    const nodes = {};
    const tierBoxes = [];
    const links = [];

    if (!horizontal) {
      const cols = Math.max(1, o.cols || 2);
      let y = o.pad;
      let maxW = 0;
      for (let t = 0; t < tiers.length; t++) {
        const ids = tiers[t];
        const rows = Math.max(1, Math.ceil(ids.length / cols));
        const h = rows * o.nodeH + (rows - 1) * o.gap;
        const w = Math.min(ids.length, cols) * o.nodeW +
          (Math.min(ids.length, cols) - 1) * o.gap;
        maxW = Math.max(maxW, w);
        tierBoxes.push({ tier: t + 1, x: o.pad, y, w, h });
        for (let i = 0; i < ids.length; i++) {
          const col = i % cols;
          const row = Math.floor(i / cols);
          nodes[ids[i]] = {
            x: o.pad + col * (o.nodeW + o.gap),
            y: y + row * (o.nodeH + o.gap),
            w: o.nodeW, h: o.nodeH
          };
        }
        y += h + o.tierGap;
      }
      const width = o.pad * 2 + maxW;
      const height = Math.max(o.pad * 2 + o.nodeH, y - o.tierGap + o.pad);
      for (let t = 0; t < tiers.length - 1; t++) {
        const from = tierBoxes[t];
        const fx = from.x + from.w / 2;
        const fy = from.y + from.h;
        const midY = fy + o.tierGap / 2;
        for (const id of tiers[t + 1]) {
          const n = nodes[id];
          if (!n) continue;
          const nx = n.x + n.w / 2;
          links.push({
            fromTier: t + 1, toNode: id,
            d: 'M ' + fx + ' ' + fy + ' V ' + midY + ' H ' + nx + ' V ' + n.y
          });
        }
      }
      return { width, height, tiers: tierBoxes, nodes, links };
    }

    // 横向：层从左到右，层内节点纵向堆叠
    let x = o.pad;
    let maxH = 0;
    for (let t = 0; t < tiers.length; t++) {
      const ids = tiers[t];
      const h = Math.max(1, ids.length) * o.nodeH +
        (Math.max(1, ids.length) - 1) * o.gap;
      maxH = Math.max(maxH, h);
      tierBoxes.push({ tier: t + 1, x, y: o.pad, w: o.nodeW, h });
      for (let i = 0; i < ids.length; i++) {
        nodes[ids[i]] = {
          x,
          y: o.pad + i * (o.nodeH + o.gap),
          w: o.nodeW, h: o.nodeH
        };
      }
      x += o.nodeW + o.tierGap;
    }
    const width = Math.max(o.pad * 2 + o.nodeW, x - o.tierGap + o.pad);
    const height = o.pad * 2 + maxH;
    for (let t = 0; t < tiers.length - 1; t++) {
      const from = tierBoxes[t];
      const fx = from.x + from.w;
      const fy = from.y + from.h / 2;
      const midX = fx + o.tierGap / 2;
      for (const id of tiers[t + 1]) {
        const n = nodes[id];
        if (!n) continue;
        const ny = n.y + n.h / 2;
        links.push({
          fromTier: t + 1, toNode: id,
          d: 'M ' + fx + ' ' + fy + ' H ' + midX + ' V ' + ny + ' H ' + n.x
        });
      }
    }
    return { width, height, tiers: tierBoxes, nodes, links };
  }

  ZG.TechLayout = { compute, DEFAULTS };
})();
