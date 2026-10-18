/* 生成 PWA 图标与 OG 图（纯 Node，无依赖） */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

function crc32(buf) {
  let c, crc = 0xFFFFFFFF;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xFF;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePNG(w, h, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

function makeCanvas(w, h) {
  const data = Buffer.alloc(w * h * 4);
  const api = {
    w, h, data,
    set(x, y, r, g, b, a) {
      if (x < 0 || y < 0 || x >= w || y >= h) return;
      const i = (y * w + x) * 4;
      const sa = (a === undefined ? 255 : a) / 255;
      data[i] = Math.round(data[i] * (1 - sa) + r * sa);
      data[i + 1] = Math.round(data[i + 1] * (1 - sa) + g * sa);
      data[i + 2] = Math.round(data[i + 2] * (1 - sa) + b * sa);
      data[i + 3] = Math.max(data[i + 3], Math.round(255 * sa));
    },
    fill(r, g, b, a) {
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) api.set(x, y, r, g, b, a);
    },
    circle(cx, cy, rad, r, g, b, a) {
      const r2 = rad * rad;
      const x0 = Math.max(0, Math.floor(cx - rad)), x1 = Math.min(w - 1, Math.ceil(cx + rad));
      const y0 = Math.max(0, Math.floor(cy - rad)), y1 = Math.min(h - 1, Math.ceil(cy + rad));
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const dx = x - cx, dy = y - cy;
          if (dx * dx + dy * dy <= r2) api.set(x, y, r, g, b, a);
        }
      }
    },
    ring(cx, cy, rad, width, r, g, b, a) {
      const ro = rad + width / 2, ri = rad - width / 2;
      const x0 = Math.max(0, Math.floor(cx - ro)), x1 = Math.min(w - 1, Math.ceil(cx + ro));
      const y0 = Math.max(0, Math.floor(cy - ro)), y1 = Math.min(h - 1, Math.ceil(cy + ro));
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const d = Math.hypot(x - cx, y - cy);
          if (d <= ro && d >= ri) api.set(x, y, r, g, b, a);
        }
      }
    },
    rect(x0, y0, rw, rh, r, g, b, a) {
      for (let y = Math.max(0, y0); y < Math.min(h, y0 + rh); y++) {
        for (let x = Math.max(0, x0); x < Math.min(w, x0 + rw); x++) api.set(x, y, r, g, b, a);
      }
    },
    gradient() {
      // 径向渐变背景
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const dx = (x - w / 2) / w, dy = (y - h / 2) / h;
          const d = Math.min(1, Math.sqrt(dx * dx + dy * dy) * 1.7);
          api.set(x, y,
            Math.round(8 + 16 * (1 - d)),
            Math.round(13 + 26 * (1 - d)),
            Math.round(22 + 42 * (1 - d)), 255);
        }
      }
    }
  };
  return api;
}

function drawEmblem(c, w, h, scale) {
  const cx = w / 2, cy = h / 2;
  const R = Math.min(w, h) * 0.30 * scale;
  // 外圈青色光环
  c.ring(cx, cy, R * 1.34, R * 0.055, 79, 195, 247, 210);
  c.ring(cx, cy, R * 1.55, R * 0.02, 79, 195, 247, 90);
  // 僵尸头
  c.circle(cx, cy, R, 124, 179, 66, 255);
  c.circle(cx, cy - R * 0.02, R * 0.92, 139, 195, 74, 255);
  // 眼窝
  c.circle(cx - R * 0.34, cy - R * 0.12, R * 0.17, 24, 32, 22, 255);
  c.circle(cx + R * 0.34, cy - R * 0.12, R * 0.17, 24, 32, 22, 255);
  c.circle(cx - R * 0.34, cy - R * 0.12, R * 0.075, 229, 57, 53, 255);
  c.circle(cx + R * 0.34, cy - R * 0.12, R * 0.075, 229, 57, 53, 255);
  // 嘴与牙
  c.rect(cx - R * 0.38, cy + R * 0.34, R * 0.76, R * 0.16, 24, 32, 22, 255);
  for (let i = -2; i <= 2; i++) {
    c.rect(cx + i * R * 0.15 - R * 0.03, cy + R * 0.34, R * 0.06, R * 0.16, 220, 230, 200, 255);
  }
  // 人类小队：三枚小圆
  const smalls = [
    [cx - R * 1.15, cy + R * 0.95, 79, 195, 247],
    [cx, cy + R * 1.15, 144, 164, 174],
    [cx + R * 1.15, cy + R * 0.95, 240, 98, 146]
  ];
  for (const [x, y, r, g, b] of smalls) {
    c.circle(x, y, R * 0.16, r, g, b, 255);
    c.ring(x, y, R * 0.16, R * 0.035, 8, 14, 22, 255);
  }
}

