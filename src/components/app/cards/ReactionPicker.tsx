/**
 * Reaction Picker
 * ===============
 * The reaction tray that opens when you hold (touch) or hover (mouse) the
 * thumbs-up on a post.
 *
 * WHY IT ISN'T A POPOVER/DROPDOWN PRIMITIVE
 * Those trap focus and mark the page inert while open, which on touch would
 * swallow the very pointer stream that is still down on the thumbs-up — the
 * user would have to lift and tap again, defeating the hold-and-slide gesture.
 * This is a plain absolutely-positioned element instead, so a single unbroken
 * press can open the tray and land on a reaction.
 *
 * The frame around the emoji stays on the monochrome glass palette. The emoji
 * inside it move: the one you hold plays its animation (and carries a dot
 * underneath), and whichever one the pointer is on plays too, so the tray
 * previews what you are about to cast. The card's button plays the same
 * animation once the reaction is yours — see `ReactionEmoji`.
 *
 * Each emoji carries its own total underneath it, so the tray doubles as the
 * public breakdown of a post — a post with 19 👍 and one ❤️ reads as exactly
 * that, where the row's single count only ever said "20 positive".
 *
 * ONE TRAY, EVERY REACTION
 * Posts and comments have no separate thumbs-down any more. The thumbs-up's
 * tray holds the positive faces, a thin divider, and then 👎 last — so the
 * downvote is one hold away instead of a second button on every row, and it
 * still reads as apart from the faces that count as a like.
 *
 * WHY IT MEASURES ITSELF AND SCROLLS
 * Seven emoji plus the author's info button is ~320px of tray, hung off a
 * button that sits a fifth of the way along a card's action row. On a phone
 * that ran the last reactions clean off the screen edge with no way to reach
 * them. So the tray caps itself at the viewport, nudges itself back inside it
 * once laid out, and scrolls horizontally for whatever still does not fit. On
 * a desktop card none of that shows: there is nothing to clamp and nothing to
 * scroll.
 *
 * ON A PHONE IT IS A DRAWER
 * Below the mobile breakpoint the tray is replaced by a bottom drawer, portalled
 * to the app root: a row hung off a ~40px thumb and clamped to a phone screen
 * still left most of the reactions scrolled out of sight at a size too small
 * to hit. The drawer shows every reaction at once, large, in a grid. Hover
 * previews and hold-and-slide are pointer-device affordances, so desktop keeps
 * the tray. React events from a portal still bubble through the card, so the
 * drawer stops them at its root the same way the tray does.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  NEGATIVE_REACTION_LIST,
  POSITIVE_REACTION_LIST,
  type PostReaction,
  type ReactionCounts,
} from '@/lib/reactions';
import { ReactionEmoji, animatedReactionSrc } from './ReactionEmoji';

/** How close to the edge of the screen the tray is allowed to sit, in px. */
const EDGE_MARGIN = 8;

/** Travel, in px, past which a press on the tray is a scroll and not a pick. */
const DRAG_SLOP = 10;

/** Compact tally for under a 36px tray button's emoji (1500 → 1.5K). */
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
   * How many people hold each reaction, drawn under its emoji. Reactions
   * nobody has picked show a dimmed 0 rather than nothing, so the totals stay
   * a readable row of numbers instead of a ragged few.
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
   * is the author's to see, so on anyone else's post the tray ends at the last
   * emoji and there is no ⓘ to press.
   */
  onShowInfo?: () => void;
  /**
   * Which reactions the tray offers. `all` (the default) is the thumbs-up's
   * tray: every positive face, a divider, then the ones that count against.
   * `positive` and `negative` show one side only.
   */
  polarity?: 'all' | 'positive' | 'negative';
}

