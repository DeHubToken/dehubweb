/**
 * Stage host backlink
 * ===================
 * Makes a stage card's "Hosted by" block open the host's profile —
 * username-first with the wallet-id fallback, the same resolution
 * PastStagesList uses — and hangs the shared ProfileHoverCard preview off it.
 *
 * `nested` renders the trigger as a <span role="link"> instead of a <button>,
 * for hosts drawn inside cards that are themselves one big <button> (the live
 * card, the music carousel card), where a nested button is invalid HTML.
 * Clicks stop propagating either way, so opening the profile never also
 * opens the stage.
 */

import { useNavigate } from 'react-router-dom';
import { ProfileHoverCard } from '@/components/app/ProfileHoverCard';
import { cn } from '@/lib/utils';
import type { AudioSpace } from '@/types/audio-spaces.types';

interface StageHostLinkProps {
  space: Pick<AudioSpace, 'host_username' | 'host_wallet_address'>;
  /** Resolved avatar URL, passed through to the hover card. */
  avatarUrl?: string;
  /** True when rendered inside a card that is itself a <button>. */
  nested?: boolean;
  className?: string;
  children: React.ReactNode;
}

export function StageHostLink({
  space,
  avatarUrl,
  nested = false,
  className,
  children,
}: StageHostLinkProps) {
  const navigate = useNavigate();
  const handle = space.host_username?.replace('@', '');

  // Nothing to link to — keep the layout, skip the affordance.
  if (!handle && !space.host_wallet_address) {
    return <div className={className}>{children}</div>;
  }

  const openProfile = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    if (handle) navigate(`/${handle}`);
    else navigate(`/app/profile?id=${space.host_wallet_address}`);
  };

  const label = `View @${handle || space.host_wallet_address?.slice(0, 6)}'s profile`;

  return (
    <ProfileHoverCard
      creatorId={space.host_wallet_address || undefined}
      creatorUsername={handle || undefined}
      displayName={handle || undefined}
      avatarUrl={avatarUrl}
    >
      {nested ? (
        <span
          role="link"
          tabIndex={0}
          aria-label={label}
          onClick={openProfile}
          onKeyDown={(e) => {
            if (e.key === 'Enter') openProfile(e);
          }}
          className={cn('cursor-pointer text-left', className)}
        >
          {children}
        </span>
      ) : (
        <button
          type="button"
          aria-label={label}
          onClick={openProfile}
          className={cn('text-left', className)}
        >
          {children}
        </button>
      )}
    </ProfileHoverCard>
  );
}

export default StageHostLink;
