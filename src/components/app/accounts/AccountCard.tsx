/**
 * Account Row
 * ===========
 * One account in the browse list, full width of the column.
 *
 * A row rather than a grid tile, for the same reason the username list is —
 * see UsernameCard. What differs is what earns the space: an account's worth
 * is its audience and its history, so followers, uploads and age get the chip
 * row, and the seller's avatar leads because the account IS the seller's
 * public face.
 */

import { memo } from 'react';
import { CalendarClock, Upload, Users } from 'lucide-react';
import dehubCoin from '@/assets/dehub-coin.png';
import { buildAvatarUrl } from '@/lib/media-url';
import { BadgeIcon } from '@/components/app/BadgeIcon';
import type { AccountListing } from '@/lib/api/dehub/account-market';

interface Props {
  listing: AccountListing;
  onClick: () => void;
  /** The viewer's own listing — shown, but never buyable. */
  isOwn?: boolean;
}

function handleClass(length: number): string {
  if (length <= 12) return 'text-xl sm:text-2xl';
  if (length <= 20) return 'text-lg sm:text-xl';
  return 'text-base sm:text-lg';
}

/** "since 2021", off the account's creation date. */
export function accountSince(accountCreatedAt: string | null): string | null {
  if (!accountCreatedAt) return null;
  const year = new Date(accountCreatedAt).getFullYear();
  return Number.isFinite(year) ? `since ${year}` : null;
}

export function compactCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 ? 1 : 0)}k`;
  return String(n);
}

export const AccountCard = memo(function AccountCard({ listing, onClick, isOwn }: Props) {
  const avatar = buildAvatarUrl(listing.seller.address, listing.seller.avatarUrl);
  const since = accountSince(listing.seller.accountCreatedAt);

  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm hover:border-white/20 transition-colors px-4 py-3.5 flex items-center gap-4"
    >
      {/* The account's face. */}
      {avatar ? (
        <img src={avatar} alt="" className="w-12 h-12 rounded-full object-cover shrink-0" loading="lazy" />
      ) : (
        <span className="w-12 h-12 rounded-full bg-white/10 shrink-0" />
      )}

      {/* Middle: the handle and what makes the account worth having. `min-w-0`
          so the flex child may actually shrink. */}
      <div className="min-w-0 flex-1">
        <p className={`font-bold text-white break-all leading-tight flex items-center gap-1.5 ${handleClass(listing.username.length)}`}>
          <span className="min-w-0 break-all">
            <span className="text-zinc-500">@</span>
            {listing.username}
          </span>
          <BadgeIcon badgeBalance={listing.seller.badgeBalance} className="w-[11px] h-[11px] shrink-0" />
        </p>

        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
          <Chip icon={<Users className="w-3 h-3" />} label={`${compactCount(listing.seller.followers)} followers`} />
          <Chip icon={<Upload className="w-3 h-3" />} label={`${compactCount(listing.seller.uploads)} uploads`} />
          {since && <Chip icon={<CalendarClock className="w-3 h-3" />} label={since} />}
          {isOwn && <Chip label="Yours" />}
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
