/**
 * Home Page
 * =========
 * Main feed page with tab-based navigation between content types.
 * Features swipe gestures for mobile navigation and mixed content home feed.
 * 
 * @module pages/app/HomePage
 */

import { useState, useEffect, useRef } from 'react';
import { Settings2 } from 'lucide-react';
import { FEED_TABS } from '@/constants/app.constants';
import { cn } from '@/lib/utils';

// Feed components
import { ImagesFeed } from '@/components/app/feeds/ImagesFeed';
import { VideosFeed } from '@/components/app/feeds/VideosFeed';
import { ShortsFeed } from '@/components/app/feeds/ShortsFeed';
import { LiveFeed } from '@/components/app/feeds/LiveFeed';
import { PPVFeed } from '@/components/app/feeds/PPVFeed';
import { W2EFeed } from '@/components/app/feeds/W2EFeed';

// Card components
import { 
  PostCard, 
  VideoCard, 
  ImageCard, 
  LiveCard, 
  ShortsReel, 
  StoriesBar 
} from '@/components/app/cards';

// UI components
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';

// Mock data
import { 
  MOCK_POSTS, 
  SAMPLE_VIDEO, 
  SAMPLE_IMAGES, 
  SAMPLE_SHORTS, 
  SAMPLE_LIVE,
  STORY_USERS 
} from '@/data/mock-feed.data';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Minimum swipe distance to trigger tab change */
const SWIPE_THRESHOLD = 50;

// ============================================================================
// HOME FEED COMPONENT
// ============================================================================

/**
 * Mixed content feed for the home tab.
 * Displays a curated mix of all content types.
 */
function HomeFeed() {
  return (
    <div className="p-2 sm:p-3 space-y-3">
      <StoriesBar users={STORY_USERS} />
      
      {/* Mixed content feed - samples from all types */}
      <LiveCard stream={SAMPLE_LIVE} />
      <PostCard post={MOCK_POSTS[0]} />
      <VideoCard video={SAMPLE_VIDEO} />
      <ImageCard post={SAMPLE_IMAGES[0]} />
      <PostCard post={MOCK_POSTS[1]} />
      
      {/* Shorts reel after ~5 items */}
      <ShortsReel shorts={SAMPLE_SHORTS} />
      
      <ImageCard post={SAMPLE_IMAGES[1]} />
      <PostCard post={MOCK_POSTS[2]} />
    </div>
  );
}

// ============================================================================
// FEED SETTINGS MODAL
// ============================================================================

interface FeedFilters {
  followed: boolean;
  subscribed: boolean;
  trending: boolean;
}

interface FeedSettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: FeedFilters;
  onFiltersChange: (filters: FeedFilters) => void;
}

/**
 * Modal for configuring feed preferences.
 */
function FeedSettingsModal({ open, onOpenChange, filters, onFiltersChange }: FeedSettingsProps) {
  const updateFilter = (key: keyof FeedFilters, value: boolean) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
              checked={filters.followed}
              onCheckedChange={(checked) => updateFilter('followed', checked)}
            />
          </div>
          
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white font-medium">Subscribed</p>
              <p className="text-sm text-zinc-400">Show posts from your subscriptions</p>
            </div>
            <Switch
              checked={filters.subscribed}
              onCheckedChange={(checked) => updateFilter('subscribed', checked)}
            />
          </div>
          
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white font-medium">Trending</p>
              <p className="text-sm text-zinc-400">Show trending content first</p>
            </div>
            <Switch
              checked={filters.trending}
              onCheckedChange={(checked) => updateFilter('trending', checked)}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function HomePage() {
  // Tab state
  const [activeTab, setActiveTab] = useState('home');
  const [refreshKey, setRefreshKey] = useState(0);
  
  // Filter states for each feed type
  const [showShortsFilters, setShowShortsFilters] = useState(false);
  const [showImagesCollage, setShowImagesCollage] = useState(false);
  const [showVideosFilters, setShowVideosFilters] = useState(false);
  
  // Settings modal
  const [showFeedSettings, setShowFeedSettings] = useState(false);
  const [feedFilters, setFeedFilters] = useState<FeedFilters>({
    followed: true,
    subscribed: true,
    trending: true,
  });
  
  // Swipe gesture refs
  const touchStartX = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);

  // --------------------------------------------------------------------------
  // EVENT HANDLERS
  // --------------------------------------------------------------------------

  /**
   * Listen for home refresh events from navigation.
   */
  useEffect(() => {
    const handleHomeRefresh = () => {
      if (activeTab === 'home') {
        // Already on home, show toast
        toast.info('No new posts', {
          description: 'Check back later for fresh content',
          duration: 2000,
        });
      }
      setActiveTab('home');
      resetFilters();
      setRefreshKey(prev => prev + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    window.addEventListener('home-refresh', handleHomeRefresh);
    return () => window.removeEventListener('home-refresh', handleHomeRefresh);
  }, [activeTab]);

  /**
   * Reset all filter states.
   */
  const resetFilters = () => {
    setShowShortsFilters(false);
    setShowImagesCollage(false);
    setShowVideosFilters(false);
  };

  /**
   * Handle tab click - toggle filters on same tab, switch on different tab.
   */
  const handleTabClick = (tabValue: string) => {
    if (tabValue === activeTab) {
      // Same tab clicked - refresh and toggle specific filter
      setRefreshKey(prev => prev + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      
      if (tabValue === 'shorts') setShowShortsFilters(prev => !prev);
      else if (tabValue === 'images') setShowImagesCollage(prev => !prev);
      else if (tabValue === 'videos') setShowVideosFilters(prev => !prev);
    } else {
      setActiveTab(tabValue);
      resetFilters();
    }
  };

  // --------------------------------------------------------------------------
  // SWIPE GESTURE HANDLERS
  // --------------------------------------------------------------------------

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
    const isLeftSwipe = distance > SWIPE_THRESHOLD;
    const isRightSwipe = distance < -SWIPE_THRESHOLD;
    
    const tabValues = FEED_TABS.map(tab => tab.value);
    const currentIndex = tabValues.indexOf(activeTab);
    
    if (isLeftSwipe && currentIndex < tabValues.length - 1) {
      setActiveTab(tabValues[currentIndex + 1]);
      resetFilters();
    } else if (isRightSwipe && currentIndex > 0) {
      setActiveTab(tabValues[currentIndex - 1]);
      resetFilters();
    }
    
    touchStartX.current = null;
    touchEndX.current = null;
  };

  // --------------------------------------------------------------------------
  // RENDER FEED BASED ON ACTIVE TAB
  // --------------------------------------------------------------------------

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

  // --------------------------------------------------------------------------
  // RENDER
  // --------------------------------------------------------------------------

  return (
    <div 
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Tab Navigation */}
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
                <tab.icon className="w-4 h-4" />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
            
            {/* Settings Button */}
            <button
              onClick={() => setShowFeedSettings(true)}
              className="flex items-center justify-center px-3 py-2 rounded-xl transition-colors text-zinc-400 hover:bg-zinc-800/50 hover:text-white"
              aria-label="Feed settings"
            >
              <Settings2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Feed Content */}
      {renderFeed()}

      {/* Settings Modal */}
      <FeedSettingsModal
        open={showFeedSettings}
        onOpenChange={setShowFeedSettings}
        filters={feedFilters}
        onFiltersChange={setFeedFilters}
      />
    </div>
  );
}
