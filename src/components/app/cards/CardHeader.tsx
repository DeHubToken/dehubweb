import { translateCopy as _translateCopy } from '@/i18n/copy';
/**
 * Card Header Component
 * =====================
 * Universal header for all feed card types.
 * Displays avatar with gradient ring, username, verified badge, and content type label.
 * Clickable to navigate to creator's profile.
 * Badge is fetched on-chain via useBadgeBalance hook.
 */

import { useState } from 'react';
import { CheckCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getAgentAvatarFallback } from '@/constants/agent-avatars.constants';
import { BadgeIcon } from '@/components/app/BadgeIcon';
import { NewMemberChip } from '@/components/app/NewMemberChip';
import { seedProfileCache } from '@/lib/profile-cache-seed';
import { ProfileHoverCard } from '@/components/app/ProfileHoverCard';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from 'react-i18next';

import type { ContentType } from '@/types/feed.types';
import type { BadgeLock } from '@/lib/staking-badges';

interface CardHeaderProps {
  /** Display name or username */
  username: string;
  /** @handle for the user (optional, shown greyed next to username) */
  handle?: string;
  /** Seed for generating avatar image or actual avatar URL */
  avatarSeed: string;
  /** Whether user is verified */
  verified?: boolean;
  /** Type of content for badge display */
  contentType: ContentType;
  /** Whether this is a live stream (shows pulsing indicator) */
  isLive?: boolean;
  /** Creator's user ID for navigation */
  creatorId?: string;
  /** Creator's username for URL-based navigation */
  creatorUsername?: string;
  /** Timestamp to show next to username (e.g., "2h") */
  timestamp?: string;
  /** View count to show next to timestamp. Already includes signed-out viewers. */
  viewCount?: string | number;
  /** Post token id. */
  tokenId?: string | number;
  /** Badge balance from API data (avoids edge function call) */
  badgeBalance?: number;
  /**
   * Username or wallet to resolve the badge from, for surfaces whose payload
   * carries no balance (governance proposals, feature requests).
   */
  badgeLookupId?: string | null;
  /**
   * The holder's grandfathered tier, when the payload carries one. A provided
   * `badgeBalance` skips the account lookup, so without this the badge falls
   * back to the live ladder for that balance.
   */
  badgeLock?: BadgeLock | null;
}

/**
 * Badge configuration for each content type
 */
const CONTENT_BADGES: Record<ContentType, { label: string; className: string }> = {
  post: { get label() { return _translateCopy("copy.a5554622c655", { defaultValue: "Post" }); }, className: 'bg-zinc-500/20 text-zinc-400' },
  video: { get label() { return _translateCopy("copy.d534be829e32", { defaultValue: "Video" }); }, className: 'bg-zinc-500/20 text-zinc-300' },
  image: { get label() { return _translateCopy("copy.1aa4cb0bcca7", { defaultValue: "Image" }); }, className: 'bg-purple-500/20 text-purple-400' },
  live: { get label() { return _translateCopy("copy.35e0d0360a0a", { defaultValue: "LIVE" }); }, className: 'bg-red-500 text-white' },
  short: { get label() { return _translateCopy("copy.f5d61ead3eef", { defaultValue: "Short" }); }, className: 'bg-pink-500/20 text-pink-400' },
};

