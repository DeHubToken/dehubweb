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

/**
 * The love burst is a firework, not one heart with a halo: eleven hearts at
 * eleven sizes thrown out of the tap point and then pulled back down.
 *
 * `angle` is degrees clockwise from due right, so negative is upward — the
 * spray is weighted there because that is where there is room above a finger.
 * The size spread is what sells it as an explosion; a single size reads as a
 * ring instead. `fall` is the sag applied over the last third of the flight,
 * and small sparks fly furthest and sag least.
 */
const LOVE_SPARK_SEEDS = [
  { angle: -90, distance: 106, size: 26, delay: 0, rotate: -8, fall: 22, tone: 'fill-rose-500 text-rose-500' },
  { angle: -138, distance: 92, size: 16, delay: 0.04, rotate: -26, fall: 18, tone: 'fill-rose-400 text-rose-400' },
  { angle: -42, distance: 96, size: 18, delay: 0.03, rotate: 24, fall: 18, tone: 'fill-rose-500 text-rose-500' },
  { angle: -166, distance: 72, size: 12, delay: 0.07, rotate: -34, fall: 14, tone: 'fill-rose-300 text-rose-300' },
  { angle: -14, distance: 76, size: 13, delay: 0.06, rotate: 30, fall: 14, tone: 'fill-rose-400 text-rose-400' },
  { angle: -114, distance: 62, size: 22, delay: 0.09, rotate: -18, fall: 12, tone: 'fill-rose-500 text-rose-500' },
  { angle: -66, distance: 66, size: 20, delay: 0.08, rotate: 16, fall: 12, tone: 'fill-rose-400 text-rose-400' },
  { angle: 154, distance: 82, size: 11, delay: 0.11, rotate: -40, fall: 10, tone: 'fill-rose-300 text-rose-300' },
  { angle: 26, distance: 86, size: 14, delay: 0.1, rotate: 36, fall: 10, tone: 'fill-rose-400 text-rose-400' },
  { angle: 104, distance: 50, size: 10, delay: 0.13, rotate: 12, fall: 8, tone: 'fill-rose-300 text-rose-300' },
  { angle: 74, distance: 56, size: 15, delay: 0.12, rotate: -12, fall: 8, tone: 'fill-rose-500 text-rose-500' },
] as const;

/** Polar → cartesian once at module load; none of it changes per burst. */
const LOVE_SPARKS = LOVE_SPARK_SEEDS.map((spark) => {
  const radians = (spark.angle * Math.PI) / 180;
  return {
    ...spark,
    x: Math.cos(radians) * spark.distance,
    y: Math.sin(radians) * spark.distance,
  };
});

/** Flight time of one spark. The stagger above adds ~0.13s on top. */
const SPARK_DURATION = 0.95;

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
      setBursts((current) => {
        // A love always arrives on top of the 👍 that the same gesture's second
        // tap cast a moment earlier. Drop that one the instant the explosion
        // starts instead of leaving a thumb sitting behind the hearts for the
        // rest of its own 450ms — the ladder upgraded, so the rung below it
        // should be gone. AnimatePresence still fades it, under the flash.
        const kept =
          burst.reaction === 'love' ? current.filter((b) => b.reaction !== 'like') : current;
        return [...kept, burst];
      });
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
            // Exit is a flat 120ms rather than the entry spring: a 👍 replaced
            // by a love has to be gone before the eye finds it again.
            exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.12, ease: 'easeOut' } }}
            transition={{ type: 'spring', stiffness: 420, damping: 18 }}
            onAnimationComplete={() => {
              // Long enough to read, short enough not to stack up on a fast
              // triple tap. Removal is driven from here rather than a timer so
              // it cannot outlive an unmount. Love waits for the last spark.
              setTimeout(() => remove(burst.id), burst.reaction === 'love' ? 900 : 450);
            }}
          >
            {burst.reaction === 'love' ? (
              <>
                {/* The flash the sparks come out of. Sits behind the lot and is
                    gone well before the hearts land. */}
                <motion.span
                  className="absolute left-1/2 top-1/2 -z-10 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full"
                  style={{
                    background:
                      'radial-gradient(circle, rgba(244,63,94,0.55) 0%, rgba(244,63,94,0.18) 45%, rgba(244,63,94,0) 70%)',
                  }}
                  initial={{ opacity: 0.9, scale: 0.2 }}
                  animate={{ opacity: 0, scale: 1.8 }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                />
                <motion.div
                  initial={{ scale: 0.4 }}
                  animate={{ scale: [0.4, 1.3, 1] }}
                  transition={{ duration: 0.45 }}
                >
                  <Heart className="h-16 w-16 fill-rose-500 text-rose-500 drop-shadow-[0_2px_12px_rgba(0,0,0,0.45)]" />
                </motion.div>
                {LOVE_SPARKS.map((spark, i) => (
                  <motion.span
                    key={i}
                    className="absolute left-1/2 top-1/2"
                    style={{ marginLeft: -spark.size / 2, marginTop: -spark.size / 2 }}
                    initial={{ opacity: 0, x: 0, y: 0, scale: 0.2, rotate: 0 }}
                    animate={{
                      opacity: [0, 1, 1, 0],
                      x: [0, spark.x * 0.62, spark.x * 0.93, spark.x],
                      y: [0, spark.y * 0.62, spark.y * 0.93, spark.y + spark.fall],
                      scale: [0.2, 1, 0.92, 0.5],
                      rotate: [0, spark.rotate * 0.5, spark.rotate * 0.85, spark.rotate],
                    }}
                    transition={{
                      duration: SPARK_DURATION,
                      delay: spark.delay,
                      times: [0, 0.25, 0.6, 1],
                      ease: 'easeOut',
                    }}
                  >
                    <Heart
                      className={`${spark.tone} drop-shadow-[0_1px_6px_rgba(0,0,0,0.4)]`}
                      style={{ width: spark.size, height: spark.size }}
                    />
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
