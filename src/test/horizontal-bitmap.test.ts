import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useHorizontalBitmap } from '../hooks/use-horizontal-bitmap';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

function stubObserver() {
  const ref: { notify: (entries: { isIntersecting: boolean }[]) => void } = { notify: () => {} };
  const disconnect = vi.fn();
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback: typeof ref.notify) { ref.notify = callback; }
    observe() {}
    disconnect = disconnect;
  });
  return { ref, disconnect };
}

const refs = () => ({ viewport: { current: document.createElement('div') }, slide: { current: document.createElement('div') } });

it('releases offscreen slides after a grace period and restores them on intersection', () => {
  vi.useFakeTimers();
  const { ref, disconnect } = stubObserver();
  const { viewport, slide } = refs();
  const { result, unmount } = renderHook(() => useHorizontalBitmap('a.jpg', true, viewport, slide, { total: 5, index: 4, activeIndex: 0 }));
  act(() => { ref.notify([{ isIntersecting: false }]); vi.advanceTimersByTime(200); });
  expect(result.current).toBe(true);
  act(() => { ref.notify([{ isIntersecting: true }]); vi.advanceTimersByTime(400); });
  expect(result.current).toBe(true);
  act(() => { ref.notify([{ isIntersecting: false }]); vi.advanceTimersByTime(400); });
  expect(result.current).toBe(false);
  act(() => ref.notify([{ isIntersecting: true }]));
  expect(result.current).toBe(true);
  unmount();
  expect(disconnect).toHaveBeenCalled();
});

it('always keeps a single-image carousel visible', () => {
  vi.useFakeTimers();
  const { ref } = stubObserver();
  const { viewport, slide } = refs();
  const { result } = renderHook(() => useHorizontalBitmap('a.jpg', true, viewport, slide, { total: 1, index: 0, activeIndex: 0 }));
  act(() => { ref.notify([{ isIntersecting: false }]); vi.advanceTimersByTime(5000); });
  expect(result.current).toBe(true);
});

it('keeps the active slide and its neighbours visible', () => {
  vi.useFakeTimers();
  const { ref } = stubObserver();
  const { viewport, slide } = refs();
  const { result } = renderHook(() => useHorizontalBitmap('a.jpg', true, viewport, slide, { total: 4, index: 2, activeIndex: 1 }));
  act(() => { ref.notify([{ isIntersecting: false }]); vi.advanceTimersByTime(5000); });
  expect(result.current).toBe(true);
});
