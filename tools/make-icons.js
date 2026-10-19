// Draws the app icons (icons/icon-192.png, icon-512.png, icon-maskable-512.png).
// Usage: node tools/make-icons.js   — replace the PNGs with your own art any time.
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = buf => { let c = -1; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w, h, px) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; px.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const C = { navy: hex('#142b38'), sky: hex('#ffb27a'), sky2: hex('#ffd9a8'), sun: hex('#ffd24a'), sea: hex('#086f9c'), sea2: hex('#28c7c4'), foam: hex('#f2fffd'), wood: hex('#9a6b43'), plank: hex('#c48a52'), rust: hex('#c95b3c'), red: hex('#b93b46'), ink: hex('#0b1820'), teal: hex('#4a9a8e'), canvas: hex('#f1e6cc') };

// shapes in a 0..1 square (y down)
function scene(u, v) {
  // sky gradient + sun
  let col = v < 0.62 ? mix(C.sky2, C.sky, v / 0.62) : null;
  if (v < 0.62 && Math.hypot(u - 0.68, v - 0.36) < 0.16) col = C.sun;
  // tower: legs, cabin, roof, flag
  const tx = 0.38;
  if (v > 0.3 && v < 0.6 && (Math.abs(u - (tx - 0.09 + (v - 0.3) * -0.08)) < 0.018 || Math.abs(u - (tx + 0.09 + (v - 0.3) * 0.08)) < 0.018)) col = C.wood;
  if (v > 0.42 && v < 0.445 && Math.abs(u - tx) < 0.11) col = C.wood;
  if (v > 0.2 && v < 0.31 && Math.abs(u - tx) < 0.11) col = C.teal;
  if (v > 0.23 && v < 0.28 && Math.abs(u - tx) < 0.06) col = C.sun;
  if (v > 0.12 && v <= 0.2 && Math.abs(u - tx) < 0.14 * (v - 0.12) / 0.08) col = C.red;
  if (v > 0.03 && v < 0.12 && Math.abs(u - (tx + 0.002)) < 0.008) col = C.ink;
  if (v > 0.035 && v < 0.08 && u > tx && u < tx + 0.09) col = C.sea2;
  // house
  if (v > 0.44 && v < 0.6 && u > 0.55 && u < 0.78) col = C.rust;
  if (v > 0.36 && v <= 0.44 && Math.abs(u - 0.665) < 0.14 * (v - 0.36) / 0.08) col = C.canvas;
  if (v > 0.5 && v < 0.58 && u > 0.62 && u < 0.68) col = C.sun;
  // deck
  if (v >= 0.6 && v < 0.66 && u > 0.14 && u < 0.86) col = (Math.floor(u * 30) % 2) ? C.plank : C.wood;
  // sea with waves
  if (!col || v >= 0.66) {
    if (v >= 0.62) {
      const w = 0.012 * Math.sin(u * 28 + v * 9);
      col = mix(C.sea2, C.sea, Math.min(1, (v - 0.62) / 0.38));
      for (const wy of [0.7, 0.8, 0.9]) if (Math.abs(v - wy - w) < 0.012 && Math.sin(u * 9 + wy * 30) > -0.2) col = C.foam;
    }
  }
  return col || C.sky;
}
function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

function draw(size, maskable) {
  const px = Buffer.alloc(size * size * 4);
  const ss = 3; // supersampling
  const pad = maskable ? 0.12 : 0.04, rad = maskable ? 0 : 0.2;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
      const fx = (x + (sx + 0.5) / ss) / size, fy = (y + (sy + 0.5) / ss) / size;
      // rounded square mask (full bleed for maskable)
      let inside = true;
      if (!maskable) {
        const qx = Math.max(Math.abs(fx - 0.5) - (0.5 - rad), 0), qy = Math.max(Math.abs(fy - 0.5) - (0.5 - rad), 0);
        inside = Math.hypot(qx, qy) <= rad;
      }
      if (!inside) continue;
      // inner art area with a border
      const u = (fx - pad) / (1 - pad * 2), v = (fy - pad) / (1 - pad * 2);
      let col;
      if (u < 0 || u > 1 || v < 0 || v > 1) col = C.navy;
      else col = scene(u, v);
      r += col[0]; g += col[1]; b += col[2]; a += 255;
    }
    const n = ss * ss, i = (y * size + x) * 4;
    const cov = a / 255;
    px[i] = cov ? r / cov : 0; px[i + 1] = cov ? g / cov : 0; px[i + 2] = cov ? b / cov : 0; px[i + 3] = a / n;
  }
  return png(size, size, px);
}
const out = path.join(__dirname, '..', 'icons');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'icon-192.png'), draw(192, false));
fs.writeFileSync(path.join(out, 'icon-512.png'), draw(512, false));
fs.writeFileSync(path.join(out, 'icon-maskable-512.png'), draw(512, true));
console.log('icons written to', out);
