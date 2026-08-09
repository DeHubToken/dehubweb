/**
 * Administrators Tab
 * ==================
 * Telegram's "Administrators" screen: who owns the community, who moderates it
 * and with which rights, plus a search box for promoting somebody new.
 *
 * Names and handles live behind a per-wallet profile call, so searching by name
 * has to warm those profiles first — the fan-out only fires once the operator
 * actually types, and only over a bounded slice of the member list.
 */

import { useMemo, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { ChevronRight, Crown, Search, Shield, User } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useCommunityMembers, type Community, type CommunityMember } from '@/hooks/use-communities';
import { useCommunityAbilities, ADMIN_RIGHTS } from '@/hooks/use-community-admin';
import { useDeHubProfile, mapUserToProfile, type ProfileData } from '@/hooks/use-dehub-profile';
import { getAccountInfo } from '@/lib/api/dehub';
import { AdminRightsDialog } from './AdminRightsDialog';

export interface AdministratorsTabProps {
  community: Community;
  membership: CommunityMember | null | undefined;
}

/** How many plain members the promote search will look at (one profile call each). */
const SEARCH_POOL = 200;
/** How many promote candidates are ever painted at once. */
const MAX_RESULTS = 25;

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function Avatar({ url }: { url?: string }) {
  return (
    <div className="w-9 h-9 rounded-lg bg-white/[0.08] flex items-center justify-center overflow-hidden flex-shrink-0">
      {url ? (
        <img src={url} alt="" className="w-full h-full object-cover" />
      ) : (
        <User className="w-4 h-4 text-zinc-500" />
      )}
    </div>
  );
}

function OwnerRow({ member }: { member: CommunityMember }) {
  const { t } = useTranslation();
  const { data: profile } = useDeHubProfile({ userId: member.wallet_address });
  const displayName = profile?.name || shortAddress(member.wallet_address);

  return (
    <div className="flex items-center gap-3 p-2.5 rounded-xl">
      <Avatar url={profile?.avatarUrl} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-white font-medium text-sm truncate">{displayName}</span>
          <Crown className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
        </div>
        <span className="text-zinc-500 text-xs">
          {t('communities.manage.ownerBadge', { defaultValue: 'Owner' })}
        </span>
      </div>
    </div>
  );
}

function AdminRow({
  member,
  onManage,
}: {
  member: CommunityMember;
  onManage: ((member: CommunityMember) => void) | null;
}) {
  const { t } = useTranslation();
  const { data: profile } = useDeHubProfile({ userId: member.wallet_address });

  const displayName = profile?.name || shortAddress(member.wallet_address);
  const badge = member.custom_title?.trim() || t('communities.manage.adminBadge', { defaultValue: 'Admin' });
  const granted = ADMIN_RIGHTS.filter((right) => member.permissions?.[right.key] === true).length;

  const body = (
    <>
      <Avatar url={profile?.avatarUrl} />
      <div className="flex-1 min-w-0 text-left">
        <div className="flex items-center gap-1.5">
          <span className="text-white font-medium text-sm truncate">{displayName}</span>
          <Shield className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
          <span className="text-zinc-500 text-xs truncate">{badge}</span>
        </div>
        <span className="text-zinc-500 text-xs">
          {t('communities.manage.rightsSummary', {
            defaultValue: '{{granted}} of {{total}} rights',
            granted,
            total: ADMIN_RIGHTS.length,
          })}
        </span>
      </div>
      {onManage && <ChevronRight className="w-4 h-4 text-zinc-500 flex-shrink-0" />}
    </>
  );

  if (!onManage) {
    return <div className="flex items-center gap-3 p-2.5 rounded-xl">{body}</div>;
  }

  return (
    <button
      type="button"
      onClick={() => onManage(member)}
      aria-label={t('communities.manage.editRightsFor', {
        defaultValue: 'Edit admin rights for {{name}}',
        name: displayName,
      })}
      className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/[0.06] transition-colors"
    >
      {body}
    </button>
  );
}

function CandidateRow({
  member,
  onPromote,
}: {
  member: CommunityMember;
  onPromote: (member: CommunityMember) => void;
}) {
  const { t } = useTranslation();
  const { data: profile } = useDeHubProfile({ userId: member.wallet_address });
  const displayName = profile?.name || shortAddress(member.wallet_address);

  return (
    <div className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/[0.06] transition-colors">
      <Avatar url={profile?.avatarUrl} />
      <div className="flex-1 min-w-0">
        <span className="text-white font-medium text-sm truncate block">{displayName}</span>
        <span className="text-zinc-500 text-xs truncate block">
          {profile?.handle || shortAddress(member.wallet_address)}
        </span>
      </div>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => onPromote(member)}
        aria-label={t('communities.manage.promoteMember', {
          defaultValue: 'Promote {{name}}',
          name: displayName,
        })}
        className="rounded-xl h-9 px-3 text-emerald-400 hover:bg-emerald-500/15 border border-white/[0.08] flex-shrink-0"
      >
        {t('communities.manage.promote', { defaultValue: 'Promote' })}
      </Button>
    </div>
  );
}

