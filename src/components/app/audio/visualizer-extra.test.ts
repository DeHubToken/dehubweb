import { describe, expect, it } from 'vitest';
import { AudioListener, drawExtra, EXTRA_STYLES, makePalette, type Ctx2D } from './visualizer-extra';

describe('audio animation catalogue', () => {
  it('keeps all existing styles selectable', () => {
    const keys = EXTRA_STYLES.map(style => style.value);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of ['liquid', 'water', 'vinyl', 'aurora', 'planet', 'ocean', 'chladni']) expect(keys).toContain(key);
  });

  it.each([[280, 104], [390, 137], [760, 220]])('paints finite chrome ribbons at %i × %i', (width, height) => {
    const coordinates: number[][] = [];
    const path = (...values: number[]) => { values.forEach(value => expect(Number.isFinite(value)).toBe(true)); coordinates.push(values); };
    const gradient = () => ({ addColorStop: (offset: number) => expect(offset).toBeGreaterThanOrEqual(0) });
    const ctx = new Proxy({} as Ctx2D, {
      get: (_, key) => String(key).startsWith('create') ? gradient : path,
      set: () => true,
    });
    const listener = new AudioListener();
    const peaks = Array.from({ length: 80 }, (_, index) => .1 + .7 * Math.abs(Math.sin(index)));
    listener.fromSynth(0, .35, peaks);
    drawExtra('liquid', ctx, width, height, listener.frame, makePalette(0, false, 'system'), {});
    expect(coordinates.length).toBeGreaterThan(300);
    const initial = JSON.stringify(coordinates);
    coordinates.length = 0;
    listener.fromSynth(8, .35, peaks);
    drawExtra('liquid', ctx, width, height, listener.frame, makePalette(0, false, 'system'), {});
    expect(JSON.stringify(coordinates)).not.toBe(initial);
  });
});
