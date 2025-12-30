import { Button } from '@/components/ui/button';
import { SUGGESTED_USERS } from '@/constants/app.constants';
import { UserAvatar } from './UserAvatar';
import { VerifiedBadge } from './VerifiedBadge';

export function WhoToFollow() {
  return (
    <div className="bg-zinc-900 rounded-2xl p-4">
      <h3 className="font-bold text-lg mb-4 text-white">Who to follow</h3>
      <div className="space-y-3">
        {SUGGESTED_USERS.map((user) => (
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
      <button className="text-blue-400 hover:text-blue-300 mt-4 text-sm transition-colors">
        Show more
      </button>
    </div>
  );
}
