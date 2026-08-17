/**
 * MembersTab
 * ==========
 * Telegram's "Members" / "Removed users" screens: the join queue, the roster,
 * and the ban list. Each roster row costs one profile request, so the list is
 * paginated in pages of 30 rather than rendering an unbounded membership.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ChevronDown, Crown, Loader2, Search, Shield, Undo2, User, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  useBannedCommunityMembers,
  useCommunityMembers,
  usePendingCommunityMembers,
  type Community,
  type CommunityMember,
} from '@/hooks/use-communities';
import {
  useApproveMember,
  useCommunityAbilities,
  useRejectMember,
  useUnbanMember,
} from '@/hooks/use-community-admin';
import { useDeHubProfile } from '@/hooks/use-dehub-profile';
import { BadgedName } from '@/components/app/BadgedName';
import { MemberActionsDialog } from './MemberActionsDialog';
import { AdminRightsDialog } from './AdminRightsDialog';

const PAGE_SIZE = 30;

const ROLE_ORDER: Record<string, number> = { owner: 0, admin: 1, member: 2 };

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function Avatar({ url }: { url?: string }) {
  return (
    <div className="w-9 h-9 rounded-lg bg-white/[0.08] flex items-center justify-center overflow-hidden flex-shrink-0">
      {url ? <img src={url} alt="" className="w-full h-full object-cover" /> : <User className="w-4 h-4 text-zinc-500" />}
    </div>
  );
}

function SectionHeader({ title, count, open }: { title: string; count: number; open: boolean }) {
  return (
    <CollapsibleTrigger className="w-full flex items-center gap-2 px-1 py-2 text-left group">
      <ChevronDown
        className={`w-4 h-4 text-zinc-500 transition-transform ${open ? '' : '-rotate-90'}`}
        aria-hidden="true"
      />
      <span className="text-white font-medium text-sm">{title}</span>
      <span className="text-zinc-500 text-xs">{count}</span>
    </CollapsibleTrigger>
  );
}

/** Reports the member's searchable text up to the tab so the filter can see it. */
function useIndexedProfile(member: CommunityMember, onIndex: (address: string, text: string) => void) {
  const { data: profile } = useDeHubProfile({ userId: member.wallet_address });
  const address = member.wallet_address;

  useEffect(() => {
    if (!profile) return;
    onIndex(address, `${profile.name ?? ''} ${profile.handle ?? ''}`.toLowerCase());
  }, [profile, address, onIndex]);

  return profile;
}

function PendingRow({
  community,
  member,
  onIndex,
}: {
  community: Community;
  member: CommunityMember;
  onIndex: (address: string, text: string) => void;
}) {
  const { t } = useTranslation();
  const profile = useIndexedProfile(member, onIndex);
  const approveMutation = useApproveMember();
  const rejectMutation = useRejectMember();

  const displayName = profile?.name || shortAddress(member.wallet_address);
  const vars = { communityId: community.id, wallet: member.wallet_address, displayName };
  const busy = approveMutation.isPending || rejectMutation.isPending;

  return (
    <div className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/[0.06] transition-colors">
      <Avatar url={profile?.avatarUrl} />
      <div className="flex-1 min-w-0">
        <BadgedName
          badgeBalance={profile?.badgeBalance}
          username={profile?.handle}
          className="text-white text-sm font-medium"
          wrapperClassName="flex"
        >
          {displayName}
        </BadgedName>
        {profile?.handle && <span className="text-zinc-500 text-xs">{profile.handle}</span>}
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => approveMutation.mutate(vars)}
          disabled={busy}
          className="rounded-xl h-9 px-3 gap-1.5 text-emerald-400 hover:bg-emerald-500/15 border border-white/[0.08]"
        >
          {approveMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          {t('communities.manage.approve', { defaultValue: 'Approve' })}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => rejectMutation.mutate(vars)}
          disabled={busy}
          className="rounded-xl h-9 px-3 gap-1.5 text-red-400 hover:bg-red-500/15 border border-white/[0.08]"
        >
          {rejectMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
          {t('communities.manage.reject', { defaultValue: 'Reject' })}
        </Button>
      </div>
    </div>
  );
}

