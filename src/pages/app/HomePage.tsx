import { useState, useEffect, useRef } from 'react';
import { Heart, MessageCircle, MoreHorizontal, Repeat2, Share, Settings2, Plus, Video, Image, ThumbsUp, ThumbsDown, Share2, Bookmark, CheckCircle, Eye } from 'lucide-react';
import { FEED_TABS } from '@/constants/app.constants';
import { UserAvatar } from '@/components/app/UserAvatar';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import type { Post } from '@/types/app.types';
import { ImagesFeed } from '@/components/app/feeds/ImagesFeed';
import { VideosFeed } from '@/components/app/feeds/VideosFeed';
import { ShortsFeed } from '@/components/app/feeds/ShortsFeed';
import { LiveFeed } from '@/components/app/feeds/LiveFeed';
import { PPVFeed } from '@/components/app/feeds/PPVFeed';
import { W2EFeed } from '@/components/app/feeds/W2EFeed';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useIsMobile } from '@/hooks/use-mobile';

// Sample data for mixed feed
const SAMPLE_VIDEO = {
  id: 'v1',
  thumbnail: 'https://images.unsplash.com/photo-1611162616475-46b635cb6868?w=480&h=270&fit=crop',
  duration: '12:34',
  title: 'Building a Full Stack App in 2024 - Complete Guide',
  channel: 'Tech Tutorials',
  channelAvatar: 'tech',
  verified: true,
  views: '1.2M views',
  uploadedAgo: '2 weeks ago',
};

const SAMPLE_IMAGES = [
  {
    id: 'i1',
    username: 'travel_adventures',
    verified: true,
    avatar: 'travel',
    image: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=600&h=600&fit=crop',
    likes: 2453,
    caption: 'Exploring the mountains 🏔️ Nothing beats this view! #travel #adventure',
    comments: 89,
    timeAgo: '2 hours ago',
  },
  {
    id: 'i2',
    username: 'foodie_life',
    verified: false,
    avatar: 'food',
    image: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=600&h=600&fit=crop',
    likes: 1832,
    caption: 'Homemade pizza night 🍕 Recipe in bio! #foodie #homemade',
    comments: 156,
    timeAgo: '4 hours ago',
  },
];

const SAMPLE_LIVE = {
  id: 'l1',
  streamer: 'Ninja',
  avatar: 'ninja',
  title: '🔴 LIVE - Grinding Ranked! Road to Champion',
  game: 'Fortnite',
  viewers: '45.2K',
  thumbnail: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=480&h=270&fit=crop',
  tags: ['English', 'Competitive'],
  isLive: true,
};

const MOCK_POSTS: Post[] = [
  {
    id: '1',
    author: {
      id: 'a1',
      name: 'Alice Cooper',
      handle: '@alice_cooper',
      verified: false,
    },
    content: 'Just discovered this amazing new tech stack! The future is looking bright 🚀',
    createdAt: '2h',
    stats: { comments: 23, reposts: 12, likes: 124 },
  },
  {
    id: '2',
    author: {
      id: 'a2',
      name: 'Fitness Pro',
      handle: '@fitnesspro',
      verified: false,
    },
    content: 'Morning workout complete! 💪 Feeling stronger every day. #fitness #motivation',
    createdAt: '3h',
    stats: { comments: 8, reposts: 5, likes: 89 },
  },
  {
    id: '3',
    author: {
      id: 'a3',
      name: 'Tech Insider',
      handle: '@techinsider',
      verified: true,
    },
    content:
      'Breaking: New AI developments are reshaping how we think about creativity and automation. Thread 🧵',
    createdAt: '5h',
    stats: { comments: 156, reposts: 234, likes: 1024 },
  },
];

