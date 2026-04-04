import { Users, Lock } from 'lucide-react';
import type { Community } from '@/hooks/use-communities';

interface CommunityCardProps {
  community: Community;
  isMember: boolean;
  onClick: () => void;
}

export function CommunityCard({ community, isMember, onClick }: CommunityCardProps) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 p-3 rounded-xl bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] transition-colors text-left"
    >
      {/* Avatar */}
      <div className="w-12 h-12 rounded-xl bg-white/[0.08] flex items-center justify-center flex-shrink-0 overflow-hidden">
        {community.avatar_url ? (
          <img src={community.avatar_url} alt={community.name} className="w-full h-full object-cover" />
        ) : (
          <Users className="w-5 h-5 text-zinc-500" />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-white font-medium text-sm truncate">{community.name}</span>
          {community.is_private && <Lock className="w-3 h-3 text-zinc-500 flex-shrink-0" />}
        </div>
        <p className="text-zinc-500 text-xs truncate">{community.description || 'No description'}</p>
        <div className="flex items-center gap-3 mt-0.5">
          <span className="text-zinc-600 text-xs">{community.member_count.toLocaleString()} members</span>
          {isMember && (
            <span className="text-xs text-emerald-500/80">Joined</span>
          )}
        </div>
      </div>
    </button>
  );
}
