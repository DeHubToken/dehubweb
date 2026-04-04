/**
 * Community Feed
 * ===============
 * Fetches posts tagged with `community:{slug}` and filters to member-only posts.
 */

import { useState, useEffect, useMemo } from 'react';
import { PenSquare } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { searchNFTs } from '@/lib/api/dehub';
import { mapNFTToFeedItem } from '@/lib/nft-to-feed-item';
import type { FeedItem, TextPost, VideoItem, ImagePost, ShortVideo } from '@/types/feed.types';
import { Skeleton } from '@/components/ui/skeleton';
import { TokenPriceChart } from '@/components/app/TokenPriceChart';
import { useTokenChart, type ChartTimeframe } from '@/hooks/use-token-chart';

interface CommunityFeedProps {
  communitySlug: string;
  memberAddresses: Set<string>;
  isMember: boolean;
  tickerSymbol?: string | null;
}

/** Extract creator address from any feed item type */
function getCreatorId(post: FeedItem): string | undefined {
  switch (post.type) {
    case 'post': return (post as TextPost).author?.id?.toLowerCase();
    case 'video': return (post as VideoItem).creatorId?.toLowerCase();
    case 'image': return (post as ImagePost).creatorId?.toLowerCase();
    case 'short': return (post as ShortVideo).creatorId?.toLowerCase();
    default: return undefined;
  }
}

function getDisplayName(post: FeedItem): string {
  switch (post.type) {
    case 'post': return (post as TextPost).author?.name || 'Anonymous';
    case 'video': return (post as VideoItem).channel || 'Anonymous';
    case 'image': return (post as ImagePost).username || 'Anonymous';
    case 'short': return (post as ShortVideo).username || 'Anonymous';
    default: return 'Anonymous';
  }
}

function getAvatar(post: FeedItem): string | undefined {
  switch (post.type) {
    case 'post': return (post as TextPost).author?.avatarSeed;
    case 'video': return (post as VideoItem).channelAvatar;
    case 'image': return (post as ImagePost).avatar;
    case 'short': return (post as ShortVideo).avatar;
    default: return undefined;
  }
}

function getText(post: FeedItem): string | undefined {
  switch (post.type) {
    case 'post': return (post as TextPost).content;
    case 'video': return (post as VideoItem).title;
    case 'image': return (post as ImagePost).caption;
    default: return undefined;
  }
}

function getThumbnail(post: FeedItem): string | undefined {
  switch (post.type) {
    case 'video': return (post as VideoItem).thumbnail;
    case 'image': return (post as ImagePost).image;
    case 'short': return (post as ShortVideo).thumbnail;
    default: return undefined;
  }
}

export function CommunityFeed({ communitySlug, memberAddresses, isMember, tickerSymbol }: CommunityFeedProps) {
  const navigate = useNavigate();
  const [posts, setPosts] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [chartTimeframe, setChartTimeframe] = useState<ChartTimeframe>('7D');
  const { data: chartData = [], isLoading: chartLoading } = useTokenChart(
    tickerSymbol || '',
    !!tickerSymbol,
    chartTimeframe
  );

  const categoryTag = `community:${communitySlug}`;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    searchNFTs({ category: categoryTag, unit: 50 })
      .then(results => {
        if (cancelled) return;
        const mapped = (results.data || []).map(mapNFTToFeedItem).filter(Boolean) as FeedItem[];
        setPosts(mapped);
      })
      .catch(e => {
        if (cancelled) return;
        console.error('[CommunityFeed] Error:', e);
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [categoryTag]);

  // Only show posts from members
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
      <div className="text-center py-12">
        <PenSquare className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
        <p className="text-zinc-500 text-sm">
          {isMember
            ? 'No posts yet. Be the first to post in this community!'
            : 'Join this community to see and create posts.'}
        </p>
        {isMember && (
          <p className="text-zinc-600 text-xs mt-2">
            Select this community when creating a post to tag it here.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {tickerSymbol && (
        <div className="rounded-xl overflow-hidden border border-white/[0.08] bg-white/[0.02]">
          <div className="px-3 py-2 flex items-center gap-1.5 border-b border-white/[0.06]">
            <span className="text-xs font-medium text-white">${tickerSymbol}</span>
          </div>
          <TokenPriceChart
            data={chartData}
            isLoading={chartLoading}
            timeframe={chartTimeframe}
            onTimeframeChange={setChartTimeframe}
          />
        </div>
      )}
      {memberPosts.map(post => {
        const avatar = getAvatar(post);
        const name = getDisplayName(post);
        const text = getText(post);
        const thumb = getThumbnail(post);

        return (
          <button
            key={post.id}
            onClick={() => navigate(`/app/post/${post.id}`)}
            className="w-full block rounded-xl bg-white/[0.04] border border-white/[0.06] p-3 hover:bg-white/[0.08] transition-colors text-left"
          >
            <div className="flex items-center gap-2 mb-2">
              {avatar && avatar !== 'user' ? (
                <img src={avatar} alt="" className="w-7 h-7 rounded-full object-cover" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-white/[0.08]" />
              )}
              <span className="text-sm text-white font-medium">{name}</span>
              {post.createdAt && (
                <span className="text-xs text-zinc-600">{post.createdAt}</span>
              )}
            </div>
            {text && <p className="text-zinc-400 text-sm line-clamp-3">{text}</p>}
            {thumb && (
              <div className="mt-2 rounded-lg overflow-hidden max-h-48">
                <img src={thumb} alt="" className="w-full h-full object-cover" />
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
