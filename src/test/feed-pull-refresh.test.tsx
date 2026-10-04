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
it('preserves horizontal feed swipes', () => {
  pull(180, 30); act(() => hook.handlers.onTouchEnd());
  expect(refresh).not.toHaveBeenCalled(); expect(hook.pullDistance).toBe(0);
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
  expect(hook.pullDistance).toBeLessThan(released * .5);
  expect(hook.pullDistance).toBeGreaterThan(0);
  settle(); expect(hook.pullDistance).toBe(0);
  expect(refresh).toHaveBeenCalledTimes(1);
});
