/**
 * VideoGlitchLoader
 * -----------------
 * Loading state for videos: renders the poster/first-frame with an
 * RGB-split glitch + scanline effect and flickers between overlay frames.
 */
import { memo } from 'react';
import { cn } from '@/lib/utils';
import glitch0 from '@/assets/glitch/glitch-0.svg.asset.json';
import glitch1 from '@/assets/glitch/glitch-1.svg.asset.json';
import glitch2 from '@/assets/glitch/glitch-2.svg.asset.json';
import glitch3 from '@/assets/glitch/glitch-3.svg.asset.json';

const GLITCH_FRAMES = [glitch0.url, glitch1.url, glitch2.url, glitch3.url];

interface VideoGlitchLoaderProps {
  poster?: string;
  className?: string;
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
          {/* Flickering glitch overlay frames */}
          {GLITCH_FRAMES.map((src, i) => (
            <img
              key={src}
              src={src}
              alt=""
              className="absolute inset-0 w-full h-full object-cover mix-blend-screen pointer-events-none"
              style={{
                animation: `video-glitch-frame-${i} 1.2s steps(1) infinite`,
                opacity: 0,
              }}
              draggable={false}
            />
          ))}
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
