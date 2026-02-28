/**
 * TV Channel Card Component
 * =========================
 * Displays individual TV channel with HLS video player.
 * Glass-morphism style matching app aesthetic.
 * 
 * Pause = keep HLS alive, just pause video element.
 * Stop  = destroy HLS instance entirely (used by VideoPlaybackManager).
 * 
 * @module components/app/tv/TVChannelCard
 */

import { useRef, useEffect, useState, useCallback } from 'react';
import { Play, Pause, Tv, Loader2, Volume2, VolumeX, RotateCcw, Maximize, Minimize, PictureInPicture2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import Hls from 'hls.js';
import { TVChannel } from '@/lib/api/live-tv';
import { getCountryFlag, reportBrokenChannel } from '@/lib/api/live-tv';
import { videoPlaybackManager } from '@/lib/video-playback-manager';
import { createLogger } from '@/lib/logger';

const logger = createLogger('TVChannelCard');

interface TVChannelCardProps {
  channel: TVChannel;
}

const MAX_RETRIES = 2;

export function TVChannelCard({ channel }: TVChannelCardProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const isStoppingRef = useRef(false);
  const cardId = `tv-${channel.id}`;
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [showVideo, setShowVideo] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isInPiP, setIsInPiP] = useState(false);
  const isMutedRef = useRef(isMuted);
  isMutedRef.current = isMuted;

  /**
   * Full stop — destroys HLS instance, clears video source.
   * Used when another video takes over or on unmount.
   */
  const fullStop = useCallback(() => {
    isStoppingRef.current = true;
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.removeAttribute('src');
      videoRef.current.load();
    }
    setIsPlaying(false);
    setIsPaused(false);
    setShowVideo(false);
    setIsLoading(false);
    setTimeout(() => { isStoppingRef.current = false; }, 100);
  }, []);

  /**
   * Pause — keeps HLS instance alive, just pauses the video element.
   */
  const pausePlayback = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.pause();
    }
    setIsPlaying(false);
    setIsPaused(true);
    videoPlaybackManager.stop(cardId);
  }, [cardId]);

  /**
   * Resume — resumes from paused state without reloading.
   */
  const resumePlayback = useCallback(() => {
    if (videoRef.current) {
      videoPlaybackManager.play(cardId);
      videoRef.current.play().catch(() => {});
      setIsPaused(false);
    }
  }, [cardId]);
  
  // Register with VideoPlaybackManager — full stop when another video plays
  useEffect(() => {
    videoPlaybackManager.register(cardId, () => {
      fullStop();
    });
    
    return () => {
      videoPlaybackManager.unregister(cardId);
      isStoppingRef.current = true;
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [cardId, fullStop]);
  
  const startPlayback = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    
    // Notify manager to pause other media
    videoPlaybackManager.play(cardId);
    
    setIsLoading(true);
    setHasError(false);
    setShowVideo(true);
    setIsPaused(false);
    
    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 90,
        fragLoadingTimeOut: 10000,
        manifestLoadingTimeOut: 10000,
        levelLoadingTimeOut: 10000,
      });
      
      console.log('[TVChannelCard] HLS supported, loading source...', channel.streamUrl);
      hls.loadSource(channel.streamUrl);
      hls.attachMedia(video);
      
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {
          logger.warn('Autoplay blocked by browser', { channel: channel.name });
        });
      });
      
      hls.on(Hls.Events.ERROR, (_, data) => {
        logger.error('TV HLS Error', { channel: channel.name, type: data.type, details: data.details, fatal: data.fatal }, data);
        if (isStoppingRef.current) return;
        if (data.fatal) {
          setHasError(true);
          setIsLoading(false);
          setIsPlaying(false);
          if (retryCount >= MAX_RETRIES - 1) {
            reportBrokenChannel(channel.id);
          }
        }
      });
      
      hlsRef.current = hls;
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = channel.streamUrl;
      video.play().catch(() => {});
    } else {
      setHasError(true);
      setIsLoading(false);
    }
  }, [cardId, channel.streamUrl, channel.id, retryCount]);
  
  const handleClick = () => {
    if (hasError) {
      handleRetry();
      return;
    }
    if (isPlaying) {
      pausePlayback();
    } else if (isPaused) {
      resumePlayback();
    } else {
      startPlayback();
    }
  };
  
  const handleRetry = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (retryCount < MAX_RETRIES) {
      setRetryCount(prev => prev + 1);
      setHasError(false);
      fullStop();
      setTimeout(() => {
        startPlayback();
      }, 500);
    }
  };
  
  const handleMuteToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
      setIsMuted(!isMuted);
    }
  };

  // Toggle mute programmatically (used by PiP media session)
  const toggleMuteProgrammatic = useCallback(() => {
    if (videoRef.current) {
      const newMuted = !videoRef.current.muted;
      videoRef.current.muted = newMuted;
      setIsMuted(newMuted);
    }
  }, []);

  // PiP: set up MediaSession mute/unmute via next/previous track buttons
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onEnterPiP = () => {
      setIsInPiP(true);
      if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: `${channel.name} ${isMutedRef.current ? '🔇' : '🔊'}`,
          artist: 'DeHub TV',
        });
        const muteHandler = () => {
          toggleMuteProgrammatic();
          // Update metadata to reflect mute state
          navigator.mediaSession.metadata = new MediaMetadata({
            title: `${channel.name} ${isMutedRef.current ? '🔇' : '🔊'}`,
            artist: 'DeHub TV',
          });
        };
        navigator.mediaSession.setActionHandler('nexttrack', muteHandler);
        navigator.mediaSession.setActionHandler('previoustrack', muteHandler);
      }
    };

    const onLeavePiP = () => {
      setIsInPiP(false);
      if ('mediaSession' in navigator) {
        navigator.mediaSession.setActionHandler('nexttrack', null);
        navigator.mediaSession.setActionHandler('previoustrack', null);
      }
    };

    video.addEventListener('enterpictureinpicture', onEnterPiP);
    video.addEventListener('leavepictureinpicture', onLeavePiP);
    return () => {
      video.removeEventListener('enterpictureinpicture', onEnterPiP);
      video.removeEventListener('leavepictureinpicture', onLeavePiP);
    };
  }, [channel.name, toggleMuteProgrammatic]);

  const handleFullscreen = (e: React.MouseEvent) => {
    e.stopPropagation();
    const container = containerRef.current;
    if (!container) return;

    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      const el = container as HTMLElement & { webkitRequestFullscreen?: () => void };
      if (el.requestFullscreen) {
        el.requestFullscreen().catch(() => {});
      } else if (el.webkitRequestFullscreen) {
        el.webkitRequestFullscreen();
      }
    }
  };

  // Track fullscreen state
  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', onFullscreenChange);
    };
  }, []);
  
  // Video event handlers
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    
    const handlePlaying = () => {
      setIsPlaying(true);
      setIsPaused(false);
      setIsLoading(false);
      setRetryCount(0);
    };
    
    const handlePause = () => {
      setIsPlaying(false);
    };
    
    const handleWaiting = () => {
      if (!isStoppingRef.current) {
        setIsLoading(true);
      }
    };
    
    const handleCanPlay = () => {
      setIsLoading(false);
    };
    
    const handleError = () => {
      if (isStoppingRef.current) return;
      setHasError(true);
      setIsLoading(false);
      setIsPlaying(false);
      if (retryCount >= MAX_RETRIES) {
        reportBrokenChannel(channel.id);
      }
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
  }, [channel.id, retryCount]);
  
  const countryFlag = getCountryFlag(channel.country);
  const canRetry = retryCount < MAX_RETRIES;
  const isActive = isPlaying || isPaused;
  
  return (
    <div
      className={cn(
        'w-full bg-black/40 backdrop-blur-[24px] saturate-[180%] border border-white/10',
        'rounded-2xl overflow-hidden',
        'hover:bg-white/5 transition-all duration-200 cursor-pointer',
        isActive && 'ring-1 ring-white/20 bg-white/5'
      )}
    >
      {/* Video/Thumbnail Area */}
      <div 
        ref={containerRef}
        onClick={handleClick}
        className={cn(
          'relative aspect-video bg-zinc-900',
          isFullscreen && '!aspect-auto w-full h-full'
        )}
      >
        {/* Video Element */}
        <video
          ref={videoRef}
          muted={isMuted}
          playsInline
          className={cn(
            'absolute inset-0 w-full h-full',
            isFullscreen ? 'object-contain' : 'object-cover',
            showVideo ? 'opacity-100' : 'opacity-0'
          )}
        />
        
        {/* Channel Logo Overlay (when not active) */}
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
            <p className="text-zinc-400 text-sm">Stream geo-blocked or unavailable</p>
            <p className="text-zinc-500 text-xs mb-3">Sorry for the inconvenience</p>
            {canRetry && (
              <button
                onClick={handleRetry}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
                Retry ({MAX_RETRIES - retryCount} left)
              </button>
            )}
          </div>
        )}
        
        {/* Loading Overlay */}
        {isLoading && !hasError && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <Loader2 className="w-10 h-10 text-white animate-spin" />
          </div>
        )}
        
        {/* Play/Pause/Resume Center Icon */}
        {!isLoading && !hasError && (
          <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
            <div className="w-16 h-16 rounded-xl bg-black/40 backdrop-blur-[24px] saturate-[180%] flex items-center justify-center border border-white/10">
              {isPlaying ? (
                <Pause className="w-8 h-8 text-white fill-white" />
              ) : (
                <Play className="w-8 h-8 text-white fill-white ml-1" />
              )}
            </div>
          </div>
        )}
        
        {/* Bottom Controls Bar (when active) */}
        {isActive && (
          <div className="absolute bottom-3 right-3 flex items-center gap-2">
            {/* Mute Button */}
            <button
              onClick={handleMuteToggle}
              className="w-10 h-10 rounded-xl bg-black/40 backdrop-blur-[24px] saturate-[180%] border border-white/10 flex items-center justify-center hover:bg-black/60 transition-colors"
            >
              {isMuted ? (
                <VolumeX className="w-5 h-5 text-white" />
              ) : (
                <Volume2 className="w-5 h-5 text-white" />
              )}
            </button>

            {/* PiP Button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                const video = videoRef.current;
                if (!video) return;
                if (document.pictureInPictureElement) {
                  document.exitPictureInPicture().catch(() => {});
                } else {
                  video.requestPictureInPicture?.().catch(() => {});
                }
              }}
              className="w-10 h-10 rounded-xl bg-black/40 backdrop-blur-[24px] saturate-[180%] border border-white/10 flex items-center justify-center hover:bg-black/60 transition-colors"
            >
              <PictureInPicture2 className="w-5 h-5 text-white" />
            </button>

            {/* Fullscreen Button */}
            <button
              onClick={handleFullscreen}
              className="w-10 h-10 rounded-xl bg-black/40 backdrop-blur-[24px] saturate-[180%] border border-white/10 flex items-center justify-center hover:bg-black/60 transition-colors"
            >
              {isFullscreen ? (
                <Minimize className="w-5 h-5 text-white" />
              ) : (
                <Maximize className="w-5 h-5 text-white" />
              )}
            </button>
          </div>
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
            <span className="text-zinc-400 text-xs">
              {channel.country}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}