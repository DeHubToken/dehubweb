/**
 * Music Feed Component
 * ====================
 * Displays music/audio uploads, music videos, and radio in the main feed.
 * 
 * @module components/app/feeds/MusicFeed
 */

import { useState, useMemo, useRef, useCallback, useEffect, useId } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, Music, Mic2, Radio, Disc3, ChevronRight, Pause, Volume2, VolumeX, Loader2, Headphones } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTabIndicator } from '@/hooks/use-tab-indicator';
import { GlassIndicator } from '@/components/app/feeds/GlassIndicator';
import stagesMicIcon from '@/assets/icons/stages-mic-icon.png';
import { MusicFeedSkeleton, MusicVideoCardSkeleton } from '@/components/app/feeds/FeedSkeletons';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { RadioSection } from '@/components/app/radio';
import { StagesCarousel } from '@/components/app/music/StagesCarousel';
import { AudioSpacesModal } from '@/components/app/spaces';

import { RadioStationCard } from '@/components/app/radio/RadioStationCard';
import { SwipeableCarousel } from '@/components/app/SwipeableCarousel';
import { VideoCard } from '@/components/app/cards/VideoCard';
import { searchNFTs, getNFTInfo, getBlockList, type DeHubNFT } from '@/lib/api/dehub';
import { MANUAL_MUSIC_TOKEN_IDS } from '@/constants/music.constants';
import { buildAvatarUrl, buildImageUrl, buildVideoUrl, extractAvatarPath } from '@/lib/media-url';
import { formatDuration, formatViews, formatTimeAgo } from '@/lib/feed-utils';
import { getCuratedCarouselStations, type RadioStation } from '@/lib/api/radio-browser';
import { useAuth } from '@/contexts/AuthContext';
import { videoPlaybackManager } from '@/lib/video-playback-manager';
import type { VideoItem } from '@/types/feed.types';

// ============================================================================
// TYPES
// ============================================================================

type MusicSubTab = 'all' | 'tracks' | 'videos' | 'podcasts' | 'radio' | 'stages';

const MUSIC_SUB_TABS: { icon?: typeof Music; customIcon?: string; label: string; value: MusicSubTab }[] = [
  { icon: Music, label: 'All', value: 'all' },
  { icon: Disc3, label: 'Tracks', value: 'tracks' },
  { icon: Play, label: 'Videos', value: 'videos' },
  { icon: Mic2, label: 'Podcasts', value: 'podcasts' },
  { icon: Radio, label: 'Radio', value: 'radio' },
  { customIcon: stagesMicIcon, label: 'Stages', value: 'stages' },
];

const CAROUSEL_INITIAL_VISIBLE = 6; // Initial visible items in carousel
const CAROUSEL_LOAD_MORE = 6; // Load more items when scrolling
const VIDEOS_PAGE_SIZE = 10; // Page size for videos tab - small for fast initial load

// ============================================================================
// HELPERS
/** Hardcoded fallback usernames/display names to filter out from feeds */
const BLOCKED_CREATORS_FALLBACK = [
  'monkey d luffy',
  'monkey d. luffy',
  'monkeydluffy',
  'monkey_d_luffy',
];

function isBlockedCreator(nft: DeHubNFT, dynamicBlockedAddresses?: Set<string>): boolean {
  if (dynamicBlockedAddresses) {
    const minter = (nft.minter || '').toLowerCase();
    if (minter && dynamicBlockedAddresses.has(minter)) return true;
  }
  const displayName = (nft.minterDisplayName || nft.mintername || '').toLowerCase();
  const username = (nft.creator?.username || '').toLowerCase();
  return BLOCKED_CREATORS_FALLBACK.some(blocked => 
    displayName.includes(blocked) || username.includes(blocked)
  );
}

