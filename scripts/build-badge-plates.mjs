/**
 * Build the badge plate masks.
 * ============================
 * Each staking badge is drawn on transparency for a dark canvas. On a light
 * theme the silver and chrome tiers lose their outer edge, so BadgeIcon paints
 * an opaque dark plate behind the artwork, masked to the badge's shape.
 *
 * The artwork's own alpha is the wrong mask for that plate: several tiers have
 * transparent gaps inside their outline (between the animal and the shield),
 * and a plate masked by the art keeps every gap, so the page shows through
 * next to the check mark. This derives a solid silhouette instead — the alpha
 * with every enclosed gap filled, stray specks dropped — grown by four percent
 * so the plate lands just past the artwork's edge.
 *
 * All of the mask work is plain typed-array code at 512px, then averaged down
 * to a 256px 8-bit alpha PNG, so the edge is a smooth anti-aliased curve. Do
 * not quantise these (no palette PNGs): that is what made the first plates
 * look pixelated.
 *
 * Re-run after any badge artwork changes:
 *   node scripts/build-badge-plates.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const SRC = path.join(ROOT, 'src/assets/badges');
const OUT = path.join(SRC, 'plates');
const HI = 512;
const OUT_PX = 256;
const GROW_PX = Math.round(HI * 0.04);

fs.mkdirSync(OUT, { recursive: true });
const tiers = fs.readdirSync(SRC).filter((f) => f.endsWith('.png')).map((f) => f.replace(/\.png$/, ''));

for (const tier of tiers) {
  const { data } = await sharp(path.join(SRC, `${tier}.png`))
    .resize(HI, HI, { kernel: 'lanczos3' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const opaque = new Uint8Array(HI * HI);
  for (let i = 0; i < HI * HI; i++) opaque[i] = data[i * 4 + 3] > 40 ? 1 : 0;

  // Flood the transparent region reachable from the canvas edge. Whatever
  // transparent pixel that flood never reaches is an enclosed gap: solid.
  const outside = new Uint8Array(HI * HI);
  const stack = [];
  const seed = (x, y) => {
    if (x < 0 || y < 0 || x >= HI || y >= HI) return;
    const k = y * HI + x;
    if (outside[k] || opaque[k]) return;
    outside[k] = 1;
    stack.push(k);
  };
  for (let x = 0; x < HI; x++) { seed(x, 0); seed(x, HI - 1); }
  for (let y = 0; y < HI; y++) { seed(0, y); seed(HI - 1, y); }
  while (stack.length) {
    const k = stack.pop();
    const x = k % HI, y = (k - x) / HI;
    seed(x + 1, y); seed(x - 1, y); seed(x, y + 1); seed(x, y - 1);
  }
  const filled = new Uint8Array(HI * HI);
  for (let k = 0; k < HI * HI; k++) filled[k] = outside[k] ? 0 : 1;

  // Keep only the largest connected piece: the exports carry a few stray
  // near-transparent specks well away from the badge.
  const label = new Int32Array(HI * HI);
  let best = 0, bestSize = 0, next = 0;
  for (let start = 0; start < HI * HI; start++) {
    if (!filled[start] || label[start]) continue;
    const id = ++next;
    let size = 0;
    const todo = [start];
    label[start] = id;
    while (todo.length) {
      const k = todo.pop();
      size++;
      const x = k % HI, y = (k - x) / HI;
      if (x + 1 < HI && filled[k + 1] && !label[k + 1]) { label[k + 1] = id; todo.push(k + 1); }
      if (x > 0 && filled[k - 1] && !label[k - 1]) { label[k - 1] = id; todo.push(k - 1); }
      if (y + 1 < HI && filled[k + HI] && !label[k + HI]) { label[k + HI] = id; todo.push(k + HI); }
      if (y > 0 && filled[k - HI] && !label[k - HI]) { label[k - HI] = id; todo.push(k - HI); }
    }
    if (size > bestSize) { bestSize = size; best = id; }
  }
  const solid = new Uint8Array(HI * HI);
  for (let k = 0; k < HI * HI; k++) solid[k] = label[k] === best ? 1 : 0;

  // Grow by a disc, stamped from the boundary pixels only.
  const grown = new Uint8Array(solid);
  const R = GROW_PX;
  for (let y = 0; y < HI; y++) for (let x = 0; x < HI; x++) {
    const k = y * HI + x;
    if (!solid[k]) continue;
    const isEdge = x === 0 || y === 0 || x === HI - 1 || y === HI - 1
      || !solid[k - 1] || !solid[k + 1] || !solid[k - HI] || !solid[k + HI];
    if (!isEdge) continue;
    for (let dy = -R; dy <= R; dy++) {
      const ny = y + dy;
      if (ny < 0 || ny >= HI) continue;
      const w = Math.floor(Math.sqrt(R * R - dy * dy));
      for (let dx = -w; dx <= w; dx++) {
        const nx = x + dx;
        if (nx >= 0 && nx < HI) grown[ny * HI + nx] = 1;
      }
    }
  }

  // Anti-alias: a 3x3 box on the binary mask, then a 2x2 average down to OUT_PX.
  const soft = new Float32Array(HI * HI);
  for (let y = 0; y < HI; y++) for (let x = 0; x < HI; x++) {
    let s = 0, c = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= HI || ny >= HI) continue;
      s += grown[ny * HI + nx];
      c++;
    }
    soft[y * HI + x] = s / c;
  }
  const rgba = Buffer.alloc(OUT_PX * OUT_PX * 4);
  for (let y = 0; y < OUT_PX; y++) for (let x = 0; x < OUT_PX; x++) {
    const a = (soft[2 * y * HI + 2 * x] + soft[2 * y * HI + 2 * x + 1]
      + soft[(2 * y + 1) * HI + 2 * x] + soft[(2 * y + 1) * HI + 2 * x + 1]) / 4;
    const k = (y * OUT_PX + x) * 4;
    rgba[k] = 11; rgba[k + 1] = 13; rgba[k + 2] = 18; rgba[k + 3] = Math.round(a * 255);
  }
  await sharp(rgba, { raw: { width: OUT_PX, height: OUT_PX, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toFile(path.join(OUT, `${tier}.png`));

  const gaps = filled.reduce((n, v, k) => n + (v && !opaque[k] ? 1 : 0), 0);
  console.log(`${tier.padEnd(20)} filled ${String(gaps).padStart(5)} gap px, dropped ${next - 1} stray piece(s)`);
}