function PostCard({ post }: { post: Post }) {
  return (
    <article className="p-4 hover:bg-zinc-800/30 transition-colors">
      <div className="flex gap-3">
        <UserAvatar name={post.author.name} handle={post.author.handle} size="lg" className="hidden sm:flex" />
        <UserAvatar name={post.author.name} handle={post.author.handle} size="md" className="flex sm:hidden" />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-white truncate">{post.author.name}</span>
            <span className="text-zinc-500 text-sm truncate">{post.author.handle}</span>
            <span className="text-zinc-500 text-sm">· {post.createdAt}</span>
            <button className="ml-auto text-zinc-500 hover:text-white transition-colors p-1">
              <MoreHorizontal className="w-5 h-5" />
            </button>
          </div>

          <p className="mt-2 text-white/90 text-sm sm:text-base">{post.content}</p>

          <div className="flex items-center gap-4 sm:gap-8 mt-4 text-zinc-500">
            <button className="flex items-center gap-1 sm:gap-2 hover:text-blue-400 transition-colors">
              <MessageCircle className="w-4 h-4 sm:w-5 sm:h-5" />
              <span className="text-sm">{post.stats.comments}</span>
            </button>
            <button className="flex items-center gap-1 sm:gap-2 hover:text-green-400 transition-colors">
              <Repeat2 className="w-4 h-4 sm:w-5 sm:h-5" />
              <span className="text-sm">{post.stats.reposts}</span>
            </button>
            <button className="flex items-center gap-1 sm:gap-2 hover:text-red-400 transition-colors">
              <Heart className="w-4 h-4 sm:w-5 sm:h-5" />
              <span className="text-sm">{post.stats.likes}</span>
            </button>
            <button className="hover:text-blue-400 transition-colors">
              <Share className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

function VideoSampleCard() {
  return (
    <div className="bg-zinc-900 rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between p-3">
        <div className="flex items-center gap-3">
          <div className="p-0.5 rounded-full bg-gradient-to-br from-red-500 via-red-600 to-orange-500">
            <div className="p-0.5 bg-zinc-900 rounded-full">
              <Avatar className="w-8 h-8">
                <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${SAMPLE_VIDEO.channelAvatar}`} />
                <AvatarFallback className="bg-zinc-700">{SAMPLE_VIDEO.channel[0]}</AvatarFallback>
              </Avatar>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <span className="font-semibold text-white text-sm">{SAMPLE_VIDEO.channel}</span>
            {SAMPLE_VIDEO.verified && <CheckCircle className="w-4 h-4 text-blue-500" />}
          </div>
        </div>
        <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full">Video</span>
      </div>
      <div className="relative aspect-video bg-zinc-800">
        <img src={SAMPLE_VIDEO.thumbnail} alt="" className="w-full h-full object-cover" />
        <div className="absolute bottom-2 right-2 bg-black/80 px-1.5 py-0.5 rounded text-xs text-white font-medium">
          {SAMPLE_VIDEO.duration}
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-14 h-14 rounded-full bg-black/60 flex items-center justify-center cursor-pointer hover:bg-black/80 transition-colors">
            <div className="w-0 h-0 border-l-[18px] border-l-white border-y-[11px] border-y-transparent ml-1" />
          </div>
        </div>
      </div>
      <div className="p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-4">
            <button className="text-white hover:text-green-400 transition-colors"><ThumbsUp className="w-5 h-5" /></button>
            <button className="text-white hover:text-red-400 transition-colors"><ThumbsDown className="w-5 h-5" /></button>
            <button className="text-white hover:text-zinc-400 transition-colors"><MessageCircle className="w-5 h-5" /></button>
            <button className="text-white hover:text-zinc-400 transition-colors"><Share2 className="w-5 h-5" /></button>
          </div>
          <button className="text-white hover:text-zinc-400 transition-colors"><Bookmark className="w-5 h-5" /></button>
        </div>
        <p className="font-semibold text-white text-sm">{SAMPLE_VIDEO.views}</p>
        <h3 className="text-white text-sm mt-1">{SAMPLE_VIDEO.title}</h3>
        <p className="text-zinc-500 text-xs mt-1">{SAMPLE_VIDEO.uploadedAgo}</p>
      </div>
    </div>
  );
}

function ImageSampleCard({ post }: { post: typeof SAMPLE_IMAGES[0] }) {
  return (
    <div className="bg-zinc-900 rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between p-3">
        <div className="flex items-center gap-3">
          <div className="p-0.5 rounded-full bg-gradient-to-br from-red-500 via-red-600 to-orange-500">
            <div className="p-0.5 bg-zinc-900 rounded-full">
              <Avatar className="w-8 h-8">
                <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${post.avatar}`} />
                <AvatarFallback className="bg-zinc-700">{post.username[0]}</AvatarFallback>
              </Avatar>
            </div>
          </div>
          <span className="font-semibold text-white text-sm">{post.username}</span>
        </div>
        <span className="text-xs bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded-full">Image</span>
      </div>
      <div className="aspect-square bg-zinc-800">
        <img src={post.image} alt="" className="w-full h-full object-cover" />
      </div>
      <div className="p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-4">
            <button className="text-white hover:text-red-400 transition-colors"><Heart className="w-5 h-5" /></button>
            <button className="text-white hover:text-zinc-400 transition-colors"><MessageCircle className="w-5 h-5" /></button>
            <button className="text-white hover:text-zinc-400 transition-colors"><Share2 className="w-5 h-5" /></button>
          </div>
          <button className="text-white hover:text-zinc-400 transition-colors"><Bookmark className="w-5 h-5" /></button>
        </div>
        <p className="font-semibold text-white text-sm">{post.likes.toLocaleString()} likes</p>
        <p className="text-white text-sm mt-1"><span className="font-semibold">{post.username}</span> {post.caption}</p>
        <p className="text-zinc-500 text-xs mt-1">{post.timeAgo}</p>
      </div>
    </div>
  );
}

function LiveSampleCard() {
  return (
    <div className="bg-zinc-900 rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between p-3">
        <div className="flex items-center gap-3">
          <Avatar className="w-8 h-8 ring-2 ring-red-500">
            <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${SAMPLE_LIVE.avatar}`} />
            <AvatarFallback className="bg-zinc-700">{SAMPLE_LIVE.streamer[0]}</AvatarFallback>
          </Avatar>
          <span className="font-semibold text-white text-sm">{SAMPLE_LIVE.streamer}</span>
        </div>
        <span className="text-xs bg-red-500 text-white px-2 py-0.5 rounded-full flex items-center gap-1">
          <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
          LIVE
        </span>
      </div>
      <div className="relative aspect-video bg-zinc-800">
        <img src={SAMPLE_LIVE.thumbnail} alt="" className="w-full h-full object-cover" />
        <div className="absolute bottom-2 left-2 flex items-center gap-1 bg-black/70 px-2 py-0.5 rounded">
          <Eye className="w-3 h-3 text-red-500" />
          <span className="text-white text-xs font-medium">{SAMPLE_LIVE.viewers}</span>
        </div>
      </div>
      <div className="p-3">
        <h3 className="font-medium text-white text-sm">{SAMPLE_LIVE.title}</h3>
        <p className="text-zinc-500 text-xs mt-1">{SAMPLE_LIVE.game}</p>
        <div className="flex gap-1 mt-2">
          {SAMPLE_LIVE.tags.map((tag) => (
            <span key={tag} className="text-xs bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded">{tag}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

function StoriesBar() {
  const [isOpen, setIsOpen] = useState(false);
  const isMobile = useIsMobile();

  const handleGoLive = () => {
    setIsOpen(false);
    // TODO: Open live streaming
  };

  const handleAddStory = () => {
    setIsOpen(false);
    // TODO: Open story creation
  };

  const menuContent = (
    <div className="space-y-1">
      <button
        onClick={handleGoLive}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/10 transition-colors text-left"
      >
        <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center">
          <Video className="w-4 h-4 text-red-500" />
        </div>
        <span className="text-white font-medium">Go Live</span>
      </button>
      <button
        onClick={handleAddStory}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/10 transition-colors text-left"
      >
        <div className="w-8 h-8 rounded-full bg-orange-500/20 flex items-center justify-center">
          <Image className="w-4 h-4 text-orange-500" />
        </div>
        <span className="text-white font-medium">Add Story</span>
      </button>
    </div>
  );

  const triggerButton = (
    <div className="flex flex-col items-center gap-1 flex-shrink-0 cursor-pointer">
      <div className="p-0.5 rounded-full bg-gradient-to-br from-red-500 via-red-600 to-orange-500">
        <div className="p-0.5 bg-zinc-900 rounded-full">
          <div className="w-14 h-14 rounded-full bg-zinc-900/50 backdrop-blur-sm flex items-center justify-center">
            <Plus className="w-6 h-6 text-white" />
          </div>
        </div>
      </div>
      <span className="text-xs text-zinc-400 truncate w-16 text-center">Live/Story</span>
    </div>
  );

  return (
    <div className="bg-zinc-900 rounded-2xl p-4 -mt-[7px]">
      <div className="flex gap-4 overflow-x-auto scrollbar-hide">
        {/* Live/Story Button */}
        {isMobile ? (
          <Drawer open={isOpen} onOpenChange={setIsOpen}>
            <div onClick={() => setIsOpen(true)}>
              {triggerButton}
            </div>
            <DrawerContent glass className="px-4 pb-8">
              <DrawerHeader className="mb-2">
                <DrawerTitle className="text-white">Create</DrawerTitle>
              </DrawerHeader>
              {menuContent}
            </DrawerContent>
          </Drawer>
        ) : (
          <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
            <DropdownMenuTrigger asChild>
              {triggerButton}
            </DropdownMenuTrigger>
            <DropdownMenuContent glass className="w-48 p-2" align="start" sideOffset={8}>
              {menuContent}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* Other Stories */}
        {['alice', 'bob', 'charlie', 'diana', 'evan', 'fiona'].map((name) => (
          <div key={name} className="flex flex-col items-center gap-1 flex-shrink-0">
            <div className="p-0.5 rounded-full bg-gradient-to-br from-red-500 via-red-600 to-orange-500">
              <div className="p-0.5 bg-zinc-900 rounded-full">
                <Avatar className="w-14 h-14">
                  <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${name}`} />
                  <AvatarFallback className="bg-zinc-700">{name[0].toUpperCase()}</AvatarFallback>
                </Avatar>
              </div>
            </div>
            <span className="text-xs text-zinc-400 truncate w-16 text-center">{name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function HomeFeed() {
  return (
    <div className="p-2 sm:p-3 space-y-3">
      <StoriesBar />
      
      {/* Mixed content feed */}
      <LiveSampleCard />
      
      <div className="bg-zinc-900 rounded-2xl overflow-hidden">
        <PostCard post={MOCK_POSTS[0]} />
      </div>
      
      <VideoSampleCard />
      
      <ImageSampleCard post={SAMPLE_IMAGES[0]} />
      
      <div className="bg-zinc-900 rounded-2xl overflow-hidden">
        <PostCard post={MOCK_POSTS[1]} />
      </div>
      
      <ImageSampleCard post={SAMPLE_IMAGES[1]} />
      
      <div className="bg-zinc-900 rounded-2xl overflow-hidden">
        <PostCard post={MOCK_POSTS[2]} />
      </div>
    </div>
  );
}

export default function HomePage() {
  const [activeTab, setActiveTab] = useState('home');
  const [showShortsFilters, setShowShortsFilters] = useState(false);
  const [showImagesCollage, setShowImagesCollage] = useState(false);
  const [showVideosFilters, setShowVideosFilters] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showFeedSettings, setShowFeedSettings] = useState(false);
  
  // Swipe gesture refs
  const touchStartX = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);
  const minSwipeDistance = 50;
  
  // Feed filter states
  const [feedFilters, setFeedFilters] = useState({
    followed: true,
    subscribed: true,
    trending: true,
  });

  // Listen for home refresh event
  useEffect(() => {
    const handleHomeRefresh = () => {
      setActiveTab('home');
      setShowShortsFilters(false);
      setShowImagesCollage(false);
      setShowVideosFilters(false);
      setRefreshKey(prev => prev + 1);
      // Scroll to top
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    window.addEventListener('home-refresh', handleHomeRefresh);
    return () => window.removeEventListener('home-refresh', handleHomeRefresh);
  }, []);
  
  // Swipe gesture handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchEndX.current = null;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = () => {
    if (!touchStartX.current || !touchEndX.current) return;
    
    const distance = touchStartX.current - touchEndX.current;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;
    
    const tabValues = FEED_TABS.map(tab => tab.value);
    const currentIndex = tabValues.indexOf(activeTab);
    
    if (isLeftSwipe && currentIndex < tabValues.length - 1) {
      // Swipe left = go to next tab
      const nextTab = tabValues[currentIndex + 1];
      setActiveTab(nextTab);
      setShowShortsFilters(false);
      setShowImagesCollage(false);
      setShowVideosFilters(false);
    } else if (isRightSwipe && currentIndex > 0) {
      // Swipe right = go to previous tab
      const prevTab = tabValues[currentIndex - 1];
      setActiveTab(prevTab);
      setShowShortsFilters(false);
      setShowImagesCollage(false);
      setShowVideosFilters(false);
    }
    
    touchStartX.current = null;
    touchEndX.current = null;
  };

  const handleTabClick = (tabValue: string) => {
    if (tabValue === activeTab) {
      // Same tab clicked - refresh the content
      setRefreshKey(prev => prev + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      
      // Handle specific toggles
      if (tabValue === 'shorts') {
        setShowShortsFilters((prev) => !prev);
      } else if (tabValue === 'images') {
        setShowImagesCollage((prev) => !prev);
      } else if (tabValue === 'videos') {
        setShowVideosFilters((prev) => !prev);
      }
    } else {
      setActiveTab(tabValue);
      setShowShortsFilters(false);
      setShowImagesCollage(false);
      setShowVideosFilters(false);
    }
  };

  const renderFeed = () => {
    switch (activeTab) {
      case 'ppv':
        return <PPVFeed />;
      case 'w2e':
        return <W2EFeed />;
      case 'images':
        return <ImagesFeed showCollage={showImagesCollage} />;
      case 'videos':
        return <VideosFeed showFilters={showVideosFilters} />;
      case 'shorts':
        return <ShortsFeed showFilters={showShortsFilters} />;
      case 'live':
        return <LiveFeed key={refreshKey} />;
      default:
        return <HomeFeed key={refreshKey} />;
    }
  };

  return (
    <div 
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div className="sticky top-0 bg-black/80 backdrop-blur-sm z-10 p-2 sm:p-3 mt-2 lg:mt-0">
        <div className="bg-zinc-900 rounded-2xl p-2">
          <div className="flex gap-1 sm:gap-2 overflow-x-auto scrollbar-hide">
            {FEED_TABS.map((tab) => (
              <button
                key={tab.value}
                onClick={() => handleTabClick(tab.value)}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 px-3 sm:px-4 py-2 rounded-xl transition-colors text-sm whitespace-nowrap',
                  activeTab === tab.value
                    ? 'bg-zinc-800 text-white'
                    : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-white'
                )}
              >
                <tab.icon className="w-4 h-4 sm:w-4 sm:h-4" />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
            
            {/* Settings Button */}
            <button
              onClick={() => setShowFeedSettings(true)}
              className="flex items-center justify-center px-3 py-2 rounded-xl transition-colors text-zinc-400 hover:bg-zinc-800/50 hover:text-white"
            >
              <Settings2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {renderFeed()}

      {/* Feed Settings Modal */}
      <Dialog open={showFeedSettings} onOpenChange={setShowFeedSettings}>
        <DialogContent className="sm:max-w-[400px] bg-white/5 backdrop-blur-xl border border-white/10 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-white">Feed Settings</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white font-medium">Followed</p>
                <p className="text-sm text-zinc-400">Show posts from people you follow</p>
              </div>
              <Switch
                checked={feedFilters.followed}
                onCheckedChange={(checked) => setFeedFilters(prev => ({ ...prev, followed: checked }))}
              />
            </div>
            
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white font-medium">Subscribed</p>
                <p className="text-sm text-zinc-400">Show posts from your subscriptions</p>
              </div>
              <Switch
                checked={feedFilters.subscribed}
                onCheckedChange={(checked) => setFeedFilters(prev => ({ ...prev, subscribed: checked }))}
              />
            </div>
            
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white font-medium">Trending</p>
                <p className="text-sm text-zinc-400">Show trending content first</p>
              </div>
              <Switch
                checked={feedFilters.trending}
                onCheckedChange={(checked) => setFeedFilters(prev => ({ ...prev, trending: checked }))}
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
