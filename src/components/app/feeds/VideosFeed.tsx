/**
 * Videos Feed Component
 * =====================
 * Displays a grid/list of video content with filtering options.
 * Fetches from DeHub API. Uses the shared VideoCard component.
 * 
 * @module components/app/feeds/VideosFeed
 */

import { useState, useMemo, useEffect, useRef } from 'react';
import { Loader2, RefreshCw, Video, Play, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { VideoCard } from '@/components/app/cards/VideoCard';
import { ShortsReel } from '@/components/app/cards/ShortsReel';
import { useAuth } from '@/contexts/AuthContext';
import { useDeHubVideos, mapNFTToVideoItem } from '@/hooks/use-dehub-feed';
import { getMediaUrl } from '@/lib/api/dehub';
import { SwipeableCarousel } from '@/components/app/SwipeableCarousel';
import type { ShortVideo } from '@/types/feed.types';

// Category images
import minecraftCategory from '@/assets/minecraft-category.png';
import codCategory from '@/assets/cod-category.png';
import gtaCategory from '@/assets/gta-category.png';
import fortniteCategory from '@/assets/fortnite-category.png';
import valorantCategory from '@/assets/valorant-category.png';
import leagueCategory from '@/assets/league-category.png';
import apexCategory from '@/assets/apex-category.png';
import justchattingCategory from '@/assets/justchatting-category.png';

// ============================================================================
// TYPES
// ============================================================================

interface VideosFeedProps {
  showFilters?: boolean;
  isRefreshing?: boolean;
  refreshKey?: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DURATION_OPTIONS = ['0-1m', '1-4m', '4-20m', '20m+'];
const SORT_OPTIONS = ['New to Old', 'Most Liked', 'Most Viewed', 'Most Commented'];
const UPLOAD_DATE_OPTIONS = ['1d', '1w', '1y', 'All Time'];
const CATEGORY_PILLS = ['All', 'PPV', 'W2E', 'Programming', 'Web Dev', 'JavaScript', 'React', 'Python', 'Gaming', 'Music'];

const SORT_MAP: Record<string, 'new' | 'popular' | 'trending'> = {
  'New to Old': 'new',
  'Most Liked': 'popular',
  'Most Viewed': 'popular',
  'Most Commented': 'trending',
};

const LIVE_CATEGORIES_INSERT_AFTER = 5;
const SHORTS_INSERT_AFTER = 9;

const LIVE_CATEGORIES = [
  { name: 'Just Chatting', viewers: '412K', image: justchattingCategory },
  { name: 'Fortnite', viewers: '189K', image: fortniteCategory },
  { name: 'Valorant', viewers: '156K', image: valorantCategory },
  { name: 'Minecraft', viewers: '134K', image: minecraftCategory },
  { name: 'League of Legends', viewers: '298K', image: leagueCategory },
  { name: 'Call of Duty', viewers: '167K', image: codCategory },
  { name: 'GTA V', viewers: '145K', image: gtaCategory },
  { name: 'Apex Legends', viewers: '112K', image: apexCategory },
];

// Helper to format counts
function formatCount(count: number): string {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1).replace(/\.0$/, '')}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  return count.toString();
}

