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
import type { FeedItem } from '@/types/feed.types';
import { Skeleton } from '@/components/ui/skeleton';

interface CommunityFeedProps {
  communitySlug: string;
  memberAddresses: Set<string>;
  isMember: boolean;
}

/** Extract wallet address from any feed item type */
function getPostAddress(post: FeedItem): string | undefined {
  switch (post.type) {
    case 'post': return post.author?.walletAddress?.toLowerCase();
    case 'video': return post.uploaderAddress?.toLowerCase();
    case 'image': return post.walletAddress?.toLowerCase();
    case 'short': return post.walletAddress?.toLowerCase();
    case 'live': return undefined;
    default: return undefined;
  }
}

function getPostDisplayName(post: FeedItem): string {
  switch (post.type) {
    case 'post': return post.author?.username || 'Anonymous';
    case 'video': return post.uploader || 'Anonymous';
    case 'image': return post.username || 'Anonymous';
    case 'short': return post.username || 'Anonymous';
    case 'live': return post.streamer || 'Anonymous';
    default: return 'Anonymous';
  }
}

function getPostAvatar(post: FeedItem): string | undefined {
  switch (post.type) {
    case 'post': return post.author?.avatarUrl;
    case 'video': return post.uploaderAvatar;
    default: return undefined;
  }
}

function getPostText(post: FeedItem): string | undefined {
  switch (post.type) {
    case 'post': return post.content;
    case 'video': return post.title;
    case 'image': return post.caption;
    default: return undefined;
  }
}

function getPostThumbnail(post: FeedItem): string | undefined {
  switch (post.type) {
    case 'video': return post.thumbnail;
    case 'image': return post.imageUrl;
    case 'short': return post.thumbnailUrl;
    default: return undefined;
  }
}

export function CommunityFeed({ communitySlug, memberAddresses, isMember }: CommunityFeedProps) {
  const navigate = useNavigate();
  const [posts, setPosts] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);

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
      const addr = getPostAddress(post);
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
      {memberPosts.map(post => {
        const avatar = getPostAvatar(post);
        const name = getPostDisplayName(post);
        const text = getPostText(post);
        const thumb = getPostThumbnail(post);

        return (
          <button
            key={post.id}
            onClick={() => navigate(`/app/post/${post.id}`)}
            className="w-full block rounded-xl bg-white/[0.04] border border-white/[0.06] p-3 hover:bg-white/[0.08] transition-colors text-left"
          >
            <div className="flex items-center gap-2 mb-2">
              {avatar ? (
                <img src={avatar} alt="" className="w-7 h-7 rounded-full object-cover" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-white/[0.08]" />
              )}
              <span className="text-sm text-white font-medium">{name}</span>
              {post.createdAt && (
                <span className="text-xs text-zinc-600">{new Date(post.createdAt).toLocaleDateString()}</span>
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
