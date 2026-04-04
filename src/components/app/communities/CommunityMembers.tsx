import { Crown, Shield, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { CommunityMember } from '@/hooks/use-communities';
import { useDehubProfile } from '@/hooks/use-dehub-profile';

interface CommunityMembersProps {
  members: CommunityMember[];
  communityId: string;
}

function MemberRow({ member }: { member: CommunityMember }) {
  const navigate = useNavigate();
  const { data: profile } = useDehubProfile(member.wallet_address);

  const roleIcon = member.role === 'owner' 
    ? <Crown className="w-3.5 h-3.5 text-amber-400" />
    : member.role === 'admin' 
    ? <Shield className="w-3.5 h-3.5 text-blue-400" />
    : null;

  return (
    <button
      onClick={() => {
        const username = profile?.username;
        if (username) navigate(`/${username}`);
      }}
      className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/[0.06] transition-colors text-left"
    >
      <div className="w-9 h-9 rounded-full bg-white/[0.08] flex items-center justify-center overflow-hidden flex-shrink-0">
        {profile?.avatar ? (
          <img src={profile.avatar} alt="" className="w-full h-full object-cover" />
        ) : (
          <User className="w-4 h-4 text-zinc-500" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-white text-sm font-medium truncate">
            {profile?.displayName || profile?.username || `${member.wallet_address.slice(0, 6)}...${member.wallet_address.slice(-4)}`}
          </span>
          {roleIcon}
        </div>
        {profile?.username && (
          <span className="text-zinc-500 text-xs">@{profile.username}</span>
        )}
      </div>
      <span className="text-zinc-600 text-xs capitalize">{member.role}</span>
    </button>
  );
}

export function CommunityMembers({ members, communityId }: CommunityMembersProps) {
  // Sort: owner first, then admins, then mods, then members
  const roleOrder: Record<string, number> = { owner: 0, admin: 1, moderator: 2, member: 3 };
  const sorted = [...members].sort((a, b) => (roleOrder[a.role] ?? 4) - (roleOrder[b.role] ?? 4));

  return (
    <div className="space-y-1">
      {sorted.map(member => (
        <MemberRow key={member.id} member={member} />
      ))}
    </div>
  );
}
