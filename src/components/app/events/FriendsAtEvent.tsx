/**
 * FriendsAtEvent
 * ==============
 * Stacked overlapping avatars of friends attending an event.
 * Max 5, small, positioned in bottom-right of their container.
 */

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useFriendsAtEvent } from '@/hooks/use-friends-at-event';
import { cn } from '@/lib/utils';

interface FriendsAtEventProps {
  eventId: string;
  /** 'overlay' positions absolute bottom-right (for thumbnails), 'inline' is flow-based */
  mode?: 'overlay' | 'inline';
  className?: string;
}

export function FriendsAtEvent({ eventId, mode = 'overlay', className }: FriendsAtEventProps) {
  const { data: friends } = useFriendsAtEvent(eventId);

  if (!friends || friends.length === 0) return null;

  return (
    <div
      className={cn(
        'flex items-center',
        mode === 'overlay' && 'absolute bottom-2 right-2',
        className
      )}
    >
      {friends.map((friend, i) => (
        <Avatar
          key={friend.address}
          className={cn(
            'w-6 h-6 border-[1.5px] border-black/80 ring-0',
            i > 0 && '-ml-2'
          )}
          style={{ zIndex: friends.length - i }}
        >
          <AvatarImage src={friend.avatarUrl} className="object-cover" />
          <AvatarFallback className="bg-zinc-700 text-white text-[8px]">
            {friend.address.slice(2, 4).toUpperCase()}
          </AvatarFallback>
        </Avatar>
      ))}
    </div>
  );
}