// Map NFT to ShortVideo format
function mapNFTToShortVideo(nft: any): ShortVideo {
  const id = String(nft.tokenId || nft.id || nft.token_id);
  
  return {
    id,
    type: 'short',
    username: nft.minterDisplayName || nft.mintername || nft.creator?.username || 'user',
    verified: nft.creator?.is_verified || false,
    likes: formatCount(nft.totalVotes?.for || nft.like_count || 0),
    thumbnail: getMediaUrl(nft.imageUrl) || getMediaUrl(nft.thumbnail_url) || '',
    videoUrl: getMediaUrl(nft.videoUrl) || getMediaUrl(nft.media_url) || '',
    description: nft.description || nft.name || nft.title || '',
    sound: 'Original Sound',
    comments: formatCount(nft.commentCount || nft.comment_count || 0),
    shares: formatCount(Math.floor(Math.random() * 1000)),
  };
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

// Live Categories Carousel
function LiveCategoriesCarousel() {
  return (
    <div className="bg-zinc-900 rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-white flex items-center gap-2">
          <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
          Live Categories
        </h3>
        <button className="text-red-400 text-sm hover:underline flex items-center gap-1">
          See all <ChevronRight className="w-4 h-4" />
        </button>
      </div>
      <SwipeableCarousel className="flex gap-3 px-1" fadeColor="from-zinc-900">
        {LIVE_CATEGORIES.map((cat) => (
          <div key={cat.name} className="flex-shrink-0 cursor-pointer group">
            <div className="w-[90px] aspect-[3/4] rounded-lg overflow-hidden mb-2 relative">
              <img src={cat.image} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
            </div>
            <p className="text-white text-sm font-medium truncate w-[90px]">{cat.name}</p>
            <p className="text-zinc-500 text-xs">{cat.viewers} viewers</p>
          </div>
        ))}
      </SwipeableCarousel>
    </div>
  );
}

interface FilterSectionProps {
  label: string;
  options: string[];
  selected: string;
  onSelect: (value: string) => void;
}

function FilterSection({ label, options, selected, onSelect }: FilterSectionProps) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs text-zinc-500 uppercase tracking-wider">{label}</span>
      <div className="flex gap-1.5 flex-wrap">
        {options.map((option) => (
          <button
            key={option}
            onClick={() => onSelect(option)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
              selected === option
                ? 'bg-white text-black'
                : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
            )}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function VideosFeed({ showFilters = false, isRefreshing = false, refreshKey = 0 }: VideosFeedProps) {
  const [selectedDuration, setSelectedDuration] = useState(DURATION_OPTIONS[0]);
  const [selectedSort, setSelectedSort] = useState(SORT_OPTIONS[0]);
  const [selectedUploadDate, setSelectedUploadDate] = useState(UPLOAD_DATE_OPTIONS[3]);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const loaderRef = useRef<HTMLDivElement>(null);
  
  const { walletAddress } = useAuth();

  const {
    data: apiData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: isApiLoading,
    isError,
    refetch,
  } = useDeHubVideos({
    unit: 20,
    sortMode: SORT_MAP[selectedSort] || 'new',
    category: selectedCategory !== 'All' ? selectedCategory.toLowerCase() : undefined,
    address: walletAddress || undefined,
  });

  // Fetch shorts for the carousel
  const { data: shortsData } = useDeHubVideos({
    unit: 10,
    sortMode: 'popular',
    address: walletAddress || undefined,
  });

  useEffect(() => {
    if (refreshKey > 0) {
      refetch();
    }
  }, [refreshKey, refetch]);

  const videos = useMemo(() => {
    if (!apiData?.pages) return [];
    const allNFTs = apiData.pages.flatMap(page => page.data || []);
    return allNFTs.map((nft, index) => mapNFTToVideoItem(nft, index));
  }, [apiData]);

  // Map shorts data
  const shorts = useMemo((): ShortVideo[] => {
    if (!shortsData?.pages) return [];
    const allNFTs = shortsData.pages.flatMap(page => page.data || []);
    return allNFTs.slice(0, 10).map(mapNFTToShortVideo);
  }, [shortsData]);

  useEffect(() => {
    if (!loaderRef.current || !hasNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.1, rootMargin: '100px' }
    );

    observer.observe(loaderRef.current);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const EmptyState = () => (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center mb-4">
        <Video className="w-8 h-8 text-zinc-500" />
      </div>
      <h3 className="text-white font-semibold text-lg mb-2">No Videos Yet</h3>
      <p className="text-zinc-400 text-sm max-w-xs mb-4">
        {isError 
          ? 'Unable to load videos. Please try again.'
          : 'Be the first to upload a video!'}
      </p>
      <button 
        onClick={() => refetch()}
        className="px-4 py-2 rounded-full bg-white/10 text-white text-sm hover:bg-white/20 transition-colors flex items-center gap-2"
      >
        <RefreshCw className="w-4 h-4" />
        Refresh
      </button>
    </div>
  );

  if (isRefreshing || isApiLoading) {
    return (
      <div className="p-2 sm:p-3 flex items-center justify-center py-32">
        <Loader2 className="w-10 h-10 text-white animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-2 sm:p-3">
      {/* Filters */}
      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="bg-zinc-900 rounded-2xl p-4 mb-3 space-y-4">
              <FilterSection label="Duration" options={DURATION_OPTIONS} selected={selectedDuration} onSelect={setSelectedDuration} />
              <FilterSection label="Sort" options={SORT_OPTIONS} selected={selectedSort} onSelect={setSelectedSort} />
              <FilterSection label="Upload Date" options={UPLOAD_DATE_OPTIONS} selected={selectedUploadDate} onSelect={setSelectedUploadDate} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Category Pills */}
      <div className="bg-zinc-900 rounded-2xl p-3 mb-3">
        <SwipeableCarousel className="flex gap-2 px-1" fadeColor="from-zinc-900">
          {CATEGORY_PILLS.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={cn(
                'px-4 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors',
                selectedCategory === cat ? 'bg-white text-black' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
              )}
            >
              {cat}
            </button>
          ))}
        </SwipeableCarousel>
      </div>

      {/* Featured/Ad Row - First 3 videos as thumbnails */}
      {videos.length >= 3 && (
        <div className="mb-3">
          {/* Desktop/Tablet: 3 thumbnails in a row */}
          <div className="hidden sm:grid grid-cols-3 gap-2">
            {videos.slice(0, 3).map((video) => (
              <div 
                key={`featured-${video.id}`}
                className="relative aspect-video rounded-xl overflow-hidden"
              >
                <img
                  src={video.thumbnail}
                  alt={video.title}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/30" />
                
                {/* Creator info at top */}
                <div className="absolute top-2 left-2 right-2 flex items-center gap-1.5">
                  <div className="w-5 h-5 rounded-full overflow-hidden border border-white/30 flex-shrink-0">
                    <img 
                      src={video.channelAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${video.channel}`}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <span className="text-white text-[10px] font-medium truncate">{video.channel}</span>
                </div>
                
                {/* Duration badge */}
                <div className="absolute bottom-2 right-2 bg-black/70 px-1.5 py-0.5 rounded text-[10px] text-white font-medium">
                  {video.duration}
                </div>
                
                {/* Title at bottom */}
                <div className="absolute bottom-2 left-2 right-12">
                  <p className="text-white text-xs font-medium line-clamp-1">{video.title}</p>
                </div>
              </div>
            ))}
          </div>
          
          {/* Mobile: Horizontally swipeable */}
          <div className="sm:hidden">
            <SwipeableCarousel className="flex gap-2" fadeColor="from-zinc-900">
              {videos.slice(0, 3).map((video) => (
                <div 
                  key={`featured-mobile-${video.id}`}
                  className="relative flex-shrink-0 w-[70%] aspect-video rounded-xl overflow-hidden"
                >
                  <img
                    src={video.thumbnail}
                    alt={video.title}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/30" />
                  
                  {/* Creator info at top */}
                  <div className="absolute top-2 left-2 right-2 flex items-center gap-1.5">
                    <div className="w-5 h-5 rounded-full overflow-hidden border border-white/30 flex-shrink-0">
                      <img 
                        src={video.channelAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${video.channel}`}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <span className="text-white text-[10px] font-medium truncate">{video.channel}</span>
                  </div>
                  
                  {/* Duration badge */}
                  <div className="absolute bottom-2 right-2 bg-black/70 px-1.5 py-0.5 rounded text-[10px] text-white font-medium">
                    {video.duration}
                  </div>
                  
                  {/* Title at bottom */}
                  <div className="absolute bottom-2 left-2 right-12">
                    <p className="text-white text-xs font-medium line-clamp-1">{video.title}</p>
                  </div>
                </div>
              ))}
            </SwipeableCarousel>
          </div>
        </div>
      )}

      {/* Video Grid or Empty State */}
      {videos.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <div className="space-y-3">
            {/* Skip first 3 videos if featured row is shown, then insert carousels at intervals */}
            {(videos.length >= 3 ? videos.slice(3) : videos).map((video, index) => {
              const elements: React.ReactNode[] = [];
              
              // Add video card
              elements.push(<VideoCard key={video.id} video={video} />);
              
              // Insert live categories carousel after 5 posts (index 4, since 0-indexed)
              if (index === LIVE_CATEGORIES_INSERT_AFTER - 1) {
                elements.push(<LiveCategoriesCarousel key="live-categories-carousel" />);
              }
              
              // Insert shorts carousel after 9 posts (index 8)
              if (index === SHORTS_INSERT_AFTER - 1 && shorts.length > 0) {
                elements.push(<ShortsReel key="shorts-carousel" shorts={shorts} />);
              }
              
              return elements;
            })}
          </div>

          {/* Infinite scroll loader */}
          <div ref={loaderRef} className="py-4 flex justify-center">
            {isFetchingNextPage && (
              <div className="flex items-center gap-2 text-zinc-400">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm">Loading more...</span>
              </div>
            )}
            {!hasNextPage && videos.length > 0 && (
              <p className="text-zinc-500 text-sm">You've reached the end 🎉</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
