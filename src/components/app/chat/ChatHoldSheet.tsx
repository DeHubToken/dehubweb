import { useEffect, useRef, useState, type ReactNode, type SyntheticEvent } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import Plus from '@/components/ui/cut-icons/add';
import { EmojiPanel } from '@/components/app/emoji/EmojiPanel';
import { cn } from '@/lib/utils';
import '@/styles/chat-hold.css';

export interface ChatHoldAction {
  key: string;
  label: string;
  icon: ReactNode;
  onSelect: () => void;
  /** The one filled tile (Reply). */
  prime?: boolean;
  destructive?: boolean;
  /** A wide pill under the tiles (Delete, Ban) instead of a tile. */
  secondary?: boolean;
}

interface ChatHoldSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The held row. It stays where it is and the list lifts it clear of the sheet. */
  anchor: HTMLElement | null;
  /** Quick reactions shown as the top row; null hides the row (signed out). */
  quickReactions: readonly string[] | null;
  /** Emoji the viewer already used on this message, drawn as selected. */
  mine?: readonly string[];
  onReact?: (emoji: string) => void;
  /** Show the "+" for the full emoji panel. Off where only a fixed set exists (comment reactions). */
  allowMore?: boolean;
  actions: ChatHoldAction[];
  /** Draw a soft frame around the held row (live chat). */
  frame?: boolean;
}

/** Phones with a finger, not a mouse. Desktop keeps hover buttons and the browser's own right-click. */
export function isTouchHold() {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;
}

function scrollParent(el: HTMLElement): HTMLElement | null {
  let node = el.parentElement;
  while (node && node !== document.body) {
    const oy = getComputedStyle(node).overflowY;
    if (oy === 'auto' || oy === 'scroll') return node;
    node = node.parentElement;
  }
  return null;
}

const GAP = 12;
/** Up to five tiles sit in one row; six make two rows of three. */
const columns = (n: number) => (n <= 5 ? n : n === 6 ? 3 : 4);
/** The comments sheet keeps its height while a hold sheet is up. */
export const HOLD_EVENT = 'chat-hold-sheet';
let releases = 0;
const SLIDE = { type: 'tween', duration: 0.26, ease: [0.32, 0.72, 0, 1] } as const;

/**
 * React events from a portal still bubble through the component tree, so a
 * tap in this sheet would otherwise reach whatever rendered it: the comments
 * sheet's pull-to-close, a feed card's open-the-post tap, the row's own
 * reply-on-tap. The sheet keeps every touch to itself.
 */
const keep = (event: SyntheticEvent) => event.stopPropagation();
const KEEP = {
  onClick: keep, onPointerDown: keep, onPointerMove: keep, onPointerUp: keep, onPointerCancel: keep,
  onTouchStart: keep, onTouchMove: keep, onTouchEnd: keep, onMouseDown: keep, onMouseUp: keep,
  onContextMenu: keep, onWheel: keep, onKeyDown: keep,
};

/**
 * The hold menu for a chat line or a comment on a phone: the line stays put,
 * the rest of the list dims, and a glass sheet rises with the quick reactions
 * and the actions. Nothing is copied: the old menus drew a second card of the
 * message over the real one, which read as the message twice.
 *
 * A plain layer, not a dialog: no focus trap and no scroll lock, so Reply can
 * put the caret in the composer straight away (a closing dialog pulled focus
 * back and the keyboard dropped), and nothing here closes the sheet it sits
 * in.
 */
