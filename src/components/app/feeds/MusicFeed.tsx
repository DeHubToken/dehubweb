/**
 * Music Feed Component
 * ====================
 * Displays music/audio uploads and music videos in the main feed.
 * 
 * @module components/app/feeds/MusicFeed
 */

import { useState, useMemo } from 'react';
import { Play, Music, Mic2, Radio, Disc3, Loader2 } from 'lucide-react';
import { VideoCard } from '@/components/app/cards/VideoCard';
import { VerifiedBadge } from '@/components/app/VerifiedBadge';
import { cn } from '@/lib/utils';
import type { VideoItem } from '@/types/feed.types';

// ============================================================================
// MOCK DATA
// ============================================================================

const MUSIC_VIDEOS: VideoItem[] = [
  {
    id: 'mv-1',
    type: 'video',
    thumbnail: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=800',
    duration: '4:32',
    title: 'Midnight Dreams - Official Music Video',
    channel: 'Luna Eclipse',
    channelAvatar: '@lunaeclipse',
    verified: true,
    views: '2.4M',
    uploadedAgo: '3 days ago',
    likeCount: 45200,
    dislikeCount: 320,
    commentCount: 1240,
  },
  {
    id: 'mv-2',
    type: 'video',
    thumbnail: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=800',
    duration: '3:45',
    title: 'Electric Soul (Live Performance)',
    channel: 'The Voltage',
    channelAvatar: '@thevoltage',
    verified: true,
    views: '892K',
    uploadedAgo: '1 week ago',
    likeCount: 12300,
    dislikeCount: 89,
    commentCount: 456,
  },
  {
    id: 'mv-3',
    type: 'video',
    thumbnail: 'https://images.unsplash.com/photo-1514320291840-2e0a9bf2a9ae?w=800',
    duration: '5:12',
    title: 'Neon Nights - Visualizer',
    channel: 'SynthWave Collective',
    channelAvatar: '@synthwave',
    verified: false,
    views: '456K',
    uploadedAgo: '2 weeks ago',
    likeCount: 8900,
    dislikeCount: 45,
    commentCount: 234,
  },
  {
    id: 'mv-4',
    type: 'video',
    thumbnail: 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=800',
    duration: '3:28',
    title: 'Summer Vibes - Beach Sessions',
    channel: 'Coastal Beats',
    channelAvatar: '@coastalbeats',
    verified: true,
    views: '1.2M',
    uploadedAgo: '5 days ago',
    likeCount: 28700,
    dislikeCount: 156,
    commentCount: 892,
  },
  {
    id: 'mv-5',
    type: 'video',
    thumbnail: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=800',
    duration: '4:15',
    title: 'Underground Sessions Vol. 3',
    channel: 'DJ Phantom',
    channelAvatar: '@djphantom',
    verified: true,
    views: '678K',
    uploadedAgo: '1 day ago',
    likeCount: 15600,
    dislikeCount: 78,
    commentCount: 567,
  },
];

interface AudioTrack {
  id: string;
  title: string;
  artist: string;
  artistHandle: string;
  verified: boolean;
  duration: string;
  plays: string;
  coverArt: string;
  uploadedAgo: string;
}

