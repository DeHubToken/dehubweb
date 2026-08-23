import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getNFTComments, type ApiCommentResponse } from '@/lib/api/dehub';
import { mapApiComment, type Comment } from '@/lib/comment-mapper';

/**
 * Author thread — the post creator's straight comments on their own post.
 *
 * A "thread entry" is a top-level comment (no parentId) written by the post's
 * author. Everything else stays in the normal comments list. The entries feed
 * the X-style thread rendered directly under the post on its own page.
 *
 * The query key deliberately extends ['comments', <tokenId>]: posting, editing,
 * deleting or liking a comment refetches that prefix from the comments section,
 * and this query rides along — so a fresh self-reply lands in the thread the
 * moment the server confirms it, with no extra wiring.
 */
const PAGE_SIZE = 50;
/** Cap the scan: 6 pages × 50 covers every realistic thread without paging forever. */
const MAX_PAGES = 6;

export function useAuthorThread(tokenId?: string, authorAddress?: string, viewerAddress?: string) {
  const isNumericPost = !!tokenId && /^\d+$/.test(tokenId);
  const author = authorAddress?.toLowerCase();
  const viewer = viewerAddress?.toLowerCase();

  const query = useQuery({
    queryKey: ['comments', tokenId ?? '', 'author-thread', viewer ?? ''],
    queryFn: async (): Promise<ApiCommentResponse[]> => {
      const all: ApiCommentResponse[] = [];
      for (let page = 0; page < MAX_PAGES; page++) {
        const items = await getNFTComments(tokenId!, page, PAGE_SIZE, viewer);
        all.push(...items);
        if (items.length < PAGE_SIZE) break;
      }
      return all;
    },
    enabled: isNumericPost && !!author,
    staleTime: 30_000,
    retry: 1,
  });

  const entries = useMemo<Comment[]>(() => {
    if (!author) return [];
    return (query.data ?? [])
      .filter((c) => !c.parentId && c.address?.toLowerCase() === author)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .map(mapApiComment);
  }, [query.data, author]);

  return { entries, isLoading: query.isLoading };
}