// Helper functions (formatDuration, formatViews, formatTimeAgo) are now imported from @/lib/feed-utils
function mapNFTToVideoItem(nft: DeHubNFT, index: number): VideoItem {
  const minterAddress = nft.minter || nft.creator?.id || '';
  // Use centralized utility for avatar extraction
  const rawAvatarUrl = extractAvatarPath(nft) || extractAvatarPath(nft.creator);
  const avatarUrl = minterAddress && rawAvatarUrl 
    ? buildAvatarUrl(minterAddress, rawAvatarUrl) 
    : undefined;

  const tokenId = nft.tokenId || nft.id || nft.token_id || index;
  
  // Detect audio posts
  const postType = (nft as any).postType as string | undefined;
  const isAudioPost = postType === 'audio' || postType === 'feed-audio';
  
  // Get duration from various possible fields
  const duration = isAudioPost 
    ? ((nft as any).audioDuration || nft.videoDuration || nft.duration)
    : (nft.videoDuration || nft.duration);
  
  // Build audio URL for audio posts
  const rawAudioUrl = (nft as any).audioUrl as string | undefined;
  const audioUrl = isAudioPost && rawAudioUrl
    ? (rawAudioUrl.startsWith('http') ? rawAudioUrl : `https://dehubcdn.ams3.cdn.digitaloceanspaces.com/${rawAudioUrl}`)
    : undefined;
  
  return {
    id: String(tokenId),
    type: 'video',
    thumbnail: buildImageUrl(tokenId, nft.imageUrl) || buildImageUrl(tokenId, nft.thumbnail_url) || '',
    title: nft.name || nft.title || nft.description || 'Untitled',
    channel: nft.minterDisplayName || nft.mintername || nft.creator?.username || 'Anonymous',
    verified: nft.creator?.is_verified || false,
    channelAvatar: avatarUrl || undefined,
    views: formatViews(nft.views || nft.view_count || 0),
    uploadedAgo: formatTimeAgo(nft.createdAt || nft.created_at),
    duration: formatDuration(duration),
    videoUrl: isAudioPost ? undefined : buildVideoUrl(tokenId),
    audioUrl,
    audioDuration: isAudioPost ? (typeof duration === 'number' ? duration : 0) : undefined,
    isAudio: isAudioPost,
    isPPV: nft.is_ppv,
    ppvPrice: nft.ppv_price,
    ppvCurrency: nft.ppv_currency,
    isW2E: nft.is_w2e,
    isLocked: nft.is_locked,
    creatorUsername: nft.mintername || nft.creator?.username,
    creatorId: minterAddress,
    chainId: nft.chainId,
  };
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function EmptyState({ type }: { type: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Music className="w-12 h-12 text-zinc-600 mb-4" />
      <h3 className="text-white font-semibold mb-2">No {type} yet</h3>
      <p className="text-zinc-500 text-sm max-w-[280px]">
        Music content will appear here once creators start uploading.
      </p>
    </div>
  );
}

function SectionHeader({ icon: Icon, title, count, onSeeAll }: { 
  icon: typeof Music; 
  title: string; 
  count?: number;
  onSeeAll?: () => void;
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h3 className="font-bold text-white flex items-center gap-2">
        <Icon className="w-5 h-5" />
        {title}
        {count !== undefined && count > 0 && (
          <span className="text-zinc-500 font-normal text-sm">({count})</span>
        )}
      </h3>
      {onSeeAll && (
        <button 
          onClick={onSeeAll}
          className="text-zinc-400 text-sm hover:text-white flex items-center gap-1"
        >
          See all <ChevronRight className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

function RadioCarousel({ stations, onSeeAll }: { stations: RadioStation[]; onSeeAll: () => void }) {
  if (stations.length === 0) {
    return (
      <div>
        <SectionHeader icon={Radio} title="Radio Stations" />
        <p className="text-zinc-500 text-sm">Loading stations...</p>
      </div>
    );
  }

  return (
    <div>
      <SectionHeader icon={Radio} title="Radio Stations" onSeeAll={onSeeAll} />
      <div className="relative">
        <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-black to-transparent pointer-events-none z-10" />
        <SwipeableCarousel className="flex gap-3 overflow-x-auto scrollbar-hide pr-8">
          {stations.slice(0, 10).map((station) => (
            <div key={station.stationuuid} className="flex-shrink-0 w-[280px]">
              <RadioStationCard station={station} />
            </div>
          ))}
        </SwipeableCarousel>
      </div>
    </div>
  );
}

// Inline playable video thumbnail card for carousel
function InlineVideoCard({ video, onSeeAll }: { video: VideoItem; onSeeAll: () => void }) {
  const instanceId = useId();
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(() => videoPlaybackManager.globalMuted);
  const videoRef = useRef<HTMLVideoElement>(null);
  const navigate = useNavigate();

  // Pause callback for the playback manager
  const pauseVideo = useCallback(() => {
    videoRef.current?.pause();
    setIsPlaying(false);
  }, []);

  // Register with playback manager
  useEffect(() => {
    videoPlaybackManager.register(instanceId, pauseVideo);
    return () => {
      videoPlaybackManager.unregister(instanceId);
    };
  }, [instanceId, pauseVideo]);

  const handlePlayClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isPlaying) {
      videoRef.current?.pause();
      setIsPlaying(false);
      videoPlaybackManager.stop(instanceId);
    } else {
      // Sync mute state from global manager
      const currentGlobalMuted = videoPlaybackManager.globalMuted;
      setIsMuted(currentGlobalMuted);
      if (videoRef.current) {
        videoRef.current.muted = currentGlobalMuted;
      }
      // Notify manager - this will pause any other playing video
      videoPlaybackManager.play(instanceId);
      videoRef.current?.play();
      setIsPlaying(true);
    }
  };

  const handleMuteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsMuted(!isMuted);
  };

  const handleContainerClick = () => {
    // If not playing, navigate to full view
    if (!isPlaying) {
      navigate(`/app/post/${video.id}`);
    }
  };

  const handleProfileClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Navigate to user profile using the actual username from API
    const username = video.creatorUsername?.replace('@', '') || video.channel?.replace('@', '') || '';
    if (username && username !== 'Anonymous') {
      navigate(`/${username}`);
    }
  };

  return (
    <div className="flex-shrink-0 w-[280px] text-left group">
      <div 
        onClick={handleContainerClick}
        className="aspect-video rounded-xl overflow-hidden bg-zinc-800 mb-2 relative cursor-pointer"
      >
        {/* Show video if playing, otherwise thumbnail */}
        {isPlaying && video.videoUrl ? (
          <video
            ref={videoRef}
            src={video.videoUrl}
            className="w-full h-full object-cover"
            muted={isMuted}
            playsInline
            autoPlay
            loop
            onEnded={() => setIsPlaying(false)}
          />
        ) : (
          <img 
            src={video.thumbnail} 
            alt="" 
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" 
          />
        )}
        
        {/* Play/Pause button overlay */}
        <button
          onClick={handlePlayClick}
          className={cn(
            "absolute inset-0 flex items-center justify-center transition-opacity bg-black/30",
            isPlaying ? "opacity-0 hover:opacity-100" : "opacity-0 group-hover:opacity-100"
          )}
        >
          <div className="w-12 h-12 rounded-xl bg-black/40 backdrop-blur-[24px] saturate-[180%] flex items-center justify-center border border-white/10">
            {isPlaying ? (
              <Pause className="w-6 h-6 text-white fill-white" />
            ) : (
              <Play className="w-6 h-6 text-white fill-white ml-0.5" />
            )}
          </div>
        </button>

        {/* Mute button when playing */}
        {isPlaying && (
          <button
            onClick={handleMuteClick}
            className="absolute bottom-2 right-2 w-8 h-8 rounded-lg bg-black/50 flex items-center justify-center z-10"
          >
            {isMuted ? (
              <VolumeX className="w-4 h-4 text-white" />
            ) : (
              <Volume2 className="w-4 h-4 text-white" />
            )}
          </button>
        )}

        {/* Duration badge */}
        {!isPlaying && video.duration && (
          <div className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-black/70 rounded text-xs text-white">
            {video.duration}
          </div>
        )}
      </div>
      
      {/* Title and channel info with avatar */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleProfileClick}
          onPointerDown={(e) => e.stopPropagation()}
          className="flex-shrink-0 cursor-pointer"
        >
          <img 
            src={video.channelAvatar} 
            alt={video.channel}
            className="w-8 h-8 rounded-xl object-cover hover:opacity-80 transition-opacity pointer-events-none"
          />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-white text-sm font-medium truncate">{video.title}</p>
          <button 
            onClick={handleProfileClick}
            className="text-zinc-500 text-xs hover:text-white transition-colors text-left"
          >
            {video.channel}
          </button>
        </div>
      </div>
    </div>
  );
}

function MusicVideosCarousel({ videos, totalCount, isLoading, onSeeAll }: { 
  videos: VideoItem[]; 
  totalCount: number;
  isLoading: boolean; 
  onSeeAll: () => void;
}) {
  const [visibleCount, setVisibleCount] = useState(CAROUSEL_INITIAL_VISIBLE);
  const scrollRef = useRef<HTMLDivElement>(null);
  
  // Progressive loading on scroll
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    
    // Check if scrolled near the end (within 100px of right edge)
    const scrollRight = el.scrollWidth - el.scrollLeft - el.clientWidth;
    if (scrollRight < 100 && visibleCount < videos.length) {
      setVisibleCount(prev => Math.min(prev + CAROUSEL_LOAD_MORE, videos.length));
    }
  }, [visibleCount, videos.length]);
  
  const visibleVideos = videos.slice(0, visibleCount);
  
  return (
    <div>
      <SectionHeader icon={Play} title="Music Videos" onSeeAll={videos.length > 0 ? onSeeAll : undefined} />
      {isLoading ? (
        <div className="flex gap-3 overflow-hidden pr-8">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="w-[280px] flex-shrink-0">
              <MusicVideoCardSkeleton />
            </div>
          ))}
        </div>
      ) : videos.length === 0 ? (
        <p className="text-zinc-500 text-sm">No music videos yet</p>
      ) : (
        <div className="relative">
          <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-black to-transparent pointer-events-none z-10" />
          <SwipeableCarousel 
            ref={scrollRef}
            onScroll={handleScroll}
            className="flex gap-3 overflow-x-auto scrollbar-hide pr-8"
          >
            {visibleVideos.map((video) => (
              <InlineVideoCard key={video.id} video={video} onSeeAll={onSeeAll} />
            ))}
            {visibleCount < videos.length && (
              <div className="flex-shrink-0 w-[280px] aspect-video rounded-xl bg-zinc-800 flex items-center justify-center">
                <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
              </div>
            )}
          </SwipeableCarousel>
        </div>
      )}
    </div>
  );
}

