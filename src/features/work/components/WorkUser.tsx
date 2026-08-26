/**
 * A person on a bounty â€” poster, applicant, worker or reviewer.
 *
 * Every Work surface used to print a raw `0x1234â€¦abcd`, which is unreadable and
 * tells you nothing about who you are about to pay. Identity comes from the same
 * `account_info` cache the leaderboards use, keyed on the address alone, so the
 * poster rendered in the header and the same wallet rendered again as a
 * submitter cost one request between them.
 *
 * The address stays visible as the subtitle wherever it identifies a payee â€”
 * a username is a display name, but the money moves to the address, and the
 * poster is entitled to check it before signing.
 */
import { Link } from 'react-router-dom';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { BadgeIcon } from '@/components/app/BadgeIcon';
import { profileAvatar, profileName, useWalletProfiles } from '@/hooks/use-wallet-profiles';
import { cn } from '@/lib/utils';

export function shortAddress(address: string): string {
  return address.length > 12 ? `${address.slice(0, 6)}â€¦${address.slice(-4)}` : address;
}

/**
 * Profile lookup for one address. `useWalletProfiles` keys its cache on the
 * address, so calling this once per row is a single fetch per distinct wallet
 * however many rows ask â€” no need to hoist a map into every parent.
 */
export function WorkUser({
  address,
  size = 'sm',
  showAddress = false,
  trailing,
  className,
}: {
  address: string;
  size?: 'sm' | 'md';
  /** Print the raw address under the name â€” use wherever this wallet gets paid. */
  showAddress?: boolean;
  trailing?: React.ReactNode;
  className?: string;
}) {
  const profiles = useWalletProfiles([address]);
  const profile = profiles[address];
  const name = profileName(profile, address);
  const avatarUrl = profileAvatar(profile, address);
  const dim = size === 'md' ? 'h-9 w-9' : 'h-7 w-7';

  return (
    <div className={cn('flex min-w-0 items-center gap-2', className)}>
      <Link to={`/${address}`} className="shrink-0">
        <Avatar className={dim}>
          {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
          <AvatarFallback className="bg-white/10 text-[11px] font-medium text-white">
            {name.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
      </Link>
      <div className="min-w-0 flex-1">
        <Link
          to={`/${address}`}
          className="flex items-center gap-1.5 text-sm font-medium text-white hover:underline"
        >
          {/* pr-3 reserves the badge's corner â€” the placement WhoToFollow uses. */}
          <span className="relative min-w-0 truncate pr-3">
            {name}
            <BadgeIcon
              badgeBalance={profile?.badgeBalance}
              username={profile?.username}
              className="absolute right-0 top-0 h-[9px] w-[9px]"
            />
          </span>
        </Link>
        {showAddress && (
          <span className="block truncate font-mono text-[10px] text-white/40">{shortAddress(address)}</span>
        )}
      </div>
      {trailing}
    </div>
  );
}
