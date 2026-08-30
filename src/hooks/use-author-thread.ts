import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getNFTComments, type ApiCommentResponse } from '@/lib/api/dehub';
import { mapApiComment, type Comment } from '@/lib/comment-mapper';
import { selectAuthorThreadEntries } from '@/lib/comment-threading';

/**
 * Author thread — the post creator's own continuation of their post.
 *
 * A "thread entry" is a top-level comment (no parentId) the author wrote
 * *before anybody else commented and that nobody has replied to*: the X-style
 * continuation you tack onto your own post. Those entries render directly
 * under the post card and are dropped from the comments list below, so each
 * one exists exactly once.
 *
 * The cutoff matters. Without it every straight comment the author ever left
 * on their own post was promoted into the block — including a "thanks" written
 * two minutes after somebody else's comment, which then sat above the comment
 * it was answering, in a separate block, in the wrong time order. That reads as
 * a broken conversation, because it is one. Once somebody else has commented,
 * the author is talking *in* the thread, not continuing the post, so their
 * comment belongs in the list with everyone else's.
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
