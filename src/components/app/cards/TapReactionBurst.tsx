/**
 * TapReactionBurst
 * ================
 * The visible half of the tap ladder. Without it the gesture is invisible: the
 * only other feedback is a counter in the ActionBar, which on a video card is
 * off-screen below the fold.
 *
 * Listens for this post's own tap reactions rather than taking a prop, so a
 * surface opts in by dropping one self-contained element inside its media box —
 * no state to thread, and the emitting hook stays independent of the drawing.
 *
 * Purely decorative: `pointer-events-none` throughout, so it can never take a
 * tap from the carousel, the player, or the card underneath.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Heart, ThumbsUp } from 'lucide-react';
import {
  DOUBLE_TAP_LIKE_EVENT,
  type DoubleTapLikeEventDetail,
  type TapReaction,
} from '@/lib/tap-reactions';

interface Burst {
  id: number;
  reaction: TapReaction;
  /** Percentage coords within this box, so the burst starts under the finger. */
  left: number;
  top: number;
}

/** Where each heart of a love burst flies, as (x, y, rotation). */
const LOVE_SPRAY = [
  [-46, -74, -22],
  [-18, -96, -8],
  [16, -92, 10],
  [46, -68, 24],
  [-34, -44, -16],
  [34, -46, 18],
] as const;

export function TapReactionBurst({ postId }: { postId?: string | number }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [bursts, setBursts] = useState<Burst[]>([]);
  const nextId = useRef(0);

  const remove = useCallback((id: number) => {
    setBursts((current) => current.filter((b) => b.id !== id));
  }, []);

  useEffect(() => {
    const id = postId != null ? String(postId) : '';
    if (!id) return;

    const listener = (event: Event) => {
      const detail = (event as CustomEvent<DoubleTapLikeEventDetail>).detail;
      if (!detail || String(detail.postId) !== id) return;

      // Place it under the finger when we know where that was, else dead centre
      // — a mouse double-click and a keyboard-driven cast have no point.
      let left = 50;
      let top = 50;
      const box = hostRef.current?.getBoundingClientRect();
      if (box && box.width > 0 && detail.x != null && detail.y != null) {
        left = ((detail.x - box.left) / box.width) * 100;
        top = ((detail.y - box.top) / box.height) * 100;
        // A tap can land just outside during a fling; keep the burst on screen.
        left = Math.min(92, Math.max(8, left));
        top = Math.min(92, Math.max(8, top));
      }

      const burst: Burst = {
        id: nextId.current++,
        reaction: detail.reaction ?? 'like',
        left,
        top,
      };
      setBursts((current) => [...current, burst]);
    };

    window.addEventListener(DOUBLE_TAP_LIKE_EVENT, listener as EventListener);
    return () => window.removeEventListener(DOUBLE_TAP_LIKE_EVENT, listener as EventListener);
  }, [postId]);

  return (
    <div
      ref={hostRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 z-40 overflow-hidden"
    >
      <AnimatePresence>
        {bursts.map((burst) => (
          <motion.div
            key={burst.id}
            className="pointer-events-none absolute"
            style={{ left: `${burst.left}%`, top: `${burst.top}%` }}
            initial={{ opacity: 0, scale: 0.4, x: '-50%', y: '-50%' }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ type: 'spring', stiffness: 420, damping: 18 }}
            onAnimationComplete={() => {
              // Long enough to read, short enough not to stack up on a fast
              // triple tap. Removal is driven from here rather than a timer so
              // it cannot outlive an unmount.
              setTimeout(() => remove(burst.id), burst.reaction === 'love' ? 700 : 450);
            }}
          >
            {burst.reaction === 'love' ? (
              <>
                <motion.div
                  initial={{ scale: 0.4 }}
                  animate={{ scale: [0.4, 1.25, 1] }}
                  transition={{ duration: 0.45 }}
                >
                  <Heart className="h-16 w-16 fill-rose-500 text-rose-500 drop-shadow-[0_2px_12px_rgba(0,0,0,0.45)]" />
                </motion.div>
                {LOVE_SPRAY.map(([x, y, rotate], i) => (
                  <motion.span
                    key={i}
                    className="absolute left-1/2 top-1/2 text-2xl"
                    initial={{ opacity: 0, x: '-50%', y: '-50%', scale: 0.3 }}
                    animate={{ opacity: [0, 1, 0], x, y, scale: 1, rotate }}
                    transition={{ duration: 0.9, delay: i * 0.035, ease: 'easeOut' }}
                  >
                    ❤️
                  </motion.span>
                ))}
              </>
            ) : (
              <motion.div
                initial={{ scale: 0.4 }}
                animate={{ scale: [0.4, 1.2, 1] }}
                transition={{ duration: 0.35 }}
              >
                <ThumbsUp className="h-14 w-14 fill-white text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.45)]" />
              </motion.div>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
