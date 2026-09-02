/**
 * Scroll-freeze watchdog
 * ======================
 * Catches the "the page stopped taking my scroll and I had to refresh" report.
 *
 * That failure is silent — nothing throws, so `client_error_logs` holds no row
 * for it and there is nothing to read afterwards. It is also unreproducible on
 * demand: it needs a particular overlay to go away at a particular moment, on
 * a particular phone. So instead of guessing which lock leaked, detect the
 * *symptom* on the device, send the state of the page that caused it, and put
 * the page back the way it was so nobody has to refresh.
 *
 * Every known way to get here ends in one of two shapes:
 *
 * 1. **Something wrote a lock onto `<body>` and never took it off** —
 *    `position: fixed` (vaul's iOS pin), `overflow: hidden` (Radix's
 *    RemoveScroll, and half a dozen fullscreen viewers in this app), or
 *    `pointer-events: none` (Radix's dismissable layer). Body is this app's
 *    scrolling element (see `document-scroll.ts`), so any of the three stops
 *    the page dead. This is checked directly and, when nothing is on screen
 *    that should be holding the page, undone.
 * 2. **An invisible layer is sitting over the page** eating the touches. No
 *    body state shows that, so it is caught from the gesture instead: a real
 *    drag that moved the finger and did not move the page. That one is only
 *    reported, never cleared — removing an unknown overlay is a worse bet than
 *    leaving it.
 *
 * Both paths refuse to fire while a sheet, dialog or fullscreen viewer is
 * genuinely up: an open overlay is *supposed* to hold the page still.
 */

import { createLogger } from './logger';
import { getDocumentScrollTop } from './document-scroll';

const log = createLogger('ScrollFreeze');

/** Finger travel that counts as a real attempt to scroll, in px. */
const DRAG_PX = 60;
/** Body state is cheap to read; this is the only idle cost of the whole file. */
const POLL_MS = 5_000;
/** One page load should never send more than this — it is a bug report, not a metric. */
const MAX_REPORTS = 3;
/** Room below the fold before "it did not scroll" means anything. */
const SLACK_PX = 80;

const OPEN_OVERLAY_SELECTOR = [
  '[data-vaul-drawer][data-state="open"]',
  '[role="dialog"][data-state="open"]',
  '[role="alertdialog"][data-state="open"]',
  '[data-radix-popper-content-wrapper]',
  '[role="menu"][data-state="open"]',
  '[role="listbox"]',
].join(',');

let reports = 0;
let lastReportAt = 0;

/** An overlay that is meant to be holding the page still. */
function overlayIsOpen(): boolean {
  return (
    !!document.querySelector(OPEN_OVERLAY_SELECTOR) ||
    document.body.classList.contains('shorts-viewer-open')
  );
}

/**
 * Whatever is painted over the middle of the screen, if it covers the screen.
 *
 * A fullscreen viewer (the image lightbox, an arcade game, the radio
 * visualiser) locks the body on purpose and carries no dialog role, so this is
 * what tells those apart from a leak. It doubles as the evidence for case 2:
 * if the page will not scroll and *this* is what the touch lands on, name it.
 */
function coveringLayer(): { el: Element; position: string } | null {
  const el = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
  if (!el || el === document.documentElement || el === document.body) return null;
  const r = el.getBoundingClientRect();
  if (r.width < window.innerWidth * 0.95 || r.height < window.innerHeight * 0.95) return null;
  const position = getComputedStyle(el).position;
  return position === 'fixed' || position === 'sticky' ? { el, position } : null;
}

function describe(el: Element): string {
  const cls = typeof el.className === 'string' ? el.className : '';
  return `${el.tagName.toLowerCase()}${cls ? `.${cls.trim().split(/\s+/).slice(0, 4).join('.')}` : ''}`;
}

function pageIsTallerThanViewport(): boolean {
  // Deliberately against innerHeight, not body.clientHeight: `height: auto` on
  // a pinned body makes clientHeight equal scrollHeight, which would hide the
  // exact state this is looking for.
  return document.body.scrollHeight > window.innerHeight + SLACK_PX;
}

