import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('useStickyNavVisibility', () => {
  let scrollY = 0;

  beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = '';
    scrollY = 0;
    Object.defineProperty(window, 'scrollY', {
      configurable: true,
      get: () => scrollY,
    });
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('waits for content to cover the pill gap and only returns at the top', async () => {
    const nav = document.createElement('div');
    nav.dataset.feedNavOuter = '';
    nav.dataset.navReturnTop = '';
    nav.style.position = 'sticky';
    nav.style.top = '44px';
    Object.defineProperties(nav, {
      offsetHeight: { configurable: true, value: 200 },
      offsetParent: { configurable: true, value: document.body },
    });
    document.body.appendChild(nav);

    const { useStickyNavVisibility } = await import('../use-scroll-direction');
    const { result, unmount } = renderHook(() => useStickyNavVisibility());

    // Less than the pill's 200px height + 44px sticky offset: hiding here
    // would expose an empty strip before the list reaches the viewport top.
    act(() => {
      scrollY = 200;
      window.dispatchEvent(new Event('scroll'));
    });
    expect(result.current).toBe(true);

    act(() => {
      scrollY = 244;
      window.dispatchEvent(new Event('scroll'));
    });
    expect(result.current).toBe(false);

    // A small correction upward while reading must not cover the item again.
    act(() => {
      scrollY = 120;
      window.dispatchEvent(new Event('scroll'));
    });
    expect(result.current).toBe(false);

    act(() => {
      scrollY = 0;
      window.dispatchEvent(new Event('scroll'));
    });
    expect(result.current).toBe(true);

    unmount();
  });
});
