/**
 * Block Author Hook
 * =================
 * Blocking an author is the DeHub block API (`POST /api/block`) plus immediate
 * cache surgery: every feed already filters through the shared ['block-list']
 * query (use-unified-feed, use-dehub-feed, MusicFeed), so a block updates that
 * list and then prunes the author's posts out of the cached infinite feeds in
 * place.
 *
 * Blocking is bidirectional and visible: your posts leave their feed too, DMs
 * are severed both ways, and it is surfaced on their profile. `use-mute-author`
 * is the quiet, one-way alternative.
 *
 * @module hooks/use-block-author
 */
import { useCallback, useState } from 'react';
import { useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { toast } from 'sonner';
import { blockUser, type BlockedUser } from '@/lib/api/dehub';
import { lowerAddress, pruneUnifiedPages, pruneNftPages } from '@/lib/feed-prune';

export function useBlockAuthor() {
  const queryClient = useQueryClient();
  const [isBlocking, setIsBlocking] = useState(false);

  const blockAuthor = useCallback(async (address?: string | null, displayName?: string) => {
    const target = lowerAddress(address);
    if (!target || isBlocking) return;
    setIsBlocking(true);
    try {
      await blockUser(target);

      // Optimistic entry so feed filters keyed on ['block-list'] see the
      // address immediately; the invalidate below resyncs with server truth.
      queryClient.setQueryData<BlockedUser[]>(['block-list'], (old) => {
        const list = old ?? [];
        if (list.some(user => lowerAddress(user.address) === target)) return list;
        return [...list, { blockId: `pending-${target}`, address: target }];
      });

      // Prune cached feeds in place — the post disappears where it sits, and a
      // refetch would snap the reader back to the top of the feed.
      for (const query of queryClient.getQueryCache().findAll({ queryKey: ['unified-feed'] })) {
        queryClient.setQueryData(query.queryKey, (old: InfiniteData<{ items?: { minter?: string }[] }> | undefined) =>
          pruneUnifiedPages(old, target));
      }
      for (const query of queryClient.getQueryCache().findAll({ queryKey: ['dehub-feed'] })) {
        queryClient.setQueryData(query.queryKey, (old: InfiniteData<{ data?: { minter?: string; creator?: { id?: string } }[] }> | undefined) =>
          pruneNftPages(old, target));
      }

      queryClient.invalidateQueries({ queryKey: ['block-list'] });
      toast.success(`Blocked ${displayName || 'account'} — they can no longer see you either`);
    } catch (error) {
      console.error('[blockAuthor]', error);
      toast.error('Failed to block account');
    } finally {
      setIsBlocking(false);
    }
  }, [queryClient, isBlocking]);

  return { blockAuthor, isBlocking };
}
