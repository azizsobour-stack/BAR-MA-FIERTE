import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

function createCrcTable() {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }
  return table;
}

const crcTable = createCrcTable();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writePng(width, height, getPixelRgba) {
  const rowLength = width * 4;
  const rawData = Buffer.alloc(height * (rowLength + 1));

  let offset = 0;
  for (let y = 0; y < height; y++) {
    rawData[offset++] = 0; // Filter byte: None
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = getPixelRgba(x, y, width, height);
      rawData[offset++] = r;
      rawData[offset++] = g;
      rawData[offset++] = b;
      rawData[offset++] = a;
    }
  }

  const compressed = zlib.deflateSync(rawData);

  // PNG Signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // color type RGBA
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace

  const ihdrChunk = createChunk('IHDR', ihdrData);
  const idatChunk = createChunk('IDAT', compressed);
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function createChunk(type, data) {
  const len = data.length;
  const chunk = Buffer.alloc(8 + len + 4);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);
  const typeAndData = chunk.subarray(4, 8 + len);
  const crc = crc32(typeAndData);
  chunk.writeUInt32BE(crc, 8 + len);
  return chunk;
}

// Pixel shader for Bar La Fierté icon
function renderBarFierteIcon(x, y, W, H, isMaskable = false) {
  const cx = W / 2;
  const cy = H / 2;
  const dx = x - cx;
  const dy = y - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);

  // Rounded squircle radius
  const maxDim = Math.min(W, H);
  const cornerRadius = isMaskable ? 0 : maxDim * 0.22;

  // Maskable uses full bleed, standard icon uses rounded rect
  let inBounds = true;
  if (!isMaskable) {
    const rx = Math.max(0, Math.abs(dx) - (W / 2 - cornerRadius));
    const ry = Math.max(0, Math.abs(dy) - (H / 2 - cornerRadius));
    if (rx * rx + ry * ry > cornerRadius * cornerRadius) {
      inBounds = false;
    }
  }

  if (!inBounds) {
    return [0, 0, 0, 0];
  }

  // Base terracotta gradient: #c2410c (194, 65, 12) to #7c2d12 (124, 45, 18)
  const tGrad = (x + y) / (W + H);
  let r = Math.round(194 * (1 - tGrad) + 124 * tGrad);
  let g = Math.round(65 * (1 - tGrad) + 45 * tGrad);
  let b = Math.round(12 * (1 - tGrad) + 18 * tGrad);
  let a = 255;

  // Outer gold accent ring
  const outerRingR = maxDim * 0.40;
  if (Math.abs(dist - outerRingR) < maxDim * 0.008) {
    return [251, 191, 36, 255]; // Gold #fbbf24
  }

  // Inner plate dish (dark circle #261b13)
  const plateR = maxDim * 0.35;
  if (dist <= plateR) {
    // Gold plate rim
    if (dist >= plateR - maxDim * 0.015) {
      return [251, 191, 36, 255];
    }
    // Dark dish background
    r = 38;
    g = 27;
    b = 19;

    // Central Flame (Braise & grillades togolaises)
    const flameY = cy - maxDim * 0.08;
    const flameDx = dx;
    const flameDy = y - flameY;
    const flameDist = Math.sqrt(flameDx * flameDx + flameDy * flameDy);
    const flameRadius = maxDim * 0.14;

    if (flameDist < flameRadius && (flameDy + Math.abs(flameDx) * 0.6) < flameRadius) {
      // Flame gradient (orange to bright yellow)
      const fT = (y - (flameY - flameRadius)) / (flameRadius * 2);
      if (flameDist < flameRadius * 0.5) {
        return [254, 240, 138, 255]; // Inner bright yellow #fef08a
      }
      return [249, 115, 22, 255]; // Orange flame #f97316
    }

    // Crossed Fork & Knife / Grill Base
    const grillY = cy + maxDim * 0.08;
    if (Math.abs(y - grillY) < maxDim * 0.012 && Math.abs(dx) < maxDim * 0.20) {
      return [251, 191, 36, 255]; // Gold grill base line
    }

    // Utensils lines
    const forkDx = dx + maxDim * 0.09;
    const forkDy = y - (cy + maxDim * 0.05);
    if (Math.abs(forkDx * 0.8 + forkDy * 0.6) < maxDim * 0.014 && Math.abs(dx) < maxDim * 0.16) {
      return [250, 246, 240, 240]; // White utensil #faf6f0
    }

    const knifeDx = dx - maxDim * 0.09;
    const knifeDy = y - (cy + maxDim * 0.05);
    if (Math.abs(-knifeDx * 0.8 + knifeDy * 0.6) < maxDim * 0.014 && Math.abs(dx) < maxDim * 0.16) {
      return [250, 246, 240, 240];
    }
  }

  // Banner text background "LA FIERTE" pill
  const bannerY = cy + maxDim * 0.32;
  const bannerHalfW = maxDim * 0.28;
  const bannerHalfH = maxDim * 0.045;
  if (Math.abs(dx) <= bannerHalfW && Math.abs(y - bannerY) <= bannerHalfH) {
    return [250, 246, 240, 255]; // Cream pill #faf6f0
  }

  return [r, g, b, a];
}

const publicDir = path.resolve('public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// 1. pwa-192x192.png
fs.writeFileSync(
  path.join(publicDir, 'pwa-192x192.png'),
  writePng(192, 192, (x, y, w, h) => renderBarFierteIcon(x, y, w, h, false))
);
console.log('✓ Created pwa-192x192.png');

// 2. pwa-512x512.png
fs.writeFileSync(
  path.join(publicDir, 'pwa-512x512.png'),
  writePng(512, 512, (x, y, w, h) => renderBarFierteIcon(x, y, w, h, false))
);
console.log('✓ Created pwa-512x512.png');

// 3. pwa-maskable-512x512.png (full bleed)
fs.writeFileSync(
  path.join(publicDir, 'pwa-maskable-512x512.png'),
  writePng(512, 512, (x, y, w, h) => renderBarFierteIcon(x, y, w, h, true))
);
console.log('✓ Created pwa-maskable-512x512.png');

// 4. apple-touch-icon.png (180x180)
fs.writeFileSync(
  path.join(publicDir, 'apple-touch-icon.png'),
  writePng(180, 180, (x, y, w, h) => renderBarFierteIcon(x, y, w, h, false))
);
console.log('✓ Created apple-touch-icon.png');

// 5. favicon.ico / favicon (48x48)
fs.writeFileSync(
  path.join(publicDir, 'favicon.ico'),
  writePng(48, 48, (x, y, w, h) => renderBarFierteIcon(x, y, w, h, false))
);
console.log('✓ Created favicon.ico');
