import { describe, expect, it } from 'vitest';
import { AudioListener, drawExtra, EXTRA_STYLES, makePalette, type Ctx2D } from './visualizer-extra';

describe('audio animation catalogue', () => {
  it.each(EXTRA_STYLES.map(item => [item.value] as const))('renders %s safely in playing and paused states on phone and desktop', style => {
    for (const [width, height] of [[280, 144], [760, 264]]) {
      for (const playing of [true, false]) {
        let painted = 0;
        const check = (...values: unknown[]) => {
          values.filter(value => typeof value === 'number').forEach(value => expect(Number.isFinite(value)).toBe(true));
        };
        const ctx = new Proxy({} as Ctx2D, {
          get: (_, key) => String(key).startsWith('create')
            ? (...values: unknown[]) => { check(...values); return { addColorStop: check }; }
            : (...values: unknown[]) => { check(...values); if (['fill', 'stroke', 'fillRect', 'strokeRect'].includes(String(key))) painted++; },
          set: (_, key, value) => { if (typeof value === 'number') expect(Number.isFinite(value), String(key)).toBe(true); return true; },
        });
        const listener = new AudioListener();
        const state = {};
        for (const time of [0, .5, 2]) {
          if (playing) listener.fromSynth(time, .35, [.1, .6, .4, .9]);
          else listener.hold(time, .35, [.1, .6, .4, .9]);
          drawExtra(style, ctx, width, height, listener.frame, makePalette(0, false, 'system'), state);
        }
        expect(painted).toBeGreaterThan(0);
      }
    }
  });
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
