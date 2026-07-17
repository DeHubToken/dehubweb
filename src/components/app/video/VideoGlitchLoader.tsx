/**
 * VideoGlitchLoader
 * -----------------
 * Loading state for videos: renders the poster/first-frame with an
 * RGB-split glitch + scanlines + a jittering TV-static texture, plus a
 * full-width horizontal "tracking error" line of pure TV snow that rolls
 * down the frame.
 *
 * Fully self-contained: the static texture is an inline feTurbulence SVG
 * data URI, so nothing here can 404 (no network → no broken-image icons).
 * If the poster URL fails (or none is given), the poster layers are dropped
 * and the static/scanlines/slice keep running on their own.
 */
import { memo, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

// Tileable grayscale noise, ~200 bytes. stitchTiles keeps the tile seamless.
const NOISE_TEXTURE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.82' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)'/%3E%3C/svg%3E";

// The RGB-split channels are drop-shadowed copies of a full-bleed opaque
// poster, so their colour otherwise peeks out as hard red/cyan vertical
// lines pinned to the left/right frame edges. Feathering each channel at
// the horizontal edges kills those side lines while the split still reads
// in the body of the frame during jitter. The feather (>channel offset +
// jitter) travels with the element, so no line reappears mid-animation.
const CHANNEL_EDGE_MASK =
  'linear-gradient(to right, transparent, black 7%, black 93%, transparent)';

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
  const [posterFailed, setPosterFailed] = useState(false);
  useEffect(() => setPosterFailed(false), [poster]);
  const showPoster = !!poster && !posterFailed;

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
      {showPoster ? (
        <>
          {/* Base frame */}
          <img
            src={poster}
            alt=""
            onError={() => setPosterFailed(true)}
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
              animation: 'video-glitch-r 0.9s steps(1) infinite',
              maskImage: CHANNEL_EDGE_MASK,
              WebkitMaskImage: CHANNEL_EDGE_MASK,
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
              animation: 'video-glitch-c 0.9s steps(1) infinite',
              maskImage: CHANNEL_EDGE_MASK,
              WebkitMaskImage: CHANNEL_EDGE_MASK,
            }}
            draggable={false}
          />
        </>
      ) : (
        <div className="absolute inset-0 bg-white/[0.06] animate-pulse" />
      )}
      {/* TV static — noise tile jitters position/opacity in discrete steps */}
      <div
        className="absolute inset-0 mix-blend-screen"
        style={{
          backgroundImage: `url("${NOISE_TEXTURE}")`,
          backgroundSize: '140px 140px',
          animation: 'video-glitch-static 0.45s steps(1) infinite',
        }}
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
      {/* Horizontal tracking-error line — pure TV snow, no fill of its own.
          contrast() crushes the grey noise to black/white and the screen
          blend drops the black, so only bright speckles render over the
          frame; the vertical mask feathers the edges so it reads as a
          flickering line of static rather than a rectangle. */}
      <div
        className="absolute mix-blend-screen"
        style={{
          // Overshoot the frame horizontally so the line always spans the
          // full width — never a floating block with visible side edges.
          left: '-12px',
          right: '-12px',
          height: 'clamp(8px, 6%, 18px)',
          backgroundImage: `url("${NOISE_TEXTURE}")`,
          backgroundSize: '110px 110px',
          filter: 'contrast(2.8) brightness(1.35)',
          maskImage:
            'linear-gradient(to bottom, transparent, black 35%, black 65%, transparent)',
          WebkitMaskImage:
            'linear-gradient(to bottom, transparent, black 35%, black 65%, transparent)',
          animation:
            'video-glitch-slice 2.8s linear infinite, video-glitch-line-static 0.14s steps(1) infinite',
        }}
      />
      {/* Vignette darken — only over a real poster frame */}
      {showPoster && <div className="absolute inset-0 bg-black/25" />}
    </div>
  );
});