const AUDIO_TRACKS: AudioTrack[] = [
  {
    id: 'audio-1',
    title: 'Lost in the Echo',
    artist: 'Nova Pulse',
    artistHandle: '@novapulse',
    verified: true,
    duration: '3:42',
    plays: '1.8M plays',
    coverArt: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=400',
    uploadedAgo: '2 days ago',
  },
  {
    id: 'audio-2',
    title: 'Digital Dreams',
    artist: 'Cyber Wave',
    artistHandle: '@cyberwave',
    verified: false,
    duration: '4:18',
    plays: '456K plays',
    coverArt: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400',
    uploadedAgo: '1 week ago',
  },
  {
    id: 'audio-3',
    title: 'Midnight Runner',
    artist: 'The Neon Kings',
    artistHandle: '@neonkings',
    verified: true,
    duration: '3:55',
    plays: '2.3M plays',
    coverArt: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400',
    uploadedAgo: '3 days ago',
  },
  {
    id: 'audio-4',
    title: 'Starlight Serenade',
    artist: 'Aurora Sound',
    artistHandle: '@aurorasound',
    verified: true,
    duration: '5:02',
    plays: '892K plays',
    coverArt: 'https://images.unsplash.com/photo-1514320291840-2e0a9bf2a9ae?w=400',
    uploadedAgo: '4 days ago',
  },
  {
    id: 'audio-5',
    title: 'Bass Drop',
    artist: 'Heavy Frequency',
    artistHandle: '@heavyfreq',
    verified: false,
    duration: '3:21',
    plays: '345K plays',
    coverArt: 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=400',
    uploadedAgo: '6 days ago',
  },
  {
    id: 'audio-6',
    title: 'Ocean Breeze',
    artist: 'Chill Masters',
    artistHandle: '@chillmasters',
    verified: true,
    duration: '4:45',
    plays: '1.1M plays',
    coverArt: 'https://images.unsplash.com/photo-1507838153414-b4b713384a76?w=400',
    uploadedAgo: '1 day ago',
  },
  {
    id: 'audio-7',
    title: 'Urban Jungle',
    artist: 'Street Beats',
    artistHandle: '@streetbeats',
    verified: false,
    duration: '3:38',
    plays: '567K plays',
    coverArt: 'https://images.unsplash.com/photo-1571330735066-03aaa9429d89?w=400',
    uploadedAgo: '5 days ago',
  },
  {
    id: 'audio-8',
    title: 'Sunset Boulevard',
    artist: 'Golden Hour',
    artistHandle: '@goldenhour',
    verified: true,
    duration: '4:12',
    plays: '789K plays',
    coverArt: 'https://images.unsplash.com/photo-1487180144351-b8472da7d491?w=400',
    uploadedAgo: '2 weeks ago',
  },
];

// ============================================================================
// COMPONENTS
// ============================================================================

type MusicSubTab = 'all' | 'tracks' | 'videos' | 'podcasts' | 'live';

const MUSIC_SUB_TABS: { icon: typeof Music; label: string; value: MusicSubTab }[] = [
  { icon: Music, label: 'All', value: 'all' },
  { icon: Disc3, label: 'Tracks', value: 'tracks' },
  { icon: Play, label: 'Videos', value: 'videos' },
  { icon: Mic2, label: 'Podcasts', value: 'podcasts' },
  { icon: Radio, label: 'Live', value: 'live' },
];

