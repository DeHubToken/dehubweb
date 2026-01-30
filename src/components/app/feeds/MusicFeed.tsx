/**
 * Music Feed Component
 * ====================
 * Displays music/audio uploads, music videos, and radio in the main feed.
 * 
 * @module components/app/feeds/MusicFeed
 */

import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, Music, Mic2, Radio, Disc3, Loader2, ChevronRight } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { RadioSection } from '@/components/app/radio';
import { RadioStationCard } from '@/components/app/radio/RadioStationCard';
import { SwipeableCarousel } from '@/components/app/SwipeableCarousel';
import { VideoCard } from '@/components/app/cards/VideoCard';
import { searchNFTs, getMediaUrl, type DeHubNFT } from '@/lib/api/dehub';
import { buildAvatarUrl } from '@/lib/media-url';
import { getStationsByGenre, type RadioStation } from '@/lib/api/radio-browser';
import { useAuth } from '@/contexts/AuthContext';
import type { VideoItem } from '@/types/feed.types';

// ============================================================================
// TYPES
// ============================================================================

type MusicSubTab = 'all' | 'tracks' | 'videos' | 'podcasts' | 'radio';

const MUSIC_SUB_TABS: { icon: typeof Music; label: string; value: MusicSubTab }[] = [
  { icon: Music, label: 'All', value: 'all' },
  { icon: Disc3, label: 'Tracks', value: 'tracks' },
  { icon: Play, label: 'Videos', value: 'videos' },
  { icon: Mic2, label: 'Podcasts', value: 'podcasts' },
  { icon: Radio, label: 'Radio', value: 'radio' },
];

// ============================================================================
// HELPERS
// ============================================================================

