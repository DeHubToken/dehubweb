import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useFeedSwallowClip } from '@/hooks/use-feed-swallow-clip';

afterEach(() => { cleanup(); document.body.innerHTML = ''; delete document.documentElement.dataset.theme; vi.unstubAllGlobals(); });

it.each([
  ['hazy', undefined, false, false],
  ['system', undefined, false, false],
  ['immersive', undefined, false, false],
  ['system', 'bottom', false, true],
  ['hazy', 'top', false, false],
  ['hazy', undefined, true, false],
] as const)('keeps the correct feed boundary for %s edge=%s nested=%s', (theme, edge, nested, bottom) => {
  let frame: FrameRequestCallback | undefined;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frame = callback; return 1; });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  document.documentElement.dataset.theme = theme;
  const pill = document.createElement('div');
  pill.dataset.profileTestPill = '';
  Object.defineProperty(pill, 'offsetParent', { value: document.body });
  pill.getBoundingClientRect = () => ({ top: 4, bottom: 56, left: 8, right: 382, width: 374, height: 52 } as DOMRect);
  const content = document.createElement('div');
  content.getBoundingClientRect = () => ({ top: -100, left: 0, width: 390, height: 1000 } as DOMRect);
  if (nested) { content.append(pill); document.body.append(content); }
  else document.body.append(pill, content);
  const { unmount } = renderHook(() => useFeedSwallowClip(
    { current: content }, '[data-profile-test-pill]', [], { edge },
  ));
  act(() => frame?.(0));
  if (bottom) expect(content.style.clipPath).toBe('inset(156.00px 0 0 0)');
  else expect(content.style.clipPath).toBe('inset(108.00px 0 0 0)');
  unmount();
});

it('clears the profile cut when loaded content moves below the bar without another scroll', () => {
  let frame: FrameRequestCallback | undefined;
  let resized: (() => void) | undefined;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frame = callback; return 1; });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) { resized = callback; }
    observe() {}
    disconnect() {}
  });
  const pill = document.createElement('div');
  pill.dataset.profileTestPill = '';
  Object.defineProperty(pill, 'offsetParent', { value: document.body });
  pill.getBoundingClientRect = () => ({ top: 4, bottom: 56, left: 8, right: 382, width: 374, height: 52 } as DOMRect);
  const content = document.createElement('div');
  let top = -100;
  content.getBoundingClientRect = () => ({ top, left: 0, width: 390, height: 1000 } as DOMRect);
  document.body.append(pill, content);
  const { unmount } = renderHook(() => useFeedSwallowClip(
    { current: content }, '[data-profile-test-pill]', [], { allThemes: true, edge: 'bottom' },
  ));
  act(() => frame?.(0));
  expect(content.style.clipPath).toBe('inset(156.00px 0 0 0)');
  top = 80;
  act(() => { resized?.(); frame?.(0); });
  expect(content.style.clipPath).toBe('');
  unmount();
  expect(content.style.clipPath).toBe('');
});
