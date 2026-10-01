import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CachedPageActiveContext } from '@/contexts/CachedPageActiveContext';
import { useOverlayLifetime } from '../use-overlay-lifetime';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it('releases the portal immediately on close and preserves a rapid reopen', () => {
  const { result, rerender } = renderHook(({ open }) => useOverlayLifetime(open, false, undefined), {
    initialProps: { open: true },
  });
  rerender({ open: false });
  expect(result.current.present).toBe(false);
  rerender({ open: true });
  rerender({ open: false });
  act(() => vi.advanceTimersByTime(200));
  rerender({ open: true });
  act(() => vi.advanceTimersByTime(800));
  expect(result.current.present).toBe(true);
});

it('tracks trigger-controlled opens and closes', () => {
  const onChange = vi.fn();
  const { result } = renderHook(() => useOverlayLifetime(undefined, false, onChange));
  act(() => result.current.onChange(true));
  expect(result.current.open).toBe(true);
  act(() => result.current.onChange(false));
  expect(result.current.present).toBe(false);
  expect(onChange.mock.calls).toEqual([[true], [false]]);
});

it('removes portals from an inactive cached page even if its owner still says open', () => {
  const onChange = vi.fn();
  let active = true;
  const { result, rerender } = renderHook(() => useOverlayLifetime(true, false, onChange), {
    wrapper: ({ children }) => <CachedPageActiveContext.Provider value={active}>{children}</CachedPageActiveContext.Provider>,
  });
  active = false;
  rerender();
  expect(result.current.open).toBe(false);
  expect(result.current.present).toBe(false);
  expect(onChange).toHaveBeenCalledWith(false);
});
