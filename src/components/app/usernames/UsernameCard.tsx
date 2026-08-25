/**
 * Username Card
 * =============
 * One handle in the browse grid.
 *
 * Text-first rather than image-first, unlike the store card it sits beside:
 * the handle *is* the product, so it gets the whole top of the card and the
 * seller is a footnote. The two chips under it — character count and
 * digits-only — are the properties that actually make a handle valuable, and
 * they are the only sort keys worth surfacing on the card itself.
 */

import { memo } from 'react';
import { Hash, Ruler } from 'lucide-react';
import dehubCoin from '@/assets/dehub-coin.png';
import { buildAvatarUrl } from '@/lib/media-url';
import { BadgeIcon } from '@/components/app/BadgeIcon';
import type { UsernameListing } from '@/lib/api/dehub/username-market';

interface Props {
  listing: UsernameListing;
  onClick: () => void;
  /** The viewer's own listing — shown, but never buyable. */
  isOwn?: boolean;
}

export const UsernameCard = memo(function UsernameCard({ listing, onClick, isOwn }: Props) {
  const avatar = buildAvatarUrl(listing.seller.address, listing.seller.avatarUrl);
  const sellerName = listing.seller.displayName || shortAddress(listing.seller.address);

  return (
    <button
      onClick={onClick}
      className="text-left rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm overflow-hidden hover:border-white/20 transition-colors group flex flex-col"
    >
      <div className="px-4 pt-4 pb-3 flex-1 min-w-0">
        {/* The handle. Long ones step down rather than truncating — the whole
            name is the thing being sold, so hiding half of it is not an
            option a card like this can take. */}
        <p
          className={`font-bold text-white break-all leading-tight ${
            listing.username.length <= 8 ? 'text-2xl' : listing.username.length <= 16 ? 'text-lg' : 'text-sm'
          }`}
        >
          <span className="text-zinc-500">@</span>
          {listing.username}
        </p>

        <div className="flex flex-wrap gap-1.5 mt-2">
          <Chip icon={<Ruler className="w-3 h-3" />} label={`${listing.length} char${listing.length === 1 ? '' : 's'}`} />
          {listing.isNumeric && <Chip icon={<Hash className="w-3 h-3" />} label="Numbers only" />}
          {isOwn && <Chip label="Yours" />}
        </div>

        {listing.description && (
          <p className="text-xs text-zinc-400 mt-2 line-clamp-2">{listing.description}</p>
        )}
      </div>

      <div className="px-4 py-3 border-t border-white/10 space-y-2">
        <p className="text-sm font-semibold text-white flex items-center gap-1.5">
          <img src={dehubCoin} alt="DHB" className="w-4 h-4" />
          {listing.priceDhb.toLocaleString()}
          <span className="text-xs font-normal text-zinc-500">
            ≈ ${listing.priceUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </span>
        </p>

        <div className="flex items-center gap-1.5 min-w-0">
          {avatar ? (
            <img src={avatar} alt="" className="w-4 h-4 rounded-full object-cover shrink-0" loading="lazy" />
          ) : (
            <span className="w-4 h-4 rounded-full bg-white/10 shrink-0" />
          )}
          <span className="text-xs text-zinc-400 truncate">{sellerName}</span>
          <BadgeIcon badgeBalance={listing.seller.badgeBalance} className="w-[9px] h-[9px] shrink-0" />
        </div>
      </div>
    </button>
  );
});

function Chip({ icon, label }: { icon?: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-zinc-300 bg-white/10 rounded px-1.5 py-0.5">
      {icon}
      {label}
    </span>
  );
}

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
