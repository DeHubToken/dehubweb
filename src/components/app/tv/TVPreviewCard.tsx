/**
 * TV Preview Card Component
 * =========================
 * Lightweight card that auto-plays a muted HLS stream as an animated thumbnail.
 * Clicking toggles play/pause inline. Includes mute and fullscreen controls.
 *
 * @module components/app/tv/TVPreviewCard
 */

import { useRef, useEffect, useState, useCallback } from 'react';
import { Tv, Volume2, VolumeX, Maximize, Minimize, Play, Pause } from 'lucide-react';
import { cn } from '@/lib/utils';
import Hls from 'hls.js';
import type { TVChannel } from '@/lib/api/live-tv';
import { getCountryFlag } from '@/lib/api/live-tv';
import { videoPlaybackManager } from '@/lib/video-playback-manager';
import { createLogger } from '@/lib/logger';

const logger = createLogger('TVPreviewCard');

interface TVPreviewCardProps {
  channel: TVChannel;
}

export function TVPreviewCard({ channel }: TVPreviewCardProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const cardId = `tv-preview-${channel.id}`;

  const [showVideo, setShowVideo] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const countryFlag = getCountryFlag(channel.country);

  const destroyHls = useCallback(() => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
  }, []);

  // Register with playback manager so other videos can stop this one
  useEffect(() => {
    videoPlaybackManager.register(cardId, () => {
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.muted = true;
        setIsMuted(true);
        setIsPlaying(false);
      }
    });
    return () => {
      videoPlaybackManager.unregister(cardId);
      destroyHls();
    };
  }, [cardId, destroyHls]);

  // Auto-play muted on mount
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onPlaying = () => {
      setShowVideo(true);
      setIsPlaying(true);
    };
    const onPause = () => setIsPlaying(false);

    video.addEventListener('playing', onPlaying);
    video.addEventListener('pause', onPause);

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: false,
        lowLatencyMode: true,
        maxBufferLength: 5,
        maxMaxBufferLength: 10,
        fragLoadingTimeOut: 8000,
        manifestLoadingTimeOut: 8000,
      });

      logger.info('Initializing thumbnail player', { channel: channel.name, url: channel.streamUrl });
      hls.loadSource(channel.streamUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {
          // Normal for thumbnail to be blocked if not interaction
        });
      });

      hls.on(Hls.Events.ERROR, (_, data) => {
        logger.error('TV Preview Error', { channel: channel.name, type: data.type, details: data.details, fatal: data.fatal }, data);
        if (data.fatal) destroyHls();
      });

      hlsRef.current = hls;
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = channel.streamUrl;
      video.play().catch(() => {});
    }

    return () => {
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('pause', onPause);
      destroyHls();
    };
  }, [channel.streamUrl, destroyHls]);

  // Fullscreen tracking
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
    };
  }, []);

  const handlePlayPause = (e: React.MouseEvent) => {
    e.stopPropagation();
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
      videoPlaybackManager.stop(cardId);
    } else {
      videoPlaybackManager.play(cardId);
      video.play().catch(() => {});
    }
  };

  const handleMuteToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
      setIsMuted(!isMuted);
      if (!isMuted === false) {
        // Unmuting — claim playback
        videoPlaybackManager.play(cardId);
      }
    }
  };

  const handleFullscreen = (e: React.MouseEvent) => {
    e.stopPropagation();
    const container = containerRef.current;
    if (!container) return;

    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      const el = container as HTMLElement & { webkitRequestFullscreen?: () => void };
      if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    }
  };

  return (
    <div
      className={cn(
        'w-full bg-black/40 backdrop-blur-[24px] saturate-[180%] border border-white/10',
        'rounded-2xl overflow-hidden',
        'hover:bg-white/5 transition-all duration-200'
      )}
    >
      {/* Video Area */}
      <div
        ref={containerRef}
        className={cn(
          'relative aspect-video bg-zinc-900 cursor-pointer group',
          isFullscreen && '!aspect-auto w-full h-full'
        )}
        onClick={handlePlayPause}
      >
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

        {/* Fallback logo */}
        {!showVideo && (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-900">
            {channel.logo ? (
              <img
                src={channel.logo}
                alt={channel.name}
                className="w-16 h-16 object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            ) : (
              <Tv className="w-10 h-10 text-zinc-600" />
            )}
          </div>
        )}

        {/* LIVE badge */}
        <div className="absolute top-2 left-2 flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-red-600 text-white text-[10px] font-semibold">
          <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
          LIVE
        </div>

        {/* Play/Pause center overlay on hover */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="w-12 h-12 rounded-xl bg-black/40 backdrop-blur-[24px] saturate-[180%] flex items-center justify-center border border-white/10">
            {isPlaying ? (
              <Pause className="w-6 h-6 text-white fill-white" />
            ) : (
              <Play className="w-6 h-6 text-white fill-white ml-0.5" />
            )}
          </div>
        </div>

        {/* Bottom controls */}
        {showVideo && (
          <div className="absolute bottom-2 right-2 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={handleMuteToggle}
              className="w-8 h-8 rounded-xl bg-black/40 backdrop-blur-[24px] saturate-[180%] border border-white/10 flex items-center justify-center hover:bg-black/60 transition-colors"
            >
              {isMuted ? (
                <VolumeX className="w-4 h-4 text-white" />
              ) : (
                <Volume2 className="w-4 h-4 text-white" />
              )}
            </button>
            <button
              onClick={handleFullscreen}
              className="w-8 h-8 rounded-xl bg-black/40 backdrop-blur-[24px] saturate-[180%] border border-white/10 flex items-center justify-center hover:bg-black/60 transition-colors"
            >
              {isFullscreen ? (
                <Minimize className="w-4 h-4 text-white" />
              ) : (
                <Maximize className="w-4 h-4 text-white" />
              )}
            </button>
          </div>
        )}
      </div>

      {/* Channel Info */}
      <div className="p-2.5 flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg overflow-hidden flex-shrink-0 bg-zinc-800 flex items-center justify-center">
          {channel.logo ? (
            <img
              src={channel.logo}
              alt={channel.name}
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <Tv className="w-4 h-4 text-zinc-500" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-white truncate text-xs">{channel.name}</h3>
          <div className="flex items-center gap-1 mt-0.5">
            <span className="text-xs">{countryFlag}</span>
            <span className="text-zinc-400 text-[10px]">{channel.country}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
