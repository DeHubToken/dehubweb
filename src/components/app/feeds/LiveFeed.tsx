/**
 * Live Feed Component
 * ===================
 * Displays live streams using the universal LiveCard component.
 * Fetches content from DeHub API.
 * 
 * @module components/app/feeds/LiveFeed
 */

import { useEffect, useRef, useMemo } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import minecraftCategory from '@/assets/minecraft-category.png';
import codCategory from '@/assets/cod-category.png';
import gtaCategory from '@/assets/gta-category.png';
import fortniteCategory from '@/assets/fortnite-category.png';
import valorantCategory from '@/assets/valorant-category.png';
import leagueCategory from '@/assets/league-category.png';
import apexCategory from '@/assets/apex-category.png';
import justchattingCategory from '@/assets/justchatting-category.png';
import { LiveCard } from '@/components/app/cards';
import { useDeHubLive, mapNFTToLiveStream } from '@/hooks/use-dehub-feed';
import { SwipeableCarousel } from '@/components/app/SwipeableCarousel';

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
  const loaderRef = useRef<HTMLDivElement>(null);

  // Fetch live content from DeHub API
  const {
    data: apiData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: isApiLoading,
    isError,
    refetch,
    error,
  } = useDeHubLive({
    unit: 15,
    sortMode: 'new',
  });

  // Map API data to LiveStream items
  const streams = useMemo(() => {
    if (!apiData?.pages) return [];
    
    const allNFTs = apiData.pages.flatMap(page => page.data || []);
    return allNFTs.map((nft, index) => mapNFTToLiveStream(nft, index));
  }, [apiData]);

  // Infinite scroll observer
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

  const isLoading = isApiLoading || isRefreshing;

  // Empty state component
  const EmptyState = () => (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center mb-4">
        <RefreshCw className="w-8 h-8 text-zinc-500" />
      </div>
      <h3 className="text-white font-semibold text-lg mb-2">No Live Streams</h3>
      <p className="text-zinc-400 text-sm max-w-xs mb-4">
        {isError 
          ? `Unable to load streams. ${error?.message || 'Please try again.'}`
          : 'No one is streaming right now. Check back later!'}
      </p>
      <button 
        onClick={() => refetch()}
        className="px-4 py-2 rounded-full bg-white/10 text-white text-sm hover:bg-white/20 transition-colors"
      >
        Refresh
      </button>
    </div>
  );

  if (isLoading) {
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

        {streams.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            {streams.map((stream) => (
              <LiveCard key={stream.id} stream={stream} />
            ))}
            
            {/* Infinite scroll loader */}
            <div ref={loaderRef} className="py-4 flex justify-center">
              {isFetchingNextPage && (
                <div className="flex items-center gap-2 text-zinc-400">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="text-sm">Loading more...</span>
                </div>
              )}
              {!hasNextPage && streams.length > 0 && (
                <p className="text-zinc-500 text-sm">No more streams</p>
              )}
            </div>
          </>
        )}
      </div>

      {/* Categories */}
      <div className="bg-zinc-900 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-white">Categories</h2>
          <button className="text-red-400 text-sm hover:underline">Show All</button>
        </div>
        <div className="relative">
          {/* Right fade only */}
          <div className="absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-zinc-900 to-transparent pointer-events-none z-10" />
          
          <SwipeableCarousel className="flex gap-3 overflow-x-auto scrollbar-hide px-1">
            {CATEGORIES.map((cat) => (
              <div key={cat.name} className="flex-shrink-0 cursor-pointer group">
                <div className="w-[90px] aspect-[3/4] rounded-lg overflow-hidden mb-2">
                  <img src={cat.image} alt="" className="w-full h-full object-cover" />
                </div>
                <p className="text-white text-sm font-medium truncate w-[90px]">{cat.name}</p>
                <p className="text-zinc-500 text-xs">{cat.viewers} viewers</p>
              </div>
            ))}
          </SwipeableCarousel>
        </div>
      </div>
    </div>
  );
}
