import { useEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useReactionFlow } from '@/hooks/use-reaction-flow';
import { LIVE_REACTION_EMOJI } from '@/lib/live/reaction-flow';
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
  const me = walletAddress ? walletAddress.toLowerCase() : null;
  // Read through a ref: the subscription below must not tear down and rebuild
  // every time the viewer reacts.
  const meRef = useRef(me);
  useEffect(() => { meRef.current = me; }, [me]);
  useEffect(() => {
    clearReactions();
    if (!streamId || !enabled) return;
    let cancelled = false;
    let subscription: { leave: () => void } | undefined;
    import('@/lib/api/dehub/stream-presence').then(({ watchStreamReactions }) => {
      if (!cancelled) subscription = watchStreamReactions(streamId, event => {
        // Already played locally on tap — this is the same reaction coming
        // back round, not a second one.
        if (event.address && meRef.current && event.address === meRef.current) return;
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

  return <div aria-hidden="true" data-live-reaction-flow className="pointer-events-none absolute right-3 z-20 h-44 w-24 overflow-hidden" style={{ bottom }}>
    {reactions.map(item => {
      const seed = Number(item.id);
      const drift = (seed % 5 - 2) * 7;
      return <motion.span key={item.id} data-live-reaction={item.type}
        className="absolute bottom-1 text-[22px] leading-none"
        style={{ right: 12 + seed % 4 * 10 }}
        initial={{ opacity: 0, scale: 0.6, x: 0, y: 0 }}
        animate={reducedMotion
          ? { opacity: [0, 1, 1, 0], scale: 1 }
          : { opacity: [0, 1, 1, 0], scale: [0.6, 1, 1.15, 0], x: [0, drift / 2, drift, drift], y: [0, -30, -105, -120] }}
        transition={{ duration: 1.5, times: [0, 0.12, 0.85, 1], ease: 'easeOut' }}
      >{LIVE_REACTION_EMOJI[item.type]}</motion.span>;
    })}
  </div>;
}