export function ChatHoldSheet({ open, onOpenChange, anchor, quickReactions, mine = [], onReact, allowMore = true, actions, frame = false }: ChatHoldSheetProps) {
  const { t } = useTranslation();
  const sheetRef = useRef<HTMLDivElement>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const pressedOff = useRef(false);

  useEffect(() => {
    if (!open) setMoreOpen(false);
    pressedOff.current = false;
    if (!open) return;
    window.dispatchEvent(new CustomEvent(HOLD_EVENT, { detail: true }));
    return () => { window.dispatchEvent(new CustomEvent(HOLD_EVENT, { detail: false })); };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onOpenChange(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  // Mark the held row and its list, then lift the row above the sheet: scroll
  // first, and when the list is already at the bottom slide it up instead.
  useEffect(() => {
    if (!open || !anchor) return;
    // A list in its own scroller (chat, the comments sheet), or the page
    // itself (comments under a post on the post page).
    const own = scrollParent(anchor);
    const scroller = own ?? (document.scrollingElement as HTMLElement | null);
    const holder = own ?? document.body;
    // A new hold inside the last one's 0.3s ease-back takes over the list.
    delete holder.dataset.chatHoldRelease;
    holder.querySelectorAll('[data-chat-held]').forEach((row) => row.removeAttribute('data-chat-held'));
    anchor.setAttribute('data-chat-held', frame ? 'frame' : '');
    holder.setAttribute('data-chat-holding', '');
    const raf = requestAnimationFrame(() => {
      const sheet = sheetRef.current;
      if (!sheet || !scroller) return;
      const sheetTop = window.innerHeight - sheet.offsetHeight - 8;
      const row = anchor.getBoundingClientRect();
      const overlap = row.bottom - (sheetTop - GAP);
      if (overlap <= 0) return;
      // One motion, not two: the list slides up by the whole overlap (eased
      // in chat-hold.css) and, once the sheet closes, slides back. Scrolling
      // first jumped the list in one frame and then slid it again.
      const top = own ? own.getBoundingClientRect().top : 0;
      const lift = Math.min(overlap, row.top - top - GAP);
      if (lift > 0) holder.style.setProperty('--chat-hold-lift', `${-lift}px`);
    });
    return () => {
      cancelAnimationFrame(raf);
      // Ease back: the list slides down and the others brighten over the same
      // 0.3s, then the marks come off. Taking them off at once snapped the
      // list back in a single frame.
      holder.setAttribute('data-chat-holding', 'out');
      holder.style.setProperty('--chat-hold-lift', '0px');
      const token = String(++releases);
      holder.dataset.chatHoldRelease = token;
      window.setTimeout(() => {
        if (holder.dataset.chatHoldRelease !== token) return;
        anchor.removeAttribute('data-chat-held');
        holder.removeAttribute('data-chat-holding');
        holder.style.removeProperty('--chat-hold-lift');
        delete holder.dataset.chatHoldRelease;
      }, 320);
    };
  }, [open, anchor, frame]);

  const close = () => onOpenChange(false);
  const mainActions = actions.filter((a) => !a.secondary);
  const sideActions = actions.filter((a) => a.secondary);
  const pick = (emoji: string) => {
    onReact?.(emoji);
    close();
  };

  if (typeof document === 'undefined') return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div key="chat-hold" exit={{ opacity: 1 }} transition={SLIDE} data-chat-hold-layer data-no-navigate data-swipe-back-ignore {...KEEP}>
          {/* Tap anywhere off the sheet to close. It eats the tap, so closing
              never also replies to, or opens, what was under the finger. */}
          <div
            aria-hidden
            className="fixed inset-0 z-[200]"
            onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); pressedOff.current = true; }}
            // Only a tap that also started here: the finger lifting from the
            // hold that opened the sheet must not shut it again.
            onClick={(e) => { e.stopPropagation(); if (pressedOff.current) close(); pressedOff.current = false; }}
          />
          <motion.div
            ref={sheetRef}
            role="menu"
            aria-label={t('chatHold.title', 'Message options')}
            initial={{ y: '110%' }}
            animate={{ y: 0 }}
            exit={{ y: '110%' }}
            transition={SLIDE}
            className="fixed inset-x-2 bottom-[max(0.5rem,env(safe-area-inset-bottom))] z-[201] rounded-[28px] px-3.5 pb-4 pt-2.5"
            data-chat-hold-sheet
          >
            <div className="mx-auto mb-3 h-1 w-9 shrink-0 rounded-full" data-chat-hold-grab />

            {quickReactions && onReact && (
              moreOpen ? (
                <div className="-mx-1.5 mb-1 overflow-hidden rounded-2xl">
                  <EmojiPanel selected={[...mine]} onSelect={(emoji) => pick(emoji)} />
                </div>
              ) : (
                <div className="flex items-center justify-between gap-1 border-b pb-3.5" data-chat-hold-divider>
                  {quickReactions.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => pick(emoji)}
                      aria-pressed={mine.includes(emoji)}
                      className="grid h-11 w-11 place-items-center rounded-full text-[24px] leading-none transition-transform active:scale-90"
                      data-chat-hold-chip={mine.includes(emoji) ? 'on' : ''}
                    >
                      {emoji}
                    </button>
                  ))}
                  {allowMore && <button
                    type="button"
                    onClick={() => setMoreOpen(true)}
                    aria-label={t('emojiPicker.moreReactions')}
                    className="grid h-11 w-11 place-items-center rounded-full transition-transform active:scale-90"
                    data-chat-hold-chip
                  >
                    <Plus className="h-5 w-5" />
                  </button>}
                </div>
              )
            )}

            {mainActions.length > 0 && !moreOpen && (
              <div
                className={cn('grid gap-2', quickReactions && onReact ? 'pt-3.5' : 'pt-1')}
                style={{ gridTemplateColumns: `repeat(${columns(mainActions.length)}, minmax(0, 1fr))` }}
              >
                {mainActions.map((a) => (
                  <button
                    key={a.key}
                    type="button"
                    role="menuitem"
                    // Act first, inside the tap, so Reply can still raise the
                    // keyboard (phones only open it from a user gesture).
                    onClick={() => { a.onSelect(); close(); }}
                    className="flex min-w-0 flex-col items-center gap-1.5 rounded-2xl px-1 pb-2.5 pt-3 text-[12px] font-bold transition-transform active:scale-95"
                    data-chat-hold-tile={a.prime ? 'prime' : a.destructive ? 'danger' : ''}
                  >
                    <span className="grid h-5 w-5 place-items-center [&>svg]:h-5 [&>svg]:w-5">{a.icon}</span>
                    <span className="w-full truncate text-center">{a.label}</span>
                  </button>
                ))}
              </div>
            )}
            {sideActions.length > 0 && !moreOpen && (
              <div className="grid grid-cols-2 gap-2 pt-2">
                {sideActions.map((a) => (
                  <button
                    key={a.key}
                    type="button"
                    role="menuitem"
                    onClick={() => { a.onSelect(); close(); }}
                    className="flex h-11 min-w-0 items-center justify-center gap-2 rounded-2xl px-3 text-[13px] font-semibold transition-transform active:scale-95"
                    data-chat-hold-tile={a.destructive ? 'danger' : ''}
                  >
                    <span className="grid h-4 w-4 shrink-0 place-items-center [&>svg]:h-4 [&>svg]:w-4">{a.icon}</span>
                    <span className="truncate">{a.label}</span>
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
