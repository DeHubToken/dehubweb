import { useContext, useLayoutEffect, type RefObject } from 'react';
import { CachedPageActiveContext } from '@/contexts/CachedPageActiveContext';

const GLASS_NAV_THEMES = ['cosmic', 'hazy', 'swarms', 'lavalamp', 'winter', 'war', 'osaka', 'jungle', 'island', 'hacker', 'horror', 'system', 'immersive'];
// The feed stops below the pill's rounded top corners, so nothing peeks past
// them. Falls back to this when the pill reports no radius.
const PILL_CUT_INSET = 4;
type TimelineConstructor = new (options: { source: Element; axis: 'block' }) => AnimationTimeline;

function scrollSource(el: HTMLElement): HTMLElement {
  for (let node: HTMLElement | null = el; node && node !== document.documentElement; node = node.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(node).overflowY) && node.scrollHeight > node.clientHeight) return node;
  }
  return (document.scrollingElement || document.documentElement) as HTMLElement;
}

function navTranslation(value: string, nav: HTMLElement): number {
  // Resolve translateY before DOMMatrix: WebKit can accept calc() while
  // silently dropping its percentage term. Use the NAV's measured height,
  // never the much taller feed layer receiving the copied transition.
  const match = value.match(/^translateY\((.*)\)$/);
  if (match) {
    const terms = Array.from(match[1].matchAll(/([+-]?\s*(?:\d*\.)?\d+)\s*(px|%|rem)/g));
    if (!terms.length) throw new Error('Unresolved nav transform');
    const height = nav.getBoundingClientRect().height;
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    return terms.reduce((sum, term) => sum + parseFloat(term[1].replace(/\s/g, '')) * (term[2] === '%' ? height / 100 : term[2] === 'rem' ? rem : 1), 0);
  }
  return new DOMMatrixReadOnly(value).m42;
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
    const Timeline = (window as unknown as { ScrollTimeline?: TimelineConstructor }).ScrollTimeline;
    let frame: number | null = null;
    let cut: HTMLElement | null = null;
    let source: HTMLElement | null = null;
    let animation: Animation | null = null;
    let contentAnimation: Animation | null = null;
    let navAnimation: Animation | null = null;
    let inverseNavAnimation: Animation | null = null;
    let sourceNavAnimation: Animation | null = null;
    let animationSource: HTMLElement | null = null;
    let lastFrames = '';
    let lastClip = '';
    let clipTarget: HTMLElement = el;
    let findCut = true;
    let cutInset = PILL_CUT_INSET;
    let motionUntil = 0;
    const cutLayer = el.querySelector<HTMLElement>(':scope > [data-feed-swallow-cut]');
    const motion = cutLayer?.querySelector<HTMLElement>(':scope > [data-feed-swallow-motion]');
    const inverseNavLayer = motion?.querySelector<HTMLElement>(':scope > [data-feed-swallow-content]');
    const bounds = el.parentElement?.matches('[data-feed-swallow-bounds]') ? el.parentElement : null;
    const originalOverflow = bounds?.style.overflow || '';
    const visibleCut = (root: ParentNode) => Array.from(root.querySelectorAll<HTMLElement>(cutSelector)).find(candidate =>
      candidate.offsetParent !== null && getComputedStyle(candidate).visibility !== 'hidden',
    ) || null;
    const clearAnimation = () => {
      animation?.cancel();
      contentAnimation?.cancel();
      navAnimation?.cancel(); inverseNavAnimation?.cancel();
      animation = null;
      contentAnimation = null;
      navAnimation = null; inverseNavAnimation = null; sourceNavAnimation = null;
      animationSource = null;
      lastFrames = '';
      if (bounds) bounds.style.overflow = originalOverflow;
    };
    const writeClip = (clip: string, target = el) => {
      if (clipTarget !== target) { clipTarget.style.clipPath = ''; lastClip = ''; clipTarget = target; }
      if (clip !== lastClip) { target.style.clipPath = clip; lastClip = clip; }
    };
    const schedule = () => { if (frame === null) frame = requestAnimationFrame(update); };
    const invalidate = () => { findCut = true; schedule(); };
    const resizeObserver = new ResizeObserver(() => {
      // A new scroll range changes timeline progress immediately. Refresh
      // endpoints in this pre-paint callback, avoiding one stale range frame.
      findCut = true;
      if (frame !== null) cancelAnimationFrame(frame);
      update();
    });
    const update = () => {
      frame = null;
      // Running transform animations create a stacking context even when CSS
      // overrides their transform to none. Cancel them while the welcome card
      // needs to paint above the root frost, including its fade-out interval.
      if (document.documentElement.hasAttribute('data-feed-loading') && el.querySelector('.dehub-intro')) {
        clearAnimation(); writeClip(''); delete el.dataset.feedSwallowDriver; return;
      }
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
        // Themes change the pill's radius, so re-read it with the cut.
        cutInset = (cut && parseFloat(getComputedStyle(cut).borderTopLeftRadius)) || PILL_CUT_INSET;
        source = scrollSource(el);
        findCut = false;
      }
      if (!cut || !source) { clearAnimation(); writeClip(''); delete el.dataset.feedSwallowDriver; return; }

      // Read all geometry before writes. No selector traversal on ordinary scrolls.
      const pr = cut.getBoundingClientRect();
      const cr = el.getBoundingClientRect();
      const nested = el.contains(cut);
      // Profile headers explicitly request their bottom edge. Every feed pill
      // uses one full-width line at the upper rim, including canvas themes.
      const bottom = !nested && opts.edge === 'bottom';
      const cutY = bottom ? pr.bottom : pr.top + Math.min(cutInset, pr.height / 2);
      const shape = (y: number) => `inset(${y.toFixed(2)}px 0 0 0)`;
      const currentY = cutY - cr.top;
      const outer = cut.closest<HTMLElement>('[data-feed-nav-outer], [data-kit-island-outer]');
      const maxScroll = source.scrollHeight - source.clientHeight;
      // The scrollport itself has a stationary clip; its descendants already
      // scroll within that cut on the compositor (including post overlays).
      if (Timeline && outer && !nested && source !== el && maxScroll > 0 && motion && bounds && cutLayer && inverseNavLayer) {
        let pinnedY = cutY;
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
        // Move the clipping surface against the document scroll, and move
        // its content back by the same distance. Both transforms composite;
        // the full-width cut stays stationary even while JS cannot run. Bounds
        // retain the original layout height, preventing transformed overflow
        // from enlarging the document's scroll range as the page scrolls.
        const currentTransform = animation ? getComputedStyle(el).transform : '';
        const counterOffset = currentTransform && currentTransform !== 'none' ? new DOMMatrixReadOnly(currentTransform).m42 : 0;
        // A resized document changes timeline progress before endpoints are
        // refreshed. Recover the layout origin from the actual transform,
        // rather than assuming the old animation still exactly cancels scroll.
        const cutRect = cutLayer.getBoundingClientRect();
        const cutTransform = getComputedStyle(cutLayer).transform;
        const cutOffset = cutTransform && cutTransform !== 'none' ? new DOMMatrixReadOnly(cutTransform).m42 : 0;
        const layoutTop = cutRect.top + source.scrollTop - counterOffset - cutOffset;
        const navTransform = getComputedStyle(outer).transform;
        const navOffset = navTransform && navTransform !== 'none' ? new DOMMatrixReadOnly(navTransform).m42 : 0;
        const transition = outer.getAnimations().find(candidate =>
          'transitionProperty' in candidate && candidate.transitionProperty === 'transform' && candidate.playState === 'running',
        );
        const mirrorNav = !!transition && typeof transition.startTime === 'number';
        const y0 = pinnedY - layoutTop - (mirrorNav ? navOffset : 0);
        const frames: Keyframe[] = [{ transform: 'translateY(0px)' }, { transform: `translateY(${maxScroll}px)` }];
        const contentFrames: Keyframe[] = [{ transform: 'translateY(0px)' }, { transform: `translateY(${-maxScroll}px)` }];
        const key = String(maxScroll);
        if (source !== animationSource || !animation) {
          clearAnimation();
          try {
            const timing = { timeline: new Timeline({ source, axis: 'block' }), fill: 'both' as const, easing: 'linear' };
            animation = el.animate(frames, timing);
            contentAnimation = motion.animate(contentFrames, timing);
            bounds.style.overflow = 'clip';
            animationSource = source;
          } catch { clearAnimation(); /* Partial implementations keep the frame fallback. */ }
        } else if (key !== lastFrames) {
          (animation.effect as KeyframeEffect).setKeyframes(frames);
          (contentAnimation!.effect as KeyframeEffect).setKeyframes(contentFrames);
        }
        if (animation) {
          // Copy the nav's own transform transition onto the clipping layer,
          // with the inverse on its content. Shared start times keep the cut
          // attached to a returning pill even if JS stalls mid-transition.
          if (mirrorNav && transition !== sourceNavAnimation) {
            navAnimation?.cancel(); inverseNavAnimation?.cancel();
            const effect = transition.effect as KeyframeEffect;
            const navFrames = effect.getKeyframes().map(keyframe => ({ offset: keyframe.offset, easing: keyframe.easing, transform: `translateY(${navTranslation(String(keyframe.transform), outer)}px)` }));
            const inverseFrames = navFrames.map(keyframe => ({ ...keyframe, transform: `translateY(${-new DOMMatrixReadOnly(String(keyframe.transform)).m42}px)` }));
            const timing = { ...effect.getTiming(), fill: 'both' as const };
            navAnimation = cutLayer.animate(navFrames, timing);
            inverseNavAnimation = inverseNavLayer.animate(inverseFrames, timing);
            navAnimation.startTime = transition.startTime;
            inverseNavAnimation.startTime = transition.startTime;
            sourceNavAnimation = transition;
          } else if (!mirrorNav) {
            navAnimation?.cancel(); inverseNavAnimation?.cancel();
            navAnimation = null; inverseNavAnimation = null; sourceNavAnimation = null;
          }
          lastFrames = key; writeClip(shape(y0), cutLayer); el.dataset.feedSwallowDriver = 'scroll-transform';
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
      if (target !== document && target !== event.currentTarget && !(target instanceof HTMLElement && target.contains(el))) return;
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
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-feed-loading', 'data-theme', 'data-nav-hidden', 'data-sticky-nav-hidden', 'data-scroll-hidden', 'data-sticky-scroll-hidden', 'data-no-top-bar', 'data-overlay-open'] });
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
      clearAnimation(); clipTarget.style.clipPath = ''; el.style.clipPath = ''; delete el.dataset.feedSwallowDriver;
      if (bounds) bounds.style.overflow = originalOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef, cutSelector, opts.allThemes, opts.off, opts.edge, isActivePage, ...deps]);
}
