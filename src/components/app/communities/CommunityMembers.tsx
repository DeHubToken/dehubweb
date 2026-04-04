import { Crown, Shield, User, Check, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { CommunityMember } from '@/hooks/use-communities';
import { usePendingCommunityMembers, useApproveMember, useRejectMember } from '@/hooks/use-communities';
import { useDeHubProfile } from '@/hooks/use-dehub-profile';
import { Button } from '@/components/ui/button';

interface CommunityMembersProps {
  members: CommunityMember[];
  communityId: string;
  isOwner?: boolean;
}

function MemberRow({ member }: { member: CommunityMember }) {
  const navigate = useNavigate();
  const { data: profile } = useDeHubProfile({ userId: member.wallet_address });

  const roleIcon = member.role === 'owner' 
    ? <Crown className="w-3.5 h-3.5 text-amber-400" />
    : member.role === 'admin' 
    ? <Shield className="w-3.5 h-3.5 text-blue-400" />
    : null;

  const displayName = profile?.name || `${member.wallet_address.slice(0, 6)}...${member.wallet_address.slice(-4)}`;
  const handle = profile?.handle;
  const avatarUrl = profile?.avatarUrl;

  return (
    <button
      onClick={() => {
        if (handle) navigate(`/${handle.replace('@', '')}`);
      }}
      className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/[0.06] transition-colors text-left"
    >
      <div className="w-9 h-9 rounded-full bg-white/[0.08] flex items-center justify-center overflow-hidden flex-shrink-0">
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <User className="w-4 h-4 text-zinc-500" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-white text-sm font-medium truncate">{displayName}</span>
          {roleIcon}
        </div>
        {handle && (
          <span className="text-zinc-500 text-xs">{handle}</span>
        )}
      </div>
      <span className="text-zinc-600 text-xs capitalize">{member.role}</span>
    </button>
  );
}

function PendingMemberRow({ member, communityId }: { member: CommunityMember; communityId: string }) {
  const navigate = useNavigate();
  const { data: profile } = useDeHubProfile({ userId: member.wallet_address });
  const approveMutation = useApproveMember();
  const rejectMutation = useRejectMember();
  const { t } = useTranslation();

  const displayName = profile?.name || `${member.wallet_address.slice(0, 6)}...${member.wallet_address.slice(-4)}`;
  const handle = profile?.handle;
  const avatarUrl = profile?.avatarUrl;

  return (
    <div className="flex items-center gap-3 p-2.5 rounded-xl bg-white/[0.03]">
      <button
        onClick={() => { if (handle) navigate(`/${handle.replace('@', '')}`); }}
        className="w-9 h-9 rounded-full bg-white/[0.08] flex items-center justify-center overflow-hidden flex-shrink-0"
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <User className="w-4 h-4 text-zinc-500" />
        )}
      </button>
      <div className="flex-1 min-w-0">
        <span className="text-white text-sm font-medium truncate block">{displayName}</span>
        {handle && <span className="text-zinc-500 text-xs">{handle}</span>}
      </div>
      <div className="flex items-center gap-1.5">
        <Button
          size="sm"
          onClick={() => approveMutation.mutate({ memberId: member.id, communityId })}
          disabled={approveMutation.isPending || rejectMutation.isPending}
          className="h-7 px-2.5 rounded-lg bg-green-500/20 text-green-400 hover:bg-green-500/30 border border-green-500/30 gap-1"
        >
          <Check className="w-3.5 h-3.5" /> {t('communities.approve')}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => rejectMutation.mutate({ memberId: member.id, communityId })}
          disabled={approveMutation.isPending || rejectMutation.isPending}
          className="h-7 px-2.5 rounded-lg text-red-400 hover:bg-red-500/20 border border-white/[0.08] gap-1"
        >
          <X className="w-3.5 h-3.5" /> {t('communities.reject')}
        </Button>
      </div>
    </div>
  );
}

export function CommunityMembers({ members, communityId, isOwner }: CommunityMembersProps) {
  const roleOrder: Record<string, number> = { owner: 0, admin: 1, moderator: 2, member: 3 };
  const sorted = [...members].sort((a, b) => (roleOrder[a.role] ?? 4) - (roleOrder[b.role] ?? 4));
  const { data: pendingMembers = [] } = usePendingCommunityMembers(isOwner ? communityId : undefined);
  const { t } = useTranslation();

  return (
    <div className="space-y-1">
      {isOwner && pendingMembers.length > 0 && (
        <div className="mb-4">
          <h3 className="text-sm font-medium text-amber-400 mb-2 px-1">
            {t('communities.pendingRequests', { count: pendingMembers.length })}
          </h3>
          <div className="space-y-1.5">
            {pendingMembers.map(member => (
              <PendingMemberRow key={member.id} member={member} communityId={communityId} />
            ))}
          </div>
        </div>
      )}
      {sorted.map(member => (
        <MemberRow key={member.id} member={member} />
      ))}
    </div>
  );
}
