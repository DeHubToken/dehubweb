import { useState } from 'react';
import { 
  Home, MessageCircle, Image, Video, Star, Play, Radio,
  Calendar, UserPlus, Copy, AtSign, Wallet, Send, Plus, Bell, Lock, CreditCard
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/app/UserAvatar';
import { VerifiedBadge } from '@/components/app/VerifiedBadge';
import { PostCard } from '@/components/app/cards/PostCard';
import { ImageCard } from '@/components/app/cards/ImageCard';
import { VideoCard } from '@/components/app/cards/VideoCard';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';
import { MOCK_POSTS, SAMPLE_IMAGES, SAMPLE_VIDEOS } from '@/data/mock-feed.data';
import type { TextPost, ImagePost, VideoItem } from '@/types/feed.types';

const MOCK_PROFILE = {
  name: 'Alice Cooper',
  handle: '@alice_cooper',
  verified: true,
  bio: 'Tech enthusiast & startup founder 🚀 Building the future one line of code at a time. Always exploring new technologies!',
  joinedDate: 'January 2024',
  following: 416,
  followers: 1825,
  postsCount: 142,
};

// Filter/modify mock data to appear as if from the profile user
const PROFILE_POSTS: TextPost[] = MOCK_POSTS.slice(0, 10).map(post => ({
  ...post,
  author: {
    id: 'profile-user',
    name: MOCK_PROFILE.name,
    handle: MOCK_PROFILE.handle,
    verified: MOCK_PROFILE.verified,
  },
}));

const PROFILE_IMAGES: ImagePost[] = SAMPLE_IMAGES.slice(0, 10).map(img => ({
  ...img,
  username: MOCK_PROFILE.name,
  avatar: MOCK_PROFILE.handle,
  verified: MOCK_PROFILE.verified,
}));

const PROFILE_VIDEOS: VideoItem[] = SAMPLE_VIDEOS.slice(0, 8).map((vid, i) => ({
  ...vid,
  id: `profile-video-${i}`,
  channel: MOCK_PROFILE.name,
  channelAvatar: MOCK_PROFILE.handle,
  verified: MOCK_PROFILE.verified,
}));

// Generate additional videos to reach 10
const EXTRA_VIDEOS: VideoItem[] = SAMPLE_VIDEOS.slice(0, 2).map((vid, i) => ({
  ...vid,
  id: `profile-video-extra-${i}`,
  channel: MOCK_PROFILE.name,
  channelAvatar: MOCK_PROFILE.handle,
  verified: MOCK_PROFILE.verified,
  title: i === 0 ? 'Behind the Scenes - Day in My Life' : 'Q&A Session with Followers',
}));

const ALL_PROFILE_VIDEOS = [...PROFILE_VIDEOS, ...EXTRA_VIDEOS];

type TabValue = 'home' | 'replies' | 'images' | 'videos' | 'subscribers' | 'songs' | 'live';

const PROFILE_TABS: { icon: typeof Home; label: string; value: TabValue; count: number }[] = [
  { icon: Home, label: 'All', value: 'home', count: PROFILE_POSTS.length + PROFILE_IMAGES.length + ALL_PROFILE_VIDEOS.length },
  { icon: MessageCircle, label: 'Replies', value: 'replies', count: 10 },
  { icon: Image, label: 'Images', value: 'images', count: PROFILE_IMAGES.length },
  { icon: Video, label: 'Videos', value: 'videos', count: ALL_PROFILE_VIDEOS.length },
  { icon: Star, label: 'Subs', value: 'subscribers', count: 10 },
  { icon: Play, label: 'Songs', value: 'songs', count: 10 },
  { icon: Radio, label: 'Live', value: 'live', count: 10 },
];

export default function ProfilePage() {
  const [activeTab, setActiveTab] = useState<TabValue>('home');
  const [shareSheetOpen, setShareSheetOpen] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);

  const handleCopyProfileUrl = () => {
    navigator.clipboard.writeText(`https://dehub.gg/${MOCK_PROFILE.handle.replace('@', '')}`);
    toast.success('Profile URL copied to clipboard');
    setShareSheetOpen(false);
  };

  const handleCopyUsername = () => {
    navigator.clipboard.writeText(MOCK_PROFILE.handle);
    toast.success('Username copied to clipboard');
    setShareSheetOpen(false);
  };

  const handleCopyAddress = () => {
    navigator.clipboard.writeText('0x1234...5678');
    toast.success('Address copied to clipboard');
    setShareSheetOpen(false);
  };

  const handleSendCoins = () => {
    toast.info('Send coins feature coming soon');
    setShareSheetOpen(false);
  };

  const handleToggleNotifications = () => {
    toast.success('Notifications enabled for this profile');
    setShareSheetOpen(false);
  };

  const ShareOptions = () => (
    <div className="flex flex-col gap-1">
      <button
        onClick={handleCopyProfileUrl}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 hover:bg-white/10 transition-colors text-left"
      >
        <div className="w-8 h-8 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center">
          <Copy className="w-4 h-4 text-white" />
        </div>
        <span className="text-white font-medium">Copy profile URL</span>
      </button>
      <button
        onClick={handleCopyUsername}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 hover:bg-white/10 transition-colors text-left"
      >
        <div className="w-8 h-8 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center">
          <AtSign className="w-4 h-4 text-white" />
        </div>
        <span className="text-white font-medium">Copy username</span>
      </button>
      <button
        onClick={handleCopyAddress}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 hover:bg-white/10 transition-colors text-left"
      >
        <div className="w-8 h-8 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center">
          <Wallet className="w-4 h-4 text-white" />
        </div>
        <span className="text-white font-medium">Copy address</span>
      </button>
      <button
        onClick={handleSendCoins}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 hover:bg-white/10 transition-colors text-left"
      >
        <div className="w-8 h-8 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center">
          <Send className="w-4 h-4 text-white" />
        </div>
        <span className="text-white font-medium">Send coins</span>
      </button>
      <button
        onClick={handleToggleNotifications}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 hover:bg-white/10 transition-colors text-left"
      >
        <div className="w-8 h-8 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center">
          <Bell className="w-4 h-4 text-white" />
        </div>
        <span className="text-white font-medium">Notify</span>
      </button>
    </div>
  );

  const renderTabContent = () => {
    switch (activeTab) {
      case 'home':
        return (
          <div className="space-y-2 sm:space-y-3">
            {PROFILE_POSTS.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
            {PROFILE_IMAGES.map((image) => (
              <ImageCard key={image.id} post={image} />
            ))}
            {ALL_PROFILE_VIDEOS.map((video) => (
              <VideoCard key={video.id} video={video} />
            ))}
          </div>
        );
      case 'images':
        return (
          <div className="space-y-2 sm:space-y-3">
            {PROFILE_IMAGES.map((image) => (
              <ImageCard key={image.id} post={image} />
            ))}
          </div>
        );
      case 'videos':
        return (
          <div className="space-y-2 sm:space-y-3">
            {ALL_PROFILE_VIDEOS.map((video) => (
              <VideoCard key={video.id} video={video} />
            ))}
          </div>
        );
      case 'replies':
        return (
          <div className="space-y-2 sm:space-y-3">
            {PROFILE_POSTS.slice(0, 10).map((post, i) => (
              <PostCard key={`reply-${post.id}-${i}`} post={{
                ...post,
                content: `@someone ${post.content}`,
              }} />
            ))}
          </div>
        );
      case 'subscribers':
        return (
          <div className="space-y-2 sm:space-y-3">
            {!isSubscribed ? (
              <>
                {/* Blurred content with subscribe prompt */}
                <div className="relative">
                  <div className="blur-lg pointer-events-none select-none">
                    {PROFILE_POSTS.slice(0, 2).map((post) => (
                      <div key={`sub-blur-${post.id}`} className="mb-2">
                        <PostCard post={post} />
                      </div>
                    ))}
                  </div>
                  {/* Subscribe overlay */}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm rounded-2xl">
                    <div className="text-center p-6">
                      <div className="w-16 h-16 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center mx-auto mb-4">
                        <Lock className="w-8 h-8 text-white" />
                      </div>
                      <h3 className="text-white font-bold text-xl mb-2">Subscribers Only</h3>
                      <p className="text-zinc-400 text-sm mb-4 max-w-xs">
                        Subscribe to {MOCK_PROFILE.name} to unlock exclusive content
                      </p>
                      <Button 
                        onClick={() => {
                          setIsSubscribed(true);
                          toast.success(`Subscribed to ${MOCK_PROFILE.name}!`);
                        }}
                        className="rounded-full bg-purple-600 hover:bg-purple-700 text-white gap-2"
                      >
                        <CreditCard className="w-4 h-4" />
                        Subscribe for $4.99/mo
                      </Button>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <>
                {PROFILE_POSTS.slice(0, 5).map((post) => (
                  <PostCard key={`sub-${post.id}`} post={post} />
                ))}
                {PROFILE_IMAGES.slice(0, 5).map((image) => (
                  <ImageCard key={`sub-${image.id}`} post={image} />
                ))}
              </>
            )}
          </div>
        );
      case 'songs':
        return (
          <div className="space-y-2 sm:space-y-3">
            {PROFILE_POSTS.slice(0, 10).map((post, i) => (
              <PostCard key={`song-${post.id}-${i}`} post={{
                ...post,
                content: `🎵 Now playing: Track ${i + 1} - ${post.content.slice(0, 30)}...`,
              }} />
            ))}
          </div>
        );
      case 'live':
        return (
          <div className="space-y-2 sm:space-y-3">
            {ALL_PROFILE_VIDEOS.slice(0, 10).map((video, i) => (
              <VideoCard key={`live-${video.id}-${i}`} video={{
                ...video,
                title: `Live Stream #${i + 1} - ${video.title}`,
              }} />
            ))}
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen">
      <div className="p-2 sm:p-3 space-y-2 sm:space-y-3 mt-2 lg:mt-0">
        {/* Profile Card Bento */}
        <div className="bg-zinc-900 rounded-2xl overflow-hidden">
          {/* Cover Photo */}
          <div className="aspect-[3/1] bg-gradient-to-br from-purple-900/50 via-zinc-800 to-blue-900/50" />
          
          {/* Profile Content */}
          <div className="px-4 sm:px-6 pb-4">
            {/* Avatar - positioned to overlap banner */}
            <div className="relative -mt-12 sm:-mt-14 mb-4">
              <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-zinc-900 p-1">
                <UserAvatar 
                  name={MOCK_PROFILE.name} 
                  handle={MOCK_PROFILE.handle} 
                  size="lg" 
                  className="w-full h-full rounded-full"
                />
              </div>
              <div className="absolute bottom-2 right-2 w-4 h-4 bg-green-500 rounded-full border-2 border-zinc-900" />
            </div>

            {/* Action Buttons - separate row */}
            <div className="flex items-center gap-2 mb-4">
              {!isFollowing ? (
                <Button 
                  size="sm" 
                  className="rounded-full bg-white text-black hover:bg-zinc-200 gap-2"
                  onClick={() => {
                    setIsFollowing(true);
                    toast.success(`Following ${MOCK_PROFILE.name}`);
                  }}
                >
                  <UserPlus className="w-4 h-4" />
                  Follow
                </Button>
              ) : !isSubscribed ? (
                <Button 
                  size="sm" 
                  className="rounded-full bg-purple-600 hover:bg-purple-700 text-white gap-2"
                  onClick={() => {
                    setIsSubscribed(true);
                    toast.success(`Subscribed to ${MOCK_PROFILE.name}!`);
                  }}
                >
                  <Star className="w-4 h-4" />
                  Subscribe
                </Button>
              ) : (
                <Button 
                  size="sm" 
                  variant="outline"
                  className="rounded-full border-purple-600 text-purple-400 hover:bg-purple-600/10 gap-2"
                >
                  <Star className="w-4 h-4 fill-current" />
                  Subscribed
                </Button>
              )}
              <Button
                variant="outline" 
                size="sm" 
                className="rounded-full border-zinc-700 text-white hover:bg-zinc-800 bg-transparent gap-2"
              >
                <MessageCircle className="w-4 h-4" />
                Message
              </Button>
              <Drawer open={shareSheetOpen} onOpenChange={setShareSheetOpen}>
                <DrawerTrigger asChild>
                  <Button 
                    variant="outline" 
                    size="icon" 
                    className="rounded-full border-zinc-700 text-white hover:bg-zinc-800 bg-transparent h-9 w-9"
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </DrawerTrigger>
                <DrawerContent glass className="px-4 pb-8">
                  <DrawerHeader className="sr-only">
                    <DrawerTitle>Profile Options</DrawerTitle>
                  </DrawerHeader>
                  <ShareOptions />
                </DrawerContent>
              </Drawer>
            </div>

            {/* Profile Info */}
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-white">{MOCK_PROFILE.name}</h2>
                {MOCK_PROFILE.verified && <VerifiedBadge className="w-5 h-5" />}
              </div>
              <p className="text-zinc-500">{MOCK_PROFILE.handle}</p>
              
              <p className="mt-3 text-white/90 text-sm sm:text-base">{MOCK_PROFILE.bio}</p>
              
              <div className="flex items-center gap-2 mt-3 text-zinc-500 text-sm">
                <Calendar className="w-4 h-4" />
                <span>Joined {MOCK_PROFILE.joinedDate}</span>
              </div>
              
              <div className="flex items-center gap-4 mt-3">
                <button className="hover:underline">
                  <span className="font-bold text-white">{MOCK_PROFILE.following}</span>
                  <span className="text-zinc-500 ml-1">Following</span>
                </button>
                <button className="hover:underline">
                  <span className="font-bold text-white">{MOCK_PROFILE.followers}</span>
                  <span className="text-zinc-500 ml-1">Followers</span>
                </button>
              </div>
              
              <p className="text-zinc-500 text-sm mt-2">No mutuals</p>
            </div>
          </div>
        </div>

        {/* Profile Tabs Bento */}
        <div className="bg-zinc-900 rounded-2xl p-2 relative">
          <div className="flex overflow-x-auto scrollbar-hide">
            {PROFILE_TABS.map((tab) => (
              <button
                key={tab.value}
                onClick={() => setActiveTab(tab.value)}
                className={cn(
                  'flex-1 flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-colors min-w-[60px]',
                  activeTab === tab.value
                    ? 'bg-zinc-800 text-white'
                    : 'text-zinc-500 hover:bg-zinc-800/50 hover:text-white'
                )}
              >
                <tab.icon className="w-5 h-5" />
                <span className="text-xs font-medium">{tab.count}</span>
              </button>
            ))}
          </div>
          {/* Right fade indicator */}
          <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-zinc-900 to-transparent pointer-events-none rounded-r-2xl" />
        </div>

        {/* Tab Content */}
        {renderTabContent()}
      </div>
    </div>
  );
}
