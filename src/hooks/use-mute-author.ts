/**
 * Mute Author Hook
 * ================
 * Muting an author is the DeHub block API (`POST /api/block`) plus immediate
 * cache surgery: every feed already filters through the shared ['block-list']
 * query (use-unified-feed, use-dehub-feed, MusicFeed), so a mute updates that
 * list and then prunes the author's posts out of the cached infinite feeds in
 * place — no refetch, because refetching the unified feed tears down the
 * scroll position and snaps the reader back to the top.
 *
 * @module hooks/use-mute-author
 */

import { useCallback, useState } from 'react';
import { useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { toast } from 'sonner';
import { blockUser, type BlockedUser } from '@/lib/api/dehub';

const lower = (value?: string | null) => (value ?? '').toLowerCase();

/** Structural subset of UnifiedFeedItem — only what pruning needs. */
interface MuteableUnifiedItem {
  minter?: string;
}

/** Structural subset of a dehub-feed page ({ data: DeHubNFT[] }). */
interface NftLikeItem {
  minter?: string;
  creator?: { id?: string };
}

function pruneUnifiedPages(
  data: InfiniteData<{ items?: MuteableUnifiedItem[] }> | undefined,
  address: string
) {
  if (!data?.pages?.length) return data;
  let changed = false;
  const pages = data.pages.map(page => {
    const items = page.items;
    if (!items?.some(item => lower(item.minter) === address)) return page;
    changed = true;
    return { ...page, items: items.filter(item => lower(item.minter) !== address) };
  });
  return changed ? { ...data, pages } : data;
}

function pruneNftPages(
  data: InfiniteData<{ data?: NftLikeItem[] }> | undefined,
  address: string
) {
  if (!data?.pages?.length) return data;
  let changed = false;
  const pages = data.pages.map(page => {
    const items = page.data;
    if (!items?.some(nft => lower(nft.minter || nft.creator?.id) === address)) return page;
    changed = true;
    return {
      ...page,
      data: items.filter(nft => lower(nft.minter || nft.creator?.id) !== address),
    };
  });
  return changed ? { ...data, pages } : data;
}

export function useMuteAuthor() {
  const queryClient = useQueryClient();
  const [isMuting, setIsMuting] = useState(false);

  const muteAuthor = useCallback(async (address?: string | null, displayName?: string) => {
    const target = lower(address);
    if (!target || isMuting) return;
    setIsMuting(true);
    try {
      await blockUser(target);

      // Optimistic entry so feed filters keyed on ['block-list'] see the
      // address immediately; the invalidate below resyncs with server truth.
      queryClient.setQueryData<BlockedUser[]>(['block-list'], (old) => {
        const list = old ?? [];
        if (list.some(user => lower(user.address) === target)) return list;
        return [...list, { blockId: `pending-${target}`, address: target }];
      });

      // Prune cached feeds in place — the X'd post disappears where it sits.
      for (const query of queryClient.getQueryCache().findAll({ queryKey: ['unified-feed'] })) {
        queryClient.setQueryData(query.queryKey, (old: InfiniteData<{ items?: MuteableUnifiedItem[] }> | undefined) =>
          pruneUnifiedPages(old, target));
      }
      for (const query of queryClient.getQueryCache().findAll({ queryKey: ['dehub-feed'] })) {
        queryClient.setQueryData(query.queryKey, (old: InfiniteData<{ data?: NftLikeItem[] }> | undefined) =>
          pruneNftPages(old, target));
      }

      queryClient.invalidateQueries({ queryKey: ['block-list'] });
      toast.success(`Muted ${displayName || 'account'} — you won't see their posts anymore`);
    } catch (error) {
      console.error('[muteAuthor]', error);
      toast.error('Failed to mute account');
    } finally {
      setIsMuting(false);
    }
  }, [queryClient, isMuting]);

  return { muteAuthor, isMuting };
}
