import { useEffect, type RefObject } from 'react';

/** Themes whose sticky feed nav is a glass surface (pill or bento). */
const GLASS_NAV_THEMES = ['cosmic', 'hazy', 'swarms', 'lavalamp', 'winter', 'system'];

/**
 * Swallow scrolled feed content at the top edge of a sticky glass nav surface.
 *
 * Under the glass-nav themes the sticky nav pill/bento is semi-transparent, so
 * without this, scrolled posts slide behind it and re-emerge above it in the
 * padding gap. The surface's top edge is the design's hard cut-off line:
 * content shows through the glass but must never come out the other side. That
 * line is fixed in the viewport while the feed scrolls, which CSS clip alone
 * can't express — so a rAF-throttled scroll listener clips the scrolling
 * container at the visible surface's top, tracing its corner radius.
 *
 * Used by the home feed (cut element = the `[data-feed-nav]` pill, present in
 * two variants — this page's and the collapsed GlobalFeedNav) and by the
 * bento feed pages (Explore/Music/Notifications, cut element = the sticky
 * `[data-page-bento]` header). No-op on themes with opaque nav bars.
 *
 * @param containerRef  the scrolling content container to clip
 * @param cutSelector   CSS selector for the sticky surface whose top edge is
 *                      the cut line; the first visible match is used
 * @param deps          extra effect deps — pass a value that flips when a
 *                      conditionally-mounted container appears (e.g. a post
 *                      overlay) so the listener re-attaches to the live element
 * @param opts          allThemes: clip on every theme, not just the glass
 *                      ones — for surfaces whose nav floats with a gap above
 *                      it on the opaque/paper themes too (e.g. the docs blog
 *                      pill pins below the docs header), where content would
 *                      otherwise re-emerge above the nav
 */
export function useFeedSwallowClip(
  containerRef: RefObject<HTMLElement | null>,
  cutSelector: string,
  deps: unknown[] = [],
  opts: { allThemes?: boolean } = {},
) {
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let rafId: number | null = null;
    let lastClip = '';
    let lastEventAt = 0;
    let cachedCut: HTMLElement | null = null;
    let cachedRadius = 12;

    const update = () => {
      const theme = document.documentElement.dataset.theme || '';
      let clip = '';
      if (opts.allThemes || GLASS_NAV_THEMES.includes(theme)) {
        // Whichever matching surface is currently rendered (e.g. HomePage's
        // pill is display:none when the collapsed GlobalFeedNav takes over).
        const cut = Array.from(document.querySelectorAll<HTMLElement>(cutSelector))
          .find(p => p.offsetParent !== null);
        if (cut) {
          if (cut !== cachedCut) {
            cachedCut = cut;
            // NaN-check rather than `|| 12`: a genuine 0 radius (the light
            // theme de-rounds the docs blog pill) must give a square cut,
            // not the 12px fallback arc.
            const parsed = parseFloat(getComputedStyle(cut).borderTopLeftRadius);
            cachedRadius = Number.isNaN(parsed) ? 12 : parsed;
          }
          const pr = cut.getBoundingClientRect();
          const cr = el.getBoundingClientRect();
          const y = pr.top - cr.top;
          if (y > 0.5) {
            // The cut follows the surface's silhouette: its top edge with the
            // surface's own corner rounding, then full width just below the
            // corner arcs — so nothing peeks out beside the rounded corners.
            const r = Math.min(cachedRadius, pr.width / 2);
            const f = (n: number) => n.toFixed(2);
            const L = pr.left - cr.left;
            const R = pr.right - cr.left;
            const W = cr.width;
            const H = cr.height;
            clip = `path('M 0 ${f(y + r)} L ${f(L)} ${f(y + r)} A ${f(r)} ${f(r)} 0 0 1 ${f(L + r)} ${f(y)} L ${f(R - r)} ${f(y)} A ${f(r)} ${f(r)} 0 0 1 ${f(R)} ${f(y + r)} L ${f(W)} ${f(y + r)} L ${f(W)} ${f(H)} L 0 ${f(H)} Z')`;
          }
        }
      }
      if (clip !== lastClip) {
        lastClip = clip;
        el.style.clipPath = clip;
      }
      // Keep tracking briefly after the last scroll event so the clip line
      // follows the nav's hide/show transform to its resting spot.
      rafId = performance.now() - lastEventAt < 450 ? requestAnimationFrame(update) : null;
    };
    const schedule = () => {
      lastEventAt = performance.now();
      if (rafId == null) rafId = requestAnimationFrame(update);
    };

    // The feed scrolls on document.body in this app; scroll events don't
    // bubble, so capture-phase listeners catch whichever element scrolls.
    const targets: EventTarget[] = [window, document];
    targets.forEach(t => t.addEventListener('scroll', schedule, { passive: true, capture: true }));
    window.addEventListener('resize', schedule, { passive: true });
    const themeObserver = new MutationObserver(schedule);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    schedule();

    return () => {
      targets.forEach(t => t.removeEventListener('scroll', schedule, { capture: true }));
      window.removeEventListener('resize', schedule);
      themeObserver.disconnect();
      if (rafId != null) cancelAnimationFrame(rafId);
      el.style.clipPath = '';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef, cutSelector, opts.allThemes, ...deps]);
}
