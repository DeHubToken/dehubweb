import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { SUGGESTED_USERS, EXTENDED_SUGGESTED_USERS } from '@/constants/app.constants';
import { UserAvatar } from './UserAvatar';
import { VerifiedBadge } from './VerifiedBadge';

export function WhoToFollow() {
  const [showMore, setShowMore] = useState(false);

  const allUsers = [...SUGGESTED_USERS, ...EXTENDED_SUGGESTED_USERS];
  const displayedUsers = showMore ? allUsers : SUGGESTED_USERS;

  return (
    <div className="space-y-3">
      {displayedUsers.map((user) => (
        <div key={user.id} className="flex items-center gap-3">
          <UserAvatar name={user.name} handle={user.handle} size="md" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1">
              <span className="font-semibold truncate text-white">{user.name}</span>
              {user.verified && <VerifiedBadge />}
            </div>
            <span className="text-zinc-500 text-sm truncate block">{user.handle}</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl border-zinc-700 text-white hover:bg-zinc-800 hover:text-white bg-transparent"
          >
            Follow
          </Button>
        </div>
      ))}
      <button
        onClick={() => setShowMore(!showMore)}
        className="w-full mt-1 py-2 text-white hover:text-zinc-300 transition-colors text-sm font-medium"
      >
        {showMore ? 'Show less' : 'Show more'}
      </button>
    </div>
  );
}
