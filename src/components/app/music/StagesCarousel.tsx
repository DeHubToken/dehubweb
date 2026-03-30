/**
 * Stages Carousel for Music Feed
 * ===============================
 * Displays live audio stages in a horizontal carousel.
 * 
 * @module components/app/music/StagesCarousel
 */

import { Mic2, Users, ChevronRight, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { SwipeableCarousel } from '@/components/app/SwipeableCarousel';
import { cn } from '@/lib/utils';
import { buildAvatarUrl, buildAvatarCdnFallbackUrl } from '@/lib/media-url';
import type { AudioSpace } from '@/types/audio-spaces.types';

// Import the 3D mic icon
import stagesMicIcon from '@/assets/icons/stages-mic-icon.png';

interface StagesCarouselProps {
  onOpenStages: () => void;
}

function StageCard({ space, onClick }: { space: AudioSpace; onClick: () => void }) {
  const totalListeners = (space.speaker_count || 1) + (space.listener_count || 0);
  
  return (
    <button
      onClick={onClick}
      className="flex-shrink-0 w-[260px] rounded-xl border border-white/[0.12] bg-white/[0.03] backdrop-blur-[24px] p-3 text-left hover:border-white/20 transition-all group"
    >
      {/* Live badge and listeners */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5 px-2 py-1 bg-red-500/20 rounded-lg">
          <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
          <span className="text-red-400 text-xs font-medium">LIVE</span>
        </div>
        <div className="flex items-center gap-1 text-zinc-400 text-xs">
          <Users className="w-3.5 h-3.5" />
          <span>{totalListeners}</span>
        </div>
      </div>
      
      {/* Host info */}
      <div className="flex items-center gap-3 mb-3">
        <div className="relative">
          <div className="w-10 h-10 rounded-full ring-2 ring-white/20 overflow-hidden">
            {(() => {
              const resolvedAvatar = buildAvatarUrl(space.host_wallet_address || '', space.host_avatar)
                || buildAvatarCdnFallbackUrl(space.host_wallet_address || '');
              return resolvedAvatar ? (
                <img src={resolvedAvatar} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-zinc-700 flex items-center justify-center text-white font-medium text-sm">
                  {(space.host_username || space.host_wallet_address || 'U').charAt(0).toUpperCase()}
                </div>
              );
            })()}
          </div>
          <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-zinc-700 rounded-full flex items-center justify-center">
            <Mic2 className="w-3 h-3 text-white" />
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-zinc-500 text-[10px]">Hosted by</p>
          <p className="text-white text-xs font-medium truncate">
            @{space.host_username || space.host_wallet_address?.slice(0, 6)}
          </p>
        </div>
      </div>
      
      {/* Title */}
      <h4 className="text-white font-semibold text-sm line-clamp-2 group-hover:text-zinc-300 transition-colors">
        {space.title}
      </h4>
      
      {/* Description if available */}
      {space.description && (
        <p className="text-zinc-500 text-xs mt-1 line-clamp-1">
          {space.description}
        </p>
      )}
    </button>
  );
}

export function StagesCarousel({ onOpenStages }: StagesCarouselProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  // Fetch live stages
  const { data: liveSpaces = [], refetch } = useQuery({
    queryKey: ['live-stages-carousel'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('audio_spaces')
        .select('*')
        .eq('status', 'live')
        .order('started_at', { ascending: false });
      
      if (error) throw error;
      return (data || []) as AudioSpace[];
    },
    staleTime: 30_000,
  });

  // Realtime: remove ended stages instantly
  React.useEffect(() => {
    const channel = supabase
      .channel('stages-carousel-realtime')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'audio_spaces' },
        (payload) => {
          const updated = payload.new as any;
          if (updated.status === 'ended') {
            // Immediately remove from cache
            queryClient.setQueryData<AudioSpace[]>(['live-stages-carousel'], (old) =>
              old ? old.filter(s => s.id !== updated.id) : []
            );
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'audio_spaces' },
        () => { refetch(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [queryClient, refetch]);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-bold text-white flex items-center gap-2">
          <img src={stagesMicIcon} alt="" className="w-5 h-5 object-contain" />
          Stages
          {liveSpaces.length > 0 && (
            <span className="text-zinc-500 font-normal text-sm">({liveSpaces.length})</span>
          )}
        </h2>
        <button 
          onClick={onOpenStages}
          className="text-zinc-400 text-sm hover:text-white flex items-center gap-1"
        >
          See all <ChevronRight className="w-4 h-4" />
        </button>
      </div>
      
      {/* Carousel */}
      {liveSpaces.length === 0 ? (
        <button
          onClick={onOpenStages}
          className="w-full flex items-center gap-3 p-4 bg-zinc-800/60 border border-dashed border-white/10 rounded-2xl hover:border-white/20 hover:bg-zinc-800/80 transition-all group"
        >
          <div className="w-12 h-12 rounded-xl bg-zinc-700/60 flex items-center justify-center group-hover:bg-zinc-700 transition-colors">
            <Plus className="w-5 h-5 text-zinc-400 group-hover:text-white transition-colors" />
          </div>
          <div className="text-left">
            <p className="text-white text-sm font-medium">No live stages right now</p>
            <p className="text-zinc-500 text-xs">Start a stage and go live with your audience</p>
          </div>
        </button>
      ) : (
        <div className="relative">
          <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-black to-transparent pointer-events-none z-10" />
          <SwipeableCarousel className="flex gap-3 overflow-x-auto scrollbar-hide pr-8">
            {liveSpaces.map((space) => (
              <StageCard 
                key={space.id} 
                space={space} 
                onClick={onOpenStages}
              />
            ))}
          </SwipeableCarousel>
        </div>
      )}
    </div>
  );
}

export default StagesCarousel;
