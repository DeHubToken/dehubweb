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
 * It listens for immediate FEEDBACK, not the delayed vote request. Persistence
 * waits briefly to distinguish double from triple tap, but visible feedback must
 * never inherit that lag. If tap three arrives, Love replaces the in-flight
 * thumb in this renderer while the pending Like request is cancelled.
 *
 * Purely decorative: `pointer-events-none` throughout, so it can never take a
 * tap from the carousel, the player, or the card underneath.
 *
 * It DRAWS from <body>, not from the box it is mounted in. The bloom extends
 * beyond its tap point, and a feed card is a rounded, clipped
 * bento: drawn in place, half of it was sliced off against the card's own edge,
 * the image's rounded corner or the media box's `overflow-hidden`, and on a
 * short card the top of it landed under the sticky nav. The mount point stays
 * where it is — it is the anchor that says which post was tapped and where the
 * card is — but the hearts are portalled to <body> and positioned in viewport
 * coordinates, so nothing between here and the root can cut them.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { Heart, ThumbsUp } from 'lucide-react';
import {
  subscribeTapReactionFeedback,
  type DoubleTapLikeEventDetail,
  type TapReaction,
} from '@/lib/tap-reactions';

interface Burst {
  id: number;
  reaction: TapReaction;
  /** Viewport coords, so the burst starts under the finger wherever it landed. */
  x: number;
  y: number;
}

/**
 * Love gets a restrained bloom: six small hearts lift away from the main one.
 * The shorter travel keeps the acknowledgement close to the finger and avoids
 * the rough, confetti-like cloud the old eleven-spark firework created.
 *
 * `angle` is degrees clockwise from due right. The bloom leans upward, where
 * there is usually more room above a fingertip.
 */
