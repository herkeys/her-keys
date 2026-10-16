// HK-FE-UI-02-DM — builds <name>-side-by-side.png (Light left, Dark right, half size) from every <name>-light.png / <name>-dark.png pair in
// docs/design-system/evidence/hk-fe-ui-02-dm (and its compact/ folder). Usage: node scripts-dev/ui02dm-side-by-side.mjs
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');
const root = fileURLToPath(new URL('..', import.meta.url));
const GAP = 16;

/** 2x2 box-average downscale. */
function half(png) {
  const w = png.width >> 1;
  const h = png.height >> 1;
  const out = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      for (let c = 0; c < 4; c += 1) {
        const at = (dx, dy) => png.data[((y * 2 + dy) * png.width + (x * 2 + dx)) * 4 + c];
        out.data[(y * w + x) * 4 + c] = (at(0, 0) + at(1, 0) + at(0, 1) + at(1, 1)) >> 2;
      }
    }
  }
  return out;
}

let made = 0;
for (const sub of ['', 'compact']) {
  const dir = join(root, 'docs/design-system/evidence/hk-fe-ui-02-dm', sub);
  if (!existsSync(dir)) continue;
  for (const file of readdirSync(dir).filter((f) => f.endsWith('-light.png'))) {
    const name = file.replace(/-light\.png$/, '');
    const darkPath = join(dir, `${name}-dark.png`);
    if (!existsSync(darkPath)) continue;
    const l = half(PNG.sync.read(readFileSync(join(dir, file))));
    const d = half(PNG.sync.read(readFileSync(darkPath)));
    const out = new PNG({ width: l.width + GAP + d.width, height: Math.max(l.height, d.height) });
    out.data.fill(0x80); // neutral grey gutter
    PNG.bitblt(l, out, 0, 0, l.width, l.height, 0, 0);
    PNG.bitblt(d, out, 0, 0, d.width, d.height, l.width + GAP, 0);
    writeFileSync(join(dir, `${name}-side-by-side.png`), PNG.sync.write(out));
    made += 1;
  }
}
console.log(`side-by-side composites written: ${made}`);
