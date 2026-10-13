import { useContext, useLayoutEffect, type RefObject } from 'react';
import { CachedPageActiveContext } from '@/contexts/CachedPageActiveContext';

const GLASS_NAV_THEMES = ['cosmic', 'hazy', 'swarms', 'lavalamp', 'winter', 'war', 'osaka', 'jungle', 'island', 'hacker', 'horror', 'system', 'immersive'];
const BOTTOM_CUT_THEMES = GLASS_NAV_THEMES.filter(t => t !== 'system' && t !== 'immersive');
type TimelineConstructor = new (options: { source: Element; axis: 'block' }) => AnimationTimeline;

/** Identical path commands at each endpoint allow continuous interpolation. */
export function feedSwallowPath(y: number, r: number, left: number, right: number, width: number, height: number) {
  const f = (n: number) => n.toFixed(2);
  return `path('M 0 ${f(y + r)} L ${f(left)} ${f(y + r)} A ${f(r)} ${f(r)} 0 0 1 ${f(left + r)} ${f(y)} L ${f(right - r)} ${f(y)} A ${f(r)} ${f(r)} 0 0 1 ${f(right)} ${f(y + r)} L ${f(width)} ${f(y + r)} L ${f(width)} ${f(height)} L 0 ${f(height)} Z')`;
}

function scrollSource(el: HTMLElement): HTMLElement {
  for (let node: HTMLElement | null = el; node && node !== document.documentElement; node = node.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(node).overflowY) && node.scrollHeight > node.clientHeight) return node;
  }
  return (document.scrollingElement || document.documentElement) as HTMLElement;
}

