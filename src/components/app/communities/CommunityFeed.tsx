/**
 * Community Feed
 * ===============
 * Fetches posts tagged with the community slug and filters to member-only posts.
 * Renders full feed cards (PostCard, VideoCard, ImageCard) identical to the main feed.
 * Shows full CashtagPriceCard at top when a ticker is assigned.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PenSquare } from 'lucide-react';
import { searchNFTs } from '@/lib/api/dehub';
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

interface CommunityFeedProps {
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

export function CommunityFeed({ communitySlug, memberAddresses, isMember, tickerSymbol, tickerContractAddress, tickerChainId, tickerPairAddress }: CommunityFeedProps) {
  const { t } = useTranslation();

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
  const { data: posts = [], isLoading: loading } = useQuery({
    queryKey: ['community-feed', categoryTag],
    queryFn: async () => {
      const results = await searchNFTs({ category: categoryTag, unit: 50, sortMode: 'new' });
      return (results.data || []).map(mapNFTToFeedItem).filter(Boolean) as FeedItem[];
    },
    enabled: !!categoryTag,
    staleTime: 2 * 60 * 1000,
  });

  const memberPosts = useMemo(() => {
    return posts.filter(post => {
      const addr = getCreatorId(post);
      return addr && memberAddresses.has(addr);
    });
  }, [posts, memberAddresses]);

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

  if (memberPosts.length === 0) {
    return (
      <div className="space-y-3">
        {tickerSymbol && matchedPair && (
          <CashtagPriceCard pair={matchedPair} symbol={`$${tickerSymbol}`} cmcData={cmcData} />
        )}
        <div className="text-center py-12">
          <PenSquare className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
          <p className="text-zinc-500 text-sm">
            {isMember
              ? t('communities.noPosts')
              : t('communities.joinToSeePosts')}
          </p>
          {isMember && (
            <p className="text-zinc-600 text-xs mt-2">
              {t('communities.selectCommunityHint')}
            </p>
          )}
        </div>
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
            {card}
          </div>
        );
      })}
    </div>
  );
}
