/**
 * Reaction Picker
 * ===============
 * The nine-reaction tray that opens when you hold (touch) or hover (mouse) the
 * thumbs-up on a post.
 *
 * WHY IT ISN'T A POPOVER/DROPDOWN PRIMITIVE
 * Those trap focus and mark the page inert while open, which on touch would
 * swallow the very pointer stream that is still down on the thumbs-up — the
 * user would have to lift and tap again, defeating the hold-and-slide gesture.
 * This is a plain absolutely-positioned element instead, so a single unbroken
 * press can open the tray and land on a reaction.
 *
 * The tray is intentionally the only place emoji appear in the chrome; the
 * frame around them stays on the monochrome glass palette.
 *
 * Each emoji carries its own total in the corner, so the tray doubles as the
 * public breakdown of a post — a post with 19 👍 and one ❤️ reads as exactly
 * that, where the row's single count only ever said "20 positive".
 */

import { useEffect, useRef } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { REACTION_LIST, type PostReaction, type ReactionCounts } from '@/lib/reactions';

/** Compact tally for the corner of a 36px tray button (1500 → 1.5K). */
function formatTally(count: number): string {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1).replace(/\.0$/, '')}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  return count.toString();
}

interface ReactionPickerProps {
  open: boolean;
  /** The reaction the viewer currently holds, highlighted in the tray. */
  current: PostReaction | null;
  /**
   * How many people hold each reaction, drawn in the corner of its emoji.
   * Reactions nobody has picked show a dimmed 0 rather than nothing, so the
   * nine corners stay a readable row of numbers instead of a ragged few.
   * Omit to render the tray bare, as it was before totals existed.
   */
  counts?: ReactionCounts | null;
  onSelect: (reaction: PostReaction) => void;
  onClose: () => void;
  /**
   * Horizontal anchoring relative to the button. Cards put the like button at
   * the far right, where a centered tray would overflow the card.
   */
  align?: 'left' | 'center' | 'right';
  /**
   * Opens the reaction breakdown. Passed only on your own posts — who reacted
   * is the author's to see, so on anyone else's post the tray ends at the
   * ninth emoji and there is no ⓘ to press.
   */
  onShowInfo?: () => void;
}

export function ReactionPicker({
  open,
  current,
  counts,
  onSelect,
  onClose,
  align = 'right',
  onShowInfo,
}: ReactionPickerProps) {
  const trayRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

  // Dismiss on any press outside the tray, on scroll, and on Escape.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!trayRef.current?.contains(event.target as Node)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    // Capture phase: a card-level pointerdown handler would otherwise navigate
    // to the post before this ever ran.
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', onClose, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', onClose, true);
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={trayRef}
          role="menu"
          aria-label="Pick a reaction"
          initial={reduceMotion ? false : { opacity: 0, y: 6, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.96 }}
          transition={{ duration: reduceMotion ? 0 : 0.16, ease: [0.16, 1, 0.3, 1] }}
          data-no-navigate
          data-keep-round
          /* A floating menu, so it needs a menu's surface even though it is
             absolutely positioned rather than portalled: nine emoji have to
             read against whatever post is behind the card. */
          data-reaction-tray
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          className={cn(
            'absolute bottom-full mb-2 z-50 isolate flex items-center gap-0.5 overflow-hidden px-1.5 py-1.5',
            'rounded-2xl border border-white/15 bg-zinc-950/80',
            'backdrop-blur-[28px] backdrop-saturate-150',
            'shadow-[inset_0_1px_0_rgba(255,255,255,0.10),0_8px_32px_rgba(0,0,0,0.45)]',
            align === 'right' && 'right-0',
            align === 'left' && 'left-0',
            align === 'center' && 'left-1/2 -translate-x-1/2',
          )}
        >
          {REACTION_LIST.map((reaction) => {
            const tally = counts ? (counts[reaction.key] ?? 0) : null;
            const withTally =
              tally === null
                ? reaction.label
                : `${reaction.label} — ${tally} ${tally === 1 ? 'reaction' : 'reactions'}`;
            return (
              <button
                key={reaction.key}
                role="menuitemradio"
                aria-checked={current === reaction.key}
                type="button"
                aria-label={withTally}
                title={withTally}
                data-reaction-option
                data-keep-round
                data-active={current === reaction.key ? 'true' : undefined}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(reaction.key);
                }}
                // Fires when a hold-and-slide gesture releases over this item.
                onPointerUp={(e) => {
                  e.stopPropagation();
                  onSelect(reaction.key);
                }}
                className={cn(
                  'group relative flex h-9 w-9 items-center justify-center rounded-full',
                  'text-lg leading-none transition-[transform,background-color,box-shadow] duration-150 ease-out',
                  'hover:-translate-y-0.5 hover:scale-110 hover:bg-white/10 active:translate-y-0 active:scale-95',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60',
                  current === reaction.key && 'bg-white/15 ring-1 ring-white/40',
                )}
              >
                <span aria-hidden="true">{reaction.emoji}</span>
                {/* Total for this reaction, tucked into the corner above the
                    emoji. Absolutely positioned so a four-character "1.2K"
                    can never widen the tray — nine of those would push it off
                    a phone screen. The emoji sits in the middle 18px of a
                    36px box, so the top strip is free. */}
                {tally !== null && (
                  <span
                    aria-hidden="true"
                    data-reaction-count
                    data-zero={tally === 0 ? 'true' : undefined}
                    className={cn(
                      'pointer-events-none absolute right-0.5 top-0 text-[9px] font-semibold leading-none tabular-nums',
                      tally > 0 ? 'text-white/70' : 'text-white/30',
                    )}
                  >
                    {formatTally(tally)}
                  </span>
                )}
              </button>
            );
          })}

          {/* Author-only breakdown. Same pointerup handling as the reactions
              above so a single hold-and-slide can land on it. */}
          {onShowInfo && (
            <>
              <span aria-hidden="true" className="mx-0.5 h-5 w-px shrink-0 bg-white/15" />
              <button
                role="menuitem"
                type="button"
                aria-label="See who reacted"
                title="See who reacted"
                data-keep-round
                onClick={(e) => {
                  e.stopPropagation();
                  onShowInfo();
                }}
                onPointerUp={(e) => {
                  e.stopPropagation();
                  onShowInfo();
                }}
                className={cn(
                  'group relative flex h-9 w-9 items-center justify-center rounded-full',
                  'text-white/50 transition-[transform,background-color,color] duration-150 ease-out',
                  'hover:-translate-y-0.5 hover:bg-white/10 hover:text-white active:translate-y-0 active:scale-95',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60',
                )}
              >
                <Info className="h-[18px] w-[18px]" aria-hidden="true" />
              </button>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