function snapshot(covering: { el: Element; position: string } | null) {
  const body = document.body;
  const bodyStyle = getComputedStyle(body);
  return {
    path: location.pathname,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    contentHeight: body.scrollHeight,
    scrollTop: getDocumentScrollTop(),
    bodyInline: body.style.cssText.slice(0, 400),
    bodyPosition: bodyStyle.position,
    bodyOverflowY: bodyStyle.overflowY,
    bodyPointerEvents: bodyStyle.pointerEvents,
    bodyHeight: bodyStyle.height,
    htmlInline: document.documentElement.style.cssText.slice(0, 200),
    htmlOverflowY: getComputedStyle(document.documentElement).overflowY,
    coveringLayer: covering ? `${describe(covering.el)} (${covering.position})` : null,
    // Overlay roots still in the DOM but closed — a sheet mid-exit-animation vs
    // one that unmounted while open reads very differently here.
    overlayNodes: document.querySelectorAll('[data-vaul-drawer],[role="dialog"],[role="alertdialog"]').length,
    userAgent: navigator.userAgent.slice(0, 180),
  };
}

/** Take the locks back off `<body>`. Only called when nothing should be holding it. */
function unstick(): string[] {
  const body = document.body;
  const undone: string[] = [];

  // `touch-action` belongs here as much as the other three: the story viewer
  // sets it to `none` on <body>, and that is the one lock that produces exactly
  // "the finger moved and the page did not" while leaving position, overflow
  // and pointer-events looking clean.
  for (const prop of ['position', 'top', 'left', 'right', 'height', 'overflow', 'overflow-y', 'pointer-events', 'touch-action']) {
    if (body.style.getPropertyValue(prop)) {
      body.style.removeProperty(prop);
      undone.push(prop);
    }
  }

  // A leak can also come from a stylesheet the owning component left behind
  // (react-remove-scroll injects one), which removing inline properties cannot
  // reach — so override what is still computing wrong.
  const after = getComputedStyle(body);
  if (after.overflowY === 'hidden' || after.overflowY === 'clip') {
    body.style.setProperty('overflow-y', 'auto', 'important');
    undone.push('overflow-y!');
  }
  if (after.pointerEvents === 'none') {
    body.style.setProperty('pointer-events', 'auto', 'important');
    undone.push('pointer-events!');
  }
  if (after.position === 'fixed') {
    body.style.setProperty('position', 'static', 'important');
    undone.push('position!');
  }

  return undone;
}

function report(message: string, extra: Record<string, unknown>, recover: boolean) {
  const now = Date.now();
  // One episode, not one row per gesture inside it.
  if (now - lastReportAt < 10_000) return;
  if (reports >= MAX_REPORTS) return;
  reports++;
  lastReportAt = now;

  const covering = coveringLayer();
  const before = snapshot(covering);
  const undone = recover ? unstick() : [];
  const bodyAfter = recover ? getComputedStyle(document.body) : null;

  log.error(message, {
    ...before,
    ...extra,
    episode: reports,
    recovered: recover,
    undone,
    afterPosition: bodyAfter?.position,
    afterOverflowY: bodyAfter?.overflowY,
    afterPointerEvents: bodyAfter?.pointerEvents,
  });
}

// ---------------------------------------------------------------------------
// 1. Body carries a lock nobody is using
// ---------------------------------------------------------------------------

function checkBodyState() {
  if (document.visibilityState !== 'visible') return;
  if (reports >= MAX_REPORTS) return;
  if (!pageIsTallerThanViewport()) return;
  if (overlayIsOpen()) return;
  if (coveringLayer()) return;

  const s = getComputedStyle(document.body);
  const locks: string[] = [];
  if (s.position === 'fixed') locks.push('position:fixed');
  if (s.overflowY === 'hidden' || s.overflowY === 'clip') locks.push(`overflow-y:${s.overflowY}`);
  if (s.pointerEvents === 'none') locks.push('pointer-events:none');
  if (s.touchAction === 'none') locks.push('touch-action:none');
  if (!locks.length) return;

  report('Page left locked with nothing on screen holding it', { locks }, true);
}

