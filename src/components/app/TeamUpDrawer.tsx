import { useDeferredValue, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Lock, Search, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import {
  useApproveTeamUpRequest,
  useCancelTeamUpRequest,
  useCreateTeamUp,
  useDenyTeamUpRequest,
  useJoinTeamUp,
  useLeaveTeamUp,
  useRemoveTeamUpMember,
  useTeamUp,
  useTeamUpTeams,
  useUpdateTeamUp,
} from '@/hooks/use-superpowers';
import type { TeamUpTeam } from '@/lib/api/dehub/superpowers';
import { buildAvatarUrl } from '@/lib/media-url';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { SuperPowerIcon } from '@/components/app/SuperPowerIcon';

const compactNumber = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
// Mirrors the server's caps so the counter and the refusal never disagree.
const DESCRIPTION_MAX = 280;
const REQUEST_MESSAGE_MAX = 200;

interface Named {
  username: string | null;
  displayName: string | null;
  address: string;
}

function accountName(account: Named) {
  return account.displayName
    || (account.username ? `@${account.username.replace(/^@/, '')}` : `${account.address.slice(0, 6)}...${account.address.slice(-4)}`);
}

function initials(account: Named) {
  return accountName(account).replace('@', '').slice(0, 2).toUpperCase();
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function PrivateBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-white/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-zinc-300">
      <Lock className="w-2.5 h-2.5" aria-hidden="true" />
      {label}
    </span>
  );
}

function PrivacyToggle({
  checked,
  onCheckedChange,
  disabled,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <label className="flex items-center justify-between gap-3 cursor-pointer">
      <span className="min-w-0">
        <span className="block text-sm text-white">{t('superpowers.teamUp.privateLabel')}</span>
        <span className="block text-[12px] text-zinc-500">{t('superpowers.teamUp.privateHint')}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
    </label>
  );
}

