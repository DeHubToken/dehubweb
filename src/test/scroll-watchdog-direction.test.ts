import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The watchdog's job is to catch a page that stopped taking scroll. Its first
 * five days in production produced 1,303 reports and 55% of them were at
 * scrollTop 0 — a downward flick at the top of the feed, where the page is
 * right to stay still because there is nowhere above to go.
 *
 * Three things follow, and this pins all of them:
 *   1. A drag the page could not have honoured is not a freeze.
 *   2. Neither is one the page honoured a moment late. The verdict waits for
 *      the drag to land instead of being taken inside the gesture.
 *   3. The gesture path reports and does not recover. What eats those touches
 *      is not on <body>, so stripping body's inline styles on a guess tears the
 *      lock off a fullscreen viewer that is legitimately holding the page — so
 *      the report has to carry enough to name the culprit instead.
 */

type Report = { message: string; meta: Record<string, unknown> };
const REPORTS: Report[] = [];
const messages = () => REPORTS.map((r) => r.message);

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    error: (message: string, meta: Record<string, unknown>) => REPORTS.push({ message, meta }),
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

let dragTarget: Element = document.body;

function touch(type: string, clientY: number) {
  const event = new Event(type, { bubbles: true }) as TouchEvent & { touches: unknown };
  Object.defineProperty(event, 'touches', {
    value: type === 'touchend' ? [] : [{ clientX: 100, clientY }],
    configurable: true,
  });
  Object.defineProperty(event, 'target', { value: dragTarget, configurable: true });
  window.dispatchEvent(event);
}

/** A drag of `dy` px: positive is downward, which asks the page to scroll up. */
function drag(dy: number) {
  touch('touchstart', 500);
  touch('touchmove', 500 + dy);
  touch('touchend', 500 + dy);
}

/** Let the deferred verdict run. */
function settle() {
  vi.advanceTimersByTime(500);
}

describe('scroll freeze watchdog', () => {
  beforeEach(async () => {
    REPORTS.length = 0;
    scrollTop = 0;
    dragTarget = document.body;
    document.body.style.cssText = '';
    document.body.innerHTML = '';
    makePageScrollable();
    // jsdom has no elementFromPoint. Null is the honest answer for these cases:
    // nothing is covering the page, which is what makes the drag reportable.
    (document as unknown as { elementFromPoint: () => Element | null }).elementFromPoint = () => null;
    // jsdom drops `touch-action` — it is not in cssstyle's supported set, so it
    // never reaches getComputedStyle. Carry it on an attribute instead and hand
    // it back, so the ancestor walk has something to find.
    const real = window.getComputedStyle.bind(window);
    vi.spyOn(window, 'getComputedStyle').mockImplementation(((el: Element, pseudo?: string | null) => {
      const style = real(el, pseudo ?? undefined);
      const declared = el.getAttribute?.('data-touch-action');
      if (!declared) return style;
      return new Proxy(style, {
        get: (target, key) => (key === 'touchAction' ? declared : Reflect.get(target, key)),
      }) as CSSStyleDeclaration;
    }) as typeof window.getComputedStyle);
    vi.useFakeTimers();
    vi.resetModules();
    const mod = await import('@/lib/scroll-freeze-watchdog');
    mod.installScrollFreezeWatchdog();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.style.cssText = '';
    document.body.innerHTML = '';
  });

  it('says nothing when a downward drag happens at the top of the page', () => {
    scrollTop = 0;
    drag(120);
    settle();
    expect(messages()).toEqual([]);
  });

  it('says nothing when an upward drag happens at the bottom of the page', () => {
    scrollTop = 2000; // scrollHeight 3000 - innerHeight 1000
    drag(-120);
    settle();
    expect(messages()).toEqual([]);
  });

  it('reports a drag the page had room to honour and did not', () => {
    scrollTop = 900;
    drag(120);
    settle();
    expect(messages()).toContain('A drag moved the finger but not the page');
  });

  it('says nothing when the page scrolls a moment late', () => {
    scrollTop = 900;
    drag(120); // a stalled frame: nothing has moved yet when the finger passes 60px
    scrollTop = 700; // the scroll lands before the verdict
    settle();
    expect(messages()).toEqual([]);
  });

  it('names the ancestor whose touch-action ruled the pan out', () => {
    scrollTop = 900;
    const blocker = document.createElement('div');
    blocker.className = 'swipe-layer';
    blocker.setAttribute('data-touch-action', 'none');
    const img = document.createElement('img');
    blocker.appendChild(img);
    document.body.appendChild(blocker);
    dragTarget = img;

    drag(120);
    settle();

    expect(messages()).toContain('A drag moved the finger but not the page');
    expect(REPORTS[0].meta.blockedBy).toContain('div.swipe-layer:none');
  });

  it('leaves the body alone when it reports a swallowed drag', () => {
    scrollTop = 900;
    // A fullscreen viewer legitimately holding the page still.
    document.body.style.setProperty('overflow', 'hidden');
    document.body.style.setProperty('position', 'fixed');

    drag(120);
    settle();

    expect(document.body.style.getPropertyValue('overflow')).toBe('hidden');
    expect(document.body.style.getPropertyValue('position')).toBe('fixed');
  });
});