function AudioUploadsCarousel({ audioItems, isLoading }: { audioItems: VideoItem[]; isLoading: boolean }) {
  const [visibleCount, setVisibleCount] = useState(CAROUSEL_INITIAL_VISIBLE);
  const scrollRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const scrollRight = el.scrollWidth - el.scrollLeft - el.clientWidth;
    if (scrollRight < 100 && visibleCount < audioItems.length) {
      setVisibleCount(prev => Math.min(prev + CAROUSEL_LOAD_MORE, audioItems.length));
    }
  }, [visibleCount, audioItems.length]);

  const visibleItems = audioItems.slice(0, visibleCount);

  return (
    <div>
      <SectionHeader icon={Disc3} title="Audio Uploads" count={audioItems.length} />
      {isLoading ? (
        <div className="flex gap-3 overflow-hidden pr-8">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="w-[200px] flex-shrink-0">
              <div className="aspect-square rounded-xl bg-zinc-800 animate-pulse" />
              <div className="mt-2 h-3 bg-zinc-800 rounded w-3/4 animate-pulse" />
              <div className="mt-1 h-2.5 bg-zinc-800 rounded w-1/2 animate-pulse" />
            </div>
          ))}
        </div>
      ) : audioItems.length === 0 ? (
        <p className="text-zinc-500 text-sm">No audio uploads yet</p>
      ) : (
        <div className="relative">
          <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-black to-transparent pointer-events-none z-10" />
          <SwipeableCarousel
            ref={scrollRef}
            onScroll={handleScroll}
            className="flex gap-3 overflow-x-auto scrollbar-hide pr-8"
          >
            {visibleItems.map((item) => (
              <div
                key={item.id}
                className="flex-shrink-0 w-[200px] cursor-pointer group"
                onClick={() => navigate(`/app/post/${item.id}`)}
              >
                {/* Square thumbnail with liquid glass look */}
                <div className="aspect-square rounded-xl overflow-hidden bg-black/60 backdrop-blur-[24px] border border-white/[0.1] mb-2 relative">
                  {item.thumbnail ? (
                    <img src={item.thumbnail} alt="" className="w-full h-full object-cover opacity-60" />
                  ) : null}
                  {/* Centered headphone icon with listen count */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
                    <Headphones className="w-8 h-8 text-white/70" />
                    {item.views && (
                      <span className="text-white/60 text-xs font-medium">{item.views.replace(' views', '')}</span>
                    )}
                  </div>
                  {/* Hover play overlay */}
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="w-12 h-12 rounded-full bg-white/[0.08] border border-white/20 flex items-center justify-center">
                      <Play className="w-5 h-5 text-white ml-0.5" />
                    </div>
                  </div>
                  {item.duration && (
                    <div className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-black/70 rounded text-[10px] text-white">
                      {item.duration}
                    </div>
                  )}
                </div>
                <p className="text-white text-sm font-medium truncate">{item.title}</p>
                <p className="text-zinc-500 text-xs truncate">{item.channel}</p>
              </div>
            ))}
            {visibleCount < audioItems.length && (
              <div className="flex-shrink-0 w-[200px] aspect-square rounded-xl bg-zinc-800 flex items-center justify-center">
                <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
              </div>
            )}
          </SwipeableCarousel>
        </div>
      )}
    </div>
  );
}

