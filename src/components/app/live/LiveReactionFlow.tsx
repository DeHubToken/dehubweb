import { useEffect, useRef } from 'react';
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'framer-motion';
import { useReactionFlow } from '@/hooks/use-reaction-flow';
import { LIVE_REACTION_EMOJI, REACTION_LANE_WIDTH, REACTION_MOTION, REACTION_SIZE, REACTION_SIZE_BIG, reactionColumn, reactionPose, type ReactionParticle } from '@/lib/live/reaction-flow';
import { useAuth } from '@/contexts/AuthContext';

/**
 * What the viewer who tapped is about to see, played locally.
 *
 * `nonce` is what makes a repeat of the same reaction a new particle; the type
 * alone cannot, because tapping 👍 twice is the common case.
 */
export interface SelfReaction {
  type: unknown;
  weight?: number;
  nonce: number;
}

export function LiveReactionFlow({ streamId, enabled, bottom = 24, self }: {
  streamId?: string | null;
  enabled: boolean;
  bottom?: number;
  /**
   * The signed-in viewer's own reaction, played the instant they tap it.
   *
   * A tip puts its celebration up on submission and lets the broadcast serve
   * the rest of the room. Reactions used to take the echo as their only
   * source, so a viewer whose socket had dropped, who was not in the room, or
   * whose stream id never resolved tapped the thumb and saw nothing at all —
   * no floating thumb, no error, nothing. The echo is still what the room
   * sees; this is only the sender's own copy.
   */
  self?: SelfReaction | null;
}) {
  const { reactions, addReaction, clearReactions } = useReactionFlow();
  const reducedMotion = useReducedMotion();
  const { isAuthenticated, walletAddress } = useAuth();
  useEffect(() => {
    clearReactions();
    if (!streamId || !enabled) return;
    let cancelled = false;
    let subscription: { leave: () => void } | undefined;
    import('@/lib/api/dehub/stream-presence').then(({ watchStreamReactions }) => {
      if (!cancelled) subscription = watchStreamReactions(streamId, event => {
        // Already played locally on tap — this is the same reaction coming
        // back round, not a second one.
        if (event.isOwnReaction) return;
        addReaction(event.reactionType, event.weight);
      });
    }).catch(() => undefined);
    return () => { cancelled = true; subscription?.leave(); clearReactions(); };
  }, [streamId, enabled, addReaction, clearReactions, isAuthenticated, walletAddress]);

  const lastSelfNonce = useRef<number | null>(null);
  useEffect(() => {
    if (!self || self.nonce === lastSelfNonce.current) return;
    lastSelfNonce.current = self.nonce;
    addReaction(self.type, self.weight ?? 1);
  }, [self, addReaction]);

  const lane = useRef<HTMLDivElement>(null);
  return <div ref={lane} aria-hidden="true" data-live-reaction-flow className="pointer-events-none absolute right-1 z-20 overflow-hidden"
    style={{ bottom, width: REACTION_LANE_WIDTH, height: `min(52%, 400px)` }}>
    {reactions.map(item => <ReactionParticleView key={item.id} item={item} lane={lane} still={!!reducedMotion} />)}
  </div>;
}

/** One emoji on its climb. Driven by reactionPose, the same curve the app draws. */
function ReactionParticleView({ item, lane, still }: { item: ReactionParticle; lane: React.RefObject<HTMLDivElement>; still: boolean }) {
  const seed = Number(item.id);
  const t = useMotionValue(0);
  const height = useRef(Math.max(120, (lane.current?.clientHeight ?? 300) - (item.big ? REACTION_SIZE_BIG : REACTION_SIZE)));
  useEffect(() => {
    const controls = animate(t, 1, { duration: REACTION_MOTION[item.type].duration / 1000, ease: 'linear' });
    return () => controls.stop();
  }, [t, item.type]);
  const pose = (v: number) => reactionPose(item.type, seed, v);
  const x = useTransform(t, v => still ? 0 : pose(v).x);
  const y = useTransform(t, v => still ? 0 : -pose(v).rise * height.current);
  const rotate = useTransform(t, v => still ? 0 : pose(v).rotate);
  const scale = useTransform(t, v => still ? 1 : pose(v).scale);
  const opacity = useTransform(t, v => pose(v).opacity);
  const size = item.big ? REACTION_SIZE_BIG : REACTION_SIZE;
  return <motion.span data-live-reaction={item.type}
    className="absolute bottom-0 leading-none will-change-transform"
    style={{ right: reactionColumn(seed), fontSize: size, x, y, rotate, scale, opacity,
      // text-shadow, not a drop-shadow filter: a filter on a moving glyph is
      // an offscreen repaint every frame in Safari, over a playing video.
      textShadow: '0 2px 6px rgba(0,0,0,.45)' }}
  >{LIVE_REACTION_EMOJI[item.type]}</motion.span>;
}
