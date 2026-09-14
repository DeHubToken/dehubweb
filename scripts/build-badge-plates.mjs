/**
 * Build the badge plate masks.
 * ============================
 * Each staking badge is drawn on transparency for a dark canvas. On a light
 * theme the silver and chrome tiers lose their outer edge, so BadgeIcon paints
 * a dark plate behind the artwork, masked to the badge's shape.
 *
 * The artwork's own alpha is the wrong mask for that plate: several tiers have
 * transparent gaps inside their outline (between the animal and the shield),
 * and a plate masked by the art keeps every gap, so the page shows through
 * next to the check mark. This script derives a solid silhouette instead —
 * the alpha with every enclosed gap filled — and dilates it a few pixels so
 * the plate lands past the artwork's edge as a rim.
 *
 * Output is a 128px alpha-only PNG per tier under src/assets/badges/plates/.
 * Re-run after any badge artwork changes:
 *   node scripts/build-badge-plates.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const SRC = path.join(ROOT, 'src/assets/badges');
const OUT = path.join(SRC, 'plates');
const THRESHOLD = 8;
// Rim width in source pixels. At the 20px inline size this is just under one
// CSS pixel; on a 40px profile badge, just under two.
const DILATE = 6;

fs.mkdirSync(OUT, { recursive: true });
const tiers = fs.readdirSync(SRC).filter((f) => f.endsWith('.webp')).map((f) => f.replace(/\.webp$/, ''));

for (const tier of tiers) {
  const { data, info } = await sharp(path.join(SRC, `${tier}.webp`)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const opaque = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) opaque[i] = data[i * 4 + 3] > THRESHOLD ? 1 : 0;

  // Flood the transparent region reachable from the canvas edge. Whatever
  // transparent pixel that flood never reaches is an enclosed gap: solid.
  const outside = new Uint8Array(w * h);
  const stack = [];
  const seed = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const k = y * w + x;
    if (outside[k] || opaque[k]) return;
    outside[k] = 1;
    stack.push(k);
  };
  for (let x = 0; x < w; x++) { seed(x, 0); seed(x, h - 1); }
  for (let y = 0; y < h; y++) { seed(0, y); seed(w - 1, y); }
  while (stack.length) {
    const k = stack.pop();
    const x = k % w, y = (k - x) / w;
    seed(x + 1, y); seed(x - 1, y); seed(x, y + 1); seed(x, y - 1);
  }
  const filled = new Uint8Array(w * h);
  for (let k = 0; k < w * h; k++) filled[k] = outside[k] ? 0 : 1;

  // Keep only the largest connected piece. The exports carry a few stray
  // near-transparent specks well away from the badge, and dilating those
  // would put a dark dot beside the artwork.
  const label = new Int32Array(w * h);
  let best = 0, bestSize = 0, next = 0;
  for (let start = 0; start < w * h; start++) {
    if (!filled[start] || label[start]) continue;
    const id = ++next;
    let size = 0;
    const todo = [start];
    label[start] = id;
    while (todo.length) {
      const k = todo.pop();
      size++;
      const x = k % w, y = (k - x) / w;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const nk = ny * w + nx;
        if (filled[nk] && !label[nk]) { label[nk] = id; todo.push(nk); }
      }
    }
    if (size > bestSize) { bestSize = size; best = id; }
  }
  const solid = new Uint8Array(w * h);
  for (let k = 0; k < w * h; k++) solid[k] = label[k] === best ? 1 : 0;
  const dropped = next - 1;

  // Dilate with a disc so the rim is even in every direction.
  const dilated = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!solid[y * w + x]) continue;
    for (let dy = -DILATE; dy <= DILATE; dy++) for (let dx = -DILATE; dx <= DILATE; dx++) {
      if (dx * dx + dy * dy > DILATE * DILATE) continue;
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < w && ny < h) dilated[ny * w + nx] = 1;
    }
  }

  const rgba = Buffer.alloc(w * h * 4);
  for (let k = 0; k < w * h; k++) rgba[k * 4 + 3] = dilated[k] ? 255 : 0;
  // A one-pixel blur softens the stair-step of the dilation without moving the edge.
  await sharp(rgba, { raw: { width: w, height: h, channels: 4 } }).blur(0.6).png({ palette: true, colours: 4 }).toFile(path.join(OUT, `${tier}.png`));
  const gaps = solid.reduce((n, v, k) => n + (v && !opaque[k] ? 1 : 0), 0);
  console.log(`${tier.padEnd(20)} filled ${String(gaps).padStart(5)} gap px, dropped ${dropped} stray piece(s)`);
}