export function CardHeader({ 
  username, 
  handle,
  avatarSeed, 
  verified = false, 
  contentType,
  isLive = false,
  creatorId,
  creatorUsername,
  timestamp,
  viewCount,
  tokenId,
  badgeBalance,
  badgeLookupId,
  badgeLock,
}: CardHeaderProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { walletAddress: viewerAddress } = useAuth();
  const [imageError, setImageError] = useState(false);
  const badge = CONTENT_BADGES[contentType];

  // Use feed-provided avatar directly — no extra API call needed
  const agentFallback = getAgentAvatarFallback(creatorId);
  
  
  // Only use avatarSeed as image source if it's a real URL and hasn't errored
  const hasRealAvatar = avatarSeed && avatarSeed.startsWith('http') && !imageError;
  const avatarSrc = hasRealAvatar ? avatarSeed : agentFallback;

  const handleProfileClick = () => {
    // Seed profile cache with data we already have from the feed card
    const cleanUsername = creatorUsername?.replace('@', '');
    if (cleanUsername || creatorId) {
      seedProfileCache(queryClient, {
        address: creatorId,
        username: cleanUsername,
        displayName: username,
        avatarUrl: hasRealAvatar ? avatarSeed : undefined,
        badgeBalance,
      }, viewerAddress || undefined);
    }

    // Prefer username-based navigation, fallback to ID
    if (creatorUsername) {
      navigate(`/${cleanUsername}`);
    } else if (creatorId) {
      navigate(`/app/profile?id=${creatorId}`);
    }
  };

  const isClickable = !!(creatorId || creatorUsername);
  
  // Format handle to ensure it starts with @
  const formattedHandle = handle ? (handle.startsWith('@') ? handle : `@${handle}`) : null;

  // Prevent focus scroll-into-view on click (which causes the feed to jump to top)
  const handleProfileMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
  };

  return (
    <div className={`flex items-end gap-3 pr-3 flex-1 min-w-0 ${contentType === 'image' ? 'pb-2' : 'pb-3'}`}>
      <ProfileHoverCard
        creatorId={creatorId}
        creatorUsername={creatorUsername}
        displayName={username}
        avatarUrl={hasRealAvatar ? avatarSeed : undefined}
        verified={verified}
        badgeBalance={badgeBalance}
      >
        <button
          onClick={handleProfileClick}
          onMouseDown={handleProfileMouseDown}
          disabled={!isClickable}
          /* The avatar inside has no alt (it is decorative beside the name),
             so the button needs a name of its own — one per card on the feed,
             and all of them were nameless on the 2026-09-02 Lighthouse run. */
          aria-label={t('feed.viewProfile', { name: username })}
          className={`shrink-0 ${isClickable ? 'cursor-pointer' : 'cursor-default'}`}
        >
          <Avatar className="w-9 h-9 rounded-md">
            {avatarSrc && <AvatarImage src={avatarSrc} onError={() => setImageError(true)} className="rounded-md" />}
            <AvatarFallback className="bg-zinc-700 text-white font-medium rounded-md">{username[0]?.toUpperCase()}</AvatarFallback>
          </Avatar>
        </button>
      </ProfileHoverCard>
      <button
        onClick={handleProfileClick}
        onMouseDown={handleProfileMouseDown}
        disabled={!isClickable}
        className={`flex flex-1 flex-col min-w-0 text-left ${isClickable ? 'cursor-pointer' : 'cursor-default'}`}
      >
        <div className="flex items-center gap-1.5 min-w-0 w-full">
          <span className="inline-flex items-baseline gap-1 shrink min-w-0 max-w-full text-base leading-5">
            <span className="font-semibold text-white truncate min-w-0 leading-5">{username}</span>
            <BadgeIcon badgeBalance={badgeBalance} lookupId={badgeLookupId} username={handle || username} badgeLock={badgeLock} className="w-[1em] h-[1em]" />
            <NewMemberChip address={creatorId} className="shrink-0 ml-0.5" />
          </span>
          {verified && <CheckCircle className="w-3.5 h-3.5 text-white shrink-0 self-end" />}
        </div>
        {(formattedHandle || timestamp) && (
          <div className="flex items-center gap-1 min-w-0 w-full">
            {formattedHandle && (
              <span className="text-zinc-500 text-sm truncate min-w-0 leading-4">{formattedHandle}</span>
            )}
            {timestamp && (
              <>
                <span className="text-zinc-600 text-[13px]">·</span>
                <span className="text-zinc-500 text-[13px] leading-4 shrink-0">{timestamp}</span>
              </>
            )}
          </div>
        )}
      </button>
    </div>
  );
}
