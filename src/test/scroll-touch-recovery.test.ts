import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { restoreDocumentTouchScroll } from '@/lib/scroll-freeze-watchdog';
import { lockBodyScroll } from '@/lib/body-scroll-lock';
const scrollTo = vi.fn();
vi.mock('@/lib/document-scroll', () => ({ getDocumentScrollTop: () => 732, scrollDocumentTo: (top: number) => scrollTo(top) }));
vi.mock('@/lib/logger', () => ({ createLogger: () => ({ error: vi.fn() }) }));
beforeEach(() => {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('SamsungBrowser/30.0');
  Object.defineProperty(document.body, 'scrollHeight', { value: 3000, configurable: true });
  document.elementFromPoint = () => null;
  document.body.style.cssText = '';
  document.body.innerHTML = '';
  scrollTo.mockClear();
});
afterEach(() => { vi.restoreAllMocks(); document.body.style.cssText = ''; document.body.innerHTML = ''; });
describe('Samsung post-overlay touch recovery', () => {
  it('rebuilds the unlocked scrolling layer and preserves offset and inline priority over repeated closes', () => {
    document.body.style.setProperty('overflow-y', 'auto', 'important');
    for (let i = 0; i < 5; i++) {
      expect(restoreDocumentTouchScroll()).toBe(true);
      expect(document.body.style.getPropertyValue('overflow-y')).toBe('auto');
      expect(document.body.style.getPropertyPriority('overflow-y')).toBe('important');
    }
    expect(scrollTo).toHaveBeenLastCalledWith(732);
  });
  it('does not unlock an underlying modal or a registered fullscreen owner', () => {
    document.body.innerHTML = '<div role="dialog" data-state="open"></div>';
    expect(restoreDocumentTouchScroll()).toBe(false);
    document.body.innerHTML = '';
    const release = lockBodyScroll('test-viewer');
    expect(restoreDocumentTouchScroll()).toBe(false);
    release();
    expect(scrollTo).not.toHaveBeenCalled();
  });
  it('does not change other browsers', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Chrome/143');
    expect(restoreDocumentTouchScroll()).toBe(false);
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
