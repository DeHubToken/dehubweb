import { useEffect, useRef, useState, type ReactNode, type SyntheticEvent } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { useCommentsPullDismiss } from '@/hooks/use-comments-pull-dismiss';
import { useKeyboardOpen, useVisualViewportBox } from '@/hooks/use-keyboard-open';
import { CommentsSplitContext, setCommentsSplitCloser } from '@/lib/comments-split';
import { HOLD_EVENT } from '@/components/app/chat/ChatHoldSheet';

// Same tween as the Shorts comments sheet, so both open the same way.
const SLIDE = { type: 'tween', duration: 0.35, ease: [0.32, 0.72, 0, 1] } as const;

/*
 * The sheet is portalled to <body>, but React still bubbles its events up
 * the component tree: through the feed card it belongs to and on into the
 * Home feed. There a sideways drag in the comments read as the feed's
 * swipe-between-tabs (Videos, Images, Text... jumped to Home at the top), a
 * pull read as pull-to-refresh, and taps and keys reached the card. Nothing
 * outside the sheet has any business with them, so they stop at its edge.
 * Native listeners (page swipe-back, Back) are unaffected.
 */
const stop = (event: SyntheticEvent) => event.stopPropagation();
const KEEP_INSIDE = {
  onTouchStart: stop, onTouchMove: stop, onTouchEnd: stop, onTouchCancel: stop,
  onPointerDown: stop, onPointerMove: stop, onPointerUp: stop, onPointerCancel: stop,
  onMouseDown: stop, onMouseMove: stop, onMouseUp: stop, onMouseLeave: stop,
  onClick: stop, onDoubleClick: stop, onContextMenu: stop, onWheel: stop,
  onKeyDown: stop, onKeyUp: stop,
};

/**
 * Comments in the bottom half of a phone post page, under the post, in the
 * drawers' liquid glass (post-stage.css, [data-comments-split]). The logo and
 * the top pill are left alone: no scrim, no shade over them.
 */
export function PostCommentsSplit({ onClose, children, closeOnTapAbove = false }: {
  onClose: () => void;
  children: ReactNode;
  /** Feed cards: the feed stays put above the sheet, so a tap up there
   *  closes the sheet instead of reaching (or scrolling) the feed. */
  closeOnTapAbove?: boolean;
}) {
  const pullDismiss = useCommentsPullDismiss(onClose);
  // While typing, sit on the keyboard instead of under it.
  const typing = useKeyboardOpen(true);
  // The page under the sheet keeps its place: on the feed it is the card
  // this sheet belongs to.
  const viewport = useVisualViewportBox(typing, { keepPageScroll: true });

  // Holding a comment while typing drops the keyboard. Stay tall until the
  // hold sheet closes: snapping to half height under the finger moved the
  // held comment behind the sheet, and Reply then grew it straight back.
  const [holdTall, setHoldTall] = useState(false);
  // The press itself can blur the field a moment before the sheet opens, so
  // "typing" counts for a second after the keyboard went.
  const typedAt = useRef(0);
  if (typing) typedAt.current = Date.now();
  // A hold blurs the field on touch, half a second before its sheet opens.
  // Wait a beat before shrinking so a hold started while typing never drops
  // the sheet to half and then has to hold it there.
  const [linger, setLinger] = useState(false);
  useEffect(() => {
    if (typing) { setLinger(false); return; }
    if (!typedAt.current) return;
    typedAt.current = Date.now();
    setLinger(true);
    const timer = window.setTimeout(() => setLinger(false), 700);
    return () => window.clearTimeout(timer);
  }, [typing]);
  // Tall stops under whatever floats at the top (the feed's logo and tabs,
  // or the post page's pill), not under a fixed 56px that the feed's taller
  // bar covered.
  const [chromeBottom, setChromeBottom] = useState(56);
  const tall = typing || holdTall || linger;
  useEffect(() => {
    if (!tall) return;
    let bottom = 0;
    for (const el of document.querySelectorAll<HTMLElement>('[data-mobile-header], [data-feed-nav]')) {
      const box = el.getBoundingClientRect();
      if (box.height > 0 && box.bottom > 0 && box.top < window.innerHeight / 3) bottom = Math.max(bottom, box.bottom);
    }
    setChromeBottom(Math.round(Math.max(56, bottom + 4)));
  }, [tall]);
  useEffect(() => {
    const onHold = (event: Event) => {
      const open = (event as CustomEvent<boolean>).detail;
      const recent = Date.now() - typedAt.current < 1200;
      setHoldTall((was) => (open ? was || recent : false));
    };
    window.addEventListener(HOLD_EVENT, onHold);
    return () => window.removeEventListener(HOLD_EVENT, onHold);
  }, []);

  useEffect(() => {
    setCommentsSplitCloser(onClose);
    const root = document.documentElement;
    root.dataset.commentsSplitOpen = '';
    return () => {
      setCommentsSplitCloser(null);
      delete root.dataset.commentsSplitOpen;
    };
  }, [onClose]);

  // Safari keeps the layout viewport full height under its keyboard and pans
  // the visible area down to the focused field, so `bottom: 0` lands behind
  // the keys. While typing, place the sheet from what is actually visible:
  // the pan offset plus the visible height. On Android (resizes-content) that
  // is the same spot as bottom 0.
  const keyboardBox = typing && viewport.height !== null ? (() => {
    // Typing takes the whole visible area above the keys (less the top bar),
    // so the comment being answered stays in sight above the box, as in the
    // app. Half height left it under the keyboard.
    const height = Math.max(220, viewport.height - chromeBottom);
    // Android shrinks the page for the keyboard, so the sheet keeps its
    // bottom on the keyboard edge and only its top moves, which the
    // stylesheet eases. Safari draws the keyboard over the page and pans:
    // place it from the visible area instead.
    const overlaid = window.innerHeight - viewport.height > 80 || viewport.offsetTop > 0;
    return overlaid
      ? { top: viewport.offsetTop + viewport.height - height, bottom: 'auto', height }
      : { top: chromeBottom };
  })() : holdTall || linger ? { top: chromeBottom } : undefined;
  // Portalled: the post page's rise-in animation leaves a transform on an
  // ancestor, which would pin a fixed sheet to the page instead of the screen.
  return createPortal(
    <div data-comments-split-root style={{ display: 'contents' }} {...KEEP_INSIDE}>
    {closeOnTapAbove && (
      <div
        data-comments-split-catch
        data-no-navigate
        aria-hidden
        onClick={onClose}
        onWheel={e => e.preventDefault()}
      />
    )}
    <motion.div
      data-comments-split
      data-no-navigate
      {...pullDismiss}
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={SLIDE}
      style={keyboardBox}
    >
      <motion.div
        data-comments-split-handle
        style={{ touchAction: 'none' }}
        onPanEnd={(_, info) => {
          if (info.offset.y > 60 || info.velocity.y > 500) onClose();
        }}
      >
        <i />
      </motion.div>
      <CommentsSplitContext.Provider value>{children}</CommentsSplitContext.Provider>
    </motion.div>
    </div>,
    document.body,
  );
}
