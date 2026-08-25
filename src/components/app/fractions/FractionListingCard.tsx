/**
 * Fraction Listing Card
 * =====================
 * One listing in the market grid.
 *
 * The post title, thumbnail and creator are read off the listing row, not
 * fetched. They were snapshotted when the listing was created precisely so a
 * grid of sixty cards is one Supabase query instead of sixty /api/feed calls —
 * the token id is the only field here that decides anything.
 */

import { memo } from 'react';
import { ImageIcon, Music, Video, Users } from 'lucide-react';
import { cdnImage } from '@/lib/media-url';
import { truncateAddress } from '@/lib/api/token-holders';
import { useTokenPrices } from '@/hooks/use-token-prices';
import { SellerTrustBadge } from './SellerTrustBadge';
import { TOTAL_FRACTIONS, type FractionListing, type FractionSellerStats } from '@/hooks/use-fraction-marketplace';
import dehubCoin from '@/assets/dehub-coin.png';

interface FractionListingCardProps {
  listing: FractionListing;
  stats?: FractionSellerStats | null;
  isMine?: boolean;
  onClick: () => void;
}

const TYPE_ICON: Record<string, typeof ImageIcon> = {
  audio: Music,
  video: Video,
  image: ImageIcon,
};

export const FractionListingCard = memo(function FractionListingCard({
  listing,
  stats,
  isMine,
  onClick,
}: FractionListingCardProps) {
  const available = listing.quantity - listing.filled_quantity;
  const totalDhb = available * listing.price_per_fraction;
  const { data: prices } = useTokenPrices();
  const dhbUsd = prices?.DHB ?? 0;

  const Icon = TYPE_ICON[listing.post_type || ''] || ImageIcon;
  const thumbnail = listing.post_image_url ? cdnImage(listing.post_image_url, { width: 400 }) : '';
  // Share of the whole upload this listing represents. It is the number that
  // makes a fraction price mean something — 50 of 1000 is 5% of the post.
  const sharePct = (available / TOTAL_FRACTIONS) * 100;

  return (
    <button
      onClick={onClick}
      className="text-left rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm overflow-hidden hover:border-white/20 transition-colors group"
    >
      <div className="aspect-square bg-white/5 relative overflow-hidden">
        {thumbnail ? (
          <img
            src={thumbnail}
            alt={listing.post_title || `Post #${listing.token_id}`}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-white/20">
            <Icon className="w-8 h-8" />
          </div>
        )}
        <span className="absolute top-2 left-2 text-[10px] font-semibold bg-black/70 text-white/90 px-1.5 py-0.5 rounded backdrop-blur-sm">
          {available} / {TOTAL_FRACTIONS}
        </span>
        {isMine && (
          <span className="absolute top-2 right-2 text-[10px] font-semibold bg-white/90 text-black px-1.5 py-0.5 rounded">
            Yours
          </span>
        )}
      </div>

      <div className="p-3 space-y-1">
        <h3 className="text-sm font-medium text-white truncate">
          {listing.post_title || `Post #${listing.token_id}`}
        </h3>
        <p className="text-xs text-zinc-400 truncate flex items-center gap-1">
          <Users className="w-3 h-3 shrink-0" />
          {listing.creator_username || truncateAddress(listing.seller_address)}
        </p>

        <p className="text-sm font-semibold text-white flex items-center gap-1 pt-0.5">
          <img src={dehubCoin} alt="DHB" className="w-4 h-4" />
          {listing.price_per_fraction.toLocaleString(undefined, { maximumFractionDigits: 4 })}
          <span className="text-[10px] font-normal text-zinc-500">/ fraction</span>
        </p>
        <p className="text-[10px] text-zinc-500">
          {totalDhb.toLocaleString(undefined, { maximumFractionDigits: 2 })} DHB for {sharePct.toFixed(1)}% of the post
          {dhbUsd > 0 && ` · $${(totalDhb * dhbUsd).toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
        </p>

        <SellerTrustBadge stats={stats} compact className="pt-0.5" />
      </div>
    </button>
  );
});
