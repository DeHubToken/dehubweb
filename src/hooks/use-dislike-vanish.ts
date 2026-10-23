import { useLayoutEffect, useState, type RefObject } from 'react';
import { isDislikeHidden, useDislikeHidden } from '@/lib/disliked-posts-store';

const LEAVE_MS = 420;
const HOLD_MS = 180;

/**
 * A feed slot leaving because its post was disliked: the card shrinks and
 * fades while its space closes up, then the slot renders nothing for the rest
 * of the session. Animates the slot's own element (no wrapper), so the feed's
 * `:last-child` / `> [data-feed-item]` rules keep matching. A slot that mounts
 * already disliked (scrolled back, tab switched) is simply gone. Returns true
 * once the slot should render nothing.
 */
export function useDislikeVanish(postId: string | number | null | undefined, root: RefObject<HTMLElement>): boolean {
  const isHidden = useDislikeHidden(postId);
  const [gone, setGone] = useState(() => isDislikeHidden(postId));

  useLayoutEffect(() => {
    const el = root.current;
    if (!isHidden) {
      if (gone) setGone(false);
      if (el?.dataset.dislikeVanish) {
        delete el.dataset.dislikeVanish;
        for (const p of ['height', 'overflow', 'transition', 'opacity', 'transform', 'margin-top', 'margin-bottom', 'transform-origin']) el.style.removeProperty(p);
      }
      return;
    }
    if (gone || !el) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setGone(true); return; }
    // Let the thumb show 👎 for a beat, then fold the card away.
    el.dataset.dislikeVanish = 'leaving';
    el.style.height = `${el.offsetHeight}px`;
    el.style.overflow = 'hidden';
    el.style.transformOrigin = 'top center';
    el.style.transition = [
      `height ${LEAVE_MS}ms cubic-bezier(.4,0,.2,1) ${HOLD_MS}ms`,
      `margin ${LEAVE_MS}ms cubic-bezier(.4,0,.2,1) ${HOLD_MS}ms`,
      `opacity ${LEAVE_MS - 120}ms ease ${HOLD_MS}ms`,
      `transform ${LEAVE_MS}ms cubic-bezier(.4,0,.2,1) ${HOLD_MS}ms`,
    ].join(', ');
    void el.offsetHeight;
    el.style.height = '0px';
    el.style.marginTop = '0px';
    el.style.marginBottom = '0px';
    el.style.opacity = '0';
    el.style.transform = 'scale(0.94)';
    const done = window.setTimeout(() => setGone(true), HOLD_MS + LEAVE_MS + 40);
    return () => window.clearTimeout(done);
  }, [isHidden, gone, root]);

  return gone && isHidden;
}
