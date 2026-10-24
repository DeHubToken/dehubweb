/**
 * The DeHub logo, armed the moment a finger or mouse goes down on something
 * that opens a page (a profile, a post, an in-app link, a Back button).
 *
 * A page change renders inside the click, and on a busy feed that keeps the
 * main thread for a few hundred ms before anything new can paint. The logo is
 * put up on press instead, so the browser paints it in the gap before the
 * click. Its fade-in is a CSS animation, which the compositor keeps running
 * while the main thread is busy: a page that opens quickly never shows it, a
 * slow one shows the logo spinning until the new page is drawn.
 *
 * Deferring the page render behind a painted logo (web #3019) was measured
 * slower: the feed's own timers took the gap and the page arrived later.
 * This never moves the render; it only uses the press-to-click gap.
 */

const ID = 'dehub-tap-pending';
/** Quick taps are ~60-120 ms press to click; only a hold or a slow page shows it. */
const FADE_DELAY_MS = 160;
/** Back is history.go(): its page change lands a task or two after the click. */
const BACK_WAIT_MS = 400;
const MOVE_CANCEL_PX = 10;

let el: HTMLDivElement | null = null;
let armed = false;
let startX = 0;
let startY = 0;
let clearTimer = 0;

function element(): HTMLDivElement {
  if (el) return el;
  el = document.createElement('div');
  el.id = ID;
  el.setAttribute('aria-hidden', 'true');
  el.setAttribute('data-navigation-pending', '');
  el.style.cssText =
    'position:fixed;inset:0;z-index:120;display:none;align-items:center;justify-content:center;pointer-events:none;contain:strict;';
  const img = document.createElement('img');
  img.src = '/dehub-loader-240.webp';
  img.alt = '';
  img.width = 56;
  img.height = 56;
  img.className = 'dehub-loader-mark select-none';
  img.style.cssText = `width:56px;height:56px;flex:none;object-fit:contain;animation-delay:${FADE_DELAY_MS}ms;`;
  el.appendChild(img);
  document.body.appendChild(el);
  return el;
}

export function clearTapPendingLogo(): void {
  window.clearTimeout(clearTimer);
  if (!armed) return;
  armed = false;
  if (el) el.style.display = 'none';
}

function opensPage(target: EventTarget | null): 'back' | 'page' | null {
  if (!(target instanceof Element)) return null;
  if (target.closest('[data-swipe-back]')) return 'back';
  if (target.closest('[data-opens-page]')) return 'page';
  const link = target.closest('a[href]');
  if (link) {
    const href = link.getAttribute('href') || '';
    if (link.getAttribute('target') === '_blank' || !href.startsWith('/') || href.startsWith('//')) return null;
    return 'page';
  }
  // A tap on a feed card's body (not one of its buttons) opens the post.
  const control = target.closest('button, [role="button"], input, textarea, select, label, video, [contenteditable="true"]');
  if (!control && target.closest('[data-feed-item]')) return 'page';
  return null;
}

let kind: 'back' | 'page' | null = null;

function onPointerDown(e: PointerEvent): void {
  if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
  kind = opensPage(e.target);
  if (!kind) return;
  startX = e.clientX;
  startY = e.clientY;
  window.clearTimeout(clearTimer);
  const node = element();
  // display none -> flex restarts the fade, so each press waits its full delay.
  node.style.display = 'flex';
  armed = true;
}

function onPointerMove(e: PointerEvent): void {
  if (armed && Math.hypot(e.clientX - startX, e.clientY - startY) > MOVE_CANCEL_PX) clearTapPendingLogo();
}

function onClick(): void {
  if (!armed) return;
  // A link's page renders inside this click; Back's lands shortly after. The
  // router bridge clears the logo when the new page commits; this catches a
  // press that opened nothing.
  window.clearTimeout(clearTimer);
  clearTimer = window.setTimeout(clearTapPendingLogo, kind === 'back' ? BACK_WAIT_MS : 0);
}

export function installTapPendingLogo(): () => void {
  if (typeof window === 'undefined') return () => {};
  const opts = { capture: true, passive: true } as const;
  window.addEventListener('pointerdown', onPointerDown, opts);
  window.addEventListener('pointermove', onPointerMove, opts);
  window.addEventListener('pointercancel', clearTapPendingLogo, opts);
  window.addEventListener('scroll', clearTapPendingLogo, opts);
  window.addEventListener('click', onClick, opts);
  if (document.body) element();
  // Decode the logo up front so the first press has it ready to animate.
  const warm = new Image();
  warm.src = '/dehub-loader-240.webp';
  void warm.decode?.().catch(() => {});
  return () => {
    el?.remove();
    el = null;
    window.removeEventListener('pointerdown', onPointerDown, opts);
    window.removeEventListener('pointermove', onPointerMove, opts);
    window.removeEventListener('pointercancel', clearTapPendingLogo, opts);
    window.removeEventListener('scroll', clearTapPendingLogo, opts);
    window.removeEventListener('click', onClick, opts);
    armed = false;
    window.clearTimeout(clearTimer);
  };
}
