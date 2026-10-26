import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getNFTComments, type ApiCommentResponse } from '@/lib/api/dehub';
import { mapApiComment, type Comment } from '@/lib/comment-mapper';
import { selectAuthorThreadEntries } from '@/lib/comment-threading';

/**
 * Author thread — the post creator's own continuation of their post.
 *
 * A "thread entry" is a straight comment (no parentId) the author left on
 * their own post: the X-style thread. Those entries render directly under the
 * post card, oldest first, and are dropped from the comments list below, so
 * each one exists exactly once. selectAuthorThreadEntries owns the rule.
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

  const entries = useMemo<Comment[]>(
    () => selectAuthorThreadEntries(query.data ?? [], author).map(mapApiComment),
    [query.data, author],
  );

  const entryIds = useMemo(() => new Set(entries.map((e) => e.id)), [entries]);

  return { entries, entryIds, isLoading: query.isLoading };
}
