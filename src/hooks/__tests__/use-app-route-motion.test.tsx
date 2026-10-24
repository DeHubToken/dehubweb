import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Location } from 'react-router-dom';
import { useAppRouteMotion } from '../use-app-route-motion';

const location = (pathname: string, key: string): Location => ({ pathname, key, search: '', hash: '', state: null });
let update: (() => void) | undefined;
let finish: (() => void) | undefined;
let skip: ReturnType<typeof vi.fn>;
let start: ReturnType<typeof vi.fn>;

beforeEach(() => {
  history.replaceState({ idx: 1 }, '');
  document.body.innerHTML = '<main data-main-panel></main>';
  skip = vi.fn();
  start = vi.fn((callback: () => void) => {
    update = callback;
    return { finished: new Promise<void>(resolve => { finish = resolve; }), skipTransition: skip };
  });
  Object.defineProperty(document, 'startViewTransition', { configurable: true, value: start });
});

afterEach(() => {
  document.documentElement.classList.remove('reduce-motion');
  delete document.documentElement.dataset.appNavigation;
  Object.defineProperty(document, 'startViewTransition', { configurable: true, value: undefined });
  vi.restoreAllMocks();
});

it('keeps the source rendered until the snapshot update commits the destination', async () => {
  const from = location('/app', 'feed');
  const to = location('/app/post/1', 'post');
  const { result, rerender } = renderHook(({ route }) => useAppRouteMotion(route, false), { initialProps: { route: from } });
  history.replaceState({ idx: 2 }, '');
  rerender({ route: to });
  expect(result.current).toBe(from);
  expect(document.documentElement.dataset.appNavigation).toBe('forward');
  act(() => update?.());
  expect(result.current).toBe(to);
  await act(async () => { finish?.(); });
  expect(document.documentElement.dataset.appNavigation).toBeUndefined();
});

it('reverses the transition on browser Back and skips a running snapshot on rapid navigation', () => {
  const from = location('/app/post/1', 'post');
  const { result, rerender } = renderHook(({ route }) => useAppRouteMotion(route, false), { initialProps: { route: from } });
  history.replaceState({ idx: 0 }, '');
  rerender({ route: location('/app', 'feed') });
  expect(document.documentElement.dataset.appNavigation).toBe('back');
  const stale = update;
  history.replaceState({ idx: 2 }, '');
  const profile = location('/creator', 'profile');
  rerender({ route: profile });
  expect(skip).toHaveBeenCalledOnce();
  act(() => stale?.());
  expect(result.current).toBe(from);
  act(() => update?.());
  expect(result.current).toBe(profile);
});

it.each(['setting', 'system', 'unsupported', 'query', 'surface'] as const)('commits immediately for %s', reason => {
  const from = location('/app', 'feed');
  const { result, rerender } = renderHook(({ route, reduced }) => useAppRouteMotion(route, reduced), {
    initialProps: { route: from, reduced: false },
  });
  if (reason === 'setting') document.documentElement.classList.add('reduce-motion');
  if (reason === 'unsupported') Object.defineProperty(document, 'startViewTransition', { configurable: true, value: undefined });
  const to = location(reason === 'query' ? '/app' : reason === 'surface' ? '/docs' : '/creator', 'next');
  rerender({ route: to, reduced: reason === 'system' });
  expect(result.current).toBe(to);
  expect(start).not.toHaveBeenCalled();
});