function makeIcon(size, maskable) {
  const c = makeCanvas(size, size);
  c.gradient();
  if (maskable) {
    // maskable 安全区：内容缩到 78%
    const inner = makeCanvas(size, size);
    inner.gradient();
    drawEmblem(inner, size, size, 0.72);
    c.gradient();
    const off = Math.round(size * 0.14);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        c.data[i] = inner.data[i];
        c.data[i + 1] = inner.data[i + 1];
        c.data[i + 2] = inner.data[i + 2];
        c.data[i + 3] = 255;
      }
    }
  } else {
    drawEmblem(c, size, size, 1);
    c.rect(0, 0, size, Math.round(size * 0.035), 79, 195, 247, 60);
    c.rect(0, size - Math.round(size * 0.035), size, Math.round(size * 0.035), 124, 179, 66, 60);
  }
  return encodePNG(size, size, c.data);
}

function makeOG() {
  const w = 1200, h = 630;
  const c = makeCanvas(w, h);
  c.gradient();
  // 网格
  for (let x = 0; x < w; x += 48) c.rect(x, 0, 1, h, 34, 48, 74, 70);
  for (let y = 0; y < h; y += 48) c.rect(0, y, w, 1, 34, 48, 74, 70);
  // 放射性光
  for (let i = 0; i < 200; i++) {
    const a = (i / 200) * Math.PI * 2;
    const len = 220 + (i % 5) * 24;
    for (let d = 0; d < len; d += 3) {
      const x = Math.round(w / 2 + Math.cos(a) * d);
      const y = Math.round(h / 2 + Math.sin(a) * d * 0.6);
      c.set(x, y, 30, 55, 88, 18);
    }
  }
  // 左侧标题用几何块模拟（真实文字由 HTML/OG 生成器另行覆盖）
  drawEmblem(c, 410, 380, 1.0);
  // 右侧装饰：一圈僵尸与人类
  const colors = [[124, 179, 66], [192, 202, 51], [229, 57, 53], [142, 36, 170], [51, 105, 30]];
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2;
    const rr = 190 + (i % 4) * 26;
    const x = Math.round(850 + Math.cos(a) * rr);
    const y = Math.round(315 + Math.sin(a) * rr * 0.55);
    const col = colors[i % colors.length];
    c.circle(x, y, 12 + (i % 3) * 3, col[0], col[1], col[2], 235);
  }
  for (let i = 0; i < 12; i++) {
    const x = 790 + (i % 6) * 40;
    const y = 300 + Math.floor(i / 6) * 44;
    const col = [[79, 195, 247], [255, 183, 77], [129, 199, 132], [240, 98, 146]][i % 4];
    c.circle(x, y, 10, col[0], col[1], col[2], 240);
    c.ring(x, y, 10, 2, 8, 14, 22, 200);
  }
  return encodePNG(w, h, c.data);
}

const outDir = path.join(__dirname, '..', 'icons');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'icon-192.png'), makeIcon(192, false));
fs.writeFileSync(path.join(outDir, 'icon-512.png'), makeIcon(512, false));
fs.writeFileSync(path.join(outDir, 'icon-maskable-512.png'), makeIcon(512, true));
fs.writeFileSync(path.join(outDir, 'og.png'), makeOG());
console.log('icons written to', outDir);
