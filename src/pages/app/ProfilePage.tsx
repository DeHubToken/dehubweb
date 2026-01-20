import { useState, useMemo } from 'react';
import { useSearchParams, useParams } from 'react-router-dom';
import { 
  Home, MessageCircle, Image, Video, Star, Play, Radio,
  Calendar, UserPlus, UserMinus, Copy, AtSign, Wallet, Send, Plus, Bell, Lock, CreditCard, PieChart, Tag, Handshake, Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UserAvatar } from '@/components/app/UserAvatar';
import { VerifiedBadge } from '@/components/app/VerifiedBadge';
import { PostCard } from '@/components/app/cards/PostCard';
import { ImageCard } from '@/components/app/cards/ImageCard';
import { VideoCard } from '@/components/app/cards/VideoCard';
import { AppLayout } from '@/components/app/AppLayout';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';
import { useAuth } from '@/contexts/AuthContext';
import { useDeHubProfile, useDeHubUserContent, separateUserContent, type ProfileData } from '@/hooks/use-dehub-profile';
import { followUser, unfollowUser } from '@/lib/api/dehub';
import { MOCK_POSTS, SAMPLE_IMAGES, SAMPLE_VIDEOS } from '@/data/mock-feed.data';
import type { TextPost, ImagePost, VideoItem } from '@/types/feed.types';
import dehubCoin from '@/assets/dehub-coin.png';

