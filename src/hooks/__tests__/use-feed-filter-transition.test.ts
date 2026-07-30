import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement, type FC } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  useFeedFilterTransition,
  type FeedFilterTransition,
} from '@/hooks/use-feed-filter-transition';

/**
 * The timings this hook exists for are all invisible in a screenshot, so they
 * are pinned here instead: it must survive the gap before the request starts,
 * outlive a warm cache hit, and let go when the request stalls.
 *
 * Hand-rolled harness rather than @testing-library/react: this repo's install
 * is missing @testing-library/dom, so `renderHook` throws on import.
 */
function renderTransition(initialBusy: boolean) {
  const box: { current: FeedFilterTransition } = { current: null as never };
  const Probe: FC<{ busy: boolean }> = ({ busy }) => {
    box.current = useFeedFilterTransition(busy);
    return null;
  };

  const container = document.createElement('div');
  document.body.appendChild(container);
  let root: Root;
  act(() => {
    root = createRoot(container);
    root.render(createElement(Probe, { busy: initialBusy }));
  });

  return {
    get active() {
      return box.current.active;
    },
    begin: () => act(() => box.current.begin()),
    setBusy: (busy: boolean) =>
      act(() => {
        root.render(createElement(Probe, { busy }));
      }),
    advance: (ms: number) => act(() => { vi.advanceTimersByTime(ms); }),
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe('useFeedFilterTransition', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // performance.now() must advance with the fake clock or every elapsed-time
    // calculation in the hook reads 0.
    vi.setSystemTime(0);
    vi.spyOn(performance, 'now').mockImplementation(() => Date.now());
    // React 18 wants this before act() outside of a test renderer.
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('is inactive until begin() is called', () => {
    const h = renderTransition(false);
    expect(h.active).toBe(false);
    h.unmount();
  });

  it('activates on begin()', () => {
    const h = renderTransition(false);
    h.begin();
    expect(h.active).toBe(true);
    h.unmount();
  });

  it('stays up across the gap before the request starts', () => {
    // The click lands, params are still deferred, nothing is fetching yet.
    const h = renderTransition(false);
    h.begin();

    h.advance(200);
    expect(h.active).toBe(true);

    // The fetch finally starts, inside the grace window.
    h.setBusy(true);
    h.advance(2000);
    expect(h.active).toBe(true);

    h.setBusy(false);
    h.advance(500);
    expect(h.active).toBe(false);
    h.unmount();
  });

  it('gives up if no request ever starts', () => {
    const h = renderTransition(false);
    h.begin();
    h.advance(500);
    expect(h.active).toBe(false);
    h.unmount();
  });

  it('holds a cache hit on screen long enough to be read', () => {
    // Fetch starts and finishes back to back — without the floor this would
    // flash for a single frame.
    const h = renderTransition(false);
    h.begin();
    h.setBusy(true);
    h.setBusy(false);

    h.advance(300);
    expect(h.active).toBe(true);

    h.advance(200);
    expect(h.active).toBe(false);
    h.unmount();
  });

  it('releases the feed when the request stalls', () => {
    const h = renderTransition(true);
    h.begin();

    h.advance(7_000);
    expect(h.active).toBe(true);

    h.advance(1_500);
    expect(h.active).toBe(false);
    h.unmount();
  });
});
