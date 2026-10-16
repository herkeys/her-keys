/**
 * HK-FE-UI-02-DM · DM-06 — derives the LIGHT-mode splash tile from the approved brand mark.
 *
 * The approved splash artwork (assets/splash-brand.png) is a gold key on a near-black field with no transparency. On an off-white
 * launch screen that would be a hard black square. This script takes THE SAME ARTWORK, adds nothing, and only rounds its corners
 * (transparent outside a continuous-corner rounded square), producing assets/splash-brand-tile.png: the brand tile on the light
 * ground, like the app icon. No new imagery, no recolouring.
 *
 *   node scripts-dev/ui02dm-make-splash-tile.mjs
 *
 * Pure Node (zlib + hand-rolled PNG chunks) so it adds no dependency.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync, inflateSync, crc32 } from 'node:zlib';

const SRC = new URL('../assets/splash-brand.png', import.meta.url);
const OUT = new URL('../assets/splash-brand-tile.png', import.meta.url);
const RADIUS_FRACTION = 0.225; // close to the platform icon corner

const png = readFileSync(SRC);
if (png.subarray(1, 4).toString() !== 'PNG') throw new Error('not a PNG');

let off = 8;
let width = 0, height = 0, depth = 0, colorType = 0;
const idat = [];
while (off < png.length) {
  const len = png.readUInt32BE(off);
  const type = png.subarray(off + 4, off + 8).toString();
  const data = png.subarray(off + 8, off + 8 + len);
  if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); depth = data[8]; colorType = data[9]; }
  if (type === 'IDAT') idat.push(data);
  off += 12 + len;
}
if (depth !== 8 || colorType !== 2) throw new Error(`expected 8-bit RGB, got depth ${depth} type ${colorType}`);

// ---- decode (unfilter) 8-bit RGB
const bpp = 3;
const stride = width * bpp;
const raw = inflateSync(Buffer.concat(idat));
const pixels = Buffer.alloc(height * stride);
const paeth = (a, b, c) => { const p = a + b - c; const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };
for (let y = 0; y < height; y++) {
  const filter = raw[y * (stride + 1)];
  for (let x = 0; x < stride; x++) {
    const cur = raw[y * (stride + 1) + 1 + x];
    const left = x >= bpp ? pixels[y * stride + x - bpp] : 0;
    const up = y > 0 ? pixels[(y - 1) * stride + x] : 0;
    const upLeft = y > 0 && x >= bpp ? pixels[(y - 1) * stride + x - bpp] : 0;
    const v = filter === 0 ? cur : filter === 1 ? cur + left : filter === 2 ? cur + up : filter === 3 ? cur + ((left + up) >> 1) : cur + paeth(left, up, upLeft);
    pixels[y * stride + x] = v & 255;
  }
}

// ---- rounded-square alpha (anti-aliased by 4x4 supersampling at the corners only)
const r = Math.round(Math.min(width, height) * RADIUS_FRACTION);
const coverage = (px, py) => {
  // distance outside the rounded rectangle, in the nearest corner's circle
  const cx = px < r ? r : px >= width - r ? width - r : null;
  const cy = py < r ? r : py >= height - r ? height - r : null;
  if (cx === null || cy === null) return 1;
  return Math.hypot(px + 0.5 - cx, py + 0.5 - cy) <= r ? 1 : 0;
};
const rgba = Buffer.alloc(height * (width * 4 + 1));
for (let y = 0; y < height; y++) {
  rgba[y * (width * 4 + 1)] = 0; // filter: none
  for (let x = 0; x < width; x++) {
    const i = y * (width * 4 + 1) + 1 + x * 4;
    const nearCorner = (x < r || x >= width - r) && (y < r || y >= height - r);
    let a = 1;
    if (nearCorner) {
      let sum = 0;
      for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) sum += coverage(x + (sx + 0.5) / 4 - 0.5, y + (sy + 0.5) / 4 - 0.5);
      a = sum / 16;
    }
    rgba[i] = pixels[y * stride + x * 3];
    rgba[i + 1] = pixels[y * stride + x * 3 + 1];
    rgba[i + 2] = pixels[y * stride + x * 3 + 2];
    rgba[i + 3] = Math.round(a * 255);
  }
}

const chunk = (type, data) => {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const body = Buffer.concat([head.subarray(4), data]);
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(body) >>> 0, 0);
  return Buffer.concat([head, data, tail]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(width, 0);
ihdr.writeUInt32BE(height, 4);
ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
writeFileSync(OUT, Buffer.concat([png.subarray(0, 8), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(rgba, { level: 9 })), chunk('IEND', Buffer.alloc(0))]));
console.log(`wrote assets/splash-brand-tile.png ${width}x${height}, corner radius ${r}px`);
