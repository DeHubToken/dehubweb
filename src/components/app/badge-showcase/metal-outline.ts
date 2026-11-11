/** Trace the outer cut from alpha, retaining every outgoing edge at a junction. */
export function traceMetalOutline(rgba: ArrayLike<number>, size: number, grow = 1): [number, number][] {
  const solid = new Uint8Array(size * size);
  for (let i = 0; i < solid.length; i++) solid[i] = rgba[i * 4 + 3] < 80 ? 0 : 1;
  // A small dilation joins narrow claws before the bevel is smoothed: one
  // pixel on the 96px grid, `grow` pixels on a finer one. Two passes (across,
  // then down) keep it cheap at any size.
  const wide = new Uint8Array(size * size), mask = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (!solid[y * size + x]) continue;
    for (let dx = Math.max(0, x - grow), end = Math.min(size - 1, x + grow); dx <= end; dx++) wide[y * size + dx] = 1;
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (!wide[y * size + x]) continue;
    for (let dy = Math.max(0, y - grow), end = Math.min(size - 1, y + grow); dy <= end; dy++) mask[dy * size + x] = 1;
  }
  const stride = size + 1;
  const edges = new Map<number, number[]>();
  const add = (x: number, y: number, xx: number, yy: number) => {
    const key = y * stride + x;
    const list = edges.get(key) ?? [];
    list.push(yy * stride + xx);
    edges.set(key, list);
  };
  const filled = (x: number, y: number) => x >= 0 && x < size && y >= 0 && y < size && mask[y * size + x];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (!filled(x, y)) continue;
    if (!filled(x, y - 1)) add(x, y, x + 1, y);
    if (!filled(x + 1, y)) add(x + 1, y, x + 1, y + 1);
    if (!filled(x, y + 1)) add(x + 1, y + 1, x, y + 1);
    if (!filled(x - 1, y)) add(x, y + 1, x, y);
  }
  let best: [number, number][] = [], largest = 0;
  while (edges.size) {
    const start = edges.keys().next().value!;
    let current = start;
    const loop: [number, number][] = [];
    do {
      loop.push([current % stride, Math.floor(current / stride)]);
      const next = edges.get(current);
      if (!next?.length) break;
      const previous = current;
      current = next.pop()!;
      if (!next.length) edges.delete(previous);
    } while (current !== start);
    if (current !== start) continue;
    const area = Math.abs(loop.reduce((sum, a, i) => {
      const b = loop[(i + 1) % loop.length];
      return sum + a[0] * b[1] - b[0] * a[1];
    }, 0));
    if (area > largest) { largest = area; best = loop; }
  }
  if (best.length < 3) throw new Error('Badge artwork has no silhouette');
  return best;
}

/** Grid the silhouette is traced on. The art is 128px; tracing it this fine
 * turns each pixel step of the cut into steps too small to see once smoothed. */
export const METAL_OUTLINE_GRID = 384;

/**
 * Rounds the traced staircase into a clean curve: a moving average over the
 * same stretch of edge the 96px trace used, then every `step`th point.
 */
export function smoothMetalOutline(outline: [number, number][], size: number): [number, number][] {
  const reach = Math.max(1, Math.round(size / 96 * 3)), step = Math.max(1, Math.round(size / 96 * 1.5));
  const count = outline.length, smooth: [number, number][] = [];
  let x = 0, y = 0;
  for (let k = -reach; k <= reach; k++) { const q = outline[(k % count + count) % count]; x += q[0]; y += q[1]; }
  const span = reach * 2 + 1;
  for (let i = 0; i < count; i++) {
    if (i % step === 0) smooth.push([x / span, y / span]);
    const leave = outline[((i - reach) % count + count) % count], enter = outline[(i + reach + 1) % count];
    x += enter[0] - leave[0]; y += enter[1] - leave[1];
  }
  return smooth;
}