export function TeamUpDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation();
  const { walletAddress, isAuthenticated, openLoginModal } = useAuth();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [search, setSearch] = useState('');
  // The private team whose request note is being written, if any.
  const [requesting, setRequesting] = useState<string | null>(null);
  const [requestMessage, setRequestMessage] = useState('');
  const [editing, setEditing] = useState(false);
  const [editDescription, setEditDescription] = useState('');
  const [editPrivate, setEditPrivate] = useState(false);
  const deferredSearch = useDeferredValue(search);
  const mine = useTeamUp(open);
  const teams = useTeamUpTeams(deferredSearch, open && isAuthenticated && !mine.data);
  const create = useCreateTeamUp();
  const update = useUpdateTeamUp();
  const join = useJoinTeamUp();
  const cancelRequest = useCancelTeamUpRequest();
  const approve = useApproveTeamUpRequest();
  const deny = useDenyTeamUpRequest();
  const leave = useLeaveTeamUp();
  const remove = useRemoveTeamUpMember();
  const busy = create.isPending || update.isPending || join.isPending || cancelRequest.isPending
    || approve.isPending || deny.isPending || leave.isPending || remove.isPending;
  const myAddress = walletAddress?.toLowerCase() ?? '';
  const team = mine.data;
  const isOwner = !!team && team.ownerAddress.toLowerCase() === myAddress;
  const tierLabel = (tier: string | null) => tier || t('superpowers.teamUp.noBadgeYet');

  const startEditing = () => {
    setEditDescription(team?.description ?? '');
    setEditPrivate(team?.isPrivate ?? false);
    setEditing(true);
  };

  const sendJoin = (target: TeamUpTeam, message?: string) => join.mutate(
    { teamId: target.id, message },
    {
      onSuccess: result => {
        if ('requested' in result && result.requested) {
          toast.success(t('superpowers.teamUp.requestSent'));
        } else {
          toast.success(t('superpowers.teamUp.joined', { name: target.name }));
        }
        setRequesting(null);
        setRequestMessage('');
      },
      onError: error => toast.error(errorMessage(
        error,
        target.isPrivate ? t('superpowers.teamUp.requestFailed') : t('superpowers.teamUp.joinFailed'),
      )),
    },
  );

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent scrollable column glass className="px-4 pb-6">
        <DrawerHeader className="pb-3 flex flex-row items-start justify-between gap-3">
          <div className="min-w-0">
            <DrawerTitle className="text-white text-lg flex items-center gap-2">
              <SuperPowerIcon power="team_up" alt="" className="w-8 h-8 shrink-0 object-contain" />
              {t('superpowers.teamUp.title')}
            </DrawerTitle>
            <p className="text-[12px] text-zinc-400 mt-1">{t('superpowers.teamUp.subtitle')}</p>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label={t('common.close')}
            className="text-zinc-400 hover:text-white transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </DrawerHeader>

        {!isAuthenticated ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5 flex flex-col gap-3">
            <p className="text-sm text-zinc-300">{t('superpowers.teamUp.signInPrompt')}</p>
            <Button onClick={() => openLoginModal()} className="self-start">{t('superpowers.teamUp.signIn')}</Button>
          </div>
        ) : mine.isLoading ? (
          <div className="space-y-2" aria-label={t('superpowers.teamUp.loadingTeam')}>
            <div className="h-20 rounded-xl bg-white/5 animate-pulse" />
            <div className="h-14 rounded-xl bg-white/[0.03] animate-pulse" />
            <div className="h-14 rounded-xl bg-white/[0.03] animate-pulse" />
          </div>
        ) : team ? (
          <div className="max-h-[68vh] overflow-y-auto flex flex-col gap-4">
            <section className="rounded-xl border border-white/15 bg-white/[0.05] p-4 flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-white font-semibold flex items-center gap-2 min-w-0">
                    <span className="truncate">{team.name}</span>
                    {team.isPrivate && <PrivateBadge label={t('superpowers.teamUp.privateBadge')} />}
                  </p>
                  <p className="text-[12px] text-zinc-400 mt-1">
                    {t('superpowers.teamUp.membersCount', { count: team.memberCount, max: team.maxMembers })}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold text-white">{tierLabel(team.tier)}</p>
                  <p className="text-[11px] text-zinc-500 tabular-nums">
                    {t('superpowers.teamUp.pooled', { amount: compactNumber.format(team.pooledBadgeBalance) })}
                  </p>
                </div>
              </div>

              {editing ? (
                <div className="flex flex-col gap-3 border-t border-white/10 pt-3">
                  <Textarea
                    value={editDescription}
                    onChange={event => setEditDescription(event.target.value)}
                    maxLength={DESCRIPTION_MAX}
                    rows={3}
                    placeholder={t('superpowers.teamUp.descriptionPlaceholder')}
                    aria-label={t('superpowers.teamUp.descriptionPlaceholder')}
                    className="bg-white/5 border-white/10 text-white placeholder:text-zinc-600 resize-none"
                  />
                  <PrivacyToggle checked={editPrivate} onCheckedChange={setEditPrivate} disabled={busy} />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() => update.mutate(
                        { description: editDescription, isPrivate: editPrivate },
                        {
                          onSuccess: () => { setEditing(false); toast.success(t('superpowers.teamUp.updated')); },
                          onError: error => toast.error(errorMessage(error, t('superpowers.teamUp.updateFailed'))),
                        },
                      )}
                    >
                      {t('common.save')}
                    </Button>
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => setEditing(false)}>
                      {t('common.cancel')}
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  {team.description && (
                    <p className="text-[12px] text-zinc-300 whitespace-pre-line">{team.description}</p>
                  )}
                  {isOwner && (
                    <button
                      type="button"
                      onClick={startEditing}
                      className="self-start text-[12px] text-zinc-400 hover:text-white transition-colors"
                    >
                      {t('common.edit')}
                    </button>
                  )}
                </>
              )}
            </section>

            {isOwner && team.isPrivate && (
              <section className="flex flex-col gap-2">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                  {t('superpowers.teamUp.joinRequests')}
                  {team.pendingCount > 0 && (
                    <span className="ml-2 normal-case tracking-normal text-zinc-400">
                      {t('superpowers.teamUp.waiting', { count: team.pendingCount })}
                    </span>
                  )}
                </h3>
                {(team.joinRequests ?? []).length === 0 ? (
                  <p className="rounded-xl border border-white/10 px-3 py-3 text-[12px] text-zinc-500">
                    {t('superpowers.teamUp.noRequests')}
                  </p>
                ) : (
                  (team.joinRequests ?? []).map(request => {
                    const avatar = buildAvatarUrl(request.address, request.avatarImageUrl, 72);
                    return (
                      <div key={request.address} className="rounded-xl bg-white/[0.03] px-3 py-2.5 flex flex-col gap-2">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-9 w-9">
                            {avatar && <AvatarImage src={avatar} />}
                            <AvatarFallback className="text-xs text-zinc-300">{initials(request)}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-white truncate">{accountName(request)}</p>
                            {request.message && (
                              <p className="text-[12px] text-zinc-400 whitespace-pre-line">{request.message}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2 pl-12">
                          <Button
                            size="sm"
                            disabled={busy}
                            onClick={() => approve.mutate(
                              { teamId: team.id, address: request.address },
                              {
                                onSuccess: () => toast.success(t('superpowers.teamUp.approved', { name: accountName(request) })),
                                onError: error => toast.error(errorMessage(error, t('superpowers.teamUp.approveFailed'))),
                              },
                            )}
                          >
                            {t('superpowers.teamUp.approve')}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => deny.mutate(
                              { teamId: team.id, address: request.address },
                              {
                                onSuccess: () => toast.success(t('superpowers.teamUp.declined')),
                                onError: error => toast.error(errorMessage(error, t('superpowers.teamUp.declineFailed'))),
                              },
                            )}
                          >
                            {t('superpowers.teamUp.decline')}
                          </Button>
                        </div>
                      </div>
                    );
                  })
                )}
              </section>
            )}

            <section className="flex flex-col gap-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                {t('superpowers.teamUp.members')}
              </h3>
              {team.members.map(member => {
                const owner = member.address.toLowerCase() === team.ownerAddress.toLowerCase();
                const canRemove = isOwner && !owner;
                const avatar = buildAvatarUrl(member.address, member.avatarImageUrl, 72);
                return (
                  <div key={member.address} className="flex items-center gap-3 rounded-xl bg-white/[0.03] px-3 py-2.5">
                    <Avatar className="h-9 w-9">
                      {avatar && <AvatarImage src={avatar} />}
                      <AvatarFallback className="text-xs text-zinc-300">{initials(member)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-white truncate">
                        {accountName(member)}{' '}
                        {owner && <span className="text-zinc-500">{t('superpowers.teamUp.owner')}</span>}
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
                          if (!window.confirm(t('superpowers.teamUp.removeBody', { name: accountName(member), team: team.name }))) return;
                          remove.mutate(
                            { teamId: team.id, address: member.address },
                            { onError: error => toast.error(errorMessage(error, t('superpowers.teamUp.removeFailed'))) },
                          );
                        }}
                        className="text-[12px] text-zinc-500 hover:text-white disabled:opacity-40"
                      >
                        {t('superpowers.teamUp.remove')}
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
                if (!window.confirm(t('superpowers.teamUp.leaveBody', { name: team.name }))) return;
                leave.mutate(undefined, {
                  onSuccess: () => toast.success(t('superpowers.teamUp.left')),
                  onError: error => toast.error(errorMessage(error, t('superpowers.teamUp.leaveFailed'))),
                });
              }}
              className="self-start"
            >
              {t('superpowers.teamUp.leave')}
            </Button>
          </div>
        ) : (
          <div className="max-h-[68vh] overflow-y-auto flex flex-col gap-5">
            <section className="rounded-xl border border-white/10 bg-white/[0.03] p-4 flex flex-col gap-3">
              <div>
                <h3 className="text-sm font-semibold text-white">{t('superpowers.teamUp.make')}</h3>
                <p className="text-[12px] text-zinc-500 mt-1">{t('superpowers.teamUp.makeHint')}</p>
              </div>
              <Input
                value={name}
                onChange={event => setName(event.target.value)}
                maxLength={40}
                placeholder={t('superpowers.teamUp.namePlaceholder')}
                aria-label={t('superpowers.teamUp.namePlaceholder')}
                className="bg-white/5 border-white/10 text-white placeholder:text-zinc-600"
              />
              <div>
                <Textarea
                  value={description}
                  onChange={event => setDescription(event.target.value)}
                  maxLength={DESCRIPTION_MAX}
                  rows={2}
                  placeholder={t('superpowers.teamUp.descriptionPlaceholder')}
                  aria-label={t('superpowers.teamUp.descriptionPlaceholder')}
                  className="bg-white/5 border-white/10 text-white placeholder:text-zinc-600 resize-none"
                />
                <p className="text-[11px] text-zinc-500 mt-1">{t('superpowers.teamUp.descriptionHint')}</p>
              </div>
              <PrivacyToggle checked={isPrivate} onCheckedChange={setIsPrivate} disabled={busy} />
              <Button
                className="self-start"
                disabled={busy || name.trim().length < 3}
                onClick={() => create.mutate(
                  { name, description, isPrivate },
                  {
                    onSuccess: () => {
                      setName('');
                      setDescription('');
                      setIsPrivate(false);
                      toast.success(t('superpowers.teamUp.created'));
                    },
                    onError: error => toast.error(errorMessage(error, t('superpowers.teamUp.createFailed'))),
                  },
                )}
              >
                {t('superpowers.teamUp.create')}
              </Button>
            </section>

            <section className="flex flex-col gap-3">
              <div>
                <h3 className="text-sm font-semibold text-white">{t('superpowers.teamUp.join')}</h3>
                <p className="text-[12px] text-zinc-500 mt-1">{t('superpowers.teamUp.joinHint')}</p>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" aria-hidden="true" />
                <Input
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                  placeholder={t('superpowers.teamUp.searchPlaceholder')}
                  aria-label={t('superpowers.teamUp.searchPlaceholder')}
                  className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-zinc-600"
                />
              </div>
              {teams.isLoading ? (
                <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-zinc-500" /></div>
              ) : (teams.data ?? []).length === 0 ? (
                <div className="rounded-xl border border-white/10 px-4 py-7 text-center">
                  <Users className="w-6 h-6 text-zinc-600 mx-auto" aria-hidden="true" />
                  <p className="text-sm text-zinc-400 mt-2">{t('superpowers.teamUp.none')}</p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {(teams.data ?? []).map(candidate => {
                    const full = candidate.memberCount >= candidate.maxMembers;
                    const pending = candidate.myRequestPending === true;
                    const composing = requesting === candidate.id;
                    return (
                      <div key={candidate.id} className="rounded-xl bg-white/[0.03] px-3.5 py-3 flex flex-col gap-2">
                        <div className="flex items-center gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-white font-medium flex items-center gap-2 min-w-0">
                              <span className="truncate">{candidate.name}</span>
                              {candidate.isPrivate && <PrivateBadge label={t('superpowers.teamUp.privateBadge')} />}
                            </p>
                            <p className="text-[11px] text-zinc-500 mt-0.5">
                              {t('superpowers.teamUp.teamMeta', {
                                count: candidate.memberCount,
                                max: candidate.maxMembers,
                                tier: tierLabel(candidate.tier),
                                amount: compactNumber.format(candidate.pooledBadgeBalance),
                              })}
                            </p>
                          </div>
                          {full ? (
                            <Button size="sm" variant="outline" disabled>{t('superpowers.teamUp.full')}</Button>
                          ) : pending ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={() => cancelRequest.mutate(candidate.id, {
                                onSuccess: () => toast.success(t('superpowers.teamUp.requestCancelled')),
                                onError: error => toast.error(errorMessage(error, t('superpowers.teamUp.cancelRequestFailed'))),
                              })}
                            >
                              {t('superpowers.teamUp.cancelRequest')}
                            </Button>
                          ) : candidate.isPrivate ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy || composing}
                              onClick={() => { setRequesting(candidate.id); setRequestMessage(''); }}
                            >
                              {t('superpowers.teamUp.requestToJoin')}
                            </Button>
                          ) : (
                            <Button size="sm" variant="outline" disabled={busy} onClick={() => sendJoin(candidate)}>
                              {t('superpowers.teamUp.joinAction')}
                            </Button>
                          )}
                        </div>
                        {candidate.description && (
                          <p className="text-[12px] text-zinc-400 line-clamp-2 whitespace-pre-line">{candidate.description}</p>
                        )}
                        {pending ? (
                          <p className="text-[11px] text-zinc-500">{t('superpowers.teamUp.requestPending')}</p>
                        ) : candidate.isPrivate && !composing ? (
                          <p className="text-[11px] text-zinc-500">{t('superpowers.teamUp.privateCardHint')}</p>
                        ) : null}
                        {composing && (
                          <div className="flex flex-col gap-2 border-t border-white/10 pt-2">
                            <Textarea
                              value={requestMessage}
                              onChange={event => setRequestMessage(event.target.value)}
                              maxLength={REQUEST_MESSAGE_MAX}
                              rows={2}
                              autoFocus
                              placeholder={t('superpowers.teamUp.requestMessagePlaceholder')}
                              aria-label={t('superpowers.teamUp.requestMessagePlaceholder')}
                              className="bg-white/5 border-white/10 text-white placeholder:text-zinc-600 resize-none"
                            />
                            <div className="flex gap-2">
                              <Button size="sm" disabled={busy} onClick={() => sendJoin(candidate, requestMessage)}>
                                {t('superpowers.teamUp.sendRequest')}
                              </Button>
                              <Button size="sm" variant="ghost" disabled={busy} onClick={() => setRequesting(null)}>
                                {t('common.cancel')}
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )}
      </DrawerContent>
    </Drawer>
  );
}
