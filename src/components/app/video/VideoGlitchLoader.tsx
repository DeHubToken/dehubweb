/**
 * VideoGlitchLoader
 * -----------------
 * Loading state for videos: renders the poster/first-frame with an
 * RGB-split glitch + scanline effect instead of a plain spinner.
 * Falls back to a subtle animated dark surface when no poster is provided.
 */
import { memo } from 'react';
import { cn } from '@/lib/utils';

interface VideoGlitchLoaderProps {
  poster?: string;
  className?: string;
  /** Rounded corners to match the underlying video */
  rounded?: string;
}

export const VideoGlitchLoader = memo(function VideoGlitchLoader({
  poster,
  className,
  rounded = 'rounded-lg',
}: VideoGlitchLoaderProps) {
  return (
    <div
      className={cn(
        'absolute inset-0 overflow-hidden pointer-events-none',
        rounded,
        className,
      )}
      data-video-glitch=""
      aria-hidden="true"
    >
      {poster ? (
        <>
          {/* Base frame */}
          <img
            src={poster}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
            draggable={false}
          />
          {/* Red channel offset */}
          <img
            src={poster}
            alt=""
            className="absolute inset-0 w-full h-full object-cover mix-blend-screen opacity-70"
            style={{
              filter: 'brightness(1.1) contrast(1.05) drop-shadow(2px 0 0 rgba(255,0,64,0.9))',
              animation: 'video-glitch-r 1.8s steps(1) infinite',
            }}
            draggable={false}
          />
          {/* Cyan channel offset */}
          <img
            src={poster}
            alt=""
            className="absolute inset-0 w-full h-full object-cover mix-blend-screen opacity-70"
            style={{
              filter: 'brightness(1.1) contrast(1.05) drop-shadow(-2px 0 0 rgba(0,220,255,0.9))',
              animation: 'video-glitch-c 1.8s steps(1) infinite',
            }}
            draggable={false}
          />
          {/* Scanlines */}
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                'repeating-linear-gradient(to bottom, rgba(255,255,255,0.06) 0 1px, transparent 1px 3px)',
              mixBlendMode: 'overlay',
              opacity: 0.5,
            }}
          />
          {/* Horizontal glitch slice */}
          <div
            className="absolute left-0 right-0 h-[6%] bg-white/10 backdrop-invert"
            style={{ animation: 'video-glitch-slice 2.4s steps(1) infinite' }}
          />
          {/* Vignette darken */}
          <div className="absolute inset-0 bg-black/25" />
        </>
      ) : (
        <div className="absolute inset-0 bg-white/[0.06] animate-pulse" />
      )}
    </div>
  );
});
