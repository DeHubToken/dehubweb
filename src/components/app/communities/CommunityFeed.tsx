/**
 * Community Feed
 * ===============
 * Fetches posts tagged with `community:{slug}` and filters to member-only posts.
 */

import { useState, useEffect, useMemo } from 'react';
import { Users, PenSquare } from 'lucide-react';
import { searchNFTs } from '@/lib/api/dehub';
import { mapNFTToFeedItem } from '@/lib/api/dehub/feed-mapper';
import type { FeedItem } from '@/types/feed.types';
import { Skeleton } from '@/components/ui/skeleton';

interface CommunityFeedProps {
  communitySlug: string;
  memberAddresses: Set<string>;
  isMember: boolean;
}

export function CommunityFeed({ communitySlug, memberAddresses, isMember }: CommunityFeedProps) {
  const [posts, setPosts] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const categoryTag = `community:${communitySlug}`;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    searchNFTs({ category: categoryTag, limit: 50 })
      .then(results => {
        if (cancelled) return;
        const mapped = results.map(mapNFTToFeedItem).filter(Boolean) as FeedItem[];
        setPosts(mapped);
      })
      .catch(e => {
        if (cancelled) return;
        setError('Failed to load posts');
        console.error('[CommunityFeed] Error:', e);
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [categoryTag]);

  // Only show posts from members
  const memberPosts = useMemo(() => {
    return posts.filter(post => {
      const addr = post.author?.walletAddress?.toLowerCase();
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
      {memberPosts.map(post => (
        <a
          key={post.id}
          href={`/app/post/${post.id}`}
          onClick={e => { e.preventDefault(); window.location.href = `/app/post/${post.id}`; }}
          className="block rounded-xl bg-white/[0.04] border border-white/[0.06] p-3 hover:bg-white/[0.08] transition-colors"
        >
          <div className="flex items-center gap-2 mb-2">
            {post.author?.avatarUrl ? (
              <img src={post.author.avatarUrl} alt="" className="w-7 h-7 rounded-full object-cover" />
            ) : (
              <div className="w-7 h-7 rounded-full bg-white/[0.08]" />
            )}
            <span className="text-sm text-white font-medium">{post.author?.username || 'Anonymous'}</span>
            <span className="text-xs text-zinc-600">{new Date(post.createdAt).toLocaleDateString()}</span>
          </div>
          {post.title && <p className="text-white text-sm font-medium mb-1">{post.title}</p>}
          {post.content && <p className="text-zinc-400 text-sm line-clamp-3">{post.content}</p>}
          {post.mediaUrl && (
            <div className="mt-2 rounded-lg overflow-hidden max-h-48">
              <img src={post.mediaUrl} alt="" className="w-full h-full object-cover" />
            </div>
          )}
        </a>
      ))}
    </div>
  );
}
