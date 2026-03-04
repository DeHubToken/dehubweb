import React, { useState } from 'react';
import { Repeat2 } from 'lucide-react';
import { Loader2, Plus, MessageCircle, Heart, ArrowUpRight, ThumbsUp, ThumbsDown, MessageSquare, Share2, Bookmark, Info, CornerDownRight, Image, Play, Pencil, Trash2 } from 'lucide-react';
import { useInfiniteQuery, useQueries, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { CardHeader } from '@/components/app/cards/CardHeader';
import { PostMetadata } from '@/components/app/cards/PostMetadata';

import { PostCard } from '@/components/app/cards/PostCard';
import { ImageCard } from '@/components/app/cards/ImageCard';
import { VideoCard } from '@/components/app/cards/VideoCard';
import { PlanCard } from '@/components/app/subscriptions';
import { ProfileEmptyState } from '@/components/app/profile/ProfileEmptyState';
import { getUserComments, getNFTInfo, getMediaUrl, editComment, deleteComment } from '@/lib/api/dehub';
import type { DeHubNFT } from '@/lib/api/dehub';
import { buildImageUrl } from '@/lib/media-url';
import { buildAvatarUrl } from '@/lib/media-url';
import type { TextPost, ImagePost, VideoItem } from '@/types/feed.types';
import type { OptimisticPost } from '@/hooks/use-optimistic-posts';
import type { SubscriptionPlan } from '@/lib/api/dehub';
import type { ProfileData } from '@/hooks/use-dehub-profile';
import type { TabValue } from './ProfileConstants';
import type { ApiCommentResponse } from '@/lib/api/dehub/comments';

import fractions3dIcon from '@/assets/icons/fractions-3d-icon.png';
import live3dIcon from '@/assets/icons/live-3d-icon.png';
import audio3dIcon from '@/assets/icons/audio-3d-icon.png';
import subs3dIcon from '@/assets/icons/subs-3d-icon.png';
import star3dIcon from '@/assets/icons/star-3d-icon.png';
import filmstrip3dIcon from '@/assets/icons/filmstrip-3d-icon.png';
import imageFrame3dIcon from '@/assets/icons/image-frame-3d-icon.png';
import lock3dIcon from '@/assets/lock-3d.png';
import home3dIcon from '@/assets/icons/home-3d-icon.png';
import comment3dIcon from '@/assets/icons/comment-3d-icon.png';

interface ProfileTabContentProps {
  activeTab: TabValue;
  profileAddress: string;
  // Content arrays
  ALL_CONTENT: Array<{ type: 'post' | 'image' | 'video'; data: TextPost | ImagePost | VideoItem; createdAt: string; isRepost?: boolean }>;
  PROFILE_POSTS: TextPost[];
  PROFILE_IMAGES: ImagePost[];
  ALL_PROFILE_VIDEOS: VideoItem[];
  // Loading
  isLoadingContent: boolean;
  userContentData: unknown;
  // Privacy
  isTargetPrivate: boolean;
  isFollowing: boolean;
  isPending: boolean;
  isViewingOwnProfile: boolean | undefined;
  // Optimistic
  optimisticPosts: OptimisticPost[];
  // Subscriptions
  isLoadingPlans: boolean;
  hasPlans: boolean;
  plans: SubscriptionPlan[];
  isSubscribed: boolean;
  profile: ProfileData | undefined;
  // Actions
  setCreatePlanModalOpen: (open: boolean) => void;
  setEditingPlan: (plan: SubscriptionPlan | null) => void;
}

export function ProfileTabContent({
  activeTab,
  profileAddress,
  ALL_CONTENT,
  PROFILE_POSTS,
  PROFILE_IMAGES,
  ALL_PROFILE_VIDEOS,
  isLoadingContent,
  userContentData,
  isTargetPrivate,
  isFollowing,
  isPending,
  isViewingOwnProfile,
  optimisticPosts,
  isLoadingPlans,
  hasPlans,
  plans,
  isSubscribed,
  profile,
  setCreatePlanModalOpen,
  setEditingPlan,
}: ProfileTabContentProps) {
  const navigate = useNavigate();

  // Fetch user comments/replies
  const {
    data: commentsData,
    isLoading: isLoadingComments,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['user-comments', profileAddress],
    queryFn: ({ pageParam = 1 }) => getUserComments(profileAddress, pageParam, 20),
    getNextPageParam: (lastPage) => lastPage.has_more ? lastPage.page + 1 : undefined,
    initialPageParam: 1,
    enabled: !!profileAddress,
    staleTime: 2 * 60 * 1000,
  });

  const allComments = commentsData?.pages.flatMap(p => p.data) ?? [];

  // Private account gate - shown instead of all tabs
  if (isTargetPrivate && !isFollowing && !isViewingOwnProfile) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <img src={lock3dIcon} alt="Private" className="w-[80px] h-[80px] object-contain mb-4" />
        <p className="text-white text-lg font-semibold">This account is private</p>
        <p className="text-zinc-500 text-sm mt-1 max-w-xs">
          {isPending 
            ? 'Your follow request is pending approval.'
            : 'Follow this account to see their posts and content.'}
        </p>
      </div>
    );
  }
  
  const hasData = userContentData && (userContentData as any).pages && (userContentData as any).pages.length > 0;
  const showLoading = isLoadingContent && !hasData;

  // Hidden tabs use visibility:hidden + height:0 instead of display:none
  // so the browser still loads/caches images inside inactive panels.
  const TabPanel = ({ tab, children }: { tab: TabValue; children: React.ReactNode }) => {
    const isActive = activeTab === tab;
    return (
      <div
        style={isActive ? undefined : { visibility: 'hidden', height: 0, overflow: 'hidden', position: 'absolute', width: '100%' }}
        aria-hidden={!isActive}
      >
        {children}
      </div>
    );
  };

  return (
    <div style={{ position: 'relative' }}>
      {/* Loading overlay for content tabs on first load */}
      {showLoading && ['home', 'posts', 'images', 'videos'].includes(activeTab) && (
        <div className="flex flex-col items-center justify-center min-h-[200px]">
          <Loader2 className="w-8 h-8 text-muted-foreground animate-spin" />
        </div>
      )}

      {/* HOME TAB */}
      <TabPanel tab="home">
        <HomeTabPanel
          ALL_CONTENT={ALL_CONTENT}
          isViewingOwnProfile={isViewingOwnProfile}
          optimisticPosts={optimisticPosts}
          isLoading={showLoading}
        />
      </TabPanel>

      {/* POSTS TAB */}
      <TabPanel tab="posts">
        <PostsTabPanel
          PROFILE_POSTS={PROFILE_POSTS}
          allComments={allComments}
          isLoadingComments={isLoadingComments}
          hasNextPage={hasNextPage}
          isFetchingNextPage={isFetchingNextPage}
          fetchNextPage={fetchNextPage}
          navigate={navigate}
          isViewingOwnProfile={isViewingOwnProfile}
          profileAddress={profileAddress}
          isLoadingContent={showLoading}
        />
      </TabPanel>

      {/* IMAGES TAB */}
      <TabPanel tab="images">
        {showLoading ? null : PROFILE_IMAGES.length === 0 ? (
          <ProfileEmptyState iconSrc={imageFrame3dIcon} iconAlt="Images" title="No images yet" subtitle="Image posts will appear here" />
        ) : (
          <div className="space-y-3">
            {PROFILE_IMAGES.map((image) => (
              <div key={image.id} className="rounded-xl border border-white/[0.12] bg-white/[0.03] p-3">
                <ImageCard post={image} />
              </div>
            ))}
          </div>
        )}
      </TabPanel>

      {/* VIDEOS TAB */}
      <TabPanel tab="videos">
        {showLoading ? null : ALL_PROFILE_VIDEOS.length === 0 ? (
          <ProfileEmptyState iconSrc={filmstrip3dIcon} iconAlt="Videos" title="No videos yet" subtitle="Video posts will appear here" />
        ) : (
          <div className="space-y-3">
            {ALL_PROFILE_VIDEOS.map((video) => (
              <div key={video.id} className="rounded-xl border border-white/[0.12] bg-white/[0.03] p-3">
                <VideoCard video={video} />
              </div>
            ))}
          </div>
        )}
      </TabPanel>

      {/* SUBSCRIBERS TAB */}
      <TabPanel tab="subscribers">
        <SubscribersTabPanel
          isLoadingPlans={isLoadingPlans}
          isViewingOwnProfile={isViewingOwnProfile}
          hasPlans={hasPlans}
          plans={plans}
          isSubscribed={isSubscribed}
          profile={profile}
          setCreatePlanModalOpen={setCreatePlanModalOpen}
          setEditingPlan={setEditingPlan}
        />
      </TabPanel>

      {/* SONGS TAB */}
      <TabPanel tab="songs">
        <ProfileEmptyState iconSrc={audio3dIcon} iconAlt="Audio" title="No audio yet" subtitle="Audio tracks will appear here" />
      </TabPanel>

      {/* LIVE TAB */}
      <TabPanel tab="live">
        <ProfileEmptyState iconSrc={live3dIcon} iconAlt="Live" title="No live streams yet" subtitle="Live content will appear here" />
      </TabPanel>

      {/* FRACTIONS TAB */}
      <TabPanel tab="fractions">
        <ProfileEmptyState iconSrc={fractions3dIcon} iconAlt="Fractions" title="No fractions yet" subtitle="Fraction holdings will appear here" />
      </TabPanel>
    </div>
  );
}

