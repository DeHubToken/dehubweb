import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useFeedSwallowClip } from '@/hooks/use-feed-swallow-clip';

afterEach(() => {
  cleanup(); document.body.innerHTML = ''; delete document.documentElement.dataset.theme; vi.unstubAllGlobals();
});

function fixture(timeline = false) {
  const callbacks: FrameRequestCallback[] = [];
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => { callbacks.push(callback); return callbacks.length; }));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  document.documentElement.dataset.theme = 'system';
  const outer = document.createElement('div');
  outer.dataset.feedNavOuter = ''; outer.style.position = 'sticky'; outer.style.top = '0px'; outer.style.transform = 'none';
  outer.getBoundingClientRect = () => ({ top: 0, height: 56 } as DOMRect);
  const pill = document.createElement('div'); pill.dataset.feedNav = '';
  Object.defineProperty(pill, 'offsetParent', { value: document.body });
  pill.getBoundingClientRect = () => ({ top: 8, bottom: 44, left: 12, right: 378, width: 366, height: 36 } as DOMRect);
  outer.append(pill);
  const content = document.createElement('div');
  content.getBoundingClientRect = () => ({ top: -100, left: 0, width: 390, height: 12000 } as DOMRect);
  document.body.append(outer, content);
  const root = document.scrollingElement || document.documentElement;
  Object.defineProperty(root, 'scrollHeight', { configurable: true, value: 12000 });
  Object.defineProperty(root, 'clientHeight', { configurable: true, value: 800 });
  const cancel = vi.fn(); const setKeyframes = vi.fn();
  const animate = vi.fn((_frames: Keyframe[], _options: KeyframeAnimationOptions) => ({ cancel, effect: { setKeyframes } }));
  content.animate = animate as unknown as typeof content.animate;
  if (timeline) vi.stubGlobal('ScrollTimeline', class {});
  const hook = renderHook(() => useFeedSwallowClip({ current: content }, '[data-feed-nav]'));
  return { callbacks, content, animate, cancel, hook };
}

it('applies the fallback before the first paint and has no idle frame tail', () => {
  const { content, callbacks } = fixture();
  expect(content.style.clipPath).toMatch(/^path\('M 0 120\.00 /);
  expect(callbacks).toHaveLength(0);
  act(() => window.dispatchEvent(new Event('scroll')));
  expect(callbacks).toHaveLength(1);
  act(() => callbacks[0](0));
  expect(callbacks).toHaveLength(1);
});

it('does not wake the cut for an unrelated chat scroller', () => {
  const { callbacks } = fixture();
  const chat = document.createElement('div'); document.body.append(chat);
  act(() => chat.dispatchEvent(new Event('scroll')));
  expect(callbacks).toHaveLength(0);
});

it('lets the scroll timeline own fast scrolling and cancels it on unmount', () => {
  const { content, callbacks, animate, cancel, hook } = fixture(true);
  expect(animate).toHaveBeenCalledTimes(1);
  const frames = animate.mock.calls[0][0] as Keyframe[];
  expect(frames[0].clipPath).toMatch(/^path\('M 0 120\.00 /);
  expect(frames.at(-1)?.clipPath).toMatch(/^path\('M 0 11320\.00 /);
  expect(content.dataset.feedSwallowDriver).toBe('scroll-timeline');
  expect(content.style.clipPath).toBe('');
  act(() => window.dispatchEvent(new Event('scroll')));
  expect(callbacks).toHaveLength(0);
  hook.unmount();
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(content.dataset.feedSwallowDriver).toBeUndefined();
});
