import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The watchdog's job is to catch a page that stopped taking scroll. Its first
 * five days in production produced 1,303 reports and 55% of them were at
 * scrollTop 0 — a downward flick at the top of the feed, where the page is
 * right to stay still because there is nowhere above to go.
 *
 * Two things follow, and this pins both:
 *   1. A drag the page could not have honoured is not a freeze.
 *   2. The gesture path reports and does not recover. What eats those touches
 *      is not on <body>, so stripping body's inline styles on a guess tears the
 *      lock off a fullscreen viewer that is legitimately holding the page.
 */

const ERRORS: string[] = [];
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    error: (message: string) => ERRORS.push(message),
    warn: () => {},
    info: () => {},
    debug: () => {},
  }),
}));

let scrollTop = 0;
vi.mock('@/lib/document-scroll', () => ({
  getDocumentScrollTop: () => scrollTop,
}));

/** A page three viewports tall, so the watchdog's height gate passes. */
function makePageScrollable() {
  Object.defineProperty(document.body, 'scrollHeight', { value: 3000, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: 1000, configurable: true });
}

function touch(type: string, clientY: number) {
  const event = new Event(type, { bubbles: true }) as TouchEvent & { touches: unknown };
  Object.defineProperty(event, 'touches', {
    value: type === 'touchend' ? [] : [{ clientY }],
    configurable: true,
  });
  Object.defineProperty(event, 'target', { value: document.body, configurable: true });
  window.dispatchEvent(event);
}

/** A drag of `dy` px: positive is downward, which asks the page to scroll up. */
function drag(dy: number) {
  touch('touchstart', 500);
  touch('touchmove', 500 + dy);
  touch('touchend', 500 + dy);
}

describe('scroll freeze watchdog', () => {
  beforeEach(async () => {
    ERRORS.length = 0;
    scrollTop = 0;
    document.body.style.cssText = '';
    makePageScrollable();
    // jsdom has no elementFromPoint. Null is the honest answer for these cases:
    // nothing is covering the page, which is what makes the drag reportable.
    (document as unknown as { elementFromPoint: () => Element | null }).elementFromPoint = () => null;
    vi.resetModules();
    const mod = await import('@/lib/scroll-freeze-watchdog');
    mod.installScrollFreezeWatchdog();
  });

  afterEach(() => {
    document.body.style.cssText = '';
  });

  it('says nothing when a downward drag happens at the top of the page', () => {
    scrollTop = 0;
    drag(120);
    expect(ERRORS).toEqual([]);
  });

  it('says nothing when an upward drag happens at the bottom of the page', () => {
    scrollTop = 2000; // scrollHeight 3000 - innerHeight 1000
    drag(-120);
    expect(ERRORS).toEqual([]);
  });

  it('reports a drag the page had room to honour and did not', () => {
    scrollTop = 900;
    drag(120);
    expect(ERRORS).toContain('A drag moved the finger but not the page');
  });

  it('leaves the body alone when it reports a swallowed drag', () => {
    scrollTop = 900;
    // A fullscreen viewer legitimately holding the page still.
    document.body.style.setProperty('overflow', 'hidden');
    document.body.style.setProperty('position', 'fixed');

    drag(120);

    expect(document.body.style.getPropertyValue('overflow')).toBe('hidden');
    expect(document.body.style.getPropertyValue('position')).toBe('fixed');
  });
});
