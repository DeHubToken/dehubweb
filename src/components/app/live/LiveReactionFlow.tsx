import { useEffect } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useReactionFlow } from '@/hooks/use-reaction-flow';
import { LIVE_REACTION_EMOJI } from '@/lib/live/reaction-flow';
import { useAuth } from '@/contexts/AuthContext';

export function LiveReactionFlow({ streamId, enabled, bottom = 24 }: {
  streamId?: string | null;
  enabled: boolean;
  bottom?: number;
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
      if (!cancelled) subscription = watchStreamReactions(streamId, event => addReaction(event.reactionType, event.weight));
    }).catch(() => undefined);
    return () => { cancelled = true; subscription?.leave(); clearReactions(); };
  }, [streamId, enabled, addReaction, clearReactions, isAuthenticated, walletAddress]);

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
