/**
 * Start loading what a notification opens before the page for it mounts.
 *
 * Left to itself the post page runs a waterfall: route chunk, then the post,
 * then the comments chunk, then the page of comments pinned on the linked one.
 * Every step waited for the one before, and on desktop the comment a row named
 * arrived well over a second after the click. The row already knows the post
 * and the comment, so all of it can start on the press instead.
 *
 * @module lib/notification-prefetch
 */
import type { QueryClient } from '@tanstack/react-query';
import { getNFTCommentPage } from '@/lib/api/dehub/comments';
import { warmPostPage } from '@/lib/preload-post-page';

/** Must match the comments list's own page size and query key. */
const COMMENTS_PAGE_SIZE = 20;

let commentsChunk: Promise<unknown> | undefined;
function warmCommentsChunk() {
  commentsChunk ??= import('@/components/app/cards/CommentsSection').catch(() => {
    commentsChunk = undefined;
  });
}

/**
 * The comments list's query key. Kept here so the prefetch and the list can
 * never disagree; the trailing '' is the top-tipped key before tips load.
 */
export function focusedCommentsQueryKey(tokenId: string, walletAddress: string | null | undefined, commentId: string | null) {
  return ['comments', tokenId, walletAddress, commentId, ''] as const;
}

export function warmNotificationTarget(
  queryClient: QueryClient,
  target: { tokenId?: number | string; commentId?: number | string; walletAddress?: string | null },
): void {
  if (target.tokenId == null || target.tokenId === '') return;
  const tokenId = String(target.tokenId);
  warmPostPage();
  warmCommentsChunk();
  if (target.commentId == null || target.commentId === '') return;
  const commentId = String(target.commentId);
  void queryClient.prefetchInfiniteQuery({
    queryKey: focusedCommentsQueryKey(tokenId, target.walletAddress, commentId),
    queryFn: ({ pageParam }) =>
      getNFTCommentPage(tokenId, pageParam as number, COMMENTS_PAGE_SIZE, target.walletAddress?.toLowerCase() || undefined, commentId),
    initialPageParam: 0,
    staleTime: 30_000,
  });
}
