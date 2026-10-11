/**
 * Community Feed
 * ===============
 * Fetches posts tagged with the community slug and filters to member-only posts.
 * Renders full feed cards (PostCard, VideoCard, ImageCard) identical to the main feed.
 * Shows full CashtagPriceCard at top when a ticker is assigned.
 */

import { useMemo } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { getNFTInfo, searchNFTs } from '@/lib/api/dehub';
import { listCommunityPostShares, removeCommunityPost } from '@/lib/community-posts';
import { resolveCommunityPosts, uniqueCommunityPosts } from '@/lib/community-posts-core';
import { toast } from 'sonner';
import { mapNFTToFeedItem } from '@/lib/nft-to-feed-item';
import type { FeedItem, TextPost, VideoItem, ImagePost, ShortVideo } from '@/types/feed.types';
import { Skeleton } from '@/components/ui/skeleton';
import { CashtagPriceCard } from '@/components/app/CashtagPriceCard';
import { useDexScreenerSearchMulti, type DexPair } from '@/hooks/use-dexscreener';
import { useCmcMarketCap } from '@/hooks/use-cmc-market-cap';
import { CashtagResultSwitcher } from '@/components/app/CashtagResultSwitcher';
import { PostCard } from '@/components/app/cards/PostCard';
import { VideoCard } from '@/components/app/cards/VideoCard';
import { ImageCard } from '@/components/app/cards/ImageCard';
import { useTranslation } from 'react-i18next';
import { AppState } from '@/components/app/AppState';

interface CommunityFeedProps {
  communityId: string;
  wallet: string | null;
  canModerate: boolean;
  communitySlug: string;
  memberAddresses: Set<string>;
  isMember: boolean;
  tickerSymbol?: string | null;
  tickerContractAddress?: string | null;
  tickerChainId?: string | null;
  tickerPairAddress?: string | null;
}

function getCreatorId(post: FeedItem): string | undefined {
  switch (post.type) {
    case 'post': return (post as TextPost).author?.id?.toLowerCase();
    case 'video': return (post as VideoItem).creatorId?.toLowerCase();
    case 'image': return (post as ImagePost).creatorId?.toLowerCase();
    case 'short': return (post as ShortVideo).creatorId?.toLowerCase();
    default: return undefined;
  }
}

export function CommunityFeed({ communityId, wallet, canModerate, communitySlug, memberAddresses, isMember, tickerSymbol, tickerContractAddress, tickerChainId, tickerPairAddress }: CommunityFeedProps) {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const { data: dexPairs = [] } = useDexScreenerSearchMulti(
    tickerSymbol ? `$${tickerSymbol}` : '',
    !!tickerSymbol
  );
  const { data: cmcData } = useCmcMarketCap(
    tickerSymbol ? `$${tickerSymbol}` : '',
    !!tickerSymbol
  );

  const matchedPair = useMemo(() => {
    if (!tickerSymbol || dexPairs.length === 0) return null;
    if (tickerContractAddress) {
      const exact = dexPairs.find(
        p => p.baseToken.address.toLowerCase() === tickerContractAddress.toLowerCase() &&
             (!tickerChainId || p.chainId === tickerChainId)
      );
      if (exact) return exact;
    }
    return dexPairs[0];
  }, [dexPairs, tickerContractAddress, tickerChainId, tickerSymbol]);

  const categoryTag = communitySlug;

  // React Query instead of a raw fetch-in-effect: CommunityPage remounts on
  // every navigation, and the old effect refired the search with a skeleton
  // flash each time. Cached for 2 min, so bouncing between a community and
  // the rest of the app re-renders instantly from cache.
  const { data, isLoading: loading, isError, refetch, hasNextPage, fetchNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['community-feed', communityId, categoryTag, wallet],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const [results, shares] = await Promise.all([
        searchNFTs({ category: categoryTag, unit: 20, page: pageParam, sortMode: 'new' }),
        listCommunityPostShares(communityId,wallet,pageParam,20),
      ]);
      const originals = await resolveCommunityPosts(shares.map(row=>String(row.token_id)),getNFTInfo);
      return { tagged:(results.data || []).map(mapNFTToFeedItem), originals:originals.map(mapNFTToFeedItem), shares,
        hasMore:(results.data?.length ?? 0)===20 || shares.length===20 };
    },
    getNextPageParam: (last,_pages,page) => last.hasMore ? page+1 : undefined,
    enabled: !!categoryTag,
    staleTime: 2 * 60 * 1000,
  });

  const memberPosts = useMemo(() => {
    const pages = data?.pages ?? [];
    const originals = pages.flatMap(page=>page.originals);
    const tagged = pages.flatMap(page=>page.tagged).filter(post => {
      const addr = getCreatorId(post);
      return addr && memberAddresses.has(addr);
    });
    return uniqueCommunityPosts([...originals,...tagged],post=>post.id);
  }, [data, memberAddresses]);
  const shares = new Map((data?.pages ?? []).flatMap(page=>page.shares).map(row=>[String(row.token_id),row]));
  const more = hasNextPage && <button className="w-full rounded-xl border border-white/15 p-3 text-sm text-white" disabled={isFetchingNextPage} onClick={()=>void fetchNextPage()}>{t('communities.existingPost.more')}</button>;

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl bg-white/[0.04] p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Skeleton className="w-8 h-8 rounded-full bg-white/[0.06]" />
              <Skeleton className="h-4 w-24 bg-white/[0.06]" />
            </div>
            <Skeleton className="h-16 w-full bg-white/[0.06]" />
          </div>
        ))}
      </div>
    );
  }

  if (isError) return <AppState kind="error" title={t('common.failedToLoad')} primaryAction={{label:t('common.retry'),onClick:()=>void refetch()}} />;
  if (memberPosts.length === 0) {
    return (
      <div className="space-y-3">
        {tickerSymbol && matchedPair && (
          <CashtagPriceCard pair={matchedPair} symbol={`$${tickerSymbol}`} cmcData={cmcData} />
        )}
        <AppState
          icon="posts"
          title={isMember ? t('communities.noPosts') : t('communities.joinToSeePosts')}
          description={isMember ? t('communities.selectCommunityHint') : undefined}
          size="section"
        />
        {more}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {tickerSymbol && matchedPair && (
        <CashtagPriceCard pair={matchedPair} symbol={`$${tickerSymbol}`} cmcData={cmcData} />
      )}
      {memberPosts.map((post, index) => {
        let card: React.ReactNode = null;
        switch (post.type) {
          case 'post':
            card = <PostCard key={post.id} post={post as TextPost} />;
            break;
          case 'video':
            card = <VideoCard key={post.id} video={post as VideoItem} aboveFold={index < 2} />;
            break;
          case 'image':
            card = <ImageCard key={post.id} post={post as ImagePost} aboveFold={index < 2} />;
            break;
          default:
            return null;
        }
        return (
          <div key={post.id} className="rounded-xl border border-white/[0.12] bg-white/[0.03] p-3">
            {wallet && shares.has(post.id) && (canModerate || shares.get(post.id)?.shared_by===wallet.toLowerCase()) && (
              <button className="mb-2 text-xs text-zinc-400 underline" onClick={async ()=> {
                try { await removeCommunityPost(communityId,wallet,post.id); await qc.invalidateQueries({queryKey:['community-feed',communityId]}); }
                catch { toast.error(t('communities.existingPost.failed')); }
              }}>{t('communities.existingPost.remove')}</button>
            )}
            {card}
          </div>
        );
      })}
      {more}
    </div>
  );
}
