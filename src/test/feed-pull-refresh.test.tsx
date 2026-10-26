import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { pullForDrag } from '@/lib/pill-pull-motion';

let node: HTMLDivElement, root: Root, hook: ReturnType<typeof usePullToRefresh>;
let refresh = vi.fn<() => void>();
function Harness({ enabled = true, refreshing = false }: { enabled?: boolean; refreshing?: boolean }) {
  hook = usePullToRefresh({ enabled, isRefreshing: refreshing, onRefresh: () => refresh() });
  return <div><button>Control</button><div data-panel><div data-content /></div></div>;
}
const touch = (x: number, y: number, target: Element = node) => ({ touches: [{ clientX: x, clientY: y }], target } as unknown as React.TouchEvent);
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => setTimeout(() => callback(performance.now()), 16));
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  node = document.createElement('div'); document.body.append(node);
  root = createRoot(node); refresh = vi.fn<() => void>();
  act(() => root.render(<Harness />));
});
afterEach(() => { act(() => root.unmount()); node.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });
const settle = () => act(() => vi.advanceTimersByTime(2000));
function pull(x: number, y: number, target?: Element) {
  act(() => hook.handlers.onTouchStart(touch(0, 0, target)));
  act(() => hook.handlers.onTouchMove(touch(x, y, target)));
}
it('refreshes once after a threshold pull and release', () => {
  pull(0, 180); expect(hook.pullDistance).toBe(pullForDrag(180));
  act(() => hook.handlers.onTouchEnd()); act(() => hook.handlers.onTouchEnd());
  expect(refresh).toHaveBeenCalledTimes(1); expect(hook.pullDistance).toBeGreaterThan(0);
  settle(); expect(hook.pullDistance).toBe(0);
});
it('does not refresh after a short or cancelled pull', () => {
  pull(0, 80); act(() => hook.handlers.onTouchEnd());
  settle();
  pull(0, 180); act(() => hook.handlers.onTouchCancel()); act(() => hook.handlers.onTouchEnd());
  settle();
  expect(refresh).not.toHaveBeenCalled(); expect(hook.pullDistance).toBe(0);
});
it('ends the subpixel return tail and accepts the next pull', () => {
  pull(0, 200);
  act(() => hook.handlers.onTouchEnd());
  act(() => vi.advanceTimersByTime(650));
  expect(hook.pullDistance).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
  pull(0, 80);
  expect(hook.pullDistance).toBe(pullForDrag(80));
});
it('preserves horizontal feed swipes', () => {
  pull(180, 30); act(() => hook.handlers.onTouchEnd());
  expect(refresh).not.toHaveBeenCalled(); expect(hook.pullDistance).toBe(0);
});
it('moves the feed without rendering its cards and gives release to the compositor', () => {
  let renders = 0;
  const onMotion = vi.fn();
  const cancel = vi.fn();
  const animate = vi.fn(() => ({ cancel }));
  function CompositedFeed() {
    renders++;
    const motionRef = React.useRef<HTMLDivElement>(null);
    hook = usePullToRefresh({ enabled: true, isRefreshing: false, onRefresh: refresh, motionRef, onMotion });
    return <div ref={motionRef} data-motion />;
  }
  act(() => root.render(<CompositedFeed />));
  const content = node.querySelector<HTMLElement>('[data-motion]')!;
  content.animate = animate as unknown as typeof content.animate;
  const before = renders;
  pull(0, 200, content);
  expect(content.style.transform).toContain('translate3d');
  act(() => hook.handlers.onTouchEnd());
  act(() => vi.advanceTimersByTime(320));
  expect(animate).toHaveBeenCalledTimes(1);
  // Mid-spring: the feed is still moving (just past rest on its bounce).
  expect(onMotion.mock.lastCall![0]).not.toBe(0);
  expect(renders).toBe(before);
  settle();
  expect(cancel).toHaveBeenCalled();
  expect(content.style.transform).toBe('');
  expect(content.style.willChange).toBe('');
  expect(onMotion.mock.lastCall).toEqual([0, false]);
});
it('allows downward refresh from a carousel that owns horizontal swipes', () => {
  const panel = node.querySelector('[data-panel]')!;
  panel.setAttribute('data-no-swipe', '');
  pull(0, 180, node.querySelector('[data-content]')!);
  act(() => hook.handlers.onTouchEnd());
  expect(refresh).toHaveBeenCalledTimes(1);
});
it('does not refresh from filter panels or media seek zones', () => {
  const panel = node.querySelector('[data-panel]')!;
  for (const attribute of ['data-feed-filter-panel', 'data-no-pull']) {
    panel.setAttribute(attribute, '');
    pull(0, 180, node.querySelector('[data-content]')!);
    act(() => hook.handlers.onTouchEnd());
    panel.removeAttribute(attribute);
  }
  expect(refresh).not.toHaveBeenCalled();
});
it('claims downward browser touch movement while leaving horizontal movement native', () => {
  function BrowserHarness() {
    const containerRef = React.useRef<HTMLDivElement>(null);
    hook = usePullToRefresh({ enabled: true, isRefreshing: false, onRefresh: refresh, containerRef });
    return <div ref={containerRef} data-browser-surface><div data-no-swipe><div data-content /></div></div>;
  }
  act(() => root.render(<BrowserHarness />));
  const content = node.querySelector('[data-content]')!;
  const move = (x: number, y: number) => {
    const event = new Event('touchmove', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'touches', { value: [{ clientX: x, clientY: y }] });
    act(() => content.dispatchEvent(event));
    return event.defaultPrevented;
  };
  act(() => hook.handlers.onTouchStart(touch(0, 0, content)));
  expect(move(0, 180)).toBe(true);
  expect(move(180, 20)).toBe(false);
  expect(hook.isPulling).toBe(false);
  act(() => hook.handlers.onTouchEnd());
  expect(refresh).not.toHaveBeenCalled();
});
it('leaves player controls and scrolled nested panels alone', () => {
  pull(0, 180, node.querySelector('button')!); act(() => hook.handlers.onTouchEnd());
  const panel = node.querySelector('[data-panel]')!; panel.scrollTop = 20;
  pull(0, 180, node.querySelector('[data-content]')!); act(() => hook.handlers.onTouchEnd());
  expect(refresh).not.toHaveBeenCalled();
});
it('does not trigger while a refresh is already running', () => {
  act(() => root.render(<Harness refreshing />)); pull(0, 180); act(() => hook.handlers.onTouchEnd());
  expect(refresh).not.toHaveBeenCalled();
});
it('keeps surfaces that do not opt in disabled', () => {
  act(() => root.render(<Harness enabled={false} />)); pull(0, 180); act(() => hook.handlers.onTouchEnd());
  expect(refresh).not.toHaveBeenCalled();
});
it('draws back immediately and gradually while the fetch is still running', () => {
  pull(0, 200); const released = hook.pullDistance;
  act(() => hook.handlers.onTouchEnd());
  act(() => root.render(<Harness refreshing />));
  act(() => vi.advanceTimersByTime(16));
  expect(hook.pullDistance).toBeLessThan(released);
  expect(hook.pullDistance).toBeGreaterThan(released * .9);
  act(() => vi.advanceTimersByTime(400));
  // The spring carries the feed a few pixels past rest, then settles.
  expect(hook.pullDistance).toBeLessThan(0);
  expect(hook.pullDistance).toBeGreaterThan(-released * .05);
  settle(); expect(hook.pullDistance).toBe(0);
  expect(refresh).toHaveBeenCalledTimes(1);
});