// ============================================================================
// Sub-panel components (extracted from switch cases)
// ============================================================================

function HomeTabPanel({
  ALL_CONTENT,
  isViewingOwnProfile,
  optimisticPosts,
  isLoading,
}: {
  ALL_CONTENT: Array<{ type: 'post' | 'image' | 'video'; data: TextPost | ImagePost | VideoItem; createdAt: string; isRepost?: boolean }>;
  isViewingOwnProfile: boolean | undefined;
  optimisticPosts: OptimisticPost[];
  isLoading: boolean;
}) {
  const hasOptimisticPosts = isViewingOwnProfile && optimisticPosts.length > 0;
  
  if (ALL_CONTENT.length === 0 && !hasOptimisticPosts) {
    if (isLoading) return null;
    return <ProfileEmptyState iconSrc={home3dIcon} iconAlt="All" iconClassName="opacity-90" title="No posts yet" subtitle="Content will appear here when posted" />;
  }
  
  const filteredOptimisticPosts = isViewingOwnProfile 
    ? optimisticPosts.filter((op) => {
        // With real token IDs, just check if any feed item has the same ID
        return !ALL_CONTENT.some((apiItem) => apiItem.data.id === op.id);
      })
    : [];
  
  return (
    <div className="space-y-3">
      {filteredOptimisticPosts.map((op) => {
        const card = op.type === 'post'
          ? <PostCard key={op.id} post={op.data as TextPost} />
          : op.type === 'image'
          ? <ImageCard key={op.id} post={op.data as ImagePost} />
          : <VideoCard key={op.id} video={op.data as VideoItem} />;
        return (
          <div key={op.id} className="rounded-xl border border-white/[0.12] bg-white/[0.03] p-3">
            {card}
          </div>
        );
      })}
      {ALL_CONTENT.map((item) => {
        const card = item.type === 'post'
          ? <PostCard key={item.data.id} post={item.data as TextPost} />
          : item.type === 'image'
          ? <ImageCard key={item.data.id} post={item.data as ImagePost} />
          : <VideoCard key={item.data.id} video={item.data as VideoItem} />;
        return (
          <div key={item.data.id} className="rounded-xl border border-white/[0.12] bg-white/[0.03] p-3">
            {item.isRepost && (
              <div className="flex items-center gap-1.5 text-zinc-500 text-xs mb-2 pl-1">
                <Repeat2 className="w-3.5 h-3.5" />
                <span className="font-medium">Reposted</span>
              </div>
            )}
            {card}
          </div>
        );
      })}
    </div>
  );
}

