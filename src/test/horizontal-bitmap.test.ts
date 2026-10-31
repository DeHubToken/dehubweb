import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { HORIZONTAL_LOAD_MARGIN, HORIZONTAL_RELEASE_MARGIN, useHorizontalBitmap } from '../hooks/use-horizontal-bitmap';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

type Notify = (e: { isIntersecting: boolean }[]) => void;

function setup() {
  const observers = new Map<string | undefined, Notify>();
  const observe = vi.fn();
  vi.stubGlobal('IntersectionObserver', class {
    constructor(cb: Notify, init?: IntersectionObserverInit) { observers.set(init?.rootMargin, cb); }
    observe = observe; disconnect() {}
  });
  const fire = (margin: string, v: boolean) => observers.get(margin)?.([{ isIntersecting: v }]);
  return {
    // Within a viewport: inside both margins. Beyond three: outside both.
    near: () => { fire(HORIZONTAL_LOAD_MARGIN, true); fire(HORIZONTAL_RELEASE_MARGIN, true); },
    passed: () => { fire(HORIZONTAL_LOAD_MARGIN, false); fire(HORIZONTAL_RELEASE_MARGIN, true); },
    far: () => { fire(HORIZONTAL_LOAD_MARGIN, false); fire(HORIZONTAL_RELEASE_MARGIN, false); },
    observe,
    viewport: { current: document.createElement('div') }, slide: { current: document.createElement('div') },
  };
}

it('keeps a single image always visible', () => {
  vi.useFakeTimers();
  const t = setup();
  const { result } = renderHook(() => useHorizontalBitmap('a.jpg', true, t.viewport, t.slide, true));
  act(() => { t.far(); vi.advanceTimersByTime(5000); });
  expect(result.current).toBe(true);
  expect(t.observe).not.toHaveBeenCalled();
});

it('unloads far slides after grace and restores when near again', () => {
  vi.useFakeTimers();
  const t = setup();
  const { result } = renderHook(() => useHorizontalBitmap('a.jpg', true, t.viewport, t.slide));
  act(() => { t.near(); });
  expect(result.current).toBe(true);
  act(() => { t.far(); vi.advanceTimersByTime(200); t.near(); vi.advanceTimersByTime(400); });
  expect(result.current).toBe(true);
  act(() => { t.far(); vi.advanceTimersByTime(400); });
  expect(result.current).toBe(false);
  act(() => t.near());
  expect(result.current).toBe(true);
});

it('keeps a photo just passed drawn so swiping back never redraws it', () => {
  vi.useFakeTimers();
  const t = setup();
  const { result } = renderHook(() => useHorizontalBitmap('a.jpg', true, t.viewport, t.slide));
  act(() => { t.near(); t.passed(); vi.advanceTimersByTime(5000); });
  expect(result.current).toBe(true);
});