const LOVE_SPARK_SEEDS = [
  { angle: -100, distance: 68, size: 15, delay: 0, rotate: -8, tone: 'fill-rose-500 text-rose-500' },
  { angle: -145, distance: 58, size: 11, delay: 0.03, rotate: -18, tone: 'fill-rose-400 text-rose-400' },
  { angle: -42, distance: 62, size: 12, delay: 0.02, rotate: 16, tone: 'fill-rose-500 text-rose-500' },
  { angle: -174, distance: 46, size: 9, delay: 0.05, rotate: -22, tone: 'fill-rose-300 text-rose-300' },
  { angle: -8, distance: 50, size: 10, delay: 0.04, rotate: 20, tone: 'fill-rose-400 text-rose-400' },
  { angle: 72, distance: 42, size: 9, delay: 0.06, rotate: 10, tone: 'fill-rose-300 text-rose-300' },
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

/** Flight time of one spark. */
const SPARK_DURATION = 0.62;

/**
 * How much room the widest burst needs around its centre. A tap right on the edge of the
 * screen slides inwards by this much so the explosion stays whole — the burst
 * is feedback for a tap that already registered, not a hit target, so moving it
 * costs nothing and losing half of it costs the whole effect.
 */
const BURST_MARGIN = 84;

/** Pull a coordinate inside the viewport; centre it if the axis is too short. */
const keepOnScreen = (value: number, extent: number) =>
  extent < BURST_MARGIN * 2
    ? extent / 2
    : Math.min(extent - BURST_MARGIN, Math.max(BURST_MARGIN, value));

export function TapReactionBurst({ postId }: { postId?: string | number }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [bursts, setBursts] = useState<Burst[]>([]);
  const nextId = useRef(0);
  const removalTimers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const reduceMotion = useReducedMotion();

  const remove = useCallback((id: number) => {
    setBursts((current) => current.filter((b) => b.id !== id));
  }, []);

  useEffect(() => {
    const id = postId != null ? String(postId) : '';
    if (!id) return;
    const timers = removalTimers.current;

    const listener = (detail: DoubleTapLikeEventDetail) => {
      if (!detail || String(detail.postId) !== id) return;
      // The normal browser path paints synchronously at document.body before
      // this React event subscription runs. Stay as a compatibility renderer
      // only for environments where that direct root painter was unavailable.
      if (detail.painted) return;

      // Place it under the finger when we know where that was. A mouse
      // double-click and a keyboard-driven cast carry no point, so those fall
      // back to the middle of the anchor — which is the only reason the anchor
      // still exists now that the drawing happens at the root.
      const box = hostRef.current?.getBoundingClientRect();
      let x: number;
      let y: number;
      if (detail.x != null && detail.y != null) {
        x = detail.x;
        y = detail.y;
      } else if (box && box.width > 0) {
        x = box.left + box.width / 2;
        y = box.top + box.height / 2;
      } else {
        x = window.innerWidth / 2;
        y = window.innerHeight / 2;
      }

      const burst: Burst = {
        id: nextId.current++,
        reaction: detail.reaction ?? 'like',
        x: keepOnScreen(x, window.innerWidth),
        y: keepOnScreen(y, window.innerHeight),
      };
      setBursts((current) => {
        // Defensive only: the recognizer now resolves double versus triple
        // before casting, but an older emitter must not put a thumb behind love.
        const kept =
          burst.reaction === 'love' ? current.filter((b) => b.reaction !== 'like') : current;
        return [...kept, burst];
      });

      const timer = setTimeout(() => {
        timers.delete(timer);
        remove(burst.id);
      }, reduceMotion ? 700 : burst.reaction === 'love' ? 1560 : 1260);
      timers.add(timer);
    };

    const unsubscribe = subscribeTapReactionFeedback(listener);
    return () => {
      unsubscribe();
      timers.forEach(clearTimeout);
      timers.clear();
    };
  }, [postId, reduceMotion, remove]);

  // The anchor: an empty, unclipped box that marks where this post's media is,
  // for a cast that arrives without a tap point. It draws nothing itself.
  const anchor = <div ref={hostRef} aria-hidden className="pointer-events-none absolute inset-0" />;

  // Everything visible lives at the root instead, above the whole app — over
  // the card border, the bento, the sticky nav and any open viewer. Safe at
  // this height because every layer of it is pointer-events-none, and it is
  // gone again inside a second.
  const layer = (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[9999]">
      {bursts.map((burst) => (
        <div
          key={burst.id}
          data-tap-reaction-burst={burst.reaction}
          className="pointer-events-none fixed"
          style={{ left: burst.x, top: burst.y, transform: 'translate(-50%, -50%)' }}
        >
            {burst.reaction === 'love' ? (
              <>
                <motion.div
                  // Start visible. A newly-mounted portal can miss its first
                  // animation frame while the video is painting; beginning at
                  // opacity zero made the whole acknowledgement effectively
                  // invisible on the production feed.
                  initial={reduceMotion ? { opacity: 1 } : { opacity: 1, scale: 0.72, y: 5, rotate: -5 }}
                  animate={
                    reduceMotion
                      ? { opacity: 1 }
                      : {
                          opacity: [1, 1, 0.96, 0],
                          scale: [0.72, 1.1, 1, 0.92],
                          y: [5, 0, -2, -14],
                          rotate: [-5, 0, 0, 2],
                        }
                  }
                  transition={{ duration: 1.42, times: [0, 0.17, 0.7, 1], ease: [0.22, 1, 0.36, 1] }}
                >
                  <Heart className="h-[4.5rem] w-[4.5rem] fill-rose-500 text-rose-500 drop-shadow-[0_2px_5px_rgba(190,18,60,0.20)]" />
                </motion.div>
                {!reduceMotion && LOVE_SPARKS.map((spark, i) => (
                  <motion.span
                    key={i}
                    className="absolute left-1/2 top-1/2"
                    style={{ marginLeft: -spark.size / 2, marginTop: -spark.size / 2 }}
                    initial={{ opacity: 0, x: 0, y: 0, scale: 0.55, rotate: 0 }}
                    animate={{
                      opacity: [0, 0.9, 0],
                      x: [0, spark.x * 0.7, spark.x],
                      y: [0, spark.y * 0.7, spark.y - 6],
                      scale: [0.55, 1, 0.72],
                      rotate: [0, spark.rotate * 0.6, spark.rotate],
                    }}
                    transition={{
                      duration: SPARK_DURATION,
                      delay: spark.delay,
                      times: [0, 0.22, 1],
                      ease: [0.22, 1, 0.36, 1],
                    }}
                  >
                    <Heart
                      className={`${spark.tone} drop-shadow-[0_2px_4px_rgba(190,18,60,0.18)]`}
                      style={{ width: spark.size, height: spark.size }}
                    />
                  </motion.span>
                ))}
              </>
            ) : (
              <motion.div
                initial={reduceMotion ? { opacity: 1 } : { opacity: 1, scale: 0.76, y: 4 }}
                animate={
                  reduceMotion
                    ? { opacity: 1 }
                    : {
                        opacity: [1, 1, 0.94, 0],
                        scale: [0.76, 1.07, 1, 0.92],
                        y: [4, 0, -2, -14],
                      }
                }
                transition={{ duration: 1.12, times: [0, 0.18, 0.68, 1], ease: [0.22, 1, 0.36, 1] }}
              >
                <ThumbsUp className="h-16 w-16 fill-sky-500 text-sky-500 drop-shadow-[0_2px_5px_rgba(2,132,199,0.18)]" />
              </motion.div>
            )}
        </div>
      ))}
    </div>
  );

  return (
    <>
      {anchor}
      {/* Only while something is actually flying: a feed mounts one of these
          per card, and an idle full-viewport fixed layer each is a compositing
          bill for nothing. */}
      {bursts.length > 0 && typeof document !== 'undefined'
        ? createPortal(layer, document.body)
        : null}
    </>
  );
}
