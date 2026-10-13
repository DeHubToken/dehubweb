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
  outer.getAnimations = () => [];
  const pill = document.createElement('div'); pill.dataset.feedNav = '';
  Object.defineProperty(pill, 'offsetParent', { value: document.body });
  pill.getBoundingClientRect = () => ({ top: 8, bottom: 44, left: 12, right: 378, width: 366, height: 36 } as DOMRect);
  outer.append(pill);
  const content = document.createElement('div');
  const bounds = document.createElement('div'); bounds.dataset.feedSwallowBounds = '';
  const cutLayer = document.createElement('div'); cutLayer.dataset.feedSwallowCut = '';
  const motion = document.createElement('div'); motion.dataset.feedSwallowMotion = '';
  const inverseNavLayer = document.createElement('div'); inverseNavLayer.dataset.feedSwallowContent = '';
  motion.append(inverseNavLayer); cutLayer.append(motion); content.append(cutLayer); bounds.append(content);
  content.getBoundingClientRect = () => ({ top: -100, left: 0, width: 390, height: 12000 } as DOMRect);
  cutLayer.getBoundingClientRect = content.getBoundingClientRect;
  document.body.append(outer, bounds);
  const root = document.scrollingElement || document.documentElement;
  Object.defineProperty(root, 'scrollHeight', { configurable: true, value: 12000 });
  Object.defineProperty(root, 'clientHeight', { configurable: true, value: 800 });
  const cancel = vi.fn(); const setKeyframes = vi.fn();
  const animate = vi.fn((_frames: Keyframe[], _options: KeyframeAnimationOptions) => ({ cancel, effect: { setKeyframes } }));
  content.animate = animate as unknown as typeof content.animate;
  motion.animate = animate as unknown as typeof motion.animate;
  vi.stubGlobal('ScrollTimeline', timeline ? class {} : undefined);
  const hook = renderHook(() => useFeedSwallowClip({ current: content }, '[data-feed-nav]'));
  return { callbacks, content, cutLayer, animate, cancel, hook };
}

it('applies the fallback before the first paint and has no idle frame tail', () => {
  const { content, callbacks } = fixture();
  expect(content.style.clipPath).toMatch(/^path\('M 0 120\.00 /);
  expect(content.dataset.feedSwallowDriver).toBe('frame');
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
  const { content, cutLayer, callbacks, animate, cancel, hook } = fixture(true);
  expect(animate).toHaveBeenCalledTimes(2);
  const frames = animate.mock.calls[0][0] as Keyframe[];
  expect(frames[0].transform).toBe('translateY(0px)');
  expect(frames[frames.length - 1]?.transform).toBe('translateY(11200px)');
  expect(content.dataset.feedSwallowDriver).toBe('scroll-transform');
  expect(content.style.clipPath).toBe('');
  expect(cutLayer.style.clipPath).toMatch(/^path\('M 0 120\.00 /);
  act(() => window.dispatchEvent(new Event('scroll')));
  expect(callbacks).toHaveLength(0);
  hook.unmount();
  expect(cancel).toHaveBeenCalledTimes(2);
  expect(content.dataset.feedSwallowDriver).toBeUndefined();
});
