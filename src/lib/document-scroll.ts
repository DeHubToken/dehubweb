/**
 * Document scroll helpers
 * =======================
 * The app's scrolling element is `document.body`, not `documentElement`:
 * `index.css` gives `html, body { height: 100% }` and `body { overflow-x: clip }`,
 * and a non-visible overflow on one axis forces the other to compute to `auto`.
 * So body becomes a viewport-height scroll container with the page inside it,
 * `html` never overflows, and `window.scrollY` / `window.scrollTo()` are both
 * no-ops — a silent trap that has broken several "scroll to top" call sites.
 *
 * Always go through these helpers instead of touching one target and hoping.
 */

/** Current page scroll offset, whichever element the browser is scrolling. */
export function getDocumentScrollTop(): number {
  return (
    document.body.scrollTop ||
    document.documentElement.scrollTop ||
    window.scrollY ||
    0
  );
}

/** Scroll the page to `top`, covering every possible scrolling element. */
export function scrollDocumentTo(top: number): void {
  document.body.scrollTop = top;
  document.documentElement.scrollTop = top;
  window.scrollTo(0, top);
}

/**
 * Smooth-scroll the page to `top`.
 *
 * Assigning `scrollTop` is always instant, so the "scroll to top" affordances
 * (logo tap, pull-to-refresh, a category chip) need `scrollTo` with a
 * behavior — but on the element that actually scrolls. `window.scrollTo` alone
 * is the silent no-op this module exists to prevent; it is still called last as
 * the fallback for any browser where body is not the scroller.
 */
export function scrollDocumentToSmooth(top: number = 0): void {
  const options: ScrollToOptions = { top, behavior: 'smooth' };
  document.body.scrollTo?.(options);
  document.documentElement.scrollTo?.(options);
  window.scrollTo(options);
}
