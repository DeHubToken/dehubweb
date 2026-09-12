import { useDeferredValue, useState } from 'react';
import { Loader2, Search, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import {
  useCreateTeamUp,
  useJoinTeamUp,
  useLeaveTeamUp,
  useRemoveTeamUpMember,
  useTeamUp,
  useTeamUpTeams,
} from '@/hooks/use-superpowers';
import { buildAvatarUrl } from '@/lib/media-url';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';

const compactNumber = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });

function accountName(member: { username: string | null; displayName: string | null; address: string }) {
  return member.displayName || (member.username ? `@${member.username.replace(/^@/, '')}` : `${member.address.slice(0, 6)}...${member.address.slice(-4)}`);
}

export function TeamUpDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { walletAddress, isAuthenticated, openLoginModal } = useAuth();
  const [name, setName] = useState('');
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const mine = useTeamUp(open);
  const teams = useTeamUpTeams(deferredSearch, open && isAuthenticated && !mine.data);
  const create = useCreateTeamUp();
  const join = useJoinTeamUp();
  const leave = useLeaveTeamUp();
  const remove = useRemoveTeamUpMember();
  const busy = create.isPending || join.isPending || leave.isPending || remove.isPending;
  const myAddress = walletAddress?.toLowerCase() ?? '';

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent scrollable column glass className="px-4 pb-6">
        <DrawerHeader className="pb-3 flex flex-row items-start justify-between gap-3">
          <div className="min-w-0">
            <DrawerTitle className="text-white text-lg">Team up</DrawerTitle>
            <p className="text-[12px] text-zinc-400 mt-1">
              Combine wallet power with up to seven others. Everyone wears the badge your total unlocks.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="Close"
            className="text-zinc-400 hover:text-white transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </DrawerHeader>

        {!isAuthenticated ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5 flex flex-col gap-3">
            <p className="text-sm text-zinc-300">Sign in to make or join a team. No badge is required.</p>
            <Button onClick={() => openLoginModal()} className="self-start">Sign in</Button>
          </div>
        ) : mine.isLoading ? (
          <div className="space-y-2" aria-label="Loading your team">
            <div className="h-20 rounded-xl bg-white/5 animate-pulse" />
            <div className="h-14 rounded-xl bg-white/[0.03] animate-pulse" />
            <div className="h-14 rounded-xl bg-white/[0.03] animate-pulse" />
          </div>
        ) : mine.data ? (
          <div className="max-h-[68vh] overflow-y-auto flex flex-col gap-4">
            <section className="rounded-xl border border-white/15 bg-white/[0.05] p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-white font-semibold truncate">{mine.data.name}</p>
                  <p className="text-[12px] text-zinc-400 mt-1">
                    {mine.data.memberCount}/{mine.data.maxMembers} members
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold text-white">{mine.data.tier || 'No badge yet'}</p>
                  <p className="text-[11px] text-zinc-500 tabular-nums">
                    {compactNumber.format(mine.data.pooledBadgeBalance)} DHB pooled
                  </p>
                </div>
              </div>
            </section>

            <section className="flex flex-col gap-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Members</h3>
              {mine.data.members.map(member => {
                const owner = member.address.toLowerCase() === mine.data!.ownerAddress.toLowerCase();
                const canRemove = mine.data!.ownerAddress.toLowerCase() === myAddress && !owner;
                const avatar = buildAvatarUrl(member.address, member.avatarImageUrl, 72);
                return (
                  <div key={member.address} className="flex items-center gap-3 rounded-xl bg-white/[0.03] px-3 py-2.5">
                    <Avatar className="h-9 w-9">
                      {avatar && <AvatarImage src={avatar} />}
                      <AvatarFallback className="text-xs text-zinc-300">
                        {accountName(member).replace('@', '').slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-white truncate">
                        {accountName(member)} {owner && <span className="text-zinc-500">Owner</span>}
                      </p>
                      <p className="text-[11px] text-zinc-500 tabular-nums">
                        {compactNumber.format(member.ownBadgeBalance)} DHB
                      </p>
                    </div>
                    {canRemove && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          if (!window.confirm(`Remove ${accountName(member)} from ${mine.data!.name}?`)) return;
                          remove.mutate(
                            { teamId: mine.data!.id, address: member.address },
                            { onError: error => toast.error(error instanceof Error ? error.message : 'Could not remove that member') },
                          );
                        }}
                        className="text-[12px] text-zinc-500 hover:text-white disabled:opacity-40"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                );
              })}
            </section>

            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => {
                if (!window.confirm(`Leave ${mine.data!.name}?`)) return;
                leave.mutate(undefined, {
                  onSuccess: () => toast.success('You left the team'),
                  onError: error => toast.error(error instanceof Error ? error.message : 'Could not leave that team'),
                });
              }}
              className="self-start"
            >
              Leave team
            </Button>
          </div>
        ) : (
          <div className="max-h-[68vh] overflow-y-auto flex flex-col gap-5">
            <section className="rounded-xl border border-white/10 bg-white/[0.03] p-4 flex flex-col gap-3">
              <div>
                <h3 className="text-sm font-semibold text-white">Make a team</h3>
                <p className="text-[12px] text-zinc-500 mt-1">You become the owner. Team names are public.</p>
              </div>
              <div className="flex gap-2">
                <Input
                  value={name}
                  onChange={event => setName(event.target.value)}
                  maxLength={40}
                  placeholder="Team name"
                  aria-label="Team name"
                  className="bg-white/5 border-white/10 text-white placeholder:text-zinc-600"
                />
                <Button
                  disabled={busy || name.trim().length < 3}
                  onClick={() => create.mutate(name, {
                    onSuccess: () => { setName(''); toast.success('Team created'); },
                    onError: error => toast.error(error instanceof Error ? error.message : 'Could not create that team'),
                  })}
                >
                  Create
                </Button>
              </div>
            </section>

            <section className="flex flex-col gap-3">
              <div>
                <h3 className="text-sm font-semibold text-white">Join a team</h3>
                <p className="text-[12px] text-zinc-500 mt-1">You can only be in one team at a time.</p>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" aria-hidden="true" />
                <Input
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                  placeholder="Search teams"
                  aria-label="Search teams"
                  className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-zinc-600"
                />
              </div>
              {teams.isLoading ? (
                <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-zinc-500" /></div>
              ) : (teams.data ?? []).length === 0 ? (
                <div className="rounded-xl border border-white/10 px-4 py-7 text-center">
                  <Users className="w-6 h-6 text-zinc-600 mx-auto" aria-hidden="true" />
                  <p className="text-sm text-zinc-400 mt-2">No teams found.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {(teams.data ?? []).map(team => (
                    <div key={team.id} className="rounded-xl bg-white/[0.03] px-3.5 py-3 flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-white font-medium truncate">{team.name}</p>
                        <p className="text-[11px] text-zinc-500 mt-0.5">
                          {team.memberCount}/{team.maxMembers} members, {team.tier || 'no badge yet'}, {compactNumber.format(team.pooledBadgeBalance)} DHB
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy || team.memberCount >= team.maxMembers}
                        onClick={() => join.mutate(team.id, {
                          onSuccess: () => toast.success(`Joined ${team.name}`),
                          onError: error => toast.error(error instanceof Error ? error.message : 'Could not join that team'),
                        })}
                      >
                        {team.memberCount >= team.maxMembers ? 'Full' : 'Join'}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </DrawerContent>
    </Drawer>
  );
}
