import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { useCommentsPullDismiss } from '@/hooks/use-comments-pull-dismiss';
import { useKeyboardOpen, useVisualViewportBox } from '@/hooks/use-keyboard-open';
import { CommentsSplitContext, setCommentsSplitCloser } from '@/lib/comments-split';

// Same tween as the Shorts comments sheet, so both open the same way.
const SLIDE = { type: 'tween', duration: 0.35, ease: [0.32, 0.72, 0, 1] } as const;

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
  const viewport = useVisualViewportBox(typing);

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
    const height = Math.max(220, Math.min(window.innerHeight / 2, viewport.height - 96));
    return { top: viewport.offsetTop + viewport.height - height, bottom: 'auto', height };
  })() : undefined;
  // Portalled: the post page's rise-in animation leaves a transform on an
  // ancestor, which would pin a fixed sheet to the page instead of the screen.
  return createPortal(
    <>
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
    </>,
    document.body,
  );
}
