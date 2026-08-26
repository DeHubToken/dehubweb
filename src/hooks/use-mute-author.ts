/**
 * Mute Author Hook
 * ================
 * Muting hides an account's posts from your own feeds and nothing else. It is
 * one-way and private: your posts still reach them, DMs are untouched, and they
 * are never told. `use-block-author` is the loud counterpart — it severs the
 * relationship in both directions and shows on their profile.
 *
 * Until this hook existed, the only control on offer was the block API wearing
 * the word "mute", which is why the ⋯ menu could offer just one of the two.
 *
 * @module hooks/use-mute-author
 */
import { useCallback, useState } from 'react';
import { useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { MutedUser } from '@/lib/api/dehub/mutes';
import { lowerAddress, pruneUnifiedPages, pruneNftPages } from '@/lib/feed-prune';

export function useMuteAuthor() {
  const queryClient = useQueryClient();
  const [isMuting, setIsMuting] = useState(false);

  const muteAuthor = useCallback(
    async (address?: string | null, displayName?: string) => {
      const target = lowerAddress(address);
      if (!target || isMuting) return;
      setIsMuting(true);
      try {
        // Loaded on demand. Every feed card mounts this hook, so a static
        // import would put the mute API in the entry bundle for every session
        // to serve a request that only happens behind two taps on the ⋯ menu.
        // The type import above is erased and costs nothing.
        const { muteUser } = await import('@/lib/api/dehub/mutes');
        await muteUser(target);

        // Optimistic entry so anything keyed on ['mute-list'] sees the address
        // immediately; the invalidate below resyncs with server truth. Kept
        // separate from ['block-list'] — sharing one would make unmuting look
        // like unblocking and leak muted accounts into the block list.
        queryClient.setQueryData<MutedUser[]>(['mute-list'], (old) => {
          const list = old ?? [];
          if (list.some((user) => lowerAddress(user.address) === target)) return list;
          return [
            ...list,
            { muteId: `pending-${target}`, address: target, mutedAt: new Date().toISOString() },
          ];
        });

        // Prune in place so the muted post vanishes where it sits.
        for (const query of queryClient.getQueryCache().findAll({ queryKey: ['unified-feed'] })) {
          queryClient.setQueryData(query.queryKey, (old: InfiniteData<{ items?: { minter?: string }[] }> | undefined) =>
            pruneUnifiedPages(old, target));
        }
        for (const query of queryClient.getQueryCache().findAll({ queryKey: ['dehub-feed'] })) {
          queryClient.setQueryData(query.queryKey, (old: InfiniteData<{ data?: { minter?: string; creator?: { id?: string } }[] }> | undefined) =>
            pruneNftPages(old, target));
        }

        queryClient.invalidateQueries({ queryKey: ['mute-list'] });
        // Says what a mute does and does not do — the point of it being its own
        // control rather than a softer word for Block.
        toast.success(`Muted ${displayName || 'account'} — they won't know`);
      } catch (error) {
        console.error('[muteAuthor]', error);
        toast.error('Failed to mute account');
      } finally {
        setIsMuting(false);
      }
    },
    [queryClient, isMuting],
  );

  return { muteAuthor, isMuting };
}