function TracksCarousel() {
  return (
    <div>
      <SectionHeader icon={Disc3} title="Tracks" />
      <p className="text-zinc-500 text-sm">No tracks yet</p>
    </div>
  );
}

function PodcastsCarousel() {
  return (
    <div>
      <SectionHeader icon={Mic2} title="Podcasts" />
      <p className="text-zinc-500 text-sm">No podcasts yet</p>
    </div>
  );
}

// All Section with all subsections
function AllSection({ 
  radioStations, 
  musicVideos,
  totalVideoCount,
  isLoadingVideos,
  audioUploads,
  isLoadingAudio,
  onGoToRadio,
  onGoToVideos,
  onOpenStages,
}: { 
  radioStations: RadioStation[];
  musicVideos: VideoItem[];
  totalVideoCount: number;
  isLoadingVideos: boolean;
  audioUploads: VideoItem[];
  isLoadingAudio: boolean;
  onGoToRadio: () => void;
  onGoToVideos: () => void;
  onOpenStages: () => void;
}) {
  // Show full skeleton on initial load (no videos loaded yet and still fetching)
  if (isLoadingVideos && musicVideos.length === 0 && isLoadingAudio) {
    return <MusicFeedSkeleton />;
  }

  return (
    <div className="space-y-4 pb-32">
      <MusicVideosCarousel videos={musicVideos} totalCount={totalVideoCount} isLoading={isLoadingVideos} onSeeAll={onGoToVideos} />
      <RadioCarousel stations={radioStations} onSeeAll={onGoToRadio} />
      <AudioUploadsCarousel audioItems={audioUploads} isLoading={isLoadingAudio} />
      <StagesCarousel onOpenStages={onOpenStages} />
      <TracksCarousel />
      <PodcastsCarousel />
    </div>
  );
}

