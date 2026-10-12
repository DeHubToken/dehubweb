import { afterEach, describe, expect, it, vi } from 'vitest';
import { createIslandScene } from './IslandBackground';

vi.mock('@/contexts/ThemeContext', () => ({ useAppTheme: () => ({ theme: 'island' }) }));

// Reject geometry that Canvas2D would reject, across clock and viewport changes.
function surface() {
  const alpha: number[] = [];
  let operations = 0;
  const finite = (...values: unknown[]) => {
    operations++;
    for (const v of values) if (typeof v === 'number' && !Number.isFinite(v)) throw new Error('Invalid canvas geometry');
  };
  const gradient = (...values: number[]) => {
    finite(...values);
    return { addColorStop: (offset: number, color: string) => {
      expect(offset).toBeGreaterThanOrEqual(0);
      expect(offset).toBeLessThanOrEqual(1);
      expect(color).not.toMatch(/NaN|Infinity/);
    } };
  };
  const context = new Proxy({
    globalAlpha: 1,
    save() { alpha.push(this.globalAlpha); },
    restore() {
      if (!alpha.length) throw new Error('Unbalanced restore');
      this.globalAlpha = alpha.pop()!;
    },
    createLinearGradient: gradient,
    createRadialGradient: (...values: number[]) => {
      expect(values[2]).toBeGreaterThanOrEqual(0);
      expect(values[5]).toBeGreaterThanOrEqual(0);
      return gradient(...values);
    },
    drawImage: (_image: unknown, ...values: number[]) => finite(...values),
  }, {
    get: (obj, key) => key in obj ? Reflect.get(obj, key) : finite,
    set: (obj, key, value) => {
      if (key === 'globalAlpha') {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
      return Reflect.set(obj, key, value);
    },
  }) as unknown as CanvasRenderingContext2D;
  return { width: 1, height: 1, getContext: () => context, context, balanced: () => alpha.length === 0, operations: () => operations };
}

const clock = window as unknown as { __ISLAND_HOUR?: number };
afterEach(() => { delete clock.__ISLAND_HOUR; vi.restoreAllMocks(); });

describe('Island coastal scene', () => {
  for (const [width, height] of [[390, 844], [844, 390], [1440, 900], [2560, 1080]]) {
    it(`renders day, sunset, dusk and night at ${width} × ${height} without rebuilding detail each frame`, () => {
      const layers: ReturnType<typeof surface>[] = [];
      const create = vi.spyOn(document, 'createElement').mockImplementation(() => {
        const canvas = surface();
        layers.push(canvas);
        return canvas as unknown as HTMLElement;
      });
      clock.__ISLAND_HOUR = 13;
      const scene = createIslandScene();
      scene.resize?.(width, height);
      const target = surface();
      for (const hour of [13, 18.7, 19.4, 1]) {
        clock.__ISLAND_HOUR = hour;
        // Advance the existing scene across the clock refresh boundary.
        scene.draw(target.context, width, height, hour, 6);
        const allocations = create.mock.calls.length;
        for (const t of [0, 0.5, 9, 45]) scene.draw(target.context, width, height, t, 1 / 30);
        expect(create.mock.calls.length).toBe(allocations);
        expect(target.balanced()).toBe(true);
        expect(layers.every(canvas => canvas.balanced())).toBe(true);
      }
      expect(target.operations()).toBeGreaterThan(0);
      scene.resize?.(height, width);
      scene.draw(target.context, height, width, 0, 0);
      expect(target.balanced()).toBe(true);
    });
  }
});
