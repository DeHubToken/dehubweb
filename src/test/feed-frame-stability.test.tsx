import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useFeedFrameAspect } from '@/hooks/use-feed-frame-aspect';

let deliver: (entries: Array<{ target: Element; isIntersecting: boolean }>) => void;
const element = { current: document.createElement('div') };
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback: typeof deliver) { deliver = callback; }
    observe() {} unobserve() {} disconnect() {}
  });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });
const visible = (value: boolean) => act(() => deliver([{ target: element.current, isIntersecting: value }]));

describe('visible feed media frames', () => {
  it('waits for wheel momentum and a held touch before correcting a portrait fallback', () => {
    const view = renderHook(({ measured }: { measured: number | null }) =>
      useFeedFrameAspect('scrolling-web-portrait', measured ?? 16 / 9, element, true, measured), {
      initialProps: { measured: null },
    });
    visible(true);
    act(() => window.dispatchEvent(new Event('wheel')));
    view.rerender({ measured: 9 / 16 });
    expect(view.result.current).toBe(16 / 9);
    act(() => vi.advanceTimersByTime(400));
    act(() => window.dispatchEvent(new Event('touchstart')));
    act(() => vi.advanceTimersByTime(1000));
    expect(view.result.current).toBe(16 / 9);
    act(() => window.dispatchEvent(new Event('touchend')));
    act(() => vi.advanceTimersByTime(500));
    expect(view.result.current).toBe(9 / 16);
    view.unmount();
    const returned = renderHook(() => useFeedFrameAspect('scrolling-web-portrait', 16 / 9, element));
    expect(returned.result.current).toBe(9 / 16);
  });
  it('corrects a frozen fallback when a portrait video reports its real shape', () => {
    const view = renderHook(({ measured }: { measured: number | null }) =>
      useFeedFrameAspect('resolved-web-portrait', measured ?? 16 / 9, element, true, measured), {
      initialProps: { measured: null },
    });
    visible(true);
    expect(view.result.current).toBe(16 / 9);
    view.rerender({ measured: 9 / 16 });
    expect(view.result.current).toBe(9 / 16);
    view.unmount();
    const recycled = renderHook(() => useFeedFrameAspect('resolved-web-portrait', 16 / 9, element));
    expect(recycled.result.current).toBe(9 / 16);
  });

  it('holds every slide in a visible gallery, including hidden horizontal neighbours', () => {
    const view = renderHook(({ ratio }) => [
      useFeedFrameAspect('gallery-first', ratio, element),
      useFeedFrameAspect('gallery-neighbour', ratio, element),
    ], { initialProps: { ratio: 1 } });
    visible(true);
    view.rerender({ ratio: 0.5 });
    expect(view.result.current).toEqual([1, 1]);
  });
  it('prepares dimensions offscreen, then holds through metadata, scroll-back and remount', () => {
    const view = renderHook(({ ratio }) => useFeedFrameAspect('prepared-video', ratio, element), { initialProps: { ratio: 16 / 9 } });
    visible(false);
    view.rerender({ ratio: 9 / 16 });
    expect(view.result.current).toBe(9 / 16);
    visible(true);
    view.rerender({ ratio: 1 });
    expect(view.result.current).toBe(9 / 16);
    visible(false);
    view.rerender({ ratio: 2 });
    visible(true);
    expect(view.result.current).toBe(9 / 16);
    view.unmount();
    const returned = renderHook(() => useFeedFrameAspect('prepared-video', 2, element));
    expect(returned.result.current).toBe(9 / 16);
  });

  it('keeps a cold visible image frame steady when decoding finishes before visibility delivery', () => {
    const view = renderHook(({ ratio }) => useFeedFrameAspect('cold-image', ratio, element), { initialProps: { ratio: 1 } });
    view.rerender({ ratio: 0.5 });
    expect(view.result.current).toBe(1);
    visible(true);
    expect(view.result.current).toBe(1);
  });

  it('resets for different media and lets the post viewer use its true dimensions', () => {
    const view = renderHook(({ key, ratio, enabled }) => useFeedFrameAspect(key, ratio, element, enabled), {
      initialProps: { key: 'recycled-one', ratio: 0.5, enabled: true },
    });
    visible(true);
    view.rerender({ key: 'recycled-two', ratio: 2, enabled: true });
    expect(view.result.current).toBe(2);
    view.rerender({ key: 'recycled-one', ratio: 1.5, enabled: false });
    expect(view.result.current).toBe(1.5);
  });
});
