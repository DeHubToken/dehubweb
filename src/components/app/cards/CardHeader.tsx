/**
 * Card Header Component
 * =====================
 * Universal header for all feed card types.
 * Displays avatar with gradient ring, username, verified badge, and content type label.
 * 
 * @example
 * ```tsx
 * <CardHeader
 *   username="TechGuru"
 *   avatarSeed="tech"
 *   verified={true}
 *   contentType="video"
 * />
 * ```
 */

import { CheckCircle } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { ContentType } from '@/types/feed.types';

interface CardHeaderProps {
  /** Display name or username */
  username: string;
  /** Seed for generating avatar image */
  avatarSeed: string;
  /** Whether user is verified */
  verified?: boolean;
  /** Type of content for badge display */
  contentType: ContentType;
  /** Whether this is a live stream (shows pulsing indicator) */
  isLive?: boolean;
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
  avatarSeed, 
  verified = false, 
  contentType,
  isLive = false 
}: CardHeaderProps) {
  const badge = CONTENT_BADGES[contentType];

  return (
    <div className="flex items-center justify-between p-3">
      {/* User info */}
      <div className="flex items-center gap-3">
        <div className="p-0.5 rounded-full bg-gradient-to-br from-red-500 via-red-600 to-orange-500">
          <div className="p-0.5 bg-zinc-900 rounded-full">
            <Avatar className="w-8 h-8">
              <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${avatarSeed}`} />
              <AvatarFallback className="bg-zinc-700">{username[0]}</AvatarFallback>
            </Avatar>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <span className="font-semibold text-white text-sm">{username}</span>
          {verified && <CheckCircle className="w-4 h-4 text-blue-500" />}
        </div>
      </div>

      {/* Content type badge */}
      <span className={`text-xs px-2 py-0.5 rounded-full flex items-center gap-1 ${badge.className}`}>
        {isLive && <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />}
        {badge.label}
      </span>
    </div>
  );
}