// ---------------------------------------------------------------------------
// 2. A drag that moved the finger and not the page
// ---------------------------------------------------------------------------

let dragStartY = 0;
let dragStartScroll = 0;
let dragTarget: Element | null = null;
let dragArmed = false;

/** The nearest ancestor that scrolls on its own — dragging inside one is not a freeze. */
function hasOwnScroller(start: Element | null): boolean {
  for (let el = start; el && el !== document.body; el = el.parentElement) {
    const s = getComputedStyle(el);
    if ((s.overflowY === 'auto' || s.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 4) {
      return true;
    }
  }
  return false;
}

function endDrag() {
  dragArmed = false;
  dragTarget = null;
}

function onTouchStart(e: TouchEvent) {
  dragArmed = e.touches.length === 1;
  if (!dragArmed) return;
  dragStartY = e.touches[0].clientY;
  dragStartScroll = getDocumentScrollTop();
  dragTarget = e.target instanceof Element ? e.target : null;
}

/**
 * Could the page have moved the way the finger asked?
 *
 * A drag down is a request to scroll UP, and at the top there is nowhere to go
 * — the page is right to stay still. Without this the watchdog reports every
 * flick at the top of the feed as a freeze, which is most of them: of the 1,303
 * reports in the first five days, 55% were at scrollTop 0. Android shows it and
 * iOS does not, because iOS rubber-band drives the scroll position past the
 * edge and trips the "it moved" check above.
 *
 * `dy` is the finger's travel: positive is downward, which scrolls toward the
 * top of the document.
 */
function couldHaveScrolled(dy: number): boolean {
  const top = getDocumentScrollTop();
  if (dy > 0) return top > SLACK_PX; // dragging down: needs room above
  const max = document.body.scrollHeight - window.innerHeight;
  return top < max - SLACK_PX; // dragging up: needs room below
}

function onTouchMove(e: TouchEvent) {
  if (!dragArmed || e.touches.length !== 1) return;
  const dy = e.touches[0].clientY - dragStartY;
  if (Math.abs(dy) < DRAG_PX) return;
  dragArmed = false; // one verdict per gesture

  if (getDocumentScrollTop() !== dragStartScroll) return; // it moved — nothing wrong
  if (reports >= MAX_REPORTS) return;
  if (!pageIsTallerThanViewport()) return;
  if (!couldHaveScrolled(dy)) return; // already at that end — staying put is correct
  if (overlayIsOpen()) return;
  if (hasOwnScroller(dragTarget)) return;

  // Something on top of the page is entitled to swallow the drag; say what it
  // is rather than tearing it off.
  const covering = coveringLayer();
  if (covering) {
    report('A full-screen layer is swallowing the page scroll', { target: dragTarget ? describe(dragTarget) : null }, false);
    return;
  }

  // Reported, not cleared — see the header. What is eating the touches is not
  // on <body>, so there is nothing here to undo, and stripping body's styles on
  // a guess tears the lock off a fullscreen viewer that is legitimately holding
  // the page. The body-state check above is the path that recovers.
  report('A drag moved the finger but not the page', { target: dragTarget ? describe(dragTarget) : null }, false);
}

/**
 * Install once, from the entry. Touch only: this is a mobile failure, and
 * gating on it keeps the cost at exactly zero on desktop.
 */
export function installScrollFreezeWatchdog(): void {
  if (typeof window === 'undefined') return;
  if (!('ontouchstart' in window) && navigator.maxTouchPoints < 1) return;

  window.addEventListener('touchstart', onTouchStart, { passive: true });
  window.addEventListener('touchmove', onTouchMove, { passive: true });
  // Drop the target when the gesture ends. Feed video elements are pooled and
  // reused across cards, so a retained node makes the next report name whichever
  // card happens to own it now — which is why these logs read as video-heavy.
  window.addEventListener('touchend', endDrag, { passive: true });
  window.addEventListener('touchcancel', endDrag, { passive: true });
  window.setInterval(checkBodyState, POLL_MS);
}