function AudioTrackCard({ track }: { track: AudioTrack }) {
  return (
    <div className="bg-zinc-900 rounded-2xl p-3 sm:p-4 flex gap-3 sm:gap-4 items-center hover:bg-zinc-800/80 transition-colors cursor-pointer">
      {/* Cover Art */}
      <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden flex-shrink-0">
        <img 
          src={track.coverArt} 
          alt={track.title}
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
          <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
            <Play className="w-5 h-5 text-white fill-white" />
          </div>
        </div>
      </div>
      
      {/* Track Info */}
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-white truncate">{track.title}</h3>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-zinc-400 text-sm truncate">{track.artist}</span>
          {track.verified && <VerifiedBadge className="w-3.5 h-3.5" />}
        </div>
        <div className="flex items-center gap-2 mt-1 text-xs text-zinc-500">
          <span>{track.plays}</span>
          <span>•</span>
          <span>{track.uploadedAgo}</span>
        </div>
      </div>
      
      {/* Duration */}
      <div className="text-zinc-400 text-sm font-medium">
        {track.duration}
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

export function MusicFeed({ showFilters = false, isRefreshing = false, refreshKey = 0 }: MusicFeedProps) {
  const [activeSubTab, setActiveSubTab] = useState<MusicSubTab>('all');

  // Shuffle content on refresh
  const shuffledVideos = useMemo(() => {
    const shuffled = [...MUSIC_VIDEOS];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor((Math.abs(Math.sin(refreshKey + i)) * (i + 1)));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }, [refreshKey]);

  const shuffledTracks = useMemo(() => {
    const shuffled = [...AUDIO_TRACKS];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor((Math.abs(Math.sin(refreshKey + i + 100)) * (i + 1)));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }, [refreshKey]);

  const renderContent = () => {
    switch (activeSubTab) {
      case 'tracks':
        return (
          <div className="space-y-2 sm:space-y-3">
            {shuffledTracks.map((track) => (
              <AudioTrackCard key={track.id} track={track} />
            ))}
          </div>
        );
      case 'videos':
        return (
          <div className="space-y-2 sm:space-y-3">
            {shuffledVideos.map((video) => (
              <VideoCard key={video.id} video={video} />
            ))}
          </div>
        );
      case 'podcasts':
        return (
          <div className="space-y-2 sm:space-y-3">
            {shuffledTracks.slice(0, 5).map((track, i) => (
              <AudioTrackCard 
                key={`podcast-${track.id}`} 
                track={{
                  ...track,
                  id: `podcast-${track.id}`,
                  title: `Episode ${i + 1}: ${track.title}`,
                  duration: `${45 + i * 12}:00`,
                  plays: `${Math.floor(Math.random() * 500) + 100}K plays`,
                }} 
              />
            ))}
          </div>
        );
      case 'live':
        return (
          <div className="space-y-2 sm:space-y-3">
            {shuffledVideos.slice(0, 3).map((video, i) => (
              <VideoCard 
                key={`live-${video.id}`} 
                video={{
                  ...video,
                  id: `live-${video.id}`,
                  title: `🔴 LIVE: ${video.title}`,
                  views: `${Math.floor(Math.random() * 10) + 1}.${Math.floor(Math.random() * 9)}K watching`,
                  uploadedAgo: 'Live now',
                }} 
              />
            ))}
          </div>
        );
      default:
        // All - mixed content
        return (
          <div className="space-y-2 sm:space-y-3">
            {/* Featured Music Videos */}
            <div className="mb-4">
              <h3 className="text-white font-semibold mb-3 px-1">Featured Music Videos</h3>
              <div className="space-y-2 sm:space-y-3">
                {shuffledVideos.slice(0, 3).map((video) => (
                  <VideoCard key={video.id} video={video} />
                ))}
              </div>
            </div>
            
            {/* Audio Tracks */}
            <div>
              <h3 className="text-white font-semibold mb-3 px-1">Trending Tracks</h3>
              <div className="space-y-2 sm:space-y-3">
                {shuffledTracks.slice(0, 5).map((track) => (
                  <AudioTrackCard key={track.id} track={track} />
                ))}
              </div>
            </div>
            
            {/* More Videos */}
            <div>
              <h3 className="text-white font-semibold mb-3 px-1">More Videos</h3>
              <div className="space-y-2 sm:space-y-3">
                {shuffledVideos.slice(3).map((video) => (
                  <VideoCard key={video.id} video={video} />
                ))}
              </div>
            </div>
            
            {/* More Tracks */}
            <div>
              <h3 className="text-white font-semibold mb-3 px-1">New Releases</h3>
              <div className="space-y-2 sm:space-y-3">
                {shuffledTracks.slice(5).map((track) => (
                  <AudioTrackCard key={track.id} track={track} />
                ))}
              </div>
            </div>
          </div>
        );
    }
  };

  if (isRefreshing) {
    return (
      <div className="p-2 sm:p-3 flex items-center justify-center py-32">
        <Loader2 className="w-10 h-10 text-white animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-2 sm:p-3">
      {/* Sub-tab Navigation (only shown when filters toggled) */}
      {showFilters && (
        <div className="bg-zinc-900 rounded-2xl p-2 mb-3">
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
      )}

      {/* Content */}
      {renderContent()}
    </div>
  );
}
