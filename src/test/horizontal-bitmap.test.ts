import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useHorizontalBitmap } from '../hooks/use-horizontal-bitmap';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it('releases measured offscreen images, cancels short excursions, and restores scroll-back immediately', () => {
  vi.useFakeTimers();
  let notify: (entries: { isIntersecting: boolean }[]) => void = () => {};
  const disconnect = vi.fn();
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback: typeof notify) { notify = callback; }
    observe() {}
    disconnect = disconnect;
  });
  const viewport = { current: document.createElement('div') };
  const slide = { current: document.createElement('div') };
  const { result, rerender, unmount } = renderHook(({ source, measured }) => useHorizontalBitmap(source, measured, viewport, slide), {
    initialProps: { source: 'photo-a.jpg', measured: true },
  });
  act(() => { notify([{ isIntersecting: false }]); vi.advanceTimersByTime(200); });
  expect(result.current).toBe(true);
  act(() => { notify([{ isIntersecting: true }]); vi.advanceTimersByTime(400); });
  expect(result.current).toBe(true);
  act(() => { notify([{ isIntersecting: false }]); vi.advanceTimersByTime(400); });
  expect(result.current).toBe(false);
  act(() => notify([{ isIntersecting: true }]));
  expect(result.current).toBe(true);
  act(() => { notify([{ isIntersecting: false }]); vi.advanceTimersByTime(400); });
  rerender({ source: 'photo-b.jpg', measured: false });
  expect(result.current).toBe(true);
  unmount();
  expect(disconnect).toHaveBeenCalled();
});