export function AdministratorsTab({ community, membership }: AdministratorsTabProps) {
  const { t } = useTranslation();
  const abilities = useCommunityAbilities(community, membership);
  const { data: members = [], isLoading } = useCommunityMembers(community.id);

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [target, setTarget] = useState<CommunityMember | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const canAddAdmins = abilities.can('add_admins');

  const { owner, admins, plainMembers } = useMemo(() => {
    const sorted = [...members].sort((a, b) => a.joined_at.localeCompare(b.joined_at));
    return {
      owner: sorted.find((m) => m.role === 'owner') ?? null,
      admins: sorted.filter((m) => m.role === 'admin'),
      plainMembers: sorted.filter((m) => m.role === 'member'),
    };
  }, [members]);

  const pool = useMemo<CommunityMember[]>(
    () => (canAddAdmins ? plainMembers.slice(0, SEARCH_POOL) : []),
    [canAddAdmins, plainMembers],
  );

  const query = debouncedSearch.trim().toLowerCase();

  // Shares the cache key with useDeHubProfile, so the rows we end up painting
  // read straight out of this fan-out instead of refetching.
  const profileQueries = useQueries({
    queries: pool.map((member) => ({
      queryKey: ['dehub-profile', member.wallet_address, undefined],
      queryFn: async (): Promise<ProfileData | null> => {
        try {
          return mapUserToProfile(await getAccountInfo(member.wallet_address));
        } catch {
          return null;
        }
      },
      enabled: query.length > 0,
      staleTime: 5 * 60_000,
      retry: 1,
    })),
  });

  // useQueries widens its result element type depending on the version, so the
  // one place it is read gets an explicit shape.
  const profileAt = (index: number): ProfileData | null =>
    (profileQueries[index]?.data as ProfileData | null | undefined) ?? null;

  /** Name matches only land once the fan-out resolves — say so rather than "no matches". */
  const searching = query.length > 0 && profileQueries.some((result) => result.isLoading);

  const candidates: CommunityMember[] = [];
  for (let i = 0; i < pool.length && candidates.length < MAX_RESULTS; i++) {
    const member = pool[i];
    if (query) {
      const profile = profileAt(i);
      const haystack = [member.wallet_address, profile?.name ?? '', profile?.handle ?? '']
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(query)) continue;
    }
    candidates.push(member);
  }

  const openFor = (member: CommunityMember) => {
    setTarget(member);
    setDialogOpen(true);
  };

  /** The owner manages anybody; an admin can promote, but not touch a peer. */
  const canManageAdmin = abilities.isOwner;

  return (
    <div className="space-y-4">
      <section>
        <h3 className="text-white font-medium text-sm mb-2 px-1">
          {t('communities.manage.ownerSection', { defaultValue: 'Owner' })}
        </h3>
        <div className="rounded-xl border border-white/10 bg-white/[0.04] p-1.5">
          {owner ? (
            <OwnerRow member={owner} />
          ) : (
            <p className="text-center text-zinc-500 text-sm py-4">
              {isLoading
                ? t('communities.manage.loading', { defaultValue: 'Loading…' })
                : t('communities.manage.noOwner', { defaultValue: 'No owner on record.' })}
            </p>
          )}
        </div>
      </section>

      <section>
        <h3 className="text-white font-medium text-sm mb-2 px-1">
          {t('communities.manage.administratorsSection', { defaultValue: 'Administrators' })}
        </h3>
        <div className="rounded-xl border border-white/10 bg-white/[0.04] p-1.5">
          {admins.length === 0 ? (
            <p className="text-center text-zinc-500 text-sm py-4 px-3">
              {isLoading
                ? t('communities.manage.loading', { defaultValue: 'Loading…' })
                : t('communities.manage.noAdmins', {
                    defaultValue: 'No administrators yet. Promote a member to help you moderate.',
                  })}
            </p>
          ) : (
            admins.map((admin) => (
              <AdminRow key={admin.id} member={admin} onManage={canManageAdmin ? openFor : null} />
            ))
          )}
        </div>
      </section>

      {canAddAdmins && (
        <section>
          <h3 className="text-white font-medium text-sm mb-2 px-1">
            {t('communities.manage.addAdministrator', { defaultValue: 'Add administrator' })}
          </h3>
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-1.5 space-y-1">
            <div className="relative mx-1 mb-1">
              <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('communities.manage.searchMembers', {
                  defaultValue: 'Search members',
                })}
                aria-label={t('communities.manage.searchMembers', {
                  defaultValue: 'Search members',
                })}
                className="h-9 rounded-xl bg-white/[0.04] border-white/10 text-white placeholder:text-zinc-600 text-sm pl-9"
              />
            </div>
            {candidates.length === 0 ? (
              <p className="text-center text-zinc-500 text-sm py-4 px-3">
                {searching
                  ? t('communities.manage.searching', { defaultValue: 'Searching…' })
                  : query
                    ? t('communities.manage.noMemberMatches', {
                        defaultValue: 'No members match that search.',
                      })
                    : t('communities.manage.noMembersToPromote', {
                        defaultValue: 'Everyone here is already an admin.',
                      })}
              </p>
            ) : (
              candidates.map((member) => (
                <CandidateRow key={member.id} member={member} onPromote={openFor} />
              ))
            )}
          </div>
        </section>
      )}

      <AdminRightsDialog
        community={community}
        membership={membership}
        target={target}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </div>
  );
}