// Fallback mock profile
const MOCK_PROFILE: ProfileData = {
  id: 'mock-user',
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
const createProfilePosts = (profile: ProfileData): TextPost[] => 
  MOCK_POSTS.slice(0, 10).map(post => ({
    ...post,
    author: {
      id: profile.id,
      name: profile.name,
      handle: profile.handle,
      verified: profile.verified,
    },
  }));

const createProfileImages = (profile: ProfileData): ImagePost[] => 
  SAMPLE_IMAGES.slice(0, 10).map(img => ({
    ...img,
    username: profile.name,
    avatar: profile.avatarUrl || profile.handle,
    verified: profile.verified,
  }));

const createProfileVideos = (profile: ProfileData): VideoItem[] => {
  const baseVideos = SAMPLE_VIDEOS.slice(0, 8).map((vid, i) => ({
    ...vid,
    id: `profile-video-${i}`,
    channel: profile.name,
    channelAvatar: profile.avatarUrl || profile.handle,
    verified: profile.verified,
  }));
  
  const extraVideos = SAMPLE_VIDEOS.slice(0, 2).map((vid, i) => ({
    ...vid,
    id: `profile-video-extra-${i}`,
    channel: profile.name,
    channelAvatar: profile.avatarUrl || profile.handle,
    verified: profile.verified,
    title: i === 0 ? 'Behind the Scenes - Day in My Life' : 'Q&A Session with Followers',
  }));
  
  return [...baseVideos, ...extraVideos];
};

// Realistic reply threads - original posts that Alice replied to
const REPLY_THREADS = [
  {
    id: 'reply-1',
    originalPost: {
      author: { id: 'user-1', name: 'Marcus Chen', handle: '@marcusdev', verified: true },
      content: 'Just shipped our new AI feature and the response has been incredible! 🚀 Sometimes you just have to trust the process.',
      stats: { comments: 89, reposts: 234, likes: 1205 },
    },
    reply: 'Congrats Marcus! The new AI integration looks amazing. Would love to chat about how you handled the edge cases - we\'re working on something similar.',
  },
  {
    id: 'reply-2',
    originalPost: {
      author: { id: 'user-2', name: 'Sarah Williams', handle: '@sarahwrites', verified: false },
      content: 'Hot take: Most startups fail not because of bad ideas, but because founders don\'t know when to pivot. Thoughts?',
      stats: { comments: 156, reposts: 89, likes: 892 },
    },
    reply: 'This is so true! We almost went under in 2023 because I was too attached to our original vision. Best decision I ever made was listening to users and pivoting.',
  },
  {
    id: 'reply-3',
    originalPost: {
      author: { id: 'user-3', name: 'TechCrunch', handle: '@techcrunch', verified: true },
      content: 'Breaking: OpenAI announces new partnership with major enterprise clients. The AI arms race continues to heat up.',
      stats: { comments: 423, reposts: 1567, likes: 4521 },
    },
    reply: 'This is going to change the game for smaller companies. We need to stay nimble and focus on what makes us unique. Exciting times!',
  },
  {
    id: 'reply-4',
    originalPost: {
      author: { id: 'user-4', name: 'Dev Community', handle: '@devdotcom', verified: true },
      content: 'What\'s the one piece of advice you\'d give to junior developers starting their career in 2024?',
      stats: { comments: 892, reposts: 345, likes: 2103 },
    },
    reply: 'Learn to read code before you learn to write it. Spend time in open source repos, understand patterns, and don\'t be afraid to ask "why" about everything.',
  },
  {
    id: 'reply-5',
    originalPost: {
      author: { id: 'user-5', name: 'James Rodriguez', handle: '@jamesbuilds', verified: false },
      content: 'Finally hit 10k users on my side project! 🎉 Never thought a weekend hack would turn into this. Persistence pays off.',
      stats: { comments: 67, reposts: 123, likes: 1456 },
    },
    reply: 'That\'s incredible James! 🙌 The jump from side project to real product is the hardest part. What\'s next on your roadmap?',
  },
  {
    id: 'reply-6',
    originalPost: {
      author: { id: 'user-6', name: 'Elena Vasquez', handle: '@elenavtech', verified: true },
      content: 'Reminder: Taking breaks isn\'t laziness, it\'s maintenance. Your brain needs downtime to process and create. Go touch grass sometimes.',
      stats: { comments: 234, reposts: 567, likes: 3421 },
    },
    reply: 'Needed to hear this today. Been grinding on a feature for 12 hours straight. Time to step away and come back fresh tomorrow. Thanks Elena! 💚',
  },
  {
    id: 'reply-7',
    originalPost: {
      author: { id: 'user-7', name: 'Startup Grind', handle: '@startupgrind', verified: true },
      content: 'What\'s the biggest lesson you learned from a failed project?',
      stats: { comments: 445, reposts: 234, likes: 1876 },
    },
    reply: 'Never fall in love with your solution, fall in love with the problem. My first startup failed because I built what I wanted, not what users needed.',
  },
  {
    id: 'reply-8',
    originalPost: {
      author: { id: 'user-8', name: 'Nina Patel', handle: '@ninadesigns', verified: false },
      content: 'Design systems are not about making things look the same. They\'re about making things work the same. Consistency > uniformity.',
      stats: { comments: 89, reposts: 312, likes: 2134 },
    },
    reply: 'This distinction is so important! We spent 3 months building our design system and it\'s been worth every hour. Happy to share our approach if helpful.',
  },
  {
    id: 'reply-9',
    originalPost: {
      author: { id: 'user-9', name: 'Product Hunt', handle: '@producthunt', verified: true },
      content: 'What product would you build if you had unlimited resources and time?',
      stats: { comments: 1234, reposts: 456, likes: 5678 },
    },
    reply: 'A truly private, decentralized social platform where users own their data and algorithms are transparent. The future of social needs to be rebuilt from the ground up.',
  },
  {
    id: 'reply-10',
    originalPost: {
      author: { id: 'user-10', name: 'Alex Turner', handle: '@alexcodes', verified: false },
      content: 'Just discovered that my "clever" solution from 6 months ago is now my biggest tech debt. Past me was not as smart as I thought. 😅',
      stats: { comments: 156, reposts: 234, likes: 1876 },
    },
    reply: 'Haha this is the most relatable thing I\'ve seen all week. I have a folder called "what was I thinking" full of code I wrote at 2am. We\'ve all been there! 😂',
  },
];

type TabValue = 'home' | 'replies' | 'images' | 'videos' | 'subscribers' | 'songs' | 'live' | 'fractions';

// Mock fractions holdings
const MOCK_FRACTIONS = [
  { id: 'frac-1', postId: 'image-1', thumbnail: 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=100&h=100&fit=crop', author: '@gamer_pro', fractions: 150, totalValue: 0.45, currency: 'ETH' },
  { id: 'frac-2', postId: 'video-3', thumbnail: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=100&h=100&fit=crop', author: '@esports_daily', fractions: 75, totalValue: 0.22, currency: 'ETH' },
  { id: 'frac-3', postId: 'image-5', thumbnail: 'https://images.unsplash.com/photo-1493711662062-fa541f7f76ce?w=100&h=100&fit=crop', author: '@digital_art', fractions: 200, totalValue: 0.8, currency: 'ETH' },
  { id: 'frac-4', postId: 'video-7', thumbnail: 'https://images.unsplash.com/photo-1560419015-7c427e8ae5ba?w=100&h=100&fit=crop', author: '@streamking', fractions: 50, totalValue: 0.15, currency: 'ETH' },
  { id: 'frac-5', postId: 'image-12', thumbnail: 'https://images.unsplash.com/photo-1534423861386-85a16f5d13fd?w=100&h=100&fit=crop', author: '@nft_collector', fractions: 300, totalValue: 1.2, currency: 'ETH' },
];

export default function ProfilePage() {
  const [searchParams] = useSearchParams();
  const { username: routeUsername } = useParams<{ username: string }>();
  const userId = searchParams.get('id');
  const { user: currentUser, isAuthenticated } = useAuth();
  
  // Determine lookup method: route param username > query param id > current user
  const lookupUsername = routeUsername;
  const lookupUserId = userId || (!routeUsername ? currentUser?.id : undefined);
  
  // Fetch profile from API - supports both username and userId lookups
  const { 
    data: apiProfile, 
    isLoading: isLoadingProfile, 
    isError: isProfileError 
  } = useDeHubProfile({ 
    userId: lookupUserId, 
    username: lookupUsername,
    enabled: !!(lookupUserId || lookupUsername)
  });
  
  // Fetch user content from API - use the profile ID once we have it
  const {
    data: userContentData,
    isLoading: isLoadingContent,
  } = useDeHubUserContent({
    userId: apiProfile?.id || lookupUserId,
    enabled: !!(apiProfile?.id || lookupUserId),
  });
  
  // Determine which profile to show - no more mock fallback
  const profile = apiProfile;
  // Check if viewing own profile: no route username AND (no query ID OR query ID matches current user)
  const isOwnProfile = !routeUsername && (!userId || (currentUser?.id === userId));
  
  // Process API content - no mock fallback
  const { PROFILE_POSTS, PROFILE_IMAGES, ALL_PROFILE_VIDEOS } = useMemo(() => {
    if (!userContentData?.pages) {
      return { PROFILE_POSTS: [], PROFILE_IMAGES: [], ALL_PROFILE_VIDEOS: [] };
    }
    const allNFTs = userContentData.pages.flatMap(page => page.data || []);
    const separated = separateUserContent(allNFTs);
    return { 
      PROFILE_POSTS: separated.posts,
      PROFILE_IMAGES: separated.images, 
      ALL_PROFILE_VIDEOS: separated.videos 
    };
  }, [userContentData]);
  
  const PROFILE_TABS: { icon: typeof Home; label: string; value: TabValue; count: number }[] = [
    { icon: Home, label: 'All', value: 'home', count: PROFILE_POSTS.length + PROFILE_IMAGES.length + ALL_PROFILE_VIDEOS.length },
    { icon: Star, label: 'Subs', value: 'subscribers', count: 10 },
    { icon: MessageCircle, label: 'Replies', value: 'replies', count: 10 },
    { icon: Image, label: 'Images', value: 'images', count: PROFILE_IMAGES.length },
    { icon: Video, label: 'Videos', value: 'videos', count: ALL_PROFILE_VIDEOS.length },
    { icon: Play, label: 'Songs', value: 'songs', count: 10 },
    { icon: Radio, label: 'Live', value: 'live', count: 10 },
    { icon: PieChart, label: 'Fractions', value: 'fractions', count: MOCK_FRACTIONS.length },
  ];
  
  const [activeTab, setActiveTab] = useState<TabValue>('home');
  const [shareSheetOpen, setShareSheetOpen] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [offerDrawerOpen, setOfferDrawerOpen] = useState(false);
  const [offerAmount, setOfferAmount] = useState('');
  const [isFollowLoading, setIsFollowLoading] = useState(false);

  const handleCopyProfileUrl = () => {
    navigator.clipboard.writeText(`https://dehub.gg/${profile.handle.replace('@', '')}`);
    toast.success('Profile URL copied to clipboard');
    setShareSheetOpen(false);
  };

  const handleCopyUsername = () => {
    navigator.clipboard.writeText(profile.handle);
    toast.success('Username copied to clipboard');
    setShareSheetOpen(false);
  };

  const handleCopyAddress = () => {
    navigator.clipboard.writeText(profile.walletAddress || '0x1234...5678');
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

  const handleUnfollow = async () => {
    if (!isAuthenticated) {
      toast.error('Please connect your wallet first');
      return;
    }
    
    setIsFollowLoading(true);
    try {
      await unfollowUser(profile.id);
      setIsFollowing(false);
      setIsSubscribed(false);
      toast.success(`Unfollowed ${profile.name}`);
    } catch (error) {
      // Fallback for demo
      setIsFollowing(false);
      setIsSubscribed(false);
      toast.success(`Unfollowed ${profile.name}`);
    } finally {
      setIsFollowLoading(false);
      setShareSheetOpen(false);
    }
  };

  const handleFollow = async () => {
    if (!isAuthenticated) {
      toast.error('Please connect your wallet first');
      setIsFollowing(true); // Demo mode
      toast.success(`Following ${profile.name}`);
      return;
    }
    
    setIsFollowLoading(true);
    try {
      await followUser(profile.id);
      setIsFollowing(true);
      toast.success(`Following ${profile.name}`);
    } catch (error) {
      // Fallback for demo
      setIsFollowing(true);
      toast.success(`Following ${profile.name}`);
    } finally {
      setIsFollowLoading(false);
    }
  };

  const handleMakeOffer = () => {
    setShareSheetOpen(false);
    setOfferDrawerOpen(true);
  };

  const handleSubmitOffer = () => {
    if (!offerAmount || parseFloat(offerAmount) <= 0) {
      toast.error('Please enter a valid offer amount');
      return;
    }
    toast.success(`Offer of ${offerAmount} DHB submitted for ${MOCK_PROFILE.handle}`);
    setOfferDrawerOpen(false);
    setOfferAmount('');
  };

  const ShareOptions = () => (
    <div className="flex flex-col gap-1">
      {isFollowing && (
        <button
          onClick={handleUnfollow}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-red-500/10 backdrop-blur-md border border-red-500/20 hover:bg-red-500/20 transition-colors text-left"
        >
          <div className="w-8 h-8 rounded-full bg-red-500/20 backdrop-blur-sm flex items-center justify-center">
            <UserMinus className="w-4 h-4 text-red-400" />
          </div>
          <span className="text-red-400 font-medium">Unfollow</span>
        </button>
      )}
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
      <button
        onClick={handleMakeOffer}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 hover:bg-white/10 transition-colors text-left"
      >
        <div className="w-8 h-8 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center">
          <Handshake className="w-4 h-4 text-white" />
        </div>
        <span className="text-white font-medium">Make Offer</span>
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
            {REPLY_THREADS.map((thread) => (
              <div key={thread.id} className="bg-zinc-900 rounded-2xl overflow-hidden">
                {/* Original post (what Alice replied to) */}
                <div className="p-3 sm:p-4 border-b border-zinc-800">
                  <div className="flex items-start gap-3">
                    <UserAvatar 
                      name={thread.originalPost.author.name} 
                      handle={thread.originalPost.author.handle} 
                      size="md" 
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-white truncate">
                          {thread.originalPost.author.name}
                        </span>
                        {thread.originalPost.author.verified && <VerifiedBadge className="w-4 h-4" />}
                        <span className="text-zinc-500 text-sm truncate">
                          {thread.originalPost.author.handle}
                        </span>
                      </div>
                      <p className="text-white/90 text-sm sm:text-base mt-1">
                        {thread.originalPost.content}
                      </p>
                      <div className="flex items-center gap-4 mt-2 text-zinc-500 text-xs">
                        <span>{thread.originalPost.stats.comments} replies</span>
                        <span>{thread.originalPost.stats.reposts} reposts</span>
                        <span>{thread.originalPost.stats.likes} likes</span>
                      </div>
                    </div>
                  </div>
                </div>
                {/* Alice's reply */}
                <div className="p-3 sm:p-4 bg-zinc-800/30">
                  <div className="flex items-start gap-3">
                    <div className="flex flex-col items-center">
                      <div className="w-0.5 h-3 bg-zinc-700 -mt-4 mb-1" />
                      <UserAvatar 
                        name={profile.name} 
                        handle={profile.handle} 
                        size="md" 
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-white truncate">
                          {profile.name}
                        </span>
                        {profile.verified && <VerifiedBadge className="w-4 h-4" />}
                        <span className="text-zinc-500 text-sm truncate">
                          {profile.handle}
                        </span>
                        <span className="text-zinc-600 text-xs">· replying</span>
                      </div>
                      <p className="text-white/90 text-sm sm:text-base mt-1">
                        {thread.reply}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
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
                        Subscribe to {profile.name} to unlock exclusive content
                      </p>
                      <Button 
                        onClick={() => {
                          setIsSubscribed(true);
                          toast.success(`Subscribed to ${profile.name}!`);
                        }}
                        className="rounded-full bg-white/10 backdrop-blur-xl border border-white/20 hover:bg-white/20 hover:border-white/40 text-white gap-2"
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
      case 'fractions':
        return (
          <div className="space-y-2 sm:space-y-3">
            {/* Holdings Summary */}
            <div className="bg-zinc-900 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-white font-semibold">Your Holdings</h3>
                <span className="text-white/60 text-sm">
                  {MOCK_FRACTIONS.reduce((acc, f) => acc + f.fractions, 0)}/5000 total fractions
                </span>
              </div>
              <div className="text-2xl font-bold text-white">
                {MOCK_FRACTIONS.reduce((acc, f) => acc + f.totalValue, 0).toFixed(2)} ETH
              </div>
              <p className="text-white/40 text-sm mt-1">Estimated portfolio value</p>
            </div>
            
            {/* Holdings List */}
            {MOCK_FRACTIONS.map((holding) => (
              <div 
                key={holding.id}
                className="bg-zinc-900 rounded-2xl p-4 flex items-center gap-4"
              >
                <img 
                  src={holding.thumbnail} 
                  alt="Post thumbnail"
                  className="w-16 h-16 rounded-xl object-cover"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-white font-medium truncate">{holding.author}</p>
                  <p className="text-white/60 text-sm">
                    {holding.fractions}/1000 fractions
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-white font-semibold">{holding.totalValue} {holding.currency}</p>
                  <p className="text-white/40 text-xs">Value</p>
                </div>
              </div>
            ))}
          </div>
        );
      default:
        return null;
    }
  };

  // Determine if we need to wrap in AppLayout (when accessed via /:username route)
  const needsLayoutWrapper = !!routeUsername;

  // Show loading state
  if (isLoadingProfile) {
    const loadingContent = (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-white animate-spin" />
      </div>
    );
    
    if (needsLayoutWrapper) {
      return <AppLayout>{loadingContent}</AppLayout>;
    }
    return loadingContent;
  }

  const profileContent = (
    <div className="min-h-screen">
      <div className="p-2 sm:p-3 space-y-2 sm:space-y-3 mt-2 lg:mt-0">
        {/* Profile Card Bento */}
        <div className="bg-zinc-900 rounded-2xl overflow-hidden">
          {/* Cover Photo */}
          {profile.coverUrl ? (
            <div className="aspect-[3/1] bg-zinc-800">
              <img src={profile.coverUrl} alt="Cover" className="w-full h-full object-cover" />
            </div>
          ) : (
            <div className="aspect-[3/1] bg-gradient-to-br from-purple-900/50 via-zinc-800 to-blue-900/50" />
          )}
          
          {/* Profile Content */}
          <div className="px-4 sm:px-6 pb-4">
            {/* Avatar - positioned to overlap banner */}
            <div className="relative -mt-12 sm:-mt-14 mb-4">
              <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-zinc-900 p-1">
                {profile.avatarUrl ? (
                  <img 
                    src={profile.avatarUrl} 
                    alt={profile.name} 
                    className="w-full h-full rounded-full object-cover"
                  />
                ) : (
                  <UserAvatar 
                    name={profile.name} 
                    handle={profile.handle} 
                    size="lg" 
                    className="w-full h-full rounded-full"
                  />
                )}
              </div>
              <div className="absolute bottom-2 right-2 w-4 h-4 bg-green-500 rounded-full border-2 border-zinc-900" />
            </div>

            {/* Action Buttons - separate row */}
            <div className="flex items-center gap-2 mb-4">
              {!isFollowing ? (
                <Button 
                  size="sm" 
                  className="rounded-full bg-white text-black hover:bg-zinc-200 gap-2"
                  onClick={handleFollow}
                  disabled={isFollowLoading}
                >
                  {isFollowLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <UserPlus className="w-4 h-4" />
                  )}
                  Follow
                </Button>
              ) : !isSubscribed ? (
                <Button 
                  size="sm" 
                  className="rounded-full bg-white/10 backdrop-blur-xl border border-white/20 hover:bg-white/20 hover:border-white/40 text-white gap-2"
                  onClick={() => {
                    setIsSubscribed(true);
                    toast.success(`Subscribed to ${profile.name}!`);
                  }}
                >
                  <Star className="w-4 h-4" />
                  Subscribe
                </Button>
              ) : (
                <Button 
                  size="sm" 
                  variant="outline"
                  className="rounded-full border-red-500/50 text-red-400 hover:bg-red-500/10 gap-2"
                  onClick={() => {
                    setIsSubscribed(false);
                    toast.success(`Unsubscribed from ${profile.name}`);
                  }}
                >
                  <Star className="w-4 h-4" />
                  Unsubscribe
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
                <h2 className="text-xl font-bold text-white">{profile.name}</h2>
                {profile.verified && <VerifiedBadge className="w-5 h-5" />}
              </div>
              <p className="text-zinc-500">{profile.handle}</p>
              
              {profile.bio && (
                <p className="mt-3 text-white/90 text-sm sm:text-base">{profile.bio}</p>
              )}
              
              <div className="flex items-center gap-2 mt-3 text-zinc-500 text-sm">
                <Calendar className="w-4 h-4" />
                <span>Joined {profile.joinedDate}</span>
              </div>
              
              <div className="flex items-center gap-4 mt-3">
                <button className="hover:underline">
                  <span className="font-bold text-white">{profile.following.toLocaleString()}</span>
                  <span className="text-zinc-500 ml-1">Following</span>
                </button>
                <button className="hover:underline">
                  <span className="font-bold text-white">{profile.followers.toLocaleString()}</span>
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

      {/* Make Offer Drawer */}
      <Drawer open={offerDrawerOpen} onOpenChange={setOfferDrawerOpen}>
        <DrawerContent glass className="px-4 pb-8">
          <DrawerHeader className="text-left">
            <DrawerTitle className="text-white">Make Offer for {profile.handle}</DrawerTitle>
          </DrawerHeader>
          <div className="space-y-4">
            <p className="text-zinc-400 text-sm">
              Enter the amount of DHB tokens you'd like to offer to acquire this username.
            </p>
            
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2">
                <img src={dehubCoin} alt="DHB" className="w-5 h-5" />
              </div>
              <Input
                type="number"
                placeholder="0"
                value={offerAmount}
                onChange={(e) => setOfferAmount(e.target.value)}
                className="pl-10 pr-14 bg-zinc-800 border-zinc-700 text-white"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm font-medium">
                DHB
              </span>
            </div>
            
            <Button 
              onClick={handleSubmitOffer}
              className="w-full bg-white/10 backdrop-blur-xl border border-white/20 hover:bg-white/20 hover:border-white/40 text-white"
            >
              Submit Offer
            </Button>
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );

  // Wrap in AppLayout if accessed via /:username route
  if (needsLayoutWrapper) {
    return <AppLayout>{profileContent}</AppLayout>;
  }

  return profileContent;
}
