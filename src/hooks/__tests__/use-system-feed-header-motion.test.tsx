import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSystemFeedHeaderMotion } from '../use-system-feed-header-motion';

const read = (el: HTMLElement) => el.style.getPropertyValue('--system-feed-header-offset');
const offset = () => {
  const header = document.querySelector<HTMLElement>('[data-mobile-header]');
  const nav = document.querySelector<HTMLElement>('[data-test-nav]');
  // Never on <html>: a root custom property restyles the whole page.
  expect(read(document.documentElement)).toBe('');
  if (header && nav) expect(read(header)).toBe(read(nav));
  return nav ? read(nav) : '';
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('System feed header motion', () => {
  it('shares the full measured travel, follows size changes and clears on deactivation', () => {
    let onResize = () => {};
    const disconnect = vi.fn();
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: () => void) { onResize = callback; }
      observe() {}
      disconnect = disconnect;
    });
    const header = document.createElement('header');
    header.setAttribute('data-mobile-header', '');
    document.body.appendChild(header);
    const nav = document.createElement('div');
    nav.setAttribute('data-test-nav', '');
    nav.style.top = '44px';
    let height = 52;
    Object.defineProperty(nav, 'offsetHeight', { get: () => height });
    document.body.appendChild(nav);
    const ref = { current: nav };
    const { rerender } = renderHook(
      ({ enabled, hidden }) => useSystemFeedHeaderMotion(ref, enabled, hidden),
      { initialProps: { enabled: true, hidden: false } },
    );
    expect(offset()).toBe('0px');
    rerender({ enabled: true, hidden: true });
    expect(offset()).toBe('-96px');
    act(() => { height = 88; onResize(); });
    expect(offset()).toBe('-132px');
    rerender({ enabled: true, hidden: false });
    expect(offset()).toBe('0px');
    rerender({ enabled: false, hidden: false });
    expect(offset()).toBe('');
    expect(disconnect).toHaveBeenCalled();
  });

  it('does not measure or change the header when disabled', () => {
    const observer = vi.fn();
    vi.stubGlobal('ResizeObserver', observer);
    renderHook(() => useSystemFeedHeaderMotion({ current: document.createElement('div') }, false, true));
    expect(offset()).toBe('');
    expect(observer).not.toHaveBeenCalled();
  });
});
