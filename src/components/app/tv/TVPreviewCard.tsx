/**
 * TV Preview Card Component
 * =========================
 * Lightweight card that auto-plays a muted HLS stream as an animated thumbnail.
 * Used in the Live feed carousel. Clicking navigates to the TV page.
 *
 * @module components/app/tv/TVPreviewCard
 */

import { useRef, useEffect, useState, useCallback } from 'react';
import { Tv } from 'lucide-react';
import { cn } from '@/lib/utils';
import Hls from 'hls.js';
import type { TVChannel } from '@/lib/api/live-tv';
import { getCountryFlag } from '@/lib/api/live-tv';
import { useNavigate } from 'react-router-dom';

interface TVPreviewCardProps {
  channel: TVChannel;
}

export function TVPreviewCard({ channel }: TVPreviewCardProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [showVideo, setShowVideo] = useState(false);
  const navigate = useNavigate();

  const countryFlag = getCountryFlag(channel.country);

  const destroyHls = useCallback(() => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
  }, []);

  // Auto-play muted on mount
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onPlaying = () => setShowVideo(true);
    video.addEventListener('playing', onPlaying);

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: false,
        lowLatencyMode: true,
        maxBufferLength: 5,
        maxMaxBufferLength: 10,
        fragLoadingTimeOut: 8000,
        manifestLoadingTimeOut: 8000,
      });

      hls.loadSource(channel.streamUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {});
      });

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          destroyHls();
        }
      });

      hlsRef.current = hls;
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = channel.streamUrl;
      video.play().catch(() => {});
    }

    return () => {
      video.removeEventListener('playing', onPlaying);
      destroyHls();
    };
  }, [channel.streamUrl, destroyHls]);

  return (
    <div
      onClick={() => navigate('/app/tv')}
      className={cn(
        'w-full bg-black/40 backdrop-blur-[24px] saturate-[180%] border border-white/10',
        'rounded-2xl overflow-hidden cursor-pointer',
        'hover:bg-white/5 transition-all duration-200'
      )}
    >
      {/* Animated Thumbnail */}
      <div className="relative aspect-video bg-zinc-900">
        <video
          ref={videoRef}
          muted
          playsInline
          className={cn(
            'absolute inset-0 w-full h-full object-cover',
            showVideo ? 'opacity-100' : 'opacity-0'
          )}
        />

        {/* Fallback logo when video hasn't loaded */}
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
