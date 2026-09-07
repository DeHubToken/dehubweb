import { useEffect } from 'react';
import { useFocusComment } from '@/lib/focus-comment';

/**
 * Opens the comments when the reader arrived from a comment notification.
 *
 * Two ways that happens. `?comments=1` is the plain "they tapped a comment
 * row" case: open the list, then strip the param. A deep-linked comment
 * (`?comment=<id>`, or the `/posts/1/b/55` path form) is the stronger one —
 * there is a specific comment to show, so the list has to be open whether or
 * not the link also carried `comments=1`. The id itself stays in the URL: the
 * list reads it to pin, highlight and scroll to that comment.
 *
 * Deliberately does NOT use useSearchParams: this hook runs in every feed card
 * (hundreds mounted via the persistent page cache), and useSearchParams
 * subscribes each of them to the router — every URL change re-rendered the
 * whole feed. The check only ever runs on mount, so read window.location once
 * and strip the param with history.replaceState (no navigation, no
 * subscription).
 */
export function useAutoOpenComments(setShowComments: (open: boolean) => void, tokenId?: string) {
  const focusCommentId = useFocusComment(tokenId);

  useEffect(() => {
    if (focusCommentId) setShowComments(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusCommentId]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('comments') === '1') {
      setShowComments(true);
      params.delete('comments');
      const query = params.toString();
      window.history.replaceState(
        window.history.state,
        '',
        `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only on mount
}
