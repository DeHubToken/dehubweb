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
let uninstall: () => void;
vi.mock('@/lib/document-scroll', () => ({
  getDocumentScrollTop: () => scrollTop,
  scrollDocumentTo: (top: number) => { scrollTop = top; },
}));

/** A page three viewports tall, so the watchdog's height gate passes. */
function makePageScrollable() {
  Object.defineProperty(document.body, 'scrollHeight', { value: 3000, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: 1000, configurable: true });
}

let dragTarget: Element = document.body;

function touch(type: string, clientY: number) {
  const event = new Event(type, { bubbles: true, cancelable: true }) as TouchEvent & { touches: unknown };
  Object.defineProperty(event, 'touches', {
    value: type === 'touchend' ? [] : [{ clientX: 100, clientY }],
    configurable: true,
  });
  Object.defineProperty(event, 'target', { value: dragTarget, configurable: true });
  window.dispatchEvent(event);
  return event;
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
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
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
    uninstall = mod.installScrollFreezeWatchdog();
  });

  afterEach(() => {
    uninstall();
    vi.restoreAllMocks();
    vi.useRealTimers();
    document.body.style.cssText = '';
    document.body.innerHTML = '';
    window.history.replaceState({}, '', '/');
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

  it('recovers an orphaned body lock on a desktop with no touch support', async () => {
    uninstall();
    const touchDescriptor = Object.getOwnPropertyDescriptor(window, 'ontouchstart');
    const pointsDescriptor = Object.getOwnPropertyDescriptor(navigator, 'maxTouchPoints');
    Reflect.deleteProperty(window, 'ontouchstart');
    Object.defineProperty(navigator, 'maxTouchPoints', { value: 0, configurable: true });
    try {
      const mod = await import('@/lib/scroll-freeze-watchdog');
      uninstall = mod.installScrollFreezeWatchdog();
      document.body.style.overflowY = 'hidden';
      document.body.style.pointerEvents = 'none';
      vi.advanceTimersByTime(5000);
      expect(document.body.style.overflowY).not.toBe('hidden');
      expect(document.body.style.pointerEvents).not.toBe('none');
      expect(REPORTS[0].meta.recovered).toBe(true);
    } finally {
      if (touchDescriptor) Object.defineProperty(window, 'ontouchstart', touchDescriptor);
      if (pointsDescriptor) Object.defineProperty(navigator, 'maxTouchPoints', pointsDescriptor);
      else Reflect.deleteProperty(navigator, 'maxTouchPoints');
    }
  });

  it('preserves the lock while a real dialog is open', () => {
    document.body.innerHTML = '<div role="dialog" data-state="open"></div>';
    document.body.style.overflowY = 'hidden';
    window.dispatchEvent(new WheelEvent('wheel', { deltaY: 120 }));
    vi.advanceTimersByTime(6000);
    expect(document.body.style.overflowY).toBe('hidden');
    expect(messages()).toEqual([]);
  });

  it('does not tear a live custom viewer lock off between overlay DOM transitions', async () => {
    const { lockBodyScroll } = await import('@/lib/body-scroll-lock');
    const release = lockBodyScroll('image-fullscreen');
    document.body.style.overflowY = 'hidden';
    try {
      vi.advanceTimersByTime(6000);
      expect(document.body.style.overflow).toBe('hidden');
      expect(messages()).toEqual([]);
    } finally {
      release();
    }
    vi.advanceTimersByTime(5000);
    expect(document.body.style.overflowY).not.toBe('hidden');
    expect(REPORTS[0].meta.recovered).toBe(true);
  });

  it('reports a swallowed desktop wheel without unlocking unknown content', () => {
    scrollTop = 900;
    const event = new WheelEvent('wheel', { deltaY: 120, cancelable: true });
    window.dispatchEvent(event);
    event.preventDefault();
    settle();
    expect(messages()).toEqual(['A wheel gesture did not move the page']);
    expect(REPORTS[0].meta.defaultPrevented).toBe(true);
    expect(REPORTS[0].meta.recovered).toBe(false);
  });

  it('ignores the 1-3px tail of a trackpad glide', () => {
    scrollTop = 900;
    window.dispatchEvent(new WheelEvent('wheel', { deltaY: -1 }));
    settle();
    expect(messages()).toEqual([]);
  });

  it('does not mistake delayed wheel movement for a freeze', () => {
    window.dispatchEvent(new WheelEvent('wheel', { deltaY: 120 }));
    scrollTop = 120;
    settle();
    expect(messages()).toEqual([]);
  });

  it('accepts compositor scroll notifications even when the sampled offset is unchanged', () => {
    scrollTop = 900;
    window.dispatchEvent(new WheelEvent('wheel', { deltaY: 120 }));
    document.body.dispatchEvent(new Event('scroll'));
    settle();
    expect(messages()).toEqual([]);
  });

  it('ignores wheel events delivered just after the compositor moved the page', () => {
    document.body.dispatchEvent(new Event('scroll'));
    window.dispatchEvent(new WheelEvent('wheel', { deltaY: 120 }));
    settle();
    expect(messages()).toEqual([]);
    // A later, genuinely stationary attempt still gets diagnosed.
    window.dispatchEvent(new WheelEvent('wheel', { deltaY: 120 }));
    settle();
    expect(messages()).toEqual(['A wheel gesture did not move the page']);
  });

  it('ignores wheel movement beyond page boundaries and pinch zoom', () => {
    window.dispatchEvent(new WheelEvent('wheel', { deltaY: -120 }));
    settle();
    scrollTop = 2000;
    window.dispatchEvent(new WheelEvent('wheel', { deltaY: 120 }));
    settle();
    scrollTop = 900;
    window.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, ctrlKey: true }));
    settle();
    expect(messages()).toEqual([]);
  });

  it('leaves nested scrolling to its own container', () => {
    document.body.innerHTML = '<div style="overflow-y:auto"><span>Comments</span></div>';
    const list = document.body.firstElementChild!;
    Object.defineProperty(list, 'scrollHeight', { value: 1000 });
    Object.defineProperty(list, 'clientHeight', { value: 300 });
    list.firstElementChild!.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, bubbles: true }));
    settle();
    expect(messages()).toEqual([]);
  });

  it('checks continuous wheel input without postponing forever', () => {
    for (let i = 0; i < 6; i++) {
      window.dispatchEvent(new WheelEvent('wheel', { deltaY: 120 }));
      vi.advanceTimersByTime(100);
    }
    expect(messages()).toEqual(['A wheel gesture did not move the page']);
  });

  it('keeps recovering leaked locks after its three-report telemetry limit', () => {
    for (let i = 0; i < 5; i++) {
      document.body.style.overflowY = 'hidden';
      vi.advanceTimersByTime(10000);
      expect(document.body.style.overflowY).not.toBe('hidden');
    }
    expect(REPORTS).toHaveLength(3);
  });

  function samsungFeed() {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('SamsungBrowser/30.0 Chrome/143');
    window.history.replaceState({}, '', '/app');
  }

  it('keeps normal Samsung scrolling native until an unlocked feed drag has failed', () => {
    samsungFeed();
    touch('touchstart', 500);
    const move = touch('touchmove', 450);
    expect(move.defaultPrevented).toBe(false);
    expect(scrollTop).toBe(0);
  });

  it('keeps later swipes native after a confirmed Samsung stall, including on a profile', () => {
    samsungFeed();
    drag(-120); settle();
    expect(REPORTS[0].meta.recoveryQueued).toBe(true);
    touch('touchstart', 500);
    const move = touch('touchmove', 400);
    expect(move.defaultPrevented).toBe(false);
    expect(scrollTop).toBe(0);
    window.history.replaceState({}, '', '/ken210');
    expect(touch('touchmove', 300).defaultPrevented).toBe(false);
    expect(scrollTop).toBe(0);
  });

  it('does not nudge or rebuild the scroller during a continuing gesture', async () => {
    samsungFeed();
    const { settleAfterOverlayClose } = await import('@/lib/scroll-freeze-watchdog');
    touch('touchstart', 500);
    settleAfterOverlayClose();
    vi.advanceTimersByTime(800);
    expect(scrollTop).toBe(0);
    touch('touchend', 400);
    vi.advanceTimersByTime(800);
    expect(scrollTop).toBe(0);
  });

  it('notices touch release even when a horizontal carousel stops bubbling', async () => {
    samsungFeed();
    const { restoreDocumentTouchScroll } = await import('@/lib/scroll-freeze-watchdog');
    const carousel = document.createElement('div'); document.body.appendChild(carousel);
    carousel.addEventListener('touchend', e => e.stopPropagation());
    const start = new Event('touchstart', { bubbles: true });
    Object.defineProperty(start, 'touches', { value: [{ clientX: 100, clientY: 500 }] });
    carousel.dispatchEvent(start);
    expect(restoreDocumentTouchScroll()).toBe(false);
    const end = new Event('touchend', { bubbles: true });
    Object.defineProperty(end, 'touches', { value: [] }); carousel.dispatchEvent(end);
    expect(restoreDocumentTouchScroll()).toBe(true);
  });

  it('waits for native momentum before post-overlay recovery', async () => {
    samsungFeed();
    const { settleAfterOverlayClose } = await import('@/lib/scroll-freeze-watchdog');
    settleAfterOverlayClose();
    vi.advanceTimersByTime(600);
    scrollTop = 140;
    document.dispatchEvent(new Event('scroll'));
    vi.advanceTimersByTime(100);
    expect(scrollTop).toBe(140);
    vi.advanceTimersByTime(700);
    expect(scrollTop).toBe(140);
  });

  it('never rewinds a new swipe between a recovery nudge and its next frame', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Safari/18');
    const { settleAfterOverlayClose } = await import('@/lib/scroll-freeze-watchdog');
    let frame!: FrameRequestCallback;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => { frame = cb; return 1; });
    scrollTop = 900;
    settleAfterOverlayClose();
    vi.advanceTimersByTime(700);
    expect(scrollTop).toBe(899);
    touch('touchstart', 500);
    scrollTop = 1000;
    frame(0);
    expect(scrollTop).toBe(1000);
  });

  it('never takes a button drag or an open modal from Samsung after recovery is enabled', () => {
    samsungFeed();
    drag(-120); settle();
    document.body.innerHTML = '<button>Volume</button>';
    dragTarget = document.querySelector('button')!;
    touch('touchstart', 500);
    expect(touch('touchmove', 400).defaultPrevented).toBe(false);
    expect(scrollTop).toBe(0);
    document.body.innerHTML = '<div role="dialog" data-state="open"></div>';
    dragTarget = document.body;
    touch('touchstart', 500);
    expect(touch('touchmove', 400).defaultPrevented).toBe(false);
    expect(scrollTop).toBe(0);
  });

  it('does not activate Samsung feed recovery on a post overlay or another browser', () => {
    samsungFeed();
    document.body.innerHTML = '<div data-media-fullscreen="true"></div>';
    drag(-120); settle();
    expect(REPORTS).toHaveLength(0);
    document.body.innerHTML = '';
    window.history.replaceState({}, '', '/app');
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Chrome/143');
    touch('touchstart', 500);
    expect(touch('touchmove', 400).defaultPrevented).toBe(false);
  });

  it('leaves horizontal feed swipes and nested scrolling native after a Samsung stall', () => {
    samsungFeed();
    drag(-120); settle();
    touch('touchstart', 500);
    const sideways = new Event('touchmove', { bubbles: true, cancelable: true });
    Object.defineProperty(sideways, 'touches', { value: [{ clientX: 250, clientY: 480 }] });
    window.dispatchEvent(sideways);
    expect(sideways.defaultPrevented).toBe(false);
    expect(scrollTop).toBe(0);
    document.body.innerHTML = '<div style="overflow-y:auto"><span>Comments</span></div>';
    const list = document.body.firstElementChild!;
    Object.defineProperty(list, 'scrollHeight', { value: 1000 });
    Object.defineProperty(list, 'clientHeight', { value: 300 });
    dragTarget = list.firstElementChild!;
    touch('touchstart', 500);
    expect(touch('touchmove', 400).defaultPrevented).toBe(false);
    expect(scrollTop).toBe(0);
  });

  it('keeps Samsung recovery available after the three-report telemetry limit', () => {
    samsungFeed();
    for (let i = 0; i < 3; i++) {
      document.body.style.overflowY = 'hidden';
      vi.advanceTimersByTime(10000);
    }
    expect(REPORTS).toHaveLength(3);
    drag(-120); settle();
    touch('touchstart', 500);
    expect(touch('touchmove', 400).defaultPrevented).toBe(false);
    expect(scrollTop).toBe(0);
    expect(REPORTS).toHaveLength(3);
  });
});
