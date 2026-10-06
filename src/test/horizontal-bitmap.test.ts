import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useHorizontalBitmap } from '../hooks/use-horizontal-bitmap';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

function setup() {
  let notify: (e: { isIntersecting: boolean }[]) => void = () => {};
  const observe = vi.fn();
  vi.stubGlobal('IntersectionObserver', class {
    constructor(cb: typeof notify) { notify = cb; }
    observe = observe; disconnect() {}
  });
  return { notify: (v: boolean) => notify([{ isIntersecting: v }]), observe,
    viewport: { current: document.createElement('div') }, slide: { current: document.createElement('div') } };
}

it('keeps a single image always visible', () => {
  vi.useFakeTimers();
  const t = setup();
  const { result } = renderHook(() => useHorizontalBitmap('a.jpg', true, t.viewport, t.slide, true));
  act(() => { t.notify(false); vi.advanceTimersByTime(5000); });
  expect(result.current).toBe(true);
  expect(t.observe).not.toHaveBeenCalled();
});

it('unloads far slides after grace and restores on intersect', () => {
  vi.useFakeTimers();
  const t = setup();
  const { result } = renderHook(() => useHorizontalBitmap('a.jpg', true, t.viewport, t.slide));
  act(() => { t.notify(false); vi.advanceTimersByTime(200); t.notify(true); vi.advanceTimersByTime(400); });
  expect(result.current).toBe(true);
  act(() => { t.notify(false); vi.advanceTimersByTime(400); });
  expect(result.current).toBe(false);
  act(() => t.notify(true));
  expect(result.current).toBe(true);
});
