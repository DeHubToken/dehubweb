import { Loader2, Plus, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PostCard } from '@/components/app/cards/PostCard';
import { ImageCard } from '@/components/app/cards/ImageCard';
import { VideoCard } from '@/components/app/cards/VideoCard';
import { PlanCard } from '@/components/app/subscriptions';
import { ProfileEmptyState } from '@/components/app/profile/ProfileEmptyState';
import type { TextPost, ImagePost, VideoItem } from '@/types/feed.types';
import type { OptimisticPost } from '@/hooks/use-optimistic-posts';
import type { SubscriptionPlan } from '@/lib/api/dehub';
import type { ProfileData } from '@/hooks/use-dehub-profile';
import type { TabValue } from './ProfileConstants';

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
  // Content arrays
  ALL_CONTENT: Array<{ type: 'post' | 'image' | 'video'; data: TextPost | ImagePost | VideoItem; createdAt: string }>;
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
  // Private account gate
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
  
  // Loading state
  const hasData = userContentData && (userContentData as any).pages && (userContentData as any).pages.length > 0;
  const showLoading = isLoadingContent && !hasData;
  
  if (showLoading && ['home', 'posts', 'images', 'videos'].includes(activeTab)) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Loader2 className="w-8 h-8 text-zinc-400 animate-spin mb-3" />
        <p className="text-zinc-500 text-sm">Loading content...</p>
      </div>
    );
  }
  
  switch (activeTab) {
    case 'home': {
      const hasOptimisticPosts = isViewingOwnProfile && optimisticPosts.length > 0;
      
      if (ALL_CONTENT.length === 0 && !hasOptimisticPosts) {
        return <ProfileEmptyState iconSrc={home3dIcon} iconAlt="All" iconClassName="opacity-90" title="No posts yet" subtitle="Content will appear here when posted" />;
      }
      
      const filteredOptimisticPosts = isViewingOwnProfile 
        ? optimisticPosts.filter((op) => {
            return !ALL_CONTENT.some((apiItem) => {
              const apiStatus = (apiItem.data as { status?: string }).status;
              if (apiStatus !== 'minted') return false;
              
              if (op.type === 'post' && apiItem.type === 'post') {
                const opData = op.data as TextPost;
                const apiData = apiItem.data as TextPost;
                return opData.content === apiData.content;
              }
              if (op.type === 'image' && apiItem.type === 'image') {
                const opData = op.data as ImagePost;
                const apiData = apiItem.data as ImagePost;
                return opData.title === apiData.title || opData.caption === apiData.caption;
              }
              if (op.type === 'video' && apiItem.type === 'video') {
                const opData = op.data as VideoItem;
                const apiData = apiItem.data as VideoItem;
                return opData.title === apiData.title;
              }
              return false;
            });
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
              <div key={op.id} className="rounded-xl border border-white/[0.08] bg-transparent p-3">
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
              <div key={item.data.id} className="rounded-xl border border-white/[0.08] bg-transparent p-3">
                {card}
              </div>
            );
          })}
        </div>
      );
    }
    case 'posts':
      if (PROFILE_POSTS.length === 0) {
        return <ProfileEmptyState iconSrc={comment3dIcon} iconAlt="Posts" iconClassName="opacity-90" title="No text posts or comments yet" subtitle="They will appear here" />;
      }
      return (
        <div className="space-y-3">
          {PROFILE_POSTS.map((post) => (
            <div key={post.id} className="rounded-xl border border-white/[0.08] bg-transparent p-3">
              <PostCard post={post} />
            </div>
          ))}
        </div>
      );
    case 'images':
      if (PROFILE_IMAGES.length === 0) {
        return <ProfileEmptyState iconSrc={imageFrame3dIcon} iconAlt="Images" title="No images yet" subtitle="Image posts will appear here" />;
      }
      return (
        <div className="space-y-3">
          {PROFILE_IMAGES.map((image) => (
            <div key={image.id} className="rounded-xl border border-white/[0.08] bg-transparent p-3">
              <ImageCard post={image} />
            </div>
          ))}
        </div>
      );
    case 'videos':
      if (ALL_PROFILE_VIDEOS.length === 0) {
        return <ProfileEmptyState iconSrc={filmstrip3dIcon} iconAlt="Videos" title="No videos yet" subtitle="Video posts will appear here" />;
      }
      return (
        <div className="space-y-3">
          {ALL_PROFILE_VIDEOS.map((video) => (
            <div key={video.id} className="rounded-xl border border-white/[0.08] bg-transparent p-3">
              <VideoCard video={video} />
            </div>
          ))}
        </div>
      );
    case 'replies':
      return (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <MessageCircle className="w-12 h-12 text-zinc-600 mb-3" />
          <p className="text-zinc-400 text-lg font-medium">No replies yet</p>
          <p className="text-zinc-500 text-sm mt-1">Replies to other posts will appear here</p>
        </div>
      );
    case 'subscribers': {
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
    case 'songs':
      return <ProfileEmptyState iconSrc={audio3dIcon} iconAlt="Audio" title="No audio yet" subtitle="Audio tracks will appear here" />;
    case 'live':
      return <ProfileEmptyState iconSrc={live3dIcon} iconAlt="Live" title="No live streams yet" subtitle="Live content will appear here" />;
    case 'fractions':
      return <ProfileEmptyState iconSrc={fractions3dIcon} iconAlt="Fractions" title="No fractions yet" subtitle="Fraction holdings will appear here" />;
    default:
      return null;
  }
}