/** Scroll-driven cut: JS refreshes geometry and nav transitions, not each scroll frame. */
export function useFeedSwallowClip(
  containerRef: RefObject<HTMLElement | null>,
  cutSelector: string,
  deps: unknown[] = [],
  opts: { allThemes?: boolean; off?: boolean; edge?: 'top' | 'bottom' } = {},
) {
  const isActivePage = useContext(CachedPageActiveContext);
  useLayoutEffect(() => {
    if (!isActivePage || opts.off) return;
    const el = containerRef.current;
    if (!el) return;
    const pageScope = el.closest<HTMLElement>('[data-cached-page]');
    const Timeline = (window as Window & { ScrollTimeline?: TimelineConstructor }).ScrollTimeline;
    let frame: number | null = null;
    let cut: HTMLElement | null = null;
    let source: HTMLElement | null = null;
    let animation: Animation | null = null;
    let animationSource: HTMLElement | null = null;
    let lastFrames = '';
    let lastClip = '';
    let findCut = true;
    let radius = 12;
    let motionUntil = 0;
    const visibleCut = (root: ParentNode) => Array.from(root.querySelectorAll<HTMLElement>(cutSelector)).find(candidate =>
      candidate.offsetParent !== null && getComputedStyle(candidate).visibility !== 'hidden',
    ) || null;
    const clearAnimation = () => {
      animation?.cancel();
      animation = null;
      animationSource = null;
      lastFrames = '';
    };
    const writeClip = (clip: string) => {
      if (clip !== lastClip) { el.style.clipPath = clip; lastClip = clip; }
    };
    const schedule = () => { if (frame === null) frame = requestAnimationFrame(update); };
    const invalidate = () => { findCut = true; schedule(); };
    const resizeObserver = new ResizeObserver(invalidate);
    const update = () => {
      frame = null;
      const theme = document.documentElement.dataset.theme || '';
      if (!opts.allThemes && !GLASS_NAV_THEMES.includes(theme)) {
        clearAnimation(); writeClip(''); delete el.dataset.feedSwallowDriver; return;
      }
      if (findCut || !cut?.isConnected) {
        const next = (pageScope && visibleCut(pageScope)) || visibleCut(document);
        if (cut !== next) {
          if (cut) resizeObserver.unobserve(cut);
          cut = next;
          if (cut) resizeObserver.observe(cut);
        }
        radius = cut ? parseFloat(getComputedStyle(cut).borderTopLeftRadius) : 12;
        if (!Number.isFinite(radius)) radius = 12;
        source = scrollSource(el);
        findCut = false;
      }
      if (!cut || !source) { clearAnimation(); writeClip(''); delete el.dataset.feedSwallowDriver; return; }

      // Read all geometry before writes. No selector traversal on ordinary scrolls.
      const pr = cut.getBoundingClientRect();
      const cr = el.getBoundingClientRect();
      const nested = el.contains(cut);
      const bottom = !nested && (opts.edge === 'bottom' || (opts.edge !== 'top' && BOTTOM_CUT_THEMES.includes(theme)));
      const r = Math.min(radius, pr.width / 2, pr.height / 2);
      const shape = (y: number) => bottom ? `inset(${Math.max(0, y).toFixed(2)}px 0 0 0)`
        : feedSwallowPath(y, r, pr.left - cr.left, pr.right - cr.left, cr.width, cr.height);
      const currentY = (bottom ? pr.bottom : pr.top) - cr.top;
      const outer = cut.closest<HTMLElement>('[data-feed-nav-outer], [data-kit-island-outer]');
      const maxScroll = source.scrollHeight - source.clientHeight;
      // The scrollport itself has a stationary clip; its descendants already
      // scroll within that cut on the compositor (including post overlays).
      if (Timeline && outer && !nested && source !== el && maxScroll > 0) {
        let pinnedY = bottom ? pr.bottom : pr.top;
        if (source.contains(outer)) {
          const outerRect = outer.getBoundingClientRect();
          const style = getComputedStyle(outer);
          const top = parseFloat(style.top);
          if (style.position === 'sticky' && Number.isFinite(top)) {
            const sourceTop = source === document.scrollingElement ? 0 : source.getBoundingClientRect().top + source.clientTop;
            const transformY = style.transform === 'none' ? 0 : new DOMMatrixReadOnly(style.transform).m42;
            pinnedY += sourceTop + top + transformY - outerRect.top;
          }
        }
        const y0 = pinnedY - cr.top - source.scrollTop;
        const frames: Keyframe[] = [{ offset: 0, clipPath: shape(y0) }];
        // Preserve the zero inset until content reaches the bottom-edge cut.
        if (bottom && y0 < 0 && -y0 < maxScroll) frames.push({ offset: -y0 / maxScroll, clipPath: shape(0) });
        frames.push({ offset: 1, clipPath: shape(y0 + maxScroll) });
        const key = JSON.stringify(frames);
        if (source !== animationSource || !animation) {
          clearAnimation();
          try {
            animation = el.animate(frames, { timeline: new Timeline({ source, axis: 'block' }), fill: 'both', easing: 'linear' });
            animationSource = source;
          } catch { /* Partial implementations keep the frame fallback. */ }
        } else if (key !== lastFrames) (animation.effect as KeyframeEffect).setKeyframes(frames);
        if (animation) {
          lastFrames = key; writeClip(''); el.dataset.feedSwallowDriver = 'scroll-timeline';
        } else { writeClip(currentY > 0.5 ? shape(currentY) : ''); el.dataset.feedSwallowDriver = 'frame'; }
      } else {
        clearAnimation(); writeClip(currentY > 0.5 ? shape(currentY) : '');
        el.dataset.feedSwallowDriver = source === el && !nested ? 'scrollport' : 'frame';
      }
      if (performance.now() < motionUntil) schedule();
    };
    const onScroll = (event: Event) => {
      const target = event.target;
      // Ignore chat, carousels and dialogs; only an ancestor moves this feed.
      if (target !== document && target !== window && !(target instanceof HTMLElement && target.contains(el))) return;
      if (!animation && !(source === el && !el.contains(cut))) schedule();
    };
    const onMotion = (event: TransitionEvent) => {
      if (event.propertyName !== 'transform' || !(event.target instanceof HTMLElement)) return;
      if (!event.target.contains(cut) && !event.target.contains(el)) return;
      motionUntil = event.type === 'transitionrun' ? performance.now() + 500 : 0;
      schedule();
    };
    resizeObserver.observe(el);
    if (el.parentElement) resizeObserver.observe(el.parentElement);
    const themeObserver = new MutationObserver(invalidate);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-nav-hidden', 'data-sticky-nav-hidden', 'data-scroll-hidden', 'data-sticky-scroll-hidden', 'data-no-top-bar', 'data-overlay-open'] });
    const pageObserver = pageScope ? new MutationObserver(invalidate) : null;
    pageObserver?.observe(pageScope, { attributes: true, attributeFilter: ['style'] });
    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    window.addEventListener('resize', invalidate, { passive: true });
    document.addEventListener('transitionrun', onMotion, true);
    document.addEventListener('transitionend', onMotion, true);
    document.addEventListener('transitioncancel', onMotion, true);
    // Apply before paint so the initial render never exposes uncut content.
    update();
    return () => {
      window.removeEventListener('scroll', onScroll, { capture: true });
      window.removeEventListener('resize', invalidate);
      document.removeEventListener('transitionrun', onMotion, true);
      document.removeEventListener('transitionend', onMotion, true);
      document.removeEventListener('transitioncancel', onMotion, true);
      themeObserver.disconnect(); pageObserver?.disconnect(); resizeObserver.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
      clearAnimation(); el.style.clipPath = ''; delete el.dataset.feedSwallowDriver;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef, cutSelector, opts.allThemes, opts.off, opts.edge, isActivePage, ...deps]);
}
