/**
 * PostAIChat, mounted only once someone has actually opened it.
 *
 * Every card renders the chat unconditionally and lets `isOpen` drive it, which
 * put the whole assistant panel on the boot path for every visitor — the cards
 * are on the first-paint path, and most sessions never open it. Same shape as
 * `FullscreenImageViewerLazy`, and for the same reason: see
 * `scripts/boot-path-report.mjs`.
 *
 * `openedOnce` keeps it mounted after the first open so a close still animates
 * out rather than having the element yanked from under it.
 */
import { lazy, Suspense, useEffect, useState } from 'react';
import type { PostAIChatProps } from './PostAIChat';

const PostAIChat = lazy(() =>
  import('./PostAIChat').then((m) => ({ default: m.PostAIChat })),
);

export function PostAIChatLazy(props: PostAIChatProps) {
  const [openedOnce, setOpenedOnce] = useState(props.isOpen);

  useEffect(() => {
    if (props.isOpen) setOpenedOnce(true);
  }, [props.isOpen]);

  if (!openedOnce) return null;

  return (
    <Suspense fallback={null}>
      <PostAIChat {...props} />
    </Suspense>
  );
}
