/** Trace the outer cut from alpha, retaining every outgoing edge at a junction. */
export function traceMetalOutline(rgba: ArrayLike<number>, size: number): [number, number][] {
  const mask = new Uint8Array(size * size);
  // A one-pixel dilation joins narrow claws before the bevel is smoothed.
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (rgba[(y * size + x) * 4 + 3] < 80) continue;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (x + dx >= 0 && x + dx < size && y + dy >= 0 && y + dy < size)
        mask[(y + dy) * size + x + dx] = 1;
    }
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
