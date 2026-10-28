import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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

  // The lane stays in the picture as an empty anchor: it says where the
  // emoji start and how far they climb. The emoji themselves draw on a layer
  // outside the video, so the media box's rounded edge, the close button and
  // the bottom controls can no longer cut them; they rise over all of it and
  // drift lightly past the card's edge.
  const lane = useRef<HTMLDivElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const [host, setHost] = useState<{ el: HTMLElement; fixed: boolean } | null>(null);
  const active = reactions.length > 0;

  useLayoutEffect(() => {
    if (!active || !lane.current) { setHost(null); return; }
    // Inside a full-screen viewer, draw in that viewer so the layer stays in
    // its stacking order (under its sheets and menus). In the feed, the page.
    let el: HTMLElement | null = lane.current.parentElement;
    while (el && el !== document.body && getComputedStyle(el).position !== 'fixed') el = el.parentElement;
    setHost(el && el !== document.body ? { el, fixed: false } : { el: document.body, fixed: true });
  }, [active]);

  // Layout effect, so the first frame is already in place and never flashes
  // in the corner of the page.
  useLayoutEffect(() => {
    if (!host) return;
    let frame = 0;
    // Follows the lane while anything is flying, so a scrolling feed carries
    // the emoji with its card. Idle, nothing runs.
    const sync = () => {
      const from = lane.current?.getBoundingClientRect();
      const to = layer.current;
      if (from && to) {
        const base = host.fixed ? { left: 0, top: 0 } : host.el.getBoundingClientRect();
        to.style.transform = `translate3d(${from.left - base.left}px, ${from.top - base.top}px, 0)`;
        to.style.width = `${from.width}px`;
        to.style.height = `${from.height}px`;
      }
      frame = requestAnimationFrame(sync);
    };
    sync();
    return () => cancelAnimationFrame(frame);
  }, [host]);

  return <>
    <div ref={lane} aria-hidden="true" data-live-reaction-flow className="pointer-events-none absolute right-1"
      style={{ bottom, width: REACTION_LANE_WIDTH, height: `min(52%, 400px)` }} />
    {host && createPortal(
      <div ref={layer} aria-hidden="true" data-live-reaction-layer
        className={`pointer-events-none left-0 top-0 ${host.fixed ? 'fixed z-40' : 'absolute z-[60]'}`}>
        {reactions.map(item => <ReactionParticleView key={item.id} item={item} lane={lane} still={!!reducedMotion} />)}
      </div>,
      host.el,
    )}
  </>;
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
