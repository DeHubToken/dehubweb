/**
 * Username Row
 * ============
 * One handle in the browse list, full width of the column.
 *
 * A row rather than a grid tile, because a handle is a short string and a tile
 * wastes the whole middle of the page on padding. Worse, a narrow tile forces
 * long handles down to a size nobody can read — and the handle is the product,
 * so shrinking it to fit a box is the one thing this card must not do.
 *
 * Full width gives the name room at a readable size on every viewport, and
 * moves price and seller to the right where they read as attributes of it
 * rather than as a second stacked card.
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

/**
 * Handle type size, by length.
 *
 * A full-width row can hold ~30 characters at the largest step, so this only
 * steps down for genuinely long names — and the floor is still bigger than the
 * old tile's ceiling.
 */
function handleClass(length: number): string {
  if (length <= 12) return 'text-2xl sm:text-3xl';
  if (length <= 20) return 'text-xl sm:text-2xl';
  return 'text-lg sm:text-xl';
}

export const UsernameCard = memo(function UsernameCard({ listing, onClick, isOwn }: Props) {
  const avatar = buildAvatarUrl(listing.seller.address, listing.seller.avatarUrl);
  const sellerName = listing.seller.displayName || shortAddress(listing.seller.address);

  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm hover:border-white/20 transition-colors px-4 py-3.5 flex items-center gap-4"
    >
      {/* Left: the handle and what makes it worth having. `min-w-0` so the
          flex child may actually shrink — without it a long name pushes the
          price off the row instead of wrapping. */}
      <div className="min-w-0 flex-1">
        <p className={`font-bold text-white break-all leading-tight ${handleClass(listing.username.length)}`}>
          <span className="text-zinc-500">@</span>
          {listing.username}
        </p>

        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
          <Chip icon={<Ruler className="w-3 h-3" />} label={`${listing.length} char${listing.length === 1 ? '' : 's'}`} />
          {listing.isNumeric && <Chip icon={<Hash className="w-3 h-3" />} label="Numbers only" />}
          {isOwn && <Chip label="Yours" />}

          {/* Seller rides the chip row on wide viewports — it is the least
              important thing here, and giving it its own line on a row this
              short leaves a gap. */}
          <span className="hidden sm:flex items-center gap-1.5 min-w-0 ml-1">
            {avatar ? (
              <img src={avatar} alt="" className="w-4 h-4 rounded-full object-cover shrink-0" loading="lazy" />
            ) : (
              <span className="w-4 h-4 rounded-full bg-white/10 shrink-0" />
            )}
            <span className="text-xs text-zinc-400 truncate max-w-[14rem]">{sellerName}</span>
            <BadgeIcon badgeBalance={listing.seller.badgeBalance} className="w-[9px] h-[9px] shrink-0" />
          </span>
        </div>

        {listing.description && (
          <p className="text-xs text-zinc-400 mt-1.5 line-clamp-1">{listing.description}</p>
        )}
      </div>

      {/* Right: the price, right-aligned so a column of rows lines up on the
          digits rather than on the end of each name. */}
      <div className="shrink-0 text-right">
        <p className="text-base sm:text-lg font-semibold text-white flex items-center justify-end gap-1.5 whitespace-nowrap">
          <img src={dehubCoin} alt="DHB" className="w-4 h-4 sm:w-5 sm:h-5" />
          {listing.priceDhb.toLocaleString()}
        </p>
        <p className="text-[11px] text-zinc-500 whitespace-nowrap">
          ≈ ${listing.priceUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}
        </p>
        {/* Below sm the seller drops out of the chip row, so it lands here
            instead of vanishing entirely. */}
        <span className="sm:hidden flex items-center justify-end gap-1 mt-1 min-w-0">
          <span className="text-[10px] text-zinc-500 truncate max-w-[7rem]">{sellerName}</span>
          <BadgeIcon badgeBalance={listing.seller.badgeBalance} className="w-[8px] h-[8px] shrink-0" />
        </span>
      </div>
    </button>
  );
});

function Chip({ icon, label }: { icon?: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-zinc-300 bg-white/10 rounded px-1.5 py-0.5 whitespace-nowrap">
      {icon}
      {label}
    </span>
  );
}

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
