import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CachedPageActiveContext } from '@/contexts/CachedPageActiveContext';
import { useFeedPlaybackAllowed, visualActivity } from './visual-activity';

beforeEach(() => {
  vi.useFakeTimers();
  visualActivity.setForeground(true);
  visualActivity.setFocused(true);
  visualActivity.setCall(false, false);
  vi.advanceTimersByTime(250);
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

it('pauses the cached feed while the profile can play, then resumes the revealed feed', () => {
  let active = false;
  const cached = renderHook(() => useFeedPlaybackAllowed(), {
    wrapper: ({ children }) => <CachedPageActiveContext.Provider value={active}>{children}</CachedPageActiveContext.Provider>,
  });
  const profile = renderHook(() => useFeedPlaybackAllowed());
  expect(cached.result.current).toBe(false);
  expect(profile.result.current).toBe(true);
  active = true;
  cached.rerender();
  expect(cached.result.current).toBe(true);
});

it('still pauses the profile for window blur, backgrounding and calls', () => {
  const { result } = renderHook(() => useFeedPlaybackAllowed());
  act(() => visualActivity.setFocused(false));
  expect(result.current).toBe(false);
  act(() => { visualActivity.setFocused(true); vi.advanceTimersByTime(249); });
  expect(result.current).toBe(false);
  act(() => vi.advanceTimersByTime(1));
  expect(result.current).toBe(true);
  act(() => visualActivity.setForeground(false));
  expect(result.current).toBe(false);
  act(() => { visualActivity.setForeground(true); visualActivity.setCall(true, false); vi.advanceTimersByTime(250); });
  expect(result.current).toBe(false);
});