function MemberRow({
  member,
  onIndex,
  onSelect,
}: {
  member: CommunityMember;
  onIndex: (address: string, text: string) => void;
  onSelect: (member: CommunityMember) => void;
}) {
  const { t } = useTranslation();
  const profile = useIndexedProfile(member, onIndex);

  const displayName = profile?.name || shortAddress(member.wallet_address);
  const isMuted = !!member.muted_until && new Date(member.muted_until).getTime() > Date.now();

  const roleIcon =
    member.role === 'owner' ? (
      <Crown className="w-3.5 h-3.5 text-amber-400" aria-label={t('communities.manage.roleOwner', { defaultValue: 'Owner' })} />
    ) : member.role === 'admin' ? (
      <Shield className="w-3.5 h-3.5 text-blue-400" aria-label={t('communities.manage.roleAdmin', { defaultValue: 'Admin' })} />
    ) : null;

  return (
    <button
      type="button"
      onClick={() => onSelect(member)}
      className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/[0.06] transition-colors text-left"
    >
      <Avatar url={profile?.avatarUrl} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <BadgedName
            badgeBalance={profile?.badgeBalance}
            username={profile?.handle}
            className="text-white text-sm font-medium"
          >
            {displayName}
          </BadgedName>
          {roleIcon}
          {member.custom_title && (
            <span className="text-xs text-zinc-400 px-1.5 py-0.5 rounded-full bg-white/[0.08] flex-shrink-0">
              {member.custom_title}
            </span>
          )}
          {isMuted && (
            <span className="text-xs text-amber-400 px-1.5 py-0.5 rounded-full bg-amber-500/10 flex-shrink-0">
              {t('communities.manage.mutedChip', { defaultValue: 'Muted' })}
            </span>
          )}
        </div>
        <span className="text-zinc-500 text-xs truncate block">
          {profile?.handle || shortAddress(member.wallet_address)}
        </span>
      </div>
    </button>
  );
}

function BannedRow({
  community,
  member,
  canRestrict,
  onIndex,
}: {
  community: Community;
  member: CommunityMember;
  canRestrict: boolean;
  onIndex: (address: string, text: string) => void;
}) {
  const { t } = useTranslation();
  const profile = useIndexedProfile(member, onIndex);
  const unbanMutation = useUnbanMember();

  const displayName = profile?.name || shortAddress(member.wallet_address);
  const vars = { communityId: community.id, wallet: member.wallet_address, displayName };
  const until = formatDate(member.banned_until);

  return (
    <div className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/[0.06] transition-colors">
      <Avatar url={profile?.avatarUrl} />
      <div className="flex-1 min-w-0">
        <BadgedName
          badgeBalance={profile?.badgeBalance}
          username={profile?.handle}
          className="text-white text-sm font-medium"
          wrapperClassName="flex"
        >
          {displayName}
        </BadgedName>
        <span className="text-zinc-500 text-xs block truncate">
          {member.ban_reason
            ? t('communities.manage.bannedReasonLine', { defaultValue: 'Reason: {{reason}}', reason: member.ban_reason })
            : t('communities.manage.noBanReason', { defaultValue: 'No reason given' })}
        </span>
        {until && (
          <span className="text-zinc-500 text-xs block">
            {t('communities.manage.bannedUntilLine', { defaultValue: 'Until {{date}}', date: until })}
          </span>
        )}
      </div>
      {canRestrict && (
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => unbanMutation.mutate(vars)}
            disabled={unbanMutation.isPending}
            className="rounded-xl h-9 px-3 gap-1.5 text-emerald-400 hover:bg-emerald-500/15 border border-white/[0.08]"
          >
            {unbanMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Undo2 className="w-3.5 h-3.5" />}
            {t('communities.manage.unban', { defaultValue: 'Unban' })}
          </Button>
          {/*
            No "Remove" here on purpose. Kicking a banned member deletes the row
            that IS the ban, so the weaker action would quietly undo the stronger
            one and let them rejoin. Unban is the only way out of this list.
          */}
        </div>
      )}
    </div>
  );
}

export interface MembersTabProps {
  community: Community;
  membership: CommunityMember | null | undefined;
}

