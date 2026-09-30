import { afterEach, describe, expect, it, vi } from 'vitest';
import { BADGE_WORLDS, createBadgeScene } from './theme-scene';

// Exercise every timeline, including exact phase boundaries, with a context
// that rejects invalid geometry just as the browser's Canvas2D API does.
function canvas() {
  let depth = 0;
  const check = (...values: unknown[]) => {
    for (const value of values) if (typeof value === 'number') expect(Number.isFinite(value)).toBe(true);
  };
  const gradient = () => ({ addColorStop: check });
  const pixels = new Uint8ClampedArray(256 * 256 * 4).fill(180);
  const context = new Proxy({
    save: () => { depth++; },
    restore: () => { expect(depth).toBeGreaterThan(0); depth--; },
    getImageData: () => ({ data: pixels }),
    createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    createLinearGradient: gradient,
    createRadialGradient: (...args: number[]) => { check(...args); expect(args[2]).toBeGreaterThanOrEqual(0); expect(args[5]).toBeGreaterThanOrEqual(0); return gradient(); },
    arc: (_x: number, _y: number, r: number, ...args: number[]) => { check(_x, _y, r, ...args); expect(r).toBeGreaterThanOrEqual(0); },
    ellipse: (_x: number, _y: number, rx: number, ry: number, ...args: number[]) => { check(_x, _y, rx, ry, ...args); expect(rx).toBeGreaterThanOrEqual(0); expect(ry).toBeGreaterThanOrEqual(0); },
    drawImage: (_source: unknown, ...args: number[]) => check(...args),
    globalAlpha: 1,
  }, {
    get: (object, key) => key in object ? Reflect.get(object, key) : check,
  });
  return { width: 256, height: 256, getContext: () => context, depth: () => depth };
}

afterEach(() => vi.restoreAllMocks());
describe('themed badge timelines', () => {
  for (const { id } of BADGE_WORLDS) {
    it(`${id}: click, promotion, resize, and final frame keep valid geometry`, () => {
      vi.spyOn(document, 'createElement').mockImplementation(() => canvas() as unknown as HTMLElement);
      const surface = canvas();
      const scene = createBadgeScene(surface as unknown as HTMLCanvasElement, id);
      const art = canvas() as unknown as HTMLCanvasElement;
      scene.setIce(art); scene.prepare(art, art);
      for (const promote of [false, true]) {
        scene.start({ x: 25, y: 40, size: 32 }, promote);
        scene.geometry(390, 844, { x: 80, y: 100, size: 230 });
        const times = new Set([0, .75, 1.05, 1.4, 1.6, 2.5, 2.75, 2.9, 3.16, 3.65, 4.8, 5.3, scene.duration()]);
        for (const time of times) if (time <= scene.duration()) { scene.draw(time); expect(surface.depth()).toBe(0); }
        scene.geometry(1280, 800, { x: 160, y: 100, size: 420 });
        scene.draw(scene.duration()); scene.still();
        expect(surface.depth()).toBe(0);
      }
      scene.dispose();
    });
  }
});
