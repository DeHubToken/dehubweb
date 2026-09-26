/**
 * Reaction Emoji
 * ==============
 * One reaction's glyph, drawn as the moving Noto emoji (the flame flickers,
 * the heart beats, the 💯 stamps) when `animate` is set, and as the plain
 * system emoji otherwise.
 *
 * WHY ANIMATION AND NOT A GLOW
 * The filled thumbs-up says "you liked this" on its own. The other reactions
 * are already emoji, so a 🔥 you cast and a 🔥 somebody else put in the lead
 * looked the same, and the coloured halo that tried to tell them apart read as
 * a smudge. Movement is the one signal that survives every theme and every
 * background, so the viewer's own reaction is the glyph that moves.
 *
 * The files are Google's Noto Animated Emoji (CC BY 4.0), cut down to 72px
 * animated WebP in `public/emoji/animated/` — the 512px originals are 3.4MB
 * for the set, and the largest we draw is 36px. Reduced-motion viewers, and
 * anyone whose browser fails the file, get the static emoji instead.
 */

import { useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { reactionMeta, type PostReaction } from '@/lib/reactions';

export function animatedReactionSrc(reaction: PostReaction): string {
  return `/emoji/animated/${reaction}.webp`;
}

interface ReactionEmojiProps {
  reaction: PostReaction;
  /** Play the moving version. Off, it is the ordinary emoji character. */
  animate?: boolean;
  className?: string;
}

export function ReactionEmoji({ reaction, animate = false, className }: ReactionEmojiProps) {
  const reduceMotion = useReducedMotion();
  const [failed, setFailed] = useState(false);

  if (!animate || reduceMotion || failed) return <>{reactionMeta(reaction).emoji}</>;

  return (
    <img
      src={animatedReactionSrc(reaction)}
      alt=""
      aria-hidden="true"
      draggable={false}
      decoding="async"
      onError={() => setFailed(true)}
      className={cn('pointer-events-none h-full w-full select-none object-contain', className)}
    />
  );
}
