/**
 * LiveEndedMedia
 * --------------
 * Media fill for a live post that is no longer live (a past broadcast).
 *
 * - If a cover/thumbnail image exists, it's shown as the frame with a small
 *   "Live ended" badge so viewers can tell it was a past live — not an empty,
 *   still-loading, or currently-live card.
 * - If there's no cover (or it fails to load), it falls back to a "staticy TV
 *   screen" of animated snow with a centered "Live ended" chip.
 *
 * Fully self-contained: the static texture is an inline feTurbulence SVG data
 * URI, so nothing here can 404 (no network → no broken-image icons). This is
 * what replaces the old empty/black placeholder that live posts used to show.
 */
import { useEffect, useState } from 'react';
import { Radio } from 'lucide-react';
import { cn } from '@/lib/utils';

// Tileable grayscale noise, ~200 bytes. stitchTiles keeps the tile seamless.
// (Mirrors the texture used by VideoGlitchLoader so the two read as one system.)
const NOISE_TEXTURE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.82' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)'/%3E%3C/svg%3E";

interface LiveEndedMediaProps {
  /** Cover/thumbnail image for the past broadcast, if any. */
  thumbnail?: string | null;
  /** Badge/chip label. Defaults to "Live ended". */
  label?: string;
  className?: string;
  rounded?: string;
}

/** Animated TV-snow screen shown when there's no usable cover image. */
function TvStatic({ label }: { label: string }) {
  return (
    <div className="absolute inset-0 bg-black overflow-hidden" aria-hidden="true">
      {/* Snow — noise tile re-randomizes position each step */}
      <div
        className="absolute inset-0 opacity-90"
        style={{
          backgroundImage: `url("${NOISE_TEXTURE}")`,
          backgroundSize: '140px 140px',
          animation: 'tv-static-snow 0.45s steps(1) infinite',
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
      {/* Vignette so the centered chip stays legible over the snow */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/10 to-black/50" />
      {/* Centered "Live ended" chip */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
        <div className="w-11 h-11 rounded-xl bg-black/50 backdrop-blur-md border border-white/15 flex items-center justify-center">
          <Radio className="w-5 h-5 text-white/70" />
        </div>
        <span className="text-white/80 text-xs font-medium tracking-wide drop-shadow">
          {label}
        </span>
      </div>
    </div>
  );
}

export function LiveEndedMedia({
  thumbnail,
  label = 'Live ended',
  className,
  rounded = 'rounded-lg',
}: LiveEndedMediaProps) {
  const [imgFailed, setImgFailed] = useState(false);
  useEffect(() => setImgFailed(false), [thumbnail]);

  const showCover = !!thumbnail && !imgFailed;

  return (
    <div className={cn('absolute inset-0 overflow-hidden bg-black', rounded, className)}>
      {showCover ? (
        <>
          <img
            src={thumbnail as string}
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
            draggable={false}
            onError={() => setImgFailed(true)}
          />
          {/* Subtle scrim so the badge always reads over bright covers */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
          {/* "Live ended" badge — top-left, so a past live is never mistaken
              for a still-live or still-loading card */}
          <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-black/50 backdrop-blur-md border border-white/15 rounded-lg px-2 py-1">
            <Radio className="w-3 h-3 text-white/70" />
            <span className="text-white/80 text-[10px] font-semibold uppercase tracking-wide">
              {label}
            </span>
          </div>
        </>
      ) : (
        <TvStatic label={label} />
      )}
    </div>
  );
}