export function MembersTab({ community, membership }: MembersTabProps) {
  const { t } = useTranslation();
  const abilities = useCommunityAbilities(community, membership);
  const canRestrict = abilities.can('restrict_members');

  const { data: members = [], isLoading } = useCommunityMembers(community.id);
  const { data: pending = [] } = usePendingCommunityMembers(canRestrict ? community.id : undefined);
  const { data: banned = [] } = useBannedCommunityMembers(canRestrict ? community.id : undefined);

  const [search, setSearch] = useState('');
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [requestsOpen, setRequestsOpen] = useState(true);
  const [membersOpen, setMembersOpen] = useState(true);
  const [bannedOpen, setBannedOpen] = useState(false);

  // Rows resolve their own profile; they hand the searchable text back up here
  // so the filter can match a name the parent never fetched itself.
  const [profileIndex, setProfileIndex] = useState<Record<string, string>>({});
  const indexProfile = useCallback((address: string, text: string) => {
    setProfileIndex(prev => (prev[address] === text ? prev : { ...prev, [address]: text }));
  }, []);

  const [selected, setSelected] = useState<CommunityMember | null>(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [rightsTarget, setRightsTarget] = useState<CommunityMember | null>(null);
  const [rightsOpen, setRightsOpen] = useState(false);

  useEffect(() => {
    setVisible(PAGE_SIZE);
  }, [search]);

  const sorted = useMemo(
    () =>
      [...members].sort((a, b) => {
        const byRole = (ROLE_ORDER[a.role] ?? 3) - (ROLE_ORDER[b.role] ?? 3);
        if (byRole !== 0) return byRole;
        return (a.joined_at ?? '').localeCompare(b.joined_at ?? '');
      }),
    [members],
  );

  const query = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!query) return sorted;
    return sorted.filter(member => {
      const address = member.wallet_address.toLowerCase();
      return address.includes(query) || (profileIndex[member.wallet_address] ?? '').includes(query);
    });
  }, [sorted, query, profileIndex]);

  const shown = filtered.slice(0, visible);

  const openActions = (member: CommunityMember) => {
    setSelected(member);
    setActionsOpen(true);
  };

  return (
    <div className="space-y-4">
      {canRestrict && pending.length > 0 && (
        <Collapsible open={requestsOpen} onOpenChange={setRequestsOpen}>
          <SectionHeader
            title={t('communities.manage.joinRequests', { defaultValue: 'Join requests' })}
            count={pending.length}
            open={requestsOpen}
          />
          <CollapsibleContent>
            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-1.5">
              {pending.map(member => (
                <PendingRow key={member.id} community={community} member={member} onIndex={indexProfile} />
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      <Collapsible open={membersOpen} onOpenChange={setMembersOpen}>
        <SectionHeader
          title={t('communities.manage.members', { defaultValue: 'Members' })}
          count={members.length}
          open={membersOpen}
        />
        <CollapsibleContent>
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-1.5 space-y-1.5">
            <div className="relative p-1">
              <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <Input
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder={t('communities.manage.searchMembers', { defaultValue: 'Search members' })}
                aria-label={t('communities.manage.searchMembers', { defaultValue: 'Search members' })}
                className="h-9 rounded-xl pl-8 bg-white/[0.04] border-white/[0.08] text-white text-sm placeholder:text-zinc-600 focus-visible:border-white/20"
              />
            </div>

            {isLoading ? (
              <div className="space-y-1.5 p-1">
                {[0, 1, 2].map(row => (
                  <div key={row} className="flex items-center gap-3 p-2.5">
                    <Skeleton className="w-9 h-9 rounded-full bg-white/[0.06]" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3 w-32 bg-white/[0.06]" />
                      <Skeleton className="h-2.5 w-20 bg-white/[0.06]" />
                    </div>
                  </div>
                ))}
              </div>
            ) : shown.length === 0 ? (
              <p className="text-center text-zinc-500 text-sm py-6">
                {query
                  ? t('communities.manage.noMatchingMembers', { defaultValue: 'No members match that search' })
                  : t('communities.manage.noMembers', { defaultValue: 'Nobody here yet' })}
              </p>
            ) : (
              <>
                {shown.map(member => (
                  <MemberRow key={member.id} member={member} onIndex={indexProfile} onSelect={openActions} />
                ))}
                {filtered.length > shown.length && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setVisible(current => current + PAGE_SIZE)}
                    className="rounded-xl h-9 px-3 w-full text-zinc-400 hover:text-white hover:bg-white/[0.06]"
                  >
                    {t('communities.manage.showMore', {
                      defaultValue: 'Show more ({{remaining}} left)',
                      remaining: filtered.length - shown.length,
                    })}
                  </Button>
                )}
              </>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {canRestrict && banned.length > 0 && (
        <Collapsible open={bannedOpen} onOpenChange={setBannedOpen}>
          <SectionHeader
            title={t('communities.manage.banned', { defaultValue: 'Banned' })}
            count={banned.length}
            open={bannedOpen}
          />
          <CollapsibleContent>
            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-1.5">
              {banned.map(member => (
                <BannedRow
                  key={member.id}
                  community={community}
                  member={member}
                  canRestrict={canRestrict}
                  onIndex={indexProfile}
                />
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      <MemberActionsDialog
        community={community}
        membership={membership}
        target={selected}
        open={actionsOpen}
        onOpenChange={setActionsOpen}
        onEditRights={member => {
          setRightsTarget(member);
          setRightsOpen(true);
        }}
      />

      <AdminRightsDialog
        community={community}
        membership={membership}
        target={rightsTarget}
        open={rightsOpen}
        onOpenChange={setRightsOpen}
      />
    </div>
  );
}
