import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { useCommentsPullDismiss } from '@/hooks/use-comments-pull-dismiss';
import { useVisualViewportBox } from '@/hooks/use-keyboard-open';
import { setCommentsSplitCloser } from '@/lib/comments-split';

// Same tween as the Shorts comments sheet, so both open the same way.
const SLIDE = { type: 'tween', duration: 0.35, ease: [0.32, 0.72, 0, 1] } as const;

/**
 * Comments in the bottom half of a phone post page, under the post, in the
 * drawers' liquid glass (post-stage.css, [data-comments-split]). The logo and
 * the top pill are left alone: no scrim, no shade over them.
 */
export function PostCommentsSplit({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const pullDismiss = useCommentsPullDismiss(onClose);
  // While typing, sit on the keyboard instead of under it.
  const viewport = useVisualViewportBox(true);

  useEffect(() => {
    setCommentsSplitCloser(onClose);
    const root = document.documentElement;
    root.dataset.commentsSplitOpen = '';
    return () => {
      setCommentsSplitCloser(null);
      delete root.dataset.commentsSplitOpen;
    };
  }, [onClose]);

  const keyboardUp = viewport.height !== null && viewport.height < window.innerHeight - 80;
  // Portalled: the post page's rise-in animation leaves a transform on an
  // ancestor, which would pin a fixed sheet to the page instead of the screen.
  return createPortal(
    <motion.div
      data-comments-split
      data-no-navigate
      {...pullDismiss}
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={SLIDE}
      style={keyboardUp && viewport.height !== null ? {
        bottom: window.innerHeight - viewport.offsetTop - viewport.height,
        height: Math.max(220, Math.min(window.innerHeight / 2, viewport.height - 96)),
      } : undefined}
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
      {children}
    </motion.div>,
    document.body,
  );
}
