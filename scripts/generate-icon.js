'use strict';

/**
 * 纯 Node 生成应用图标（256x256）与托盘图标（32x32），不依赖任何第三方库。
 * 运行：node scripts/generate-icon.js
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

/* ---------------- PNG 编码 ---------------- */

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePNG(w, h, rgba) {
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;  // 位深
  ihdr[9] = 6;  // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

/* ---------------- 简易画布 ---------------- */

class Canvas {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.buf = Buffer.alloc(w * h * 4);
  }

  pixel(x, y, color) {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    const [r, g, b, a = 255] = color;
    const sa = a / 255;
    const da = this.buf[i + 3] / 255;
    const outA = sa + da * (1 - sa);
    if (outA === 0) return;
    this.buf[i] = Math.round((r * sa + this.buf[i] * da * (1 - sa)) / outA);
    this.buf[i + 1] = Math.round((g * sa + this.buf[i + 1] * da * (1 - sa)) / outA);
    this.buf[i + 2] = Math.round((b * sa + this.buf[i + 2] * da * (1 - sa)) / outA);
    this.buf[i + 3] = Math.round(outA * 255);
  }

  rect(x0, y0, x1, y1, color) {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) this.pixel(x, y, color);
  }

  roundRect(x0, y0, x1, y1, r, color) {
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const dx = Math.max(x0 + r - x, 0, x - (x1 - 1 - r));
        const dy = Math.max(y0 + r - y, 0, y - (y1 - 1 - r));
        if (dx * dx + dy * dy <= r * r) this.pixel(x, y, color);
      }
    }
  }

  glyph(pattern, x0, y0, scale, color) {
    for (let row = 0; row < pattern.length; row++) {
      for (let col = 0; col < pattern[row].length; col++) {
        if (pattern[row][col] === '1') {
          this.rect(x0 + col * scale, y0 + row * scale,
            x0 + (col + 1) * scale, y0 + (row + 1) * scale, color);
        }
      }
    }
  }
}

/* 5x7 点阵数字 */
const FONT = {
  '0': ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100']
};

/* ---------------- 256 应用图标 ---------------- */

function buildAppIcon() {
  const S = 256;
  const c = new Canvas(S, S);

  const ACCENT = [79, 107, 237];
  const ACCENT_DARK = [64, 84, 214];
  const RED = [229, 72, 77];
  const INK = [43, 47, 66];
  const LINE = [231, 234, 243];

  // 蓝色圆角底（轻微纵向渐变）
  for (let y = 0; y < S; y++) {
    const t = y / S;
    const color = [
      Math.round(ACCENT[0] + (ACCENT_DARK[0] - ACCENT[0]) * t),
      Math.round(ACCENT[1] + (ACCENT_DARK[1] - ACCENT[1]) * t),
      Math.round(ACCENT[2] + (ACCENT_DARK[2] - ACCENT[2]) * t)
    ];
    // 圆角 alpha 蒙版
    const r = 52;
    for (let x = 0; x < S; x++) {
      const dx = Math.max(r - x, 0, x - (S - 1 - r));
      const dy = Math.max(r - y, 0, y - (S - 1 - r));
      if (dx * dx + dy * dy <= r * r) c.pixel(x, y, color);
    }
  }

  // 白色日历卡片
  c.roundRect(34, 58, 222, 224, 20, [255, 255, 255]);

  // 两个红色装订环（突出卡片顶部）
  c.roundRect(80, 40, 94, 74, 7, RED);
  c.roundRect(162, 40, 176, 74, 7, RED);

  // 卡片头部区域 + 分隔线（重新覆盖，使环像从孔里穿出）
  c.rect(54, 74, 202, 106, [255, 255, 255]);
  c.rect(54, 106, 202, 110, LINE);

  // 日期数字 17
  const scale = 9;
  const gap = 6;
  const digits = '17';
  const totalW = digits.length * 5 * scale + (digits.length - 1) * gap;
  let dx = Math.round((S - totalW) / 2);
  const dy = 132;
  for (const ch of digits) {
    c.glyph(FONT[ch], dx, dy, scale, INK);
    dx += 5 * scale + gap;
  }

  return encodePNG(S, S, c.buf);
}

/* ---------------- 32 托盘图标 ---------------- */

function buildTrayIcon() {
  const S = 32;
  const c = new Canvas(S, S);
  // 蓝色圆角底
  c.roundRect(1, 1, 31, 31, 8, [79, 107, 237]);
  // 白色卡片
  c.roundRect(7, 10, 25, 26, 3, [255, 255, 255]);
  // 红环
  c.rect(11, 7, 13, 12, [229, 72, 77]);
  c.rect(19, 7, 21, 12, [229, 72, 77]);
  c.rect(7, 10, 25, 15, [255, 255, 255]);
  // 分隔线
  c.rect(9, 15, 23, 16, [231, 234, 243]);
  return encodePNG(S, S, c.buf);
}

/* ---------------- 输出 ---------------- */

const outDir = path.join(__dirname, '..', 'assets');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'icon.png'), buildAppIcon());
fs.writeFileSync(path.join(outDir, 'tray-icon.png'), buildTrayIcon());
console.log('图标已生成到 assets/ (icon.png 256x256, tray-icon.png 32x32)');