// Music Videos Section - Full list with infinite scroll
function MusicVideosSection({ walletAddress }: { walletAddress: string | null }) {
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const isFetchingRef = useRef(false);
  
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery({
    queryKey: ['music-videos-infinite', walletAddress],
    queryFn: async ({ pageParam = 1 }) => {
      // Use 'new' sort for variety, shuffle client-side for randomness
      const response = await searchNFTs({
        category: 'Music',
        postType: 'video',
        unit: VIDEOS_PAGE_SIZE,
        page: pageParam,
        sortMode: 'new',
      });
      // Filter out blocked creators
      const filteredData = (response.data || []).filter((nft: DeHubNFT) => !isBlockedCreator(nft));
      return {
        items: filteredData,
        nextPage: (response.data?.length ?? 0) >= VIDEOS_PAGE_SIZE ? pageParam + 1 : undefined,
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextPage,
    initialPageParam: 1,
    staleTime: 5 * 60 * 1000,
  });

  // Flatten pages to video items
  const videos = useMemo(() => {
    if (!data?.pages) return [];
    return data.pages.flatMap((page, pageIndex) => 
      page.items.map((nft, index) => mapNFTToVideoItem(nft, pageIndex * VIDEOS_PAGE_SIZE + index))
    );
  }, [data]);

  // Infinite scroll observer
  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting && hasNextPage && !isFetchingRef.current) {
          isFetchingRef.current = true;
          fetchNextPage().finally(() => {
            isFetchingRef.current = false;
          });
        }
      },
      { rootMargin: '200px' }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, fetchNextPage]);

  if (isLoading) {
    return (
      <div className="space-y-3 pb-32">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-white/[0.12] bg-white/[0.03] backdrop-blur-[24px] p-3">
            <MusicVideoCardSkeleton />
          </div>
        ))}
      </div>
    );
  }

  if (videos.length === 0) {
    return <EmptyState type="music videos" />;
  }

  return (
    <div className="space-y-3 pb-32">
      {videos.map((video) => (
        <div key={video.id} className="rounded-xl border border-white/[0.12] bg-white/[0.03] backdrop-blur-[24px] p-3">
          <VideoCard video={video} />
        </div>
      ))}
      
      {/* Infinite scroll trigger */}
      <div ref={loadMoreRef} className="h-10 flex items-center justify-center">
        {isFetchingNextPage && (
          <div className="w-6 h-6 border-2 border-zinc-600 border-t-white rounded-full animate-spin" />
        )}
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

interface MusicFeedProps {
  showFilters?: boolean;
  isRefreshing?: boolean;
  refreshKey?: number;
}

export function MusicFeed({ showFilters = false, isRefreshing = false }: MusicFeedProps) {
  const [activeSubTab, setActiveSubTab] = useState<MusicSubTab>('all');
  const { layerRef: musicSubTabLayerRef, setRef: setMusicSubTabRef, rect: musicSubTabRect, onScroll: onMusicSubTabScroll } = useTabIndicator(activeSubTab);
  const [showStagesModal, setShowStagesModal] = useState(false);
  const { walletAddress, isAuthenticated } = useAuth();

  // Fetch dynamic block list for authenticated users
  const { data: blockList } = useQuery({
    queryKey: ['block-list'],
    queryFn: getBlockList,
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  const blockedAddresses = useMemo(() => {
    if (!blockList?.length) return undefined;
    return new Set(blockList.map(u => u.address.toLowerCase()));
  }, [blockList]);

  // Fetch curated radio stations for carousel
  const { data: radioStations = [] } = useQuery({
    queryKey: ['radio-stations-curated'],
    queryFn: () => getCuratedCarouselStations(),
    staleTime: 10 * 60 * 1000,
  });

  // Fetch music-categorized videos for carousel - randomized
  const { data: carouselVideosData, isLoading: isLoadingCarouselVideos } = useQuery({
    queryKey: ['music-videos-carousel', walletAddress],
    queryFn: async () => {
      // Fetch API music videos
      const response = await searchNFTs({
        category: 'Music',
        postType: 'video',
        unit: 50,
        sortMode: 'popular',
      });
      
      // Fetch manually tagged music tokens
      const manualTokenPromises = MANUAL_MUSIC_TOKEN_IDS.map(tokenId => 
        getNFTInfo(String(tokenId)).catch(() => null)
      );
      const manualTokens = (await Promise.all(manualTokenPromises)).filter(Boolean) as DeHubNFT[];
      
      // Merge: manual tokens first (so they appear at the front), then API results
      // Filter out any duplicates (same tokenId) and blocked creators
      const apiTokenIds = new Set(manualTokens.map(t => t.tokenId));
      const filteredApiResults = (response.data || [])
        .filter((nft: DeHubNFT) => !isBlockedCreator(nft, blockedAddresses) && !apiTokenIds.has(nft.tokenId));
      
      return [...manualTokens.filter(nft => !isBlockedCreator(nft, blockedAddresses)), ...filteredApiResults];
    },
    staleTime: 5 * 60 * 1000,
  });

  // Fetch audio uploads for carousel (try both postType values)
  const { data: audioUploadsData, isLoading: isLoadingAudio } = useQuery({
    queryKey: ['music-audio-uploads', walletAddress],
    queryFn: async () => {
      const [audioRes, feedAudioRes] = await Promise.all([
        searchNFTs({ postType: 'audio', unit: 50, sortMode: 'new' }).catch(() => ({ data: [] })),
        searchNFTs({ postType: 'feed-audio', unit: 50, sortMode: 'new' }).catch(() => ({ data: [] })),
      ]);
      // Merge and dedupe by tokenId
      const seen = new Set<string | number>();
      const merged: DeHubNFT[] = [];
      for (const nft of [...(audioRes.data || []), ...(feedAudioRes.data || [])]) {
        const tid = nft.tokenId || nft.id || nft.token_id;
        if (seen.has(tid)) continue;
        seen.add(tid);
        if (!isBlockedCreator(nft, blockedAddresses)) merged.push(nft);
      }
      return merged;
    },
    staleTime: 5 * 60 * 1000,
  });

  const audioUploads = useMemo(() => {
    if (!audioUploadsData) return [];
    return audioUploadsData.map((nft, index) => {
      const item = mapNFTToVideoItem(nft, index);
      return { ...item, isAudio: true };
    });
  }, [audioUploadsData]);

  // Shuffle and map to VideoItem for carousel - randomized on each mount
  const carouselVideos = useMemo(() => {
    if (!carouselVideosData) return [];
    // Fisher-Yates shuffle
    const shuffled = [...carouselVideosData];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.map((nft, index) => mapNFTToVideoItem(nft, index));
  }, [carouselVideosData]);

  const getEmptyLabel = () => {
    switch (activeSubTab) {
      case 'tracks': return 'tracks';
      case 'videos': return 'music videos';
      case 'podcasts': return 'podcasts';
      default: return 'music content';
    }
  };

  if (isRefreshing) {
    return (
      <div className="p-2 sm:p-3">
        <MusicFeedSkeleton />
      </div>
    );
  }

  const renderContent = () => {
    switch (activeSubTab) {
      case 'all':
        return (
          <AllSection 
            radioStations={radioStations} 
            musicVideos={carouselVideos}
            totalVideoCount={carouselVideosData?.length || 0}
            isLoadingVideos={isLoadingCarouselVideos}
            audioUploads={audioUploads}
            isLoadingAudio={isLoadingAudio}
            onGoToRadio={() => setActiveSubTab('radio')}
            onGoToVideos={() => setActiveSubTab('videos')}
            onOpenStages={() => setShowStagesModal(true)}
          />
        );
      case 'videos':
        return <MusicVideosSection walletAddress={walletAddress} />;
      case 'radio':
        return <RadioSection showFilters={showFilters} />;
      case 'stages':
        return (
          <div className="pb-32">
            <StagesCarousel onOpenStages={() => setShowStagesModal(true)} />
          </div>
        );
      case 'tracks':
      case 'podcasts':
      default:
        return <EmptyState type={getEmptyLabel()} />;
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-2.75rem)] lg:h-[calc(100vh-0rem)]">
      {/* Sub-tab Navigation - Only shown when filters toggled */}
      <AnimatePresence mode="wait">
        {showFilters && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex-shrink-0 px-2 sm:px-3 pb-2 bg-black overflow-y-clip overflow-x-visible"
          >
            <div ref={musicSubTabLayerRef} className="relative overflow-visible">
              <GlassIndicator rect={musicSubTabRect} borderRadius="0.5rem" />
              <div className="relative z-20 flex gap-1.5 overflow-x-auto scrollbar-hide pl-1 py-1" onScroll={onMusicSubTabScroll}>
                {MUSIC_SUB_TABS.map((tab) => {
                  const isActive = activeSubTab === tab.value;
                  return (
                    <button
                      key={tab.value}
                      ref={setMusicSubTabRef(tab.value)}
                      onClick={() => setActiveSubTab(tab.value)}
                      className={cn(
                        'relative z-40 flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors text-xs whitespace-nowrap font-medium',
                        isActive ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'
                      )}
                    >
                      <span className="relative z-10 flex items-center gap-1.5">
                        {tab.icon ? (
                          <tab.icon className="w-3.5 h-3.5" />
                        ) : tab.customIcon ? (
                          <img src={tab.customIcon} alt="" className="w-3.5 h-3.5 object-contain" />
                        ) : null}
                        {tab.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Content - Scrollable */}
      <div className="flex-1 overflow-y-auto px-2 sm:px-3">
        {renderContent()}
      </div>

      {/* Stages Modal */}
      <AudioSpacesModal 
        isOpen={showStagesModal} 
        onClose={() => setShowStagesModal(false)} 
      />
    </div>
  );
}
