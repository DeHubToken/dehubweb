import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useTabletPortraitFeed } from '@/hooks/use-tablet-portrait-feed';

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

function feed(width: number, columnWidth: number, mainWidth = width, mainLeft = 0) {
  vi.stubGlobal('innerWidth', width);
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  const main = document.createElement('main');
  main.setAttribute('data-main-panel', '');
  const root = document.createElement('div');
  root.setAttribute('data-feed-root', '');
  const card = document.createElement('div');
  root.append(card);
  main.append(root);
  document.body.append(main);
  main.getBoundingClientRect = () => ({ left: mainLeft, width: mainWidth }) as DOMRect;
  card.getBoundingClientRect = () => ({ width: columnWidth }) as DOMRect;
  return { current: card };
}

describe('portrait layout in the actual feed column', () => {
  it('enables the split card at the reported 617px viewport and exits on a narrow phone', () => {
    const ref = feed(617, 575);
    const view = renderHook(() => useTabletPortraitFeed(ref, true));
    expect(view.result.current).toBe(true);
    act(() => {
      vi.stubGlobal('innerWidth', 390);
      window.dispatchEvent(new Event('resize'));
    });
    expect(view.result.current).toBe(false);
  });

  it('does not enable it while a side panel takes space from main', () => {
    const ref = feed(834, 575, 617, 217);
    const view = renderHook(() => useTabletPortraitFeed(ref, true));
    expect(view.result.current).toBe(false);
  });

  it('leaves post pages and other surfaces alone', () => {
    const ref = feed(617, 575);
    ref.current.parentElement!.removeAttribute('data-feed-root');
    const view = renderHook(() => useTabletPortraitFeed(ref, true));
    expect(view.result.current).toBe(false);
  });
});
