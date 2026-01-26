import { useState } from 'react';
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
 * If the CDN image fails to load, falls back to Dicebear identicon.
 */
export function LeaderboardUserAvatar({
  avatarUrl,
  fallbackSeed,
  displayName,
  size = 'md',
  className,
}: LeaderboardUserAvatarProps) {
  const [imageError, setImageError] = useState(false);
  
  const dicebearUrl = `https://api.dicebear.com/7.x/identicon/svg?seed=${fallbackSeed}`;
  
  // Determine which URL to use
  const imageUrl = imageError || !avatarUrl ? dicebearUrl : avatarUrl;

  return (
    <Avatar className={cn(sizeClasses[size], className)}>
      <AvatarImage 
        src={imageUrl} 
        alt={`${displayName}'s avatar`}
        onError={() => setImageError(true)}
      />
      <AvatarFallback className="bg-zinc-700 text-white text-xs">
        {displayName.charAt(0).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}
