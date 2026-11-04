import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import Plus from '@/components/ui/cut-icons/add';
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer';
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
}

interface ChatHoldSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The held row. It stays where it is, glowing, and the chat lifts it clear of the sheet. */
  anchor: HTMLElement | null;
  /** Quick reactions shown as the top row; null hides the row (signed out). */
  quickReactions: readonly string[] | null;
  /** Emoji the viewer already used on this message, drawn as selected. */
  mine?: readonly string[];
  onReact?: (emoji: string) => void;
  actions: ChatHoldAction[];
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

/**
 * The hold menu for a chat line on a phone: the line stays put and glows, the
 * rest of the chat dims, and a glass sheet rises with the quick reactions and
 * the actions. Nothing is copied — the old menus drew a second card of the
 * message over the real one, which read as the message twice.
 */
export function ChatHoldSheet({ open, onOpenChange, anchor, quickReactions, mine = [], onReact, actions }: ChatHoldSheetProps) {
  const { t } = useTranslation();
  const sheetRef = useRef<HTMLDivElement>(null);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    if (!open) setMoreOpen(false);
  }, [open]);

  // Mark the held row and its list, then lift the row above the sheet: scroll
  // first, and when the list is already at the bottom slide it up instead.
  useEffect(() => {
    if (!open || !anchor) return;
    const scroller = scrollParent(anchor);
    anchor.setAttribute('data-chat-held', '');
    scroller?.setAttribute('data-chat-holding', '');
    const raf = requestAnimationFrame(() => {
      // vaul animates the sheet in from below; measure where it will rest.
      const sheet = sheetRef.current;
      if (!sheet || !scroller) return;
      const sheetTop = window.innerHeight - sheet.offsetHeight;
      const row = anchor.getBoundingClientRect();
      const overlap = row.bottom - (sheetTop - GAP);
      if (overlap <= 0) return;
      const room = scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop;
      const scrolled = Math.max(0, Math.min(overlap, room));
      if (scrolled) scroller.scrollTop += scrolled;
      const top = scroller.getBoundingClientRect().top;
      const rest = Math.min(overlap - scrolled, row.top - scrolled - top - GAP);
      if (rest > 0) scroller.style.setProperty('--chat-hold-lift', `${-rest}px`);
    });
    return () => {
      cancelAnimationFrame(raf);
      anchor.removeAttribute('data-chat-held');
      scroller?.removeAttribute('data-chat-holding');
      scroller?.style.removeProperty('--chat-hold-lift');
    };
  }, [open, anchor]);

  const close = () => onOpenChange(false);
  const pick = (emoji: string) => {
    onReact?.(emoji);
    close();
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        ref={sheetRef}
        glass
        overlayClassName="chat-hold-overlay bg-transparent backdrop-blur-none"
        className="mx-2 mb-[max(0.5rem,env(safe-area-inset-bottom))] rounded-[28px] px-3.5 pb-4 pt-2.5"
        data-chat-hold-sheet
      >
        <DrawerTitle className="sr-only">{t('chatHold.title', 'Message options')}</DrawerTitle>
        <div className="mx-auto mb-3 h-1 w-9 shrink-0 rounded-full" data-chat-hold-grab />

        {quickReactions && onReact && (
          moreOpen ? (
            <div className="-mx-1.5 mb-1 overflow-hidden rounded-2xl" data-vaul-no-drag>
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
              <button
                type="button"
                onClick={() => setMoreOpen(true)}
                aria-label={t('emojiPicker.moreReactions')}
                className="grid h-11 w-11 place-items-center rounded-full transition-transform active:scale-90"
                data-chat-hold-chip
              >
                <Plus className="h-5 w-5" />
              </button>
            </div>
          )
        )}

        {actions.length > 0 && !moreOpen && (
          <div
            className={cn('grid gap-2', quickReactions && onReact ? 'pt-3.5' : 'pt-1')}
            style={{ gridTemplateColumns: `repeat(${Math.min(actions.length, 4)}, minmax(0, 1fr))` }}
          >
            {actions.map((a) => (
              <button
                key={a.key}
                type="button"
                onClick={() => { close(); a.onSelect(); }}
                className="flex min-w-0 flex-col items-center gap-1.5 rounded-2xl px-1 pb-2.5 pt-3 text-[12px] font-bold transition-transform active:scale-95"
                data-chat-hold-tile={a.prime ? 'prime' : a.destructive ? 'danger' : ''}
              >
                <span className="grid h-5 w-5 place-items-center [&>svg]:h-5 [&>svg]:w-5">{a.icon}</span>
                <span className="w-full truncate text-center">{a.label}</span>
              </button>
            ))}
          </div>
        )}
      </DrawerContent>
    </Drawer>
  );
}
