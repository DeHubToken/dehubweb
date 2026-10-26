import { act, fireEvent, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Location } from 'react-router-dom';
import { notifyRouteContentReady } from '@/lib/route-loading-shell';
import { useAppRouteMotion, usesLoadingCover } from '../use-app-route-motion';

const { t } = vi.hoisted(() => ({ t: (_: string, options: { defaultValue: string }) => options.defaultValue }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t }) }));
const location = (pathname: string, key: string): Location => ({ pathname, key, search: '', hash: '', state: null });
let frames: Map<number, FrameRequestCallback>;
let nextFrame: number;

beforeEach(() => {
  vi.useFakeTimers();
  history.replaceState({ idx: 1 }, '');
  document.body.innerHTML = '<main data-main-panel style="opacity: .8"></main>';
  document.querySelector('main')!.inert = false;
  frames = new Map();
  nextFrame = 0;
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { frames.set(++nextFrame, callback); return nextFrame; });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => { frames.delete(id); });
});
afterEach(() => {
  document.documentElement.classList.remove('reduce-motion');
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function paintThenRender() {
  act(() => {
    const callbacks = [...frames.values()];
    frames.clear();
    callbacks.forEach(callback => callback(0));
    vi.advanceTimersByTime(0);
  });
}

it('shows the destination header and Back before scheduling post content', () => {
  const from = location('/app', 'feed');
  const to = location('/app/post/1', 'post');
  const { result, rerender } = renderHook(({ route }) => useAppRouteMotion(route, false), { initialProps: { route: from } });
  rerender({ route: to });
  expect(result.current).toBe(from);
  expect(document.querySelector('.app-route-loading-shell strong')?.textContent).toBe('Post');
  expect(document.querySelectorAll('.post-quiet-loader path')).toHaveLength(3);
  expect(document.querySelector('.app-route-loading-author, .app-route-loading-line, .app-route-loading-media')).toBeNull();
  expect(document.querySelector('main')?.style.opacity).toBe('0.8');
  const back = vi.spyOn(history, 'back').mockImplementation(() => {});
  fireEvent.click(document.querySelector('.app-route-loading-shell button')!);
  expect(back).toHaveBeenCalledOnce();
  paintThenRender();
  expect(result.current).toBe(to);
  expect(document.querySelector('main')?.style.opacity).toBe('0.8');
  expect(document.querySelector('main')?.inert).toBe(true);
  expect(document.querySelector('.app-route-loading-shell')).not.toBeNull();
  act(() => notifyRouteContentReady(to.key));
  expect(document.querySelector('main')?.style.opacity).toBe('0.8');
  expect(document.querySelector('main')?.inert).toBe(false);
  act(() => vi.advanceTimersByTime(120));
  expect(document.querySelector('.app-route-loading-shell')).toBeNull();
});

it('cancels an unpainted destination when Back returns to the source', () => {
  const from = location('/app', 'feed');
  const { result, rerender } = renderHook(({ route }) => useAppRouteMotion(route, false), { initialProps: { route: from } });
  rerender({ route: location('/app/post/1', 'post') });
  rerender({ route: from });
  paintThenRender();
  act(() => vi.advanceTimersByTime(120));
  expect(result.current).toBe(from);
  expect(document.querySelector('.app-route-loading-shell')).toBeNull();
  expect(document.querySelector('main')?.style.opacity).toBe('0.8');
});

it('keeps only the latest destination and ignores stale ready signals', () => {
  const from = location('/app', 'feed');
  const { result, rerender } = renderHook(({ route }) => useAppRouteMotion(route, false), { initialProps: { route: from } });
  rerender({ route: location('/app/post/1', 'post') });
  const profile = location('/app/post/2', 'profile');
  rerender({ route: profile });
  expect(document.querySelectorAll('.app-route-loading-shell')).toHaveLength(1);
  paintThenRender();
  expect(result.current).toBe(profile);
  act(() => notifyRouteContentReady('post'));
  expect(document.querySelector('main')?.inert).toBe(true);
  act(() => notifyRouteContentReady('profile'));
  expect(document.querySelector('main')?.inert).toBe(false);
});

it('does not require View Transitions and removes reduced-motion loading immediately on readiness', () => {
  document.documentElement.classList.add('reduce-motion');
  const from = location('/app', 'feed');
  const { result, rerender } = renderHook(({ route }) => useAppRouteMotion(route, true), { initialProps: { route: from } });
  const to = location('/app/post/2', 'profile');
  rerender({ route: to });
  paintThenRender();
  expect(result.current).toBe(to);
  act(() => notifyRouteContentReady('profile'));
  expect(document.querySelector('.app-route-loading-shell')).toBeNull();
});

it('restores content after an error or a missing readiness signal', () => {
  const from = location('/app', 'feed');
  const { rerender } = renderHook(({ route }) => useAppRouteMotion(route, false), { initialProps: { route: from } });
  rerender({ route: location('/app/post/1', 'post') });
  paintThenRender();
  act(() => vi.advanceTimersByTime(5000));
  expect(document.querySelector('.app-route-loading-shell')).toBeNull();
  expect(document.querySelector('main')?.style.opacity).toBe('0.8');
});

it.each(['/app', '/docs'])('commits query-only changes or another surface directly (%s)', path => {
  const from = location('/app', 'feed');
  const { result, rerender } = renderHook(({ route }) => useAppRouteMotion(route, false), { initialProps: { route: from } });
  const to = location(path, 'next');
  rerender({ route: to });
  expect(result.current).toBe(to);
  expect(document.querySelector('.app-route-loading-shell')).toBeNull();
});

it.each(['/app/messages', '/app/profile', '/r2r', '/music', '/editor'])('switches to %s at once with no loading cover', path => {
  const from = location('/app', 'feed');
  const { result, rerender } = renderHook(({ route }) => useAppRouteMotion(route, false), { initialProps: { route: from } });
  const to = location(path, 'next');
  rerender({ route: to });
  expect(result.current).toBe(to);
  expect(document.querySelector('.app-route-loading-shell')).toBeNull();
});

it('covers only post opens', () => {
  expect(usesLoadingCover('/app/post/1')).toBe(true);
  expect(usesLoadingCover('/video/2')).toBe(true);
  for (const path of ['/app', '/app/profile', '/r2r', '/app/messages', '/editor']) expect(usesLoadingCover(path)).toBe(false);
});
