/**
 * Live Feed Component
 * ===================
 * Displays live streams using the universal LiveCard component.
 * Uses centralized mock data and shared utilities.
 * 
 * @module components/app/feeds/LiveFeed
 */

import { Loader2 } from 'lucide-react';
import minecraftCategory from '@/assets/minecraft-category.png';
import codCategory from '@/assets/cod-category.png';
import gtaCategory from '@/assets/gta-category.png';
import fortniteCategory from '@/assets/fortnite-category.png';
import valorantCategory from '@/assets/valorant-category.png';
import leagueCategory from '@/assets/league-category.png';
import apexCategory from '@/assets/apex-category.png';
import justchattingCategory from '@/assets/justchatting-category.png';
import { LiveCard } from '@/components/app/cards';
import type { LiveStream } from '@/types/feed.types';

const MOCK_STREAMS: LiveStream[] = [
  {
    id: 'live-1',
    type: 'live',
    streamer: 'Ninja',
    avatar: 'ninja',
    title: '🔴 LIVE - Grinding Ranked! Road to Champion',
    game: 'Fortnite',
    viewers: '45.2K',
    thumbnail: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=480&h=270&fit=crop',
    tags: ['English', 'Competitive', 'Ranked'],
    isLive: true,
  },
  {
    id: 'live-2',
    type: 'live',
    streamer: 'Pokimane',
    avatar: 'poki',
    title: 'Chill stream with chat 💜 !socials',
    game: 'Just Chatting',
    viewers: '32.1K',
    thumbnail: 'https://images.unsplash.com/photo-1614680376593-902f74cf0d41?w=480&h=270&fit=crop',
    tags: ['English', 'Chill', 'Chat'],
    isLive: true,
  },
  {
    id: 'live-3',
    type: 'live',
    streamer: 'xQc',
    avatar: 'xqc',
    title: 'REACT ANDY TODAY | !youtube',
    game: 'Just Chatting',
    viewers: '89.5K',
    thumbnail: 'https://images.unsplash.com/photo-1560253023-3ec5d502959f?w=480&h=270&fit=crop',
    tags: ['English', 'Variety'],
    isLive: true,
  },
  {
    id: 'live-4',
    type: 'live',
    streamer: 'Shroud',
    avatar: 'shroud',
    title: 'Late night gaming session',
    game: 'Valorant',
    viewers: '28.7K',
    thumbnail: 'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?w=480&h=270&fit=crop',
    tags: ['English', 'FPS', 'Pro Player'],
    isLive: true,
  },
  {
    id: 'live-5',
    type: 'live',
    streamer: 'HasanAbi',
    avatar: 'hasan',
    title: 'News & Politics | Reacting to everything',
    game: 'Just Chatting',
    viewers: '41.3K',
    thumbnail: 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=480&h=270&fit=crop',
    tags: ['English', 'Politics', 'News'],
    isLive: true,
  },
  {
    id: 'live-6',
    type: 'live',
    streamer: 'Summit1g',
    avatar: 'summit',
    title: 'GTA RP - New storyline today!',
    game: 'Grand Theft Auto V',
    viewers: '22.8K',
    thumbnail: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?w=480&h=270&fit=crop',
    tags: ['English', 'Roleplay'],
    isLive: true,
  },
];

const CATEGORIES = [
  { name: 'Just Chatting', viewers: '412K', image: justchattingCategory },
  { name: 'Fortnite', viewers: '189K', image: fortniteCategory },
  { name: 'Valorant', viewers: '156K', image: valorantCategory },
  { name: 'Minecraft', viewers: '134K', image: minecraftCategory },
  { name: 'League of Legends', viewers: '298K', image: leagueCategory },
  { name: 'Call of Duty', viewers: '167K', image: codCategory },
  { name: 'GTA V', viewers: '145K', image: gtaCategory },
  { name: 'Apex Legends', viewers: '112K', image: apexCategory },
  { name: 'Music', viewers: '89K', image: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=100&h=130&fit=crop' },
  { name: 'Art', viewers: '67K', image: 'https://images.unsplash.com/photo-1460661419201-fd4cecdf8a8b?w=100&h=130&fit=crop' },
];

interface LiveFeedProps {
  isRefreshing?: boolean;
}

export function LiveFeed({ isRefreshing = false }: LiveFeedProps) {
  if (isRefreshing) {
    return (
      <div className="p-2 sm:p-3">
        <div className="flex items-center justify-center py-32">
          <Loader2 className="w-10 h-10 text-white animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-2 sm:p-3 space-y-4">
      {/* Live Channels */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="font-bold text-white flex items-center gap-2">
            <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            Live Channels
          </h2>
          <button className="text-red-400 text-sm hover:underline">Show All</button>
        </div>

        {MOCK_STREAMS.map((stream) => (
          <LiveCard key={stream.id} stream={stream} />
        ))}
      </div>

      {/* Categories */}
      <div className="bg-zinc-900 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-white">Categories</h2>
          <button className="text-red-400 text-sm hover:underline">Show All</button>
        </div>
        <div className="relative">
          {/* Left fade */}
          <div className="absolute left-0 top-0 bottom-0 w-6 bg-gradient-to-r from-zinc-900 to-transparent pointer-events-none z-10" />
          {/* Right fade */}
          <div className="absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-zinc-900 to-transparent pointer-events-none z-10" />
          
          <div className="flex gap-3 overflow-x-auto scrollbar-hide px-1">
            {CATEGORIES.map((cat) => (
              <div key={cat.name} className="flex-shrink-0 cursor-pointer group">
                <div className="w-[90px] aspect-[3/4] rounded-lg overflow-hidden mb-2">
                  <img src={cat.image} alt="" className="w-full h-full object-cover" />
                </div>
                <p className="text-white text-sm font-medium truncate w-[90px]">{cat.name}</p>
                <p className="text-zinc-500 text-xs">{cat.viewers} viewers</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
