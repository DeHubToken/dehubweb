/**
 * SponsoredAdCard
 * ===============
 * Native-looking feed card for a served POVR ad (image / video / text
 * creative + headline + CTA). Visually matches organic cards — same radii,
 * type scale and theme-safe colors — with a clear "AD" pill. Impression
 * viewability (50% for 1s) and click beacons are handled by useAdImpression.
 */

import { useState } from 'react';
import { Megaphone, ExternalLink, Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ServedAd } from '@/lib/ads/povr';
import { useAdImpression } from '@/hooks/use-ad-serving';

interface SponsoredAdCardProps {
  ad: ServedAd;
  className?: string;
  /** Compact horizontal layout for narrow slots (related rails). */
  compact?: boolean;
}

export function SponsoredAdCard({ ad, className, compact = false }: SponsoredAdCardProps) {
  const { ref, onClick } = useAdImpression(ad);
  const [videoPlaying, setVideoPlaying] = useState(false);

  const media = ad.kind !== 'text' && ad.mediaUrl ? (
    <div
      className={cn(
        'relative w-full overflow-hidden rounded-xl bg-black/20',
        compact ? 'aspect-video' : ad.kind === 'video' ? 'aspect-video' : '',
      )}
    >
      {ad.kind === 'video' ? (
        videoPlaying ? (
          <video
            src={ad.mediaUrl}
            poster={ad.thumbnailUrl ?? undefined}
            className="w-full h-full object-cover"
            autoPlay
            muted
            loop
            playsInline
            controls
          />
        ) : (
          <button
            type="button"
            className="relative w-full h-full group"
            onClick={(e) => { e.stopPropagation(); setVideoPlaying(true); }}
            aria-label="Play ad video"
          >
            {ad.thumbnailUrl ? (
              <img src={ad.thumbnailUrl} alt={ad.headline} className="w-full h-full object-cover" loading="lazy" />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-zinc-700/40 to-zinc-900/40" />
            )}
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="w-12 h-12 rounded-full bg-black/60 backdrop-blur flex items-center justify-center group-hover:scale-110 transition-transform">
                <Play className="w-5 h-5 text-white ml-0.5" fill="currentColor" />
              </span>
            </span>
          </button>
        )
      ) : (
        <img
          src={ad.mediaUrl}
          alt={ad.headline}
          className="w-full max-h-[520px] object-cover"
          loading="lazy"
        />
      )}
    </div>
  ) : null;

  return (
    <div
      ref={ref}
      className={cn('w-full cursor-pointer select-none', className)}
      onClick={onClick}
      role="link"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onClick(); }}
    >
      {/* Advertiser row */}
      <div className="flex items-center gap-2 mb-2">
        <div className="w-8 h-8 rounded-full bg-foreground/10 flex items-center justify-center shrink-0">
          <Megaphone className="w-4 h-4 text-foreground/70" strokeWidth={1.75} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground truncate">{ad.advertiser}</p>
          <p className="text-[11px] text-muted-foreground">Sponsored</p>
        </div>
        <span className="px-1.5 py-0.5 bg-yellow-500 text-black text-xs font-bold rounded shrink-0">AD</span>
      </div>

      {media}

      {/* Copy + CTA */}
      <div className={cn('space-y-1.5', media ? 'pt-3' : '')}>
        <h4 className="text-sm font-semibold text-foreground leading-snug">{ad.headline}</h4>
        {ad.body && (
          <p className="text-sm text-muted-foreground leading-snug line-clamp-3">{ad.body}</p>
        )}
        {ad.ctaUrl && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onClick(); }}
            className={cn(
              'mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium',
              'bg-foreground/10 hover:bg-foreground/15 text-foreground',
              'border border-foreground/10 transition-colors',
            )}
          >
            {ad.ctaLabel || 'Learn more'}
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

export default SponsoredAdCard;
