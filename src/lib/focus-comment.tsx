/**
 * The one comment a reader was sent here to read.
 *
 * A comment notification — in-app row or push — names a comment, not just a
 * post, and landing on the post with a hundred other comments above the one
 * that was answered is the same as landing nowhere. The post page resolves the
 * id once (path segment `/posts/1/b/55`, or `?comment=55`) and publishes it
 * here; the comments list picks it up wherever it happens to be mounted.
 *
 * A context rather than a prop because the list sits behind five different
 * card components and a lazy wrapper, none of which have any other reason to
 * know about notifications.
 *
 * Always read through `useFocusComment(tokenId)`: a post page can have a feed
 * of related posts under it, each with its own comments, and only the post the
 * link was about may act on the id.
 */
import { createContext, useContext, useMemo, type ReactNode } from 'react';

interface FocusCommentValue {
  /** The post the focused comment belongs to. */
  tokenId?: string;
  /** The comment id, as a string — comment ids are strings server-side. */
  commentId?: string;
}

const EMPTY: FocusCommentValue = {};
const FocusCommentContext = createContext<FocusCommentValue>(EMPTY);

export function FocusCommentProvider({
  tokenId,
  commentId,
  children,
}: FocusCommentValue & { children: ReactNode }) {
  const value = useMemo(() => ({ tokenId, commentId }), [tokenId, commentId]);
  return <FocusCommentContext.Provider value={value}>{children}</FocusCommentContext.Provider>;
}

/** The focused comment id, but only for the post it belongs to. */
export function useFocusComment(tokenId: string | undefined): string | undefined {
  const { tokenId: focusTokenId, commentId } = useContext(FocusCommentContext);
  if (!commentId || !tokenId) return undefined;
  return String(focusTokenId) === String(tokenId) ? commentId : undefined;
}

/**
 * Clears the focused comment for everything inside. The related posts under a
 * post page can include that same post again (as a promoted card), and with
 * the id still in context its comments opened too and pulled the page down to
 * a second copy of the comment.
 */
export function NoFocusComment({ children }: { children: ReactNode }) {
  return <FocusCommentContext.Provider value={EMPTY}>{children}</FocusCommentContext.Provider>;
}
