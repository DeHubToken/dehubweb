/**
 * TV Channel Card Component
 * =========================
 * Displays individual TV channel with HLS video player.
 * Glass-morphism style matching app aesthetic.
 * 
 * @module components/app/tv/TVChannelCard
 */

import { useRef, useEffect, useState } from 'react';
import { Play, Pause, Tv, Loader2, Volume2, VolumeX } from 'lucide-react';
import { cn } from '@/lib/utils';
import Hls from 'hls.js';
import type { TVChannel } from '@/lib/api/live-tv';
import { getCountryFlag } from '@/lib/api/live-tv';
import { videoPlaybackManager } from '@/lib/video-playback-manager';

interface TVChannelCardProps {
  channel: TVChannel;
}

export function TVChannelCard({ channel }: TVChannelCardProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const cardId = `tv-${channel.id}`;
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [showVideo, setShowVideo] = useState(false);
  
  // Register with VideoPlaybackManager
  useEffect(() => {
    videoPlaybackManager.register(cardId, () => {
      stopPlayback();
    });
    
    return () => {
      videoPlaybackManager.unregister(cardId);
      if (hlsRef.current) {
        hlsRef.current.destroy();
      }
    };
  }, [cardId]);
  
  const stopPlayback = () => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.src = '';
    }
    setIsPlaying(false);
    setShowVideo(false);
    setIsLoading(false);
  };
  
  const startPlayback = () => {
    const video = videoRef.current;
    if (!video) return;
    
    // Notify manager to pause other media
    videoPlaybackManager.play(cardId);
    
    setIsLoading(true);
    setHasError(false);
    setShowVideo(true);
    
    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 90,
        xhrSetup: (xhr) => {
          // Some streams require a referrer header to play
          if (channel.referrer) {
            try {
              xhr.setRequestHeader('Referer', channel.referrer);
            } catch {
              // Browser may block setting Referer header
            }
          }
        },
      });
      
      hls.loadSource(channel.streamUrl);
      hls.attachMedia(video);
      
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {
          // Autoplay blocked
        });
      });
      
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          setHasError(true);
          setIsLoading(false);
          setIsPlaying(false);
        }
      });
      
      hlsRef.current = hls;
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Native HLS support (Safari/iOS)
      video.src = channel.streamUrl;
      video.play().catch(() => {
        // Autoplay blocked
      });
    } else {
      setHasError(true);
      setIsLoading(false);
    }
  };
  
  const handleClick = () => {
    if (isPlaying) {
      stopPlayback();
    } else {
      startPlayback();
    }
  };
  
  const handleMuteToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
      setIsMuted(!isMuted);
    }
  };
  
  // Video event handlers
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    
    const handlePlaying = () => {
      setIsPlaying(true);
      setIsLoading(false);
    };
    
    const handlePause = () => {
      setIsPlaying(false);
    };
    
    const handleWaiting = () => {
      setIsLoading(true);
    };
    
    const handleCanPlay = () => {
      setIsLoading(false);
    };
    
    const handleError = () => {
      setHasError(true);
      setIsLoading(false);
      setIsPlaying(false);
    };
    
    video.addEventListener('playing', handlePlaying);
    video.addEventListener('pause', handlePause);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('error', handleError);
    
    return () => {
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('error', handleError);
    };
  }, []);
  
  const countryFlag = getCountryFlag(channel.country);
  
  return (
    <div
      className={cn(
        'w-full bg-black/40 backdrop-blur-[24px] saturate-[180%] border border-white/10',
        'rounded-2xl overflow-hidden',
        'hover:bg-white/5 transition-all duration-200 cursor-pointer',
        isPlaying && 'ring-1 ring-white/20 bg-white/5'
      )}
    >
      {/* Video/Thumbnail Area */}
      <div 
        onClick={handleClick}
        className="relative aspect-video bg-zinc-900"
      >
        {/* Video Element */}
        <video
          ref={videoRef}
          muted={isMuted}
          playsInline
          className={cn(
            'absolute inset-0 w-full h-full object-cover',
            showVideo ? 'opacity-100' : 'opacity-0'
          )}
        />
        
        {/* Channel Logo Overlay (when not playing) */}
        {!showVideo && (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-900">
            {channel.logo ? (
              <img 
                src={channel.logo} 
                alt={channel.name}
                className="w-20 h-20 object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            ) : (
              <Tv className="w-12 h-12 text-zinc-600" />
            )}
          </div>
        )}
        
        {/* Live Badge */}
        <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2 py-1 rounded-md bg-red-600 text-white text-xs font-semibold">
          <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
          LIVE
        </div>
        
        {/* Error State */}
        {hasError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80">
            <Tv className="w-8 h-8 text-zinc-500 mb-2" />
            <p className="text-zinc-400 text-sm">Stream unavailable</p>
          </div>
        )}
        
        {/* Loading Overlay */}
        {isLoading && !hasError && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <Loader2 className="w-10 h-10 text-white animate-spin" />
          </div>
        )}
        
        {/* Play/Pause Button Overlay */}
        {!isLoading && !hasError && (
          <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
            <div className="w-16 h-16 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center">
              {isPlaying ? (
                <Pause className="w-8 h-8 text-white fill-white" />
              ) : (
                <Play className="w-8 h-8 text-white fill-white ml-1" />
              )}
            </div>
          </div>
        )}
        
        {/* Mute Button (when playing) */}
        {isPlaying && (
          <button
            onClick={handleMuteToggle}
            className="absolute bottom-3 right-3 w-10 h-10 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center hover:bg-black/80 transition-colors"
          >
            {isMuted ? (
              <VolumeX className="w-5 h-5 text-white" />
            ) : (
              <Volume2 className="w-5 h-5 text-white" />
            )}
          </button>
        )}
      </div>
      
      {/* Channel Info */}
      <div className="p-3 sm:p-4 flex items-center gap-3">
        {/* Logo */}
        <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-zinc-800">
          {channel.logo ? (
            <img 
              src={channel.logo} 
              alt={channel.name}
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
                (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
              }}
            />
          ) : null}
          <div className={cn(
            'w-full h-full flex items-center justify-center bg-zinc-800',
            channel.logo && 'hidden'
          )}>
            <Tv className="w-5 h-5 text-zinc-500" />
          </div>
        </div>
        
        {/* Info */}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-white truncate text-sm sm:text-base">
            {channel.name}
          </h3>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-base">{countryFlag}</span>
            <span className="text-zinc-400 text-xs capitalize">
              {channel.category}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