export function ReactionPicker({
  open,
  current,
  counts,
  onSelect,
  onClose,
  align = 'right',
  onShowInfo,
  polarity = 'all',
}: ReactionPickerProps) {
  const { t } = useTranslation();
  const positives = polarity === 'negative' ? [] : POSITIVE_REACTION_LIST;
  const negatives = polarity === 'positive' ? [] : NEGATIVE_REACTION_LIST;
  const reactions = [...positives, ...negatives];
  const isDrawer = useIsMobile();
  const trayRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  // How far the tray has been pulled back inside the viewport, in px. Kept on a
  // ref as well as in state because each measurement has to subtract the nudge
  // already applied, or every pass would chase the one before it.
  const nudgeRef = useRef(0);
  const [nudge, setNudge] = useState(0);
  // Where a press that started inside the tray began, and whether it has since
  // travelled far enough to be a scroll rather than a pick. A hold-and-slide
  // that started on the thumbs-up never sets this, so it still casts on
  // release — only a drag along the tray itself is swallowed.
  const dragOriginRef = useRef<{ x: number; y: number } | null>(null);
  const draggedRef = useRef(false);
  // The emoji under the pointer, which plays its animation as a preview.
  const [hovered, setHovered] = useState<PostReaction | null>(null);

  // Warm the animated files as the tray opens, so a hover plays at once
  // rather than flashing the still emoji while the first file loads.
  useEffect(() => {
    if (!open || reduceMotion) return;
    for (const reaction of reactions) new Image().src = animatedReactionSrc(reaction.key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, reduceMotion, polarity]);
  useEffect(() => {
    if (!open) setHovered(null);
  }, [open]);

  /** Closes out a press on the tray; true when it was a scroll, not a pick. */
  const endGesture = useCallback(() => {
    const dragged = draggedRef.current;
    dragOriginRef.current = null;
    draggedRef.current = false;
    return dragged;
  }, []);

  const clampToViewport = useCallback(() => {
    const el = trayRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const left = rect.left - nudgeRef.current;
    const right = rect.right - nudgeRef.current;
    let next = 0;
    if (left < EDGE_MARGIN) next = EDGE_MARGIN - left;
    else if (right > window.innerWidth - EDGE_MARGIN) {
      next = window.innerWidth - EDGE_MARGIN - right;
    }
    if (next === nudgeRef.current) return;
    nudgeRef.current = next;
    setNudge(next);
  }, []);

  // Measured on every opening rather than once: the button this hangs off moves
  // with the feed. A resize or a rotation invalidates the figure outright.
  useLayoutEffect(() => {
    if (!open || isDrawer) {
      nudgeRef.current = 0;
      setNudge(0);
      return;
    }
    clampToViewport();
    window.addEventListener('resize', clampToViewport);
    return () => window.removeEventListener('resize', clampToViewport);
  }, [open, isDrawer, clampToViewport]);

  // Dismiss on any press outside the tray, on scroll, and on Escape.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!trayRef.current?.contains(event.target as Node)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    // The page moving under the tray dismisses it — but the tray scrolling
    // itself is a scroll event too, and closing on that would shut the row the
    // moment anyone reached for the reactions that did not fit.
    const onScroll = (event: Event) => {
      if (trayRef.current?.contains(event.target as Node)) return;
      onClose();
    };
    // Capture phase: a card-level pointerdown handler would otherwise navigate
    // to the post before this ever ran.
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open, onClose]);

  if (isDrawer) {
    const portalTarget =
      typeof document === 'undefined' ? null : document.getElementById('app-root') ?? document.body;
    if (!portalTarget) return null;
    const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();
    return createPortal(
      <AnimatePresence>
        {open && (
          <div
            data-no-navigate
            className="fixed inset-0 z-[80]"
            onClick={stop}
            onPointerDown={stop}
            onPointerUp={stop}
          >
            {/* Outside the ref, so the document listener above reads a press
                here as outside and closes. */}
            <motion.div
              aria-hidden="true"
              className="absolute inset-0 bg-black/60"
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.18 }}
            />
            <motion.div
              ref={trayRef}
              role="menu"
              aria-label={t('reactionInfo.title')}
              data-reaction-tray
              data-reaction-drawer
              data-keep-round
              initial={reduceMotion ? false : { y: '100%' }}
              animate={{ y: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { y: '100%' }}
              transition={{ duration: reduceMotion ? 0 : 0.24, ease: [0.16, 1, 0.3, 1] }}
              drag={reduceMotion ? false : 'y'}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.6 }}
              onDragEnd={(_, info) => {
                if (info.offset.y > 80 || info.velocity.y > 600) onClose();
              }}
              className={cn(
                'absolute inset-x-0 bottom-0 mx-auto w-full max-w-lg',
                'rounded-t-2xl border border-b-0 border-white/15 bg-zinc-950/95',
                'backdrop-blur-[28px] backdrop-saturate-150',
                'px-4 pt-2.5 pb-[calc(1rem+env(safe-area-inset-bottom))]',
              )}
            >
              <div className="flex flex-col items-center pb-3">
                <span aria-hidden="true" className="mb-3 h-1 w-10 rounded-full bg-white/25" />
                <span className="text-[15px] font-semibold text-white">{t('reactionInfo.title')}</span>
              </div>
              <div className="grid grid-cols-5 gap-2">
                {reactions.map((reaction) => {
                  const isCurrent = current === reaction.key;
                  const tally = counts ? (counts[reaction.key] ?? 0) : null;
                  return (
                    <button
                      key={reaction.key}
                      role="menuitemradio"
                      aria-checked={isCurrent}
                      type="button"
                      aria-label={reaction.label}
                      data-reaction-option
                      data-keep-round
                      data-active={isCurrent ? 'true' : undefined}
                      data-negative={reaction.positive ? undefined : 'true'}
                      onClick={() => onSelect(reaction.key)}
                      className={cn(
                        'relative flex aspect-square flex-col items-center justify-center gap-1 rounded-2xl border',
                        'transition-transform duration-150 active:scale-95',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60',
                        isCurrent ? 'border-white/30 bg-white/[0.09]' : 'border-transparent bg-white/[0.03]',
                      )}
                    >
                      <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center text-[30px] leading-none">
                        <ReactionEmoji reaction={reaction.key} animate={isCurrent} />
                      </span>
                      {tally !== null && (
                        <span
                          aria-hidden="true"
                          data-reaction-count
                          data-zero={tally === 0 ? 'true' : undefined}
                          className={cn(
                            'text-xs font-semibold leading-none tabular-nums',
                            tally > 0 ? 'text-white/70' : 'text-white/30',
                          )}
                        >
                          {formatTally(tally)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              {onShowInfo && (
                <button
                  role="menuitem"
                  type="button"
                  onClick={onShowInfo}
                  className={cn(
                    'mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 py-3',
                    'text-sm font-medium text-white/80 active:scale-[0.98]',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60',
                  )}
                >
                  <Info className="h-[18px] w-[18px]" aria-hidden="true" />
                  {t('reactionInfo.seeWhoReacted')}
                </button>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>,
      portalTarget,
    );
  }

  const renderOption = (reaction: (typeof reactions)[number]) => {
    const isCurrent = current === reaction.key;
    const tally = counts ? (counts[reaction.key] ?? 0) : null;
    const withTally =
      tally === null
        ? reaction.label
        : `${reaction.label} — ${tally} ${tally === 1 ? 'reaction' : 'reactions'}`;
    return (
      <button
        key={reaction.key}
        role="menuitemradio"
        aria-checked={isCurrent}
        type="button"
        aria-label={withTally}
        title={withTally}
        data-reaction-option
        data-keep-round
        data-active={isCurrent ? 'true' : undefined}
        data-negative={reaction.positive ? undefined : 'true'}
        onPointerEnter={() => setHovered(reaction.key)}
        onPointerLeave={() => setHovered((h) => (h === reaction.key ? null : h))}
        onClick={(e) => {
          e.stopPropagation();
          if (e.detail === 0) onSelect(reaction.key);
        }}
        // Fires when a hold-and-slide gesture releases over this item.
        onPointerUp={(e) => {
          e.stopPropagation();
          if (endGesture()) return;
          onSelect(reaction.key);
        }}
        /* No disc behind the emoji on hover. The lift and the 10% grow
           already say which one the pointer is on, and a grey circle
           under one glyph in a row of them was the only chrome in a
           tray whose whole point is that the emoji are the interface.
           With totals the button grows a line taller rather than wider,
           so the number sits under its emoji without pushing the row
           any further across a phone held sideways. */
        className={cn(
          'group relative flex w-9 shrink-0 flex-col items-center justify-center rounded-full',
          tally === null ? 'h-9' : 'h-12 gap-1',
          'text-lg leading-none transition-[transform,box-shadow] duration-150 ease-out',
          'hover:-translate-y-0.5 hover:scale-110 active:translate-y-0 active:scale-95',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60',
        )}
      >
        <span aria-hidden="true" className="flex h-5 w-5 items-center justify-center">
          <ReactionEmoji
            reaction={reaction.key}
            animate={isCurrent || hovered === reaction.key}
          />
        </span>
        {/* Total for this reaction, under its emoji. A fixed-width box
            and `truncate` so a four-character "1.2K" can never widen
            the tray. */}
        {tally !== null && (
          <span
            aria-hidden="true"
            data-reaction-count
            data-zero={tally === 0 ? 'true' : undefined}
            className={cn(
              'pointer-events-none w-full truncate text-center text-[10px] font-semibold leading-none tabular-nums',
              tally > 0 ? 'text-white/70' : 'text-white/30',
            )}
          >
            {formatTally(tally)}
          </span>
        )}
        {/* Yours, as a dot — the animation already says it, but a still
            frame of a moving emoji does not. Under the emoji on a bare
            tray; above it when the total has taken the space below. */}
        {isCurrent && (
          <span
            aria-hidden="true"
            data-reaction-current
            className={cn(
              'pointer-events-none absolute left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-white/80',
              tally === null ? 'bottom-0' : 'top-0',
            )}
          />
        )}
      </button>
    );
  };

  return (
    <AnimatePresence>
      {open && (
        /* The positioned box is a plain div so the nudge that keeps the tray on
           screen is never fighting the entrance animation's own transform, and
           so the width cap applies to a box that is not being scaled as it
           opens. */
        <div
          ref={trayRef}
          data-no-navigate
          className={cn(
            'absolute bottom-full mb-2 z-50 max-w-[calc(100vw-1rem)]',
            align === 'right' && 'right-0',
            align === 'left' && 'left-0',
            align === 'center' && 'left-1/2',
          )}
          style={{
            transform:
              align === 'center'
                ? `translateX(calc(-50% + ${nudge}px))`
                : `translateX(${nudge}px)`,
          }}
        >
        <motion.div
          role="menu"
          aria-label={polarity === 'negative' ? 'Pick a downvote reaction' : 'Pick a reaction'}
          data-with-counts={counts ? 'true' : undefined}
          initial={reduceMotion ? false : { opacity: 0, y: 6, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.96 }}
          transition={{ duration: reduceMotion ? 0 : 0.16, ease: [0.16, 1, 0.3, 1] }}
          data-no-navigate
          data-keep-round
          /* A floating menu, so it needs a menu's surface even though it is
             absolutely positioned rather than portalled: a row of emoji has to
             read against whatever post is behind the card. */
          data-reaction-tray
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => {
            e.stopPropagation();
            dragOriginRef.current = { x: e.clientX, y: e.clientY };
            draggedRef.current = false;
          }}
          onPointerMove={(e) => {
            const origin = dragOriginRef.current;
            if (!origin || draggedRef.current) return;
            if (Math.hypot(e.clientX - origin.x, e.clientY - origin.y) > DRAG_SLOP) {
              draggedRef.current = true;
            }
          }}
          /* A drag along the tray scrolls the row, and `contain` stops the end
             of the row handing a sideways gesture to the feed behind it. A
             vertical drag still scrolls the page (which closes the tray):
             `pan-x` alone left a swipe that started here moving nothing. */
          style={{ touchAction: 'pan-x pan-y', overscrollBehaviorX: 'contain' }}
          className={cn(
            'isolate flex items-center gap-0.5 px-1.5 py-1.5',
            'overflow-x-auto overflow-y-hidden scrollbar-hide',
            'rounded-2xl border border-white/15 bg-zinc-950/80',
            'backdrop-blur-[28px] backdrop-saturate-150',
            'shadow-[inset_0_1px_0_rgba(255,255,255,0.10),0_8px_32px_rgba(0,0,0,0.45)]',
          )}
        >
          {positives.map(renderOption)}
          {/* The votes against sit apart from the faces that count as a like. */}
          {positives.length > 0 && negatives.length > 0 && (
            <span aria-hidden="true" data-reaction-divider className="mx-0.5 h-6 w-px shrink-0 self-center bg-white/15" />
          )}
          {negatives.map(renderOption)}

          {/* Author-only breakdown. Same pointerup handling as the reactions
              above so a single hold-and-slide can land on it. */}
          {onShowInfo && (
            <>
              <span aria-hidden="true" className="mx-0.5 h-5 w-px shrink-0 bg-white/15" />
              <button
                role="menuitem"
                type="button"
                aria-label={t('reactionInfo.seeWhoReacted')}
                title={t('reactionInfo.seeWhoReacted')}
                data-keep-round
                onClick={(e) => {
                  e.stopPropagation();
                  if (e.detail === 0) onShowInfo();
                }}
                onPointerUp={(e) => {
                  e.stopPropagation();
                  if (endGesture()) return;
                  onShowInfo();
                }}
                /* Same as the emoji beside it: lift and brighten, no disc — one
                   circle left on the end of the tray would read as the odd
                   one out. */
                className={cn(
                  'group relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                  'text-white/50 transition-[transform,color] duration-150 ease-out',
                  'hover:-translate-y-0.5 hover:text-white active:translate-y-0 active:scale-95',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60',
                )}
              >
                <Info className="h-[18px] w-[18px]" aria-hidden="true" />
              </button>
            </>
          )}
        </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
