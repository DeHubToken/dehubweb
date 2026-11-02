import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { playMagneticDock } from './magnetic-dock';

const animate = vi.fn(() => ({ cancel: vi.fn() }));
let reduced = false;
let root: HTMLElement;
let target: HTMLElement;
beforeEach(() => {
  vi.useFakeTimers();
  reduced = false;
  animate.mockClear();
  vi.stubGlobal('matchMedia', () => ({ matches: reduced }));
  vi.stubGlobal('innerWidth', 390);
  vi.stubGlobal('innerHeight', 740);
  Element.prototype.animate = animate as unknown as typeof Element.prototype.animate;
  document.body.innerHTML = '<div id="app-root"><button data-entry-logo><img src="/actual-header.png" style="filter: invert(1)"></button><article data-post-id="one"></article></div>';
  root = document.getElementById('app-root')!;
  target = root.querySelector('button')!;
  for (const el of [target, target.firstElementChild!, root.querySelector('article')!]) {
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({ x: 174, y: 4, left: 174, top: 4, right: 216, bottom: 40, width: 42, height: 36, toJSON: () => {} });
  }
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.innerHTML = ''; });

it('flies the actual header artwork to its measured position and restores the header', () => {
  const done = vi.fn();
  playMagneticDock(root, done);
  const copy = document.querySelector<HTMLImageElement>('[data-magnetic-dock] img')!;
  expect(copy.src).toContain('/actual-header.png');
  expect(copy.style.filter).toBe('invert(1)');
  expect(copy.style.left).toBe('174px');
  expect(target.style.visibility).toBe('hidden');
  vi.advanceTimersByTime(950);
  expect(target.style.visibility).toBe('');
  expect(document.querySelector('[data-magnetic-dock]')).toBeNull();
  expect(done).toHaveBeenCalledTimes(1);
});

it('uses only a short opacity transition for reduced motion', () => {
  reduced = true;
  playMagneticDock(root, vi.fn());
  expect(animate).toHaveBeenCalledTimes(1);
  expect(animate).toHaveBeenCalledWith([{ opacity: 1 }, { opacity: 0 }], { duration: 180, fill: 'both' });
  expect(target.style.visibility).toBe('');
  vi.advanceTimersByTime(180);
  expect(document.querySelector('[data-magnetic-dock]')).toBeNull();
});

it('cleans up on navigation/unmount, resize and animation errors', () => {
  const cancel = playMagneticDock(root, vi.fn());
  cancel(); cancel();
  expect(target.style.visibility).toBe('');
  expect(vi.getTimerCount()).toBe(0);
  const done = vi.fn();
  playMagneticDock(root, done);
  window.dispatchEvent(new Event('resize'));
  expect(done).toHaveBeenCalledTimes(1);
  expect(document.querySelector('[data-magnetic-dock]')).toBeNull();
  animate.mockImplementationOnce(() => { throw new Error('unsupported animation'); });
  playMagneticDock(root, vi.fn());
  expect(target.style.visibility).toBe('');
  expect(document.querySelector('[data-magnetic-dock]')).toBeNull();
});

it('does not cover layouts without a visible logo', () => {
  target.remove();
  const done = vi.fn();
  playMagneticDock(root, done);
  expect(done).toHaveBeenCalledTimes(1);
  expect(animate).not.toHaveBeenCalled();
  expect(document.querySelector('[data-magnetic-dock]')).toBeNull();
});