function formatDuration(seconds?: number): string {
  if (!seconds) return '0:00';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

function formatViews(count?: number): string {
  if (!count) return '0 views';
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M views`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K views`;
  return `${count} views`;
}

function formatTimeAgo(dateString?: string): string {
  if (!dateString) return 'Just now';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return 'Just now';
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  if (diffMs < 0) return 'Just now';
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;
  return `${Math.floor(diffDays / 7)}w`;
}

function mapNFTToVideoItem(nft: DeHubNFT, index: number): VideoItem {
  const minterAddress = nft.minter || nft.creator?.id || '';
  const rawAvatarUrl = nft.minterAvatarUrl || nft.creator?.avatar_url;
  // Always use buildAvatarUrl - it handles all URL formats including api.dehub.io → CDN conversion
  const avatarUrl = minterAddress && rawAvatarUrl 
    ? buildAvatarUrl(minterAddress, rawAvatarUrl) 
    : undefined;

  return {
    id: String(nft.tokenId || nft.id || nft.token_id || index),
    type: 'video',
    thumbnail: getMediaUrl(nft.imageUrl) || getMediaUrl(nft.thumbnail_url) || '',
    title: nft.name || nft.title || nft.description || 'Untitled',
    channel: nft.minterDisplayName || nft.mintername || nft.creator?.username || 'Anonymous',
    verified: nft.creator?.is_verified || false,
    channelAvatar: avatarUrl || `https://api.dicebear.com/7.x/identicon/svg?seed=${minterAddress}`,
    views: formatViews(nft.views || nft.view_count || 0),
    uploadedAgo: formatTimeAgo(nft.createdAt || nft.created_at),
    duration: formatDuration(nft.duration),
    videoUrl: getMediaUrl(nft.videoUrl) || getMediaUrl(nft.media_url),
    isPPV: nft.is_ppv,
    ppvPrice: nft.ppv_price,
    ppvCurrency: nft.ppv_currency,
    isW2E: nft.is_w2e,
    isLocked: nft.is_locked,
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
      <div className="bg-zinc-900 rounded-2xl p-4">
        <SectionHeader icon={Radio} title="Radio Stations" />
        <p className="text-zinc-500 text-sm">Loading stations...</p>
      </div>
    );
  }

  return (
    <div className="bg-zinc-900 rounded-2xl p-4">
      {/* Show 50,000+ as the count since that's the radio browser database size */}
      <SectionHeader icon={Radio} title="Radio Stations" count={50000} onSeeAll={onSeeAll} />
      <div className="relative">
        <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-zinc-900 to-transparent pointer-events-none z-10" />
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

function MusicVideosCarousel({ videos, onSeeAll }: { videos: VideoItem[]; onSeeAll: () => void }) {
  const navigate = useNavigate();
  
  return (
    <div className="bg-zinc-900 rounded-2xl p-4">
      <SectionHeader icon={Play} title="Music Videos" count={videos.length} onSeeAll={videos.length > 0 ? onSeeAll : undefined} />
      {videos.length === 0 ? (
        <p className="text-zinc-500 text-sm">No music videos yet</p>
      ) : (
        <div className="relative">
          <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-zinc-900 to-transparent pointer-events-none z-10" />
          <SwipeableCarousel className="flex gap-3 overflow-x-auto scrollbar-hide pr-8">
            {videos.slice(0, 10).map((video) => (
              <button 
                key={video.id} 
                onClick={() => navigate(`/app/post/${video.id}`)}
                className="flex-shrink-0 w-[280px] text-left group cursor-pointer"
              >
                <div className="aspect-video rounded-xl overflow-hidden bg-zinc-800 mb-2 relative">
                  <img src={video.thumbnail} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                  {/* Play button overlay */}
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
                    <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                      <Play className="w-6 h-6 text-white fill-white" />
                    </div>
                  </div>
                </div>
                <p className="text-white text-sm font-medium truncate">{video.title}</p>
                <p className="text-zinc-500 text-xs">{video.channel}</p>
              </button>
            ))}
          </SwipeableCarousel>
        </div>
      )}
    </div>
  );
}

function TracksCarousel() {
  return (
    <div className="bg-zinc-900 rounded-2xl p-4">
      <SectionHeader icon={Disc3} title="Tracks" />
      <p className="text-zinc-500 text-sm">No tracks yet</p>
    </div>
  );
}

function PodcastsCarousel() {
  return (
    <div className="bg-zinc-900 rounded-2xl p-4">
      <SectionHeader icon={Mic2} title="Podcasts" />
      <p className="text-zinc-500 text-sm">No podcasts yet</p>
    </div>
  );
}

// All Section with all subsections
function AllSection({ 
  radioStations, 
  musicVideos, 
  onGoToRadio,
  onGoToVideos,
}: { 
  radioStations: RadioStation[];
  musicVideos: VideoItem[];
  onGoToRadio: () => void;
  onGoToVideos: () => void;
}) {
  return (
    <div className="space-y-4 pb-32">
      <MusicVideosCarousel videos={musicVideos} onSeeAll={onGoToVideos} />
      <RadioCarousel stations={radioStations} onSeeAll={onGoToRadio} />
      <TracksCarousel />
      <PodcastsCarousel />
    </div>
  );
}

// Music Videos Section - Full list
function MusicVideosSection({ videos, isLoading }: { videos: VideoItem[]; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 text-white animate-spin" />
      </div>
    );
  }

  if (videos.length === 0) {
    return <EmptyState type="music videos" />;
  }

  return (
    <div className="space-y-3 pb-32">
      {videos.map((video) => (
        <VideoCard key={video.id} video={video} />
      ))}
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
  const { walletAddress } = useAuth();

  // Fetch radio stations for carousel
  const { data: radioStations = [] } = useQuery({
    queryKey: ['radio-stations-top'],
    queryFn: () => getStationsByGenre('top', 20),
    staleTime: 5 * 60 * 1000,
  });

  // Fetch music-categorized videos
  const { data: musicVideosData, isLoading: isLoadingVideos } = useQuery({
    queryKey: ['music-videos', walletAddress],
    queryFn: async () => {
      const response = await searchNFTs({
        category: 'Music',
        postType: 'video',
        unit: 50,
        sortMode: 'popular',
        address: walletAddress || undefined,
      });
      return response.data || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  // Map to VideoItem
  const musicVideos = useMemo(() => {
    if (!musicVideosData) return [];
    return musicVideosData.map((nft, index) => mapNFTToVideoItem(nft, index));
  }, [musicVideosData]);

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
      <div className="p-2 sm:p-3 flex items-center justify-center py-32">
        <Loader2 className="w-10 h-10 text-white animate-spin" />
      </div>
    );
  }

  const renderContent = () => {
    switch (activeSubTab) {
      case 'all':
        return (
          <AllSection 
            radioStations={radioStations} 
            musicVideos={musicVideos}
            onGoToRadio={() => setActiveSubTab('radio')}
            onGoToVideos={() => setActiveSubTab('videos')}
          />
        );
      case 'videos':
        return <MusicVideosSection videos={musicVideos} isLoading={isLoadingVideos} />;
      case 'radio':
        return <RadioSection showFilters={showFilters} />;
      case 'tracks':
      case 'podcasts':
      default:
        return <EmptyState type={getEmptyLabel()} />;
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-2.75rem)] lg:h-[calc(100vh-0rem)]">
      {/* Sub-tab Navigation - Fixed at top */}
      <div className="flex-shrink-0 px-2 sm:px-3 pb-2 bg-black">
        <div className="bg-zinc-900 rounded-2xl p-2">
          <div className="flex gap-1 sm:gap-2 overflow-x-auto scrollbar-hide">
            {MUSIC_SUB_TABS.map((tab) => (
              <button
                key={tab.value}
                onClick={() => setActiveSubTab(tab.value)}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 px-3 sm:px-4 py-2 rounded-xl transition-colors text-sm whitespace-nowrap text-white',
                  activeSubTab === tab.value && 'bg-zinc-800'
                )}
              >
                <tab.icon className="w-4 h-4" />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content - Scrollable */}
      <div className="flex-1 overflow-y-auto px-2 sm:px-3">
        {renderContent()}
      </div>
    </div>
  );
}
