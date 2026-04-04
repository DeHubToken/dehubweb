import { Users, LogIn, LogOut, Crown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Community } from '@/hooks/use-communities';

interface CommunityHeaderProps {
  community: Community;
  isMember: boolean;
  isOwner: boolean;
  isPending: boolean;
  onJoinLeave: () => void;
}

export function CommunityHeader({ community, isMember, isOwner, isPending, onJoinLeave }: CommunityHeaderProps) {
  return (
    <div className="px-3 pt-3 pb-4">
      {/* Banner */}
      <div className="h-28 sm:h-36 rounded-xl bg-white/[0.04] overflow-hidden relative">
        {community.banner_url ? (
          <img src={community.banner_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-white/[0.06] to-white/[0.02]" />
        )}
      </div>

      {/* Avatar + info */}
      <div className="flex items-end gap-3 -mt-8 px-2">
        <div className="w-16 h-16 rounded-xl bg-black border-2 border-black flex items-center justify-center overflow-hidden flex-shrink-0">
          {community.avatar_url ? (
            <img src={community.avatar_url} alt={community.name} className="w-full h-full object-cover" />
          ) : (
            <Users className="w-7 h-7 text-zinc-500" />
          )}
        </div>
        <div className="flex-1 min-w-0 pb-1">
          <h1 className="text-lg font-bold text-white truncate">{community.name}</h1>
          <p className="text-zinc-500 text-sm">{community.member_count.toLocaleString()} members</p>
        </div>
        <Button
          size="sm"
          disabled={isPending || isOwner}
          onClick={onJoinLeave}
          className={`rounded-xl gap-1.5 flex-shrink-0 ${
            isMember 
              ? 'bg-white/10 border border-white/20 text-white hover:bg-red-500/20 hover:text-red-400 hover:border-red-500/30'
              : 'bg-white text-black hover:bg-white/90'
          }`}
        >
          {isOwner ? (
            <><Crown className="w-3.5 h-3.5" /> Owner</>
          ) : isMember ? (
            <><LogOut className="w-3.5 h-3.5" /> Leave</>
          ) : (
            <><LogIn className="w-3.5 h-3.5" /> Join</>
          )}
        </Button>
      </div>

      {community.description && (
        <p className="text-zinc-400 text-sm mt-3 px-2">{community.description}</p>
      )}
    </div>
  );
}
