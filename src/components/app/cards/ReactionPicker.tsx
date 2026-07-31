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
 */

import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { REACTION_LIST, type PostReaction } from '@/lib/reactions';

interface ReactionPickerProps {
  open: boolean;
  /** The reaction the viewer currently holds, highlighted in the tray. */
  current: PostReaction | null;
  onSelect: (reaction: PostReaction) => void;
  onClose: () => void;
  /**
   * Horizontal anchoring relative to the button. Cards put the like button at
   * the far right, where a centered tray would overflow the card.
   */
  align?: 'left' | 'center' | 'right';
}

export function ReactionPicker({
  open,
  current,
  onSelect,
  onClose,
  align = 'right',
}: ReactionPickerProps) {
  const trayRef = useRef<HTMLDivElement>(null);

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
          initial={{ opacity: 0, y: 8, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.9 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
          data-no-navigate
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          className={cn(
            'absolute bottom-full mb-2 z-50 flex items-center gap-0.5 px-1.5 py-1.5',
            'rounded-full bg-zinc-950/90 backdrop-blur-xl border border-white/10',
            'shadow-[0_8px_32px_rgba(0,0,0,0.3)]',
            align === 'right' && 'right-0',
            align === 'left' && 'left-0',
            align === 'center' && 'left-1/2 -translate-x-1/2',
          )}
        >
          {REACTION_LIST.map((reaction) => (
            <button
              key={reaction.key}
              role="menuitem"
              type="button"
              aria-label={reaction.label}
              title={reaction.label}
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
                'text-lg leading-none transition-transform duration-150',
                'hover:scale-125 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60',
                current === reaction.key && 'bg-white/15 ring-1 ring-white/40',
              )}
            >
              <span aria-hidden="true">{reaction.emoji}</span>
            </button>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
