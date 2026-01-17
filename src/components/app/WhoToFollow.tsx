import { Button } from '@/components/ui/button';
import { SUGGESTED_USERS, EXTENDED_SUGGESTED_USERS } from '@/constants/app.constants';
import { UserAvatar } from './UserAvatar';
import { VerifiedBadge } from './VerifiedBadge';

export function WhoToFollow() {
  const allUsers = [...SUGGESTED_USERS, ...EXTENDED_SUGGESTED_USERS];

  return (
    <div className="max-h-[280px] overflow-y-auto scrollbar-invisible space-y-3 pr-1">
      {allUsers.map((user) => (
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
    </div>
  );
}
