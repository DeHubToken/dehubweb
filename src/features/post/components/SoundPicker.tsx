/**
 * Sound Picker
 * =============
 * Bottom sheet to browse and search audio posts from DeHub.
 * Users can preview and select a track to attach to their post.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { Search, Play, Pause, Check, Music, X, Loader2 } from 'lucide-react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { searchNFTs, getMediaUrl, DEHUB_CDN_BASE } from '@/lib/api/dehub';
import { buildAvatarUrl } from '@/lib/media-url';
import { formatDuration } from '@/lib/feed-utils';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import type { AttachedSound } from '../hooks/usePostSound';

interface SoundPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (sound: AttachedSound) => void;
  currentSound?: AttachedSound | null;
}

export function SoundPicker({ isOpen, onClose, onSelect, currentSound }: SoundPickerProps) {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(timer);
  }, [search]);

  // Fetch audio posts
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useInfiniteQuery({
    queryKey: ['sound-picker', debouncedSearch],
    queryFn: async ({ pageParam = 0 }) => {
      const result = await searchNFTs({
        postType: 'audio',
        page: pageParam,
        unit: 20,
        sortMode: 'new',
        status: 'minted',
        ...(debouncedSearch ? { search: debouncedSearch } : {}),
      });
      return result;
    },
    getNextPageParam: (lastPage, pages) => {
      if (lastPage.data.length < 20) return undefined;
      return pages.length;
    },
    initialPageParam: 0,
    enabled: isOpen,
  });

  const allTracks = data?.pages.flatMap(p => p.data) ?? [];

  const handlePreview = useCallback((trackId: string, audioUrl: string) => {
    const audio = audioRef.current;
    if (!audio) return;

    if (playingId === trackId) {
      audio.pause();
      setPlayingId(null);
      return;
    }

    audio.src = audioUrl;
    audio.play().catch(() => {});
    setPlayingId(trackId);
  }, [playingId]);

  // Stop preview when closing
  useEffect(() => {
    if (!isOpen) {
      audioRef.current?.pause();
      setPlayingId(null);
    }
  }, [isOpen]);

  const handleSelect = useCallback((nft: any) => {
    audioRef.current?.pause();
    setPlayingId(null);

    const tokenId = String(nft.tokenId || nft.id || nft.token_id);
    const rawAudioSource = nft.audioUrl || nft.videoUrl || nft.media_url;
    const audioUrl = rawAudioSource?.startsWith('http')
      ? rawAudioSource
      : `${DEHUB_CDN_BASE}/${rawAudioSource}`;
    const minterAddress = nft.minter || nft.creator?.id || '';

    onSelect({
      url: audioUrl,
      title: nft.name || nft.title || 'Untitled',
      creator: nft.minterUsername || nft.minterDisplayName || nft.mintername || 'Unknown',
      creatorAvatar: buildAvatarUrl(minterAddress, nft.minterAvatarUrl),
      tokenId,
      duration: nft.audioDuration || nft.videoDuration || nft.duration,
    });
    onClose();
  }, [onSelect, onClose]);

  return (
    <Drawer open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DrawerContent glass className="border-t border-white/10 max-h-[80vh]">
        <DrawerHeader className="border-b border-white/10 pb-3">
          <DrawerTitle className="text-white flex items-center gap-2">
            <Music className="w-5 h-5" />
            Add Sound
          </DrawerTitle>
        </DrawerHeader>

        {/* Search */}
        <div className="px-4 py-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search sounds..."
              className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-white/30"
            />
          </div>
        </div>

        {/* Track list */}
        <div className="flex-1 overflow-y-auto max-h-[50vh] pb-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-white/40 animate-spin" />
            </div>
          ) : allTracks.length === 0 ? (
            <div className="text-center py-12 text-white/40 text-sm">
              {debouncedSearch ? 'No sounds found' : 'No audio tracks available'}
            </div>
          ) : (
            <>
              {allTracks.map((nft) => {
                const tokenId = String(nft.tokenId || nft.id || nft.token_id);
                const rawAudioSource = (nft as any).audioUrl || nft.videoUrl || nft.media_url;
                const audioUrl = rawAudioSource?.startsWith('http')
                  ? rawAudioSource
                  : `${DEHUB_CDN_BASE}/${rawAudioSource}`;
                const minterAddress = nft.minter || nft.creator?.id || '';
                const avatar = buildAvatarUrl(minterAddress, nft.minterAvatarUrl);
                const isSelected = currentSound?.tokenId === tokenId;
                const isCurrentlyPlaying = playingId === tokenId;
                const duration = (nft as any).audioDuration || nft.videoDuration || nft.duration;

                return (
                  <button
                    key={tokenId}
                    type="button"
                    onClick={() => handleSelect(nft)}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors ${
                      isSelected ? 'bg-white/10' : ''
                    }`}
                  >
                    {/* Play/Pause preview */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePreview(tokenId, audioUrl);
                      }}
                      className="flex-shrink-0 w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
                    >
                      {isCurrentlyPlaying ? (
                        <Pause className="w-4 h-4 text-white" />
                      ) : (
                        <Play className="w-4 h-4 text-white ml-0.5" />
                      )}
                    </button>

                    {/* Track info */}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-white font-medium truncate">
                        {nft.name || nft.title || 'Untitled'}
                      </div>
                      <div className="text-xs text-white/50 truncate flex items-center gap-1.5">
                        <Avatar className="w-3.5 h-3.5">
                          <AvatarImage src={avatar} />
                          <AvatarFallback className="text-[6px] bg-white/10">?</AvatarFallback>
                        </Avatar>
                        {nft.minterUsername || nft.minterDisplayName || 'Unknown'}
                        {duration != null && (
                          <span className="text-white/30">• {formatDuration(duration)}</span>
                        )}
                      </div>
                    </div>

                    {/* Selected indicator */}
                    {isSelected && (
                      <Check className="w-5 h-5 text-white flex-shrink-0" />
                    )}
                  </button>
                );
              })}

              {/* Load more */}
              {hasNextPage && (
                <button
                  type="button"
                  onClick={() => fetchNextPage()}
                  disabled={isFetchingNextPage}
                  className="w-full py-3 text-sm text-white/50 hover:text-white/70 transition-colors"
                >
                  {isFetchingNextPage ? (
                    <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                  ) : (
                    'Load more'
                  )}
                </button>
              )}
            </>
          )}
        </div>

        {/* Hidden audio for previewing */}
        <audio
          ref={audioRef}
          onEnded={() => setPlayingId(null)}
          preload="none"
        />
      </DrawerContent>
    </Drawer>
  );
}
