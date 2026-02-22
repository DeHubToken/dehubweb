import { useState, memo } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

interface LeaderboardUserAvatarProps {
  avatarUrl: string | null | undefined;
  fallbackSeed: string;
  displayName: string;
  size?: 'sm' | 'md';
  className?: string;
}

const sizeClasses = {
  sm: 'w-8 h-8',
  md: 'w-10 h-10',
};

/**
 * Avatar component with CDN fallback handling.
 * If the CDN image fails to load, falls back to initial letter.
 * Memoized to prevent unnecessary re-renders when parent state changes (e.g. tab switches).
 * No `key` prop on Avatar — avoids remount/flash when avatarUrl arrives after initial render.
 */
export const LeaderboardUserAvatar = memo(function LeaderboardUserAvatar({
  avatarUrl,
  fallbackSeed,
  displayName,
  size = 'md',
  className,
}: LeaderboardUserAvatarProps) {
  const [imageError, setImageError] = useState(false);
  
  // Only use the avatarUrl if it exists and hasn't errored
  const showImage = avatarUrl && !imageError;

  return (
    <Avatar className={cn(sizeClasses[size], className)}>
      {showImage && (
        <AvatarImage 
          src={avatarUrl} 
          alt={`${displayName}'s avatar`}
          onError={() => setImageError(true)}
        />
      )}
      <AvatarFallback className="bg-zinc-700 text-white text-xs font-medium">
        {displayName.charAt(0).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
});