function PostsTabPanel({
  PROFILE_POSTS,
  allComments,
  isLoadingComments,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  navigate,
  isViewingOwnProfile,
  profileAddress,
  isLoadingContent,
}: {
  PROFILE_POSTS: TextPost[];
  allComments: ApiCommentResponse[];
  isLoadingComments: boolean;
  hasNextPage: boolean | undefined;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
  navigate: (to: string) => void;
  isViewingOwnProfile: boolean | undefined;
  profileAddress: string;
  isLoadingContent: boolean;
}) {
  // Collect unique tokenIds from comments to batch-fetch parent posts
  const uniqueTokenIds = React.useMemo(() => {
    const ids = new Set<string>();
    allComments.forEach(c => {
      if (c.tokenId) ids.add(String(c.tokenId));
    });
    return Array.from(ids);
  }, [allComments]);

  // Batch fetch parent post info for all unique tokenIds
  const parentPostQueries = useQueries({
    queries: uniqueTokenIds.map(tokenId => ({
      queryKey: ['nft-info', tokenId],
      queryFn: () => getNFTInfo(tokenId),
      staleTime: 5 * 60 * 1000,
      retry: 1,
    })),
  });

  // Build a map of tokenId -> DeHubNFT
  const parentPostsMap = React.useMemo(() => {
    const map: Record<string, DeHubNFT> = {};
    uniqueTokenIds.forEach((tokenId, i) => {
      const data = parentPostQueries[i]?.data;
      if (data) map[tokenId] = data;
    });
    return map;
  }, [uniqueTokenIds, parentPostQueries]);

  const mergedItems: Array<{ type: 'post' | 'comment'; data: TextPost | ApiCommentResponse; createdAt: string }> = [
    ...PROFILE_POSTS.map(p => ({ type: 'post' as const, data: p, createdAt: p.createdAt || '' })),
    ...allComments.map(c => ({ type: 'comment' as const, data: c, createdAt: c.createdAt || '' })),
  ];
  mergedItems.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const isLoadingAll = isLoadingComments && allComments.length === 0;

  if (mergedItems.length === 0 && !isLoadingAll && !isLoadingContent) {
    return <ProfileEmptyState iconSrc={comment3dIcon} iconAlt="Posts" iconClassName="opacity-90" title="No posts, comments, or replies yet" subtitle="They will appear here" />;
  }

  return (
    <div className="space-y-3">
      {mergedItems.map((item) => {
        if (item.type === 'post') {
          return (
            <div key={item.data.id} className="rounded-xl border border-white/[0.12] bg-white/[0.03] p-3">
              <PostCard post={item.data as TextPost} />
            </div>
          );
        }
        const comment = item.data as ApiCommentResponse;
        const parentPost = comment.tokenId ? parentPostsMap[String(comment.tokenId)] : undefined;
        return (
          <CommentCard
            key={comment.id}
            comment={comment}
            parentPost={parentPost}
            isOwnComment={!!isViewingOwnProfile}
            onClick={() => {
              if (comment.tokenId) {
                navigate(`/app/post/${comment.tokenId}?comment=${comment.id}`);
              }
            }}
          />
        );
      })}
      {isLoadingAll && (
        <div className="flex justify-center py-4">
          <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
        </div>
      )}
      {hasNextPage && (
        <div className="flex justify-center py-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className="text-muted-foreground hover:text-foreground"
          >
            {isFetchingNextPage ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}

function SubscribersTabPanel({
  isLoadingPlans,
  isViewingOwnProfile,
  hasPlans,
  plans,
  isSubscribed,
  profile,
  setCreatePlanModalOpen,
  setEditingPlan,
}: {
  isLoadingPlans: boolean;
  isViewingOwnProfile: boolean | undefined;
  hasPlans: boolean;
  plans: SubscriptionPlan[];
  isSubscribed: boolean;
  profile: ProfileData | undefined;
  setCreatePlanModalOpen: (open: boolean) => void;
  setEditingPlan: (plan: SubscriptionPlan | null) => void;
}) {
  if (isLoadingPlans) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Loader2 className="w-8 h-8 text-zinc-400 animate-spin mb-3" />
        <p className="text-zinc-500 text-sm">Loading plans...</p>
      </div>
    );
  }
  
  if (isViewingOwnProfile && !hasPlans) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <img src={star3dIcon} alt="Star" className="w-16 h-16 object-contain mb-4" />
        <h3 className="text-white font-bold text-xl mb-3">Subscriber Content</h3>
        <Button
          onClick={() => setCreatePlanModalOpen(true)}
          className="rounded-xl bg-white/10 border border-white/[0.08] hover:bg-white/20 text-white font-semibold gap-2 backdrop-blur-md"
        >
          <Plus className="w-4 h-4" />
          Create Your First Plan
        </Button>
      </div>
    );
  }
  
  if (isViewingOwnProfile && hasPlans) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-semibold">Your Subscription Plans</h3>
          <Button 
            onClick={() => setCreatePlanModalOpen(true)}
            size="sm"
            className="rounded-xl bg-white/10 border border-white/20 hover:bg-white/20 text-white gap-1"
          >
            <Plus className="w-4 h-4" />
            Add Plan
          </Button>
        </div>
        <div className="grid gap-4">
          {plans.map((plan) => (
            <PlanCard 
              key={plan._id || plan.id} 
              plan={plan} 
              isOwner={true}
              onEdit={() => setEditingPlan(plan)}
            />
          ))}
        </div>
      </div>
    );
  }
  
  if (!hasPlans) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <img src={subs3dIcon} alt="Subs" className="w-16 h-16 mb-3" />
        <p className="text-zinc-400 text-lg font-medium">No subscription plans</p>
        <p className="text-zinc-500 text-sm mt-1">{profile?.name || 'This creator'} hasn't set up any plans yet</p>
      </div>
    );
  }
  
  return (
    <div className="space-y-4">
      <h3 className="text-white font-semibold mb-4">Subscription Plans</h3>
      <div className="grid gap-4">
        {plans.map((plan) => (
          <PlanCard 
            key={plan._id || plan.id} 
            plan={plan} 
            isSubscribed={isSubscribed}
          />
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Comment Card for profile replies tab
// ============================================================================

function CommentCard({ comment, parentPost, isOwnComment, onClick }: { comment: ApiCommentResponse; parentPost?: DeHubNFT; isOwnComment?: boolean; onClick: () => void }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(comment.content);
  const [isDeleting, setIsDeleting] = useState(false);
  const queryClient = useQueryClient();

  // The user comments API returns an 'author' object with full profile data
  const author = (comment as any).author;
  
  const resolvedName = author?.displayName || author?.username || comment.writor?.username || `${comment.address.slice(0, 6)}...${comment.address.slice(-4)}`;
  const resolvedHandle = author?.username || comment.writor?.username || comment.address;
  
  // Build avatar from author data or writor fallback
  const rawAvatarPath = author?.avatarImageUrl || comment.writor?.avatarUrl;
  const avatarSeed = rawAvatarPath
    ? buildAvatarUrl(comment.address, rawAvatarPath) || comment.address
    : comment.address;

  // Parent post thumbnail - resolve through CDN helper
  const rawThumb = parentPost
    ? (parentPost.thumbnail_url || parentPost.imageUrl || (parentPost.videoUrl ? parentPost.imageUrl : null))
    : null;
  const parentThumbnail = rawThumb && parentPost
    ? (rawThumb.startsWith('http') ? rawThumb : buildImageUrl(parentPost.tokenId, rawThumb))
    : null;
  const parentTitle = parentPost?.title || parentPost?.name || parentPost?.description?.slice(0, 80);
  const parentCreator = parentPost?.minterDisplayName || parentPost?.minterUsername || parentPost?.mintername;
  const parentIsVideo = parentPost?.postType === 'video' || parentPost?.media_type === 'video';
  const parentIsImage = parentPost?.postType === 'image' || parentPost?.media_type === 'image';

  const handleEdit = async () => {
    if (!editText.trim()) return;
    try {
      await editComment({ commentId: comment.id, content: editText });
      queryClient.invalidateQueries({ queryKey: ['user-comments'] });
      setIsEditing(false);
    } catch (err) {
      console.error('Edit comment error:', err);
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isDeleting) return;
    setIsDeleting(true);
    try {
      await deleteComment(comment.id);
      queryClient.invalidateQueries({ queryKey: ['user-comments'] });
    } catch (err) {
      console.error('Delete comment error:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div
      onClick={onClick}
      className="w-full text-left rounded-xl border border-white/[0.08] bg-transparent hover:bg-white/[0.03] transition-colors cursor-pointer overflow-hidden relative"
    >
      {/* Parent post preview — X-style quoted post */}
      {parentPost && (
        <div className="mx-3 mt-3 rounded-lg border border-white/[0.06] bg-white/[0.03] overflow-hidden">
          <div className="flex gap-3 p-2.5">
            {/* Thumbnail */}
            {parentThumbnail && (
              <div className="relative flex-shrink-0 w-16 h-16 rounded-md overflow-hidden bg-white/[0.05]">
                <img
                  src={parentThumbnail}
                  alt=""
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
                {parentIsVideo && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                    <Play className="w-4 h-4 text-white fill-white" />
                  </div>
                )}
              </div>
            )}
            <div className="flex-1 min-w-0">
              {parentCreator && (
                <p className="text-xs text-zinc-400 truncate mb-0.5">
                  @{parentCreator}
                </p>
              )}
              {parentTitle && (
                <p className="text-sm text-zinc-300 line-clamp-2 leading-snug">
                  {parentTitle}
                </p>
              )}
              {!parentTitle && !parentThumbnail && (
                <p className="text-sm text-zinc-500 italic">Post #{parentPost.tokenId}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* "Replying to" label */}
      {comment.tokenId && (
        <div className="flex items-center gap-1.5 text-xs text-zinc-500 mt-2 mb-1 px-3 pl-[56px]">
          <CornerDownRight className="w-3 h-3 flex-shrink-0" />
          <span>
            {comment.parentId ? 'Replied to a comment' : 'Commented on this post'}
          </span>
        </div>
      )}

      <div className="p-3 pt-1">
        <CardHeader
          username={resolvedName}
          handle={resolvedHandle}
          avatarSeed={avatarSeed}
          contentType="post"
          creatorId={comment.address}
          creatorUsername={resolvedHandle}
        />

        {/* Content - matches PostCard text style */}
        <div className="pt-3 space-y-2">
          {isEditing ? (
            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
              <input
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                className="flex-1 bg-zinc-800 text-white text-sm rounded-lg px-3 py-1.5 border border-zinc-700 focus:outline-none focus:border-zinc-500"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleEdit();
                  else if (e.key === 'Escape') { setEditText(comment.content); setIsEditing(false); }
                }}
              />
              <button onClick={(e) => { e.stopPropagation(); handleEdit(); }} className="text-green-400 hover:text-green-300">✓</button>
              <button onClick={(e) => { e.stopPropagation(); setEditText(comment.content); setIsEditing(false); }} className="text-zinc-400 hover:text-white">✕</button>
            </div>
          ) : (
            <p className="text-white/90 text-sm sm:text-base whitespace-pre-wrap break-words line-clamp-4">
              {comment.content}
            </p>
          )}

          {comment.imageUrl && (
            <div className="mt-2 rounded-lg overflow-hidden">
              <img src={comment.imageUrl} alt="" className="w-full h-auto rounded-lg" loading="lazy" />
            </div>
          )}

          {/* Metadata: timestamp and view count */}
          <PostMetadata timestamp={comment.createdAt} />

          {/* Action bar - matches PostCard layout */}
          <div className="pt-1 flex items-center justify-between">
            <div className="flex items-center gap-0">
              <span className="flex items-center gap-1.5 text-zinc-400 text-xs px-2 py-1.5 rounded-xl">
                <ThumbsUp className="w-4 h-4" />
                {comment.likeCount ?? 0}
              </span>
              <span className="flex items-center gap-1.5 text-zinc-400 text-xs px-2 py-1.5 rounded-xl">
                <ThumbsDown className="w-4 h-4" />
                0
              </span>
              <span className="flex items-center gap-1.5 text-zinc-400 text-xs px-2 py-1.5 rounded-xl">
                <MessageSquare className="w-4 h-4" />
                {comment.replyIds?.length ?? 0}
              </span>
              <span className="flex items-center gap-1.5 text-zinc-400 text-xs px-2 py-1.5 rounded-xl">
                <Share2 className="w-4 h-4" />
                0
              </span>
              {isOwnComment && !isEditing && (
                <>
                  <button
                    onClick={(e) => { e.stopPropagation(); setIsEditing(true); }}
                    className="flex items-center gap-1.5 text-zinc-400 hover:text-white text-xs px-2 py-1.5 rounded-xl transition-colors"
                    aria-label="Edit"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={isDeleting}
                    className="flex items-center gap-1.5 text-zinc-400 hover:text-red-400 text-xs px-2 py-1.5 rounded-xl transition-colors"
                    aria-label="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Bookmark className="w-4 h-4 text-zinc-400" />
              <Info className="w-4 h-4 text-zinc-400" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
