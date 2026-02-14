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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useProfileAvatar } from '@/hooks/use-profile-avatar-cache';
import { getAgentAvatarFallback } from '@/constants/agent-avatars.constants';
import { getBadgeUrl } from '@/lib/staking-badges';
import { useBadgeBalance } from '@/hooks/use-badge-balance';

import type { ContentType } from '@/types/feed.types';

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
  /** View count to show next to timestamp */
  viewCount?: string | number;
}

/**
 * Badge configuration for each content type
 */
const CONTENT_BADGES: Record<ContentType, { label: string; className: string }> = {
  post: { label: 'Post', className: 'bg-zinc-500/20 text-zinc-400' },
  video: { label: 'Video', className: 'bg-blue-500/20 text-blue-400' },
  image: { label: 'Image', className: 'bg-purple-500/20 text-purple-400' },
  live: { label: 'LIVE', className: 'bg-red-500 text-white' },
  short: { label: 'Short', className: 'bg-pink-500/20 text-pink-400' },
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
}: CardHeaderProps) {
  const navigate = useNavigate();
  const [imageError, setImageError] = useState(false);
  const badge = CONTENT_BADGES[contentType];

  // Use live avatar from cache, falling back to feed-provided avatar
  const liveAvatarUrl = useProfileAvatar(creatorId, avatarSeed);
  const agentFallback = getAgentAvatarFallback(creatorId);
  
  // Fetch on-chain badge balance
  const { badgeBalance } = useBadgeBalance(creatorId);
  const badgeUrl = getBadgeUrl(badgeBalance);
  
  // Only use avatarSeed as image source if it's a real URL and hasn't errored
  const hasRealAvatar = liveAvatarUrl && liveAvatarUrl.startsWith('http') && !imageError;
  const avatarSrc = hasRealAvatar ? liveAvatarUrl : agentFallback;

  const handleProfileClick = () => {
    // Prefer username-based navigation, fallback to ID
    if (creatorUsername) {
      const cleanUsername = creatorUsername.replace('@', '');
      navigate(`/${cleanUsername}`);
    } else if (creatorId) {
      navigate(`/app/profile?id=${creatorId}`);
    }
  };

  const isClickable = !!(creatorId || creatorUsername);
  
  // Format handle to ensure it starts with @
  const formattedHandle = handle ? (handle.startsWith('@') ? handle : `@${handle}`) : null;

  return (
    <div className="flex items-center gap-3 pb-3 pr-3 flex-1 min-w-0">
      <button
        onClick={handleProfileClick}
        disabled={!isClickable}
        className={`flex items-center gap-3 text-left ${isClickable ? 'cursor-pointer' : 'cursor-default'}`}
      >
        {isLive ? (
          <div className="p-0.5 rounded-md bg-gradient-to-br from-red-500 via-red-600 to-orange-500">
            <div className="p-0.5 bg-zinc-900 rounded-md">
              <Avatar className="w-9 h-9 rounded-md">
                {avatarSrc && <AvatarImage src={avatarSrc} onError={() => setImageError(true)} className="rounded-md" />}
                <AvatarFallback className="bg-zinc-700 text-white font-medium rounded-md">{username[0]?.toUpperCase()}</AvatarFallback>
              </Avatar>
            </div>
          </div>
        ) : (
          <Avatar className="w-9 h-9 rounded-md">
            {avatarSrc && <AvatarImage src={avatarSrc} onError={() => setImageError(true)} className="rounded-md" />}
            <AvatarFallback className="bg-zinc-700 text-white font-medium rounded-md">{username[0]?.toUpperCase()}</AvatarFallback>
          </Avatar>
        )}
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="relative inline-flex items-baseline shrink min-w-0">
              <span className="font-semibold text-white text-sm truncate max-w-[160px] sm:max-w-none leading-tight">{username}</span>
              {badgeUrl && (
                <img 
                  src={badgeUrl} 
                  alt="Badge" 
                  className="w-[9px] h-[9px] shrink-0 absolute -top-0.5 -right-3" 
                />
              )}
            </span>
            {verified && <CheckCircle className="w-3.5 h-3.5 text-blue-500 shrink-0" />}
            {isLive && <span className="ml-1 w-2 h-2 bg-red-500 rounded-full animate-pulse shrink-0" />}
          </div>
          {formattedHandle && (
            <span className="text-zinc-500 text-xs truncate max-w-[160px] sm:max-w-none">{formattedHandle}</span>
          )}
        </div>
      </button>
    </div>
  );
}
