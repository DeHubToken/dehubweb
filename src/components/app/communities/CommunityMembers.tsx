/**
 * Community Members tab
 * ======================
 * The public roster. Every moderation action moved into the Manage panel, which
 * is where the join queue, the ban list and the per-member actions now live —
 * this tab just shows who is here and offers moderators a way in.
 */

import { useMemo, useState } from 'react';
import { Crown, Shield, User, Settings2, VolumeX } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Community, CommunityMember } from '@/hooks/use-communities';
import { usePendingCommunityMembers } from '@/hooks/use-communities';
import { useCommunityAbilities } from '@/hooks/use-community-admin';
import { useDeHubProfile } from '@/hooks/use-dehub-profile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface CommunityMembersProps {
  members: CommunityMember[];
  community: Community;
  membership: CommunityMember | null | undefined;
  onManage: () => void;
}

const PAGE_SIZE = 30;

function MemberRow({ member }: { member: CommunityMember }) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { data: profile } = useDeHubProfile({ userId: member.wallet_address });

  const roleIcon = member.role === 'owner'
    ? <Crown className="w-3.5 h-3.5 text-amber-400" />
    : member.role === 'admin'
    ? <Shield className="w-3.5 h-3.5 text-blue-400" />
    : null;

  const displayName = profile?.name || `${member.wallet_address.slice(0, 6)}...${member.wallet_address.slice(-4)}`;
  const handle = profile?.handle;
  const avatarUrl = profile?.avatarUrl;
  const isMuted = !!member.muted_until && new Date(member.muted_until).getTime() > Date.now();
  const title = member.role === 'admin' ? (member.custom_title || t('communities.admin', { defaultValue: 'Admin' })) : null;

  return (
    <button
      onClick={() => { if (handle) navigate(`/${handle.replace('@', '')}`); }}
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
          {isMuted && (
            <span className="flex items-center gap-1 text-amber-400 text-[10px] px-1.5 py-0.5 rounded-md bg-amber-500/10">
              <VolumeX className="w-3 h-3" />
              {t('communities.muted', { defaultValue: 'Muted' })}
            </span>
          )}
        </div>
        {handle && <span className="text-zinc-500 text-xs">{handle}</span>}
      </div>
      {title ? (
        <span className="text-zinc-500 text-xs flex-shrink-0">{title}</span>
      ) : member.role === 'owner' ? (
        <span className="text-zinc-500 text-xs flex-shrink-0 capitalize">{member.role}</span>
      ) : null}
    </button>
  );
}

export function CommunityMembers({ members, community, membership, onManage }: CommunityMembersProps) {
  const { t } = useTranslation();
  const abilities = useCommunityAbilities(community, membership);
  const [query, setQuery] = useState('');
  const [visible, setVisible] = useState(PAGE_SIZE);

  // Only moderators can read the queue, so only ask for it when it will resolve.
  const { data: pendingMembers = [] } = usePendingCommunityMembers(
    abilities.can('restrict_members') ? community.id : undefined,
  );

  const roleOrder: Record<string, number> = { owner: 0, admin: 1, member: 2 };
  const sorted = useMemo(
    () => [...members].sort((a, b) => (roleOrder[a.role] ?? 3) - (roleOrder[b.role] ?? 3)),
    [members],
  );

  // Search matches the address here; name/handle live behind per-row profile
  // lookups that this list deliberately does not block on.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter(m => m.wallet_address.toLowerCase().includes(q));
  }, [sorted, query]);

  return (
    <div className="space-y-3">
      {abilities.canManage && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-3">
          <div className="min-w-0">
            <div className="text-white text-sm font-medium">
              {t('communities.manageMembers', { defaultValue: 'Manage members' })}
            </div>
            <div className="text-zinc-500 text-xs">
              {pendingMembers.length > 0
                ? t('communities.pendingRequestsShort', {
                    defaultValue: '{{count}} request(s) waiting for approval',
                    count: pendingMembers.length,
                  })
                : t('communities.manageMembersHint', {
                    defaultValue: 'Roles, restrictions, invite links and recent actions',
                  })}
            </div>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={onManage}
            className="rounded-xl h-9 px-3 gap-1.5 bg-white/10 border border-white/20 text-white hover:bg-white/15 flex-shrink-0"
          >
            <Settings2 className="w-3.5 h-3.5" />
            {t('communities.manage', { defaultValue: 'Manage' })}
            {pendingMembers.length > 0 && (
              <span className="min-w-[18px] h-[18px] px-1 flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full leading-none">
                {pendingMembers.length > 99 ? '99+' : pendingMembers.length}
              </span>
            )}
          </Button>
        </div>
      )}

      {members.length > PAGE_SIZE && (
        <Input
          value={query}
          onChange={e => { setQuery(e.target.value); setVisible(PAGE_SIZE); }}
          placeholder={t('communities.searchMembers', { defaultValue: 'Search by wallet address...' })}
          className="rounded-xl bg-white/[0.06] border-white/[0.1] text-white placeholder:text-zinc-600"
        />
      )}

      <div className="space-y-1">
        {filtered.slice(0, visible).map(member => (
          <MemberRow key={member.id} member={member} />
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="text-center text-zinc-500 text-sm py-6">
          {t('communities.noMembersFound', { defaultValue: 'No members found' })}
        </p>
      )}

      {visible < filtered.length && (
        <Button
          variant="ghost"
          onClick={() => setVisible(v => v + PAGE_SIZE)}
          className="w-full rounded-xl h-9 text-zinc-400 hover:text-white border border-white/[0.08]"
        >
          {t('communities.showMore', { defaultValue: 'Show more' })}
        </Button>
      )}
    </div>
  );
}
