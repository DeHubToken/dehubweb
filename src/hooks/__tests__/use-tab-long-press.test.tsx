import { act, renderHook } from '@testing-library/react';
import type { PointerEvent } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useTabLongPress } from '../use-tab-long-press';

const pointer = (overrides = {}) => ({ pointerType: 'touch', isPrimary: true, pointerId: 1, clientX: 20, clientY: 20, ...overrides }) as PointerEvent;
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it.each(['home', 'live', 'shorts', 'images', 'videos', 'music'])('opens %s once after a stationary hold and marks its release as consumed', (tab) => {
  const open = vi.fn();
  const { result, unmount } = renderHook(() => useTabLongPress(tab, open));
  act(() => result.current.begin(pointer()));
  act(() => vi.advanceTimersByTime(499));
  expect(open).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(1));
  expect(open).toHaveBeenCalledTimes(1);
  expect(result.current.fired.current).toBe(true);
  act(() => result.current.cancel());
  act(() => vi.advanceTimersByTime(1000));
  expect(open).toHaveBeenCalledTimes(1);
  act(() => result.current.begin(pointer()));
  expect(result.current.fired.current).toBe(false);
  unmount();
});

it.each([{ clientX: 26 }, { clientY: 26 }, { clientX: 24, clientY: 24 }])('cancels movement permanently even if the finger returns', (position) => {
  const open = vi.fn();
  const { result, unmount } = renderHook(() => useTabLongPress('home', open));
  act(() => result.current.begin(pointer()));
  act(() => result.current.move(pointer(position)));
  act(() => result.current.move(pointer()));
  act(() => vi.advanceTimersByTime(1000));
  expect(open).not.toHaveBeenCalled();
  unmount();
});

it('preserves short taps and cancels release, cancellation, tab switches and unmount', () => {
  const open = vi.fn();
  const { result, rerender, unmount } = renderHook(({ tab }) => useTabLongPress(tab, open), { initialProps: { tab: 'home' } });
  act(() => result.current.begin(pointer()));
  act(() => vi.advanceTimersByTime(100));
  act(() => result.current.cancel());
  expect(result.current.fired.current).toBe(false);
  act(() => vi.advanceTimersByTime(500));
  act(() => result.current.begin(pointer()));
  rerender({ tab: 'live' });
  act(() => vi.advanceTimersByTime(500));
  act(() => result.current.begin(pointer()));
  unmount();
  act(() => vi.advanceTimersByTime(500));
  expect(open).not.toHaveBeenCalled();
});

it.each([{ pointerType: 'mouse' }, { isPrimary: false }])('ignores non-touch or secondary pointers', (event) => {
  const open = vi.fn();
  const { result, unmount } = renderHook(() => useTabLongPress('home', open));
  act(() => result.current.begin(pointer(event)));
  act(() => vi.advanceTimersByTime(500));
  expect(open).not.toHaveBeenCalled();
  unmount();
});

it('ignores disabled controls and cancels when a second finger touches elsewhere', () => {
  const open = vi.fn();
  const { result, rerender, unmount } = renderHook(({ enabled }) => useTabLongPress('home', open, enabled), { initialProps: { enabled: false } });
  act(() => result.current.begin(pointer()));
  act(() => vi.advanceTimersByTime(500));
  rerender({ enabled: true });
  act(() => result.current.begin(pointer()));
  const second = new Event('pointerdown');
  Object.defineProperty(second, 'isPrimary', { value: false });
  act(() => window.dispatchEvent(second));
  act(() => vi.advanceTimersByTime(500));
  expect(open).not.toHaveBeenCalled();
  unmount();
});
