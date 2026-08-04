/**
 * Danger zone
 * ===========
 * Owner-only, and the only two actions in the panel that cannot be walked back.
 * Both are gated behind typing the community name, so a mis-click can never
 * hand the community away or delete it.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Crown, Loader2, Search, Trash2, User } from 'lucide-react';

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCommunityAbilities, useDeleteCommunity, useTransferOwnership } from '@/hooks/use-community-admin';
import { useCommunityMembers, type Community, type CommunityMember } from '@/hooks/use-communities';
import { useDeHubProfile } from '@/hooks/use-dehub-profile';

export interface DangerZoneProps {
  community: Community;
  membership: CommunityMember | null | undefined;
  onClosePanel: () => void;
}

interface TransferCandidate {
  wallet: string;
  displayName: string;
}

function shortWallet(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function CandidateRow({
  member,
  query,
  onSelect,
  onMatchChange,
}: {
  member: CommunityMember;
  query: string;
  onSelect: (candidate: TransferCandidate) => void;
  onMatchChange: (memberId: string, matches: boolean) => void;
}) {
  const { t } = useTranslation();
  const { data: profile } = useDeHubProfile({ userId: member.wallet_address });

  const fallback = shortWallet(member.wallet_address);
  const displayName = profile?.name || fallback;
  const handle = profile?.handle;
  const avatarUrl = profile?.avatarUrl;

  const needle = query.trim().toLowerCase();
  const matches =
    !needle ||
    displayName.toLowerCase().includes(needle) ||
    (handle ?? '').toLowerCase().includes(needle) ||
    member.wallet_address.toLowerCase().includes(needle);

  // The name a row matches on only exists once its profile resolves, so the
  // parent learns from the row whether anything is still on screen.
  useEffect(() => {
    onMatchChange(member.id, matches);
  }, [member.id, matches, onMatchChange]);

  if (!matches) return null;

  return (
    <button
      type="button"
      onClick={() => onSelect({ wallet: member.wallet_address, displayName })}
      className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/[0.06] transition-colors text-left"
    >
      <div className="w-9 h-9 rounded-full bg-white/[0.08] flex items-center justify-center overflow-hidden shrink-0">
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <User className="w-4 h-4 text-zinc-500" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <span className="block text-white text-sm font-medium truncate">{displayName}</span>
        <span className="block text-zinc-500 text-xs truncate">{handle || fallback}</span>
      </div>
      <span className="text-zinc-500 text-xs shrink-0">
        {t('communities.manage.transferSelect', { defaultValue: 'Make owner' })}
      </span>
    </button>
  );
}

export function DangerZone({ community, membership, onClosePanel }: DangerZoneProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const abilities = useCommunityAbilities(community, membership);

  const { data: members = [], isLoading: membersLoading } = useCommunityMembers(community.id);
  const transferMutation = useTransferOwnership();
  const deleteMutation = useDeleteCommunity();

  const [search, setSearch] = useState('');
  const [candidate, setCandidate] = useState<TransferCandidate | null>(null);
  const [transferConfirm, setTransferConfirm] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');

  const [matched, setMatched] = useState<Record<string, boolean>>({});

  const candidates = useMemo(
    () => members.filter(member => member.role !== 'owner' && member.status === 'active'),
    [members],
  );

  const handleMatchChange = useCallback((memberId: string, matches: boolean) => {
    setMatched(previous => (previous[memberId] === matches ? previous : { ...previous, [memberId]: matches }));
  }, []);

  // Rows default to "shown" until they report back, so the empty line never
  // flashes on the first paint.
  const visibleCount = candidates.reduce(
    (count, member) => count + (matched[member.id] === false ? 0 : 1),
    0,
  );

  if (!abilities.isOwner) return null;

  const nameMatches = (value: string) => value.trim() === community.name.trim();

  const closeTransfer = () => {
    setCandidate(null);
    setTransferConfirm('');
  };

  const handleTransfer = () => {
    if (!candidate || !nameMatches(transferConfirm)) return;
    transferMutation.mutate(
      { communityId: community.id, wallet: candidate.wallet, displayName: candidate.displayName },
      {
        onSuccess: () => {
          closeTransfer();
          onClosePanel();
        },
      },
    );
  };

  const handleDelete = () => {
    if (!nameMatches(deleteConfirm)) return;
    deleteMutation.mutate(community.id, {
      onSuccess: () => {
        setDeleteOpen(false);
        setDeleteConfirm('');
        onClosePanel();
        navigate('/app/communities');
      },
    });
  };

  return (
    <div className="space-y-3">
      {/* ── Transfer ownership ─────────────────────────────────────────────── */}
      <section className="rounded-xl border border-red-500/20 bg-white/[0.04] p-3.5">
        <h3 className="text-white font-medium text-sm flex items-center gap-2">
          <Crown className="w-4 h-4 text-amber-400" />
          {t('communities.manage.transferOwnership', { defaultValue: 'Transfer ownership' })}
        </h3>
        <p className="text-zinc-500 text-xs mt-1">
          {t('communities.manage.transferOwnershipHint', {
            defaultValue: 'Hand this community to another active member. You cannot undo this.',
          })}
        </p>

        <div className="relative mt-2.5">
          <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <Input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder={t('communities.manage.searchMembers', { defaultValue: 'Search members' })}
            aria-label={t('communities.manage.searchMembers', { defaultValue: 'Search members' })}
            className="h-9 rounded-xl border-white/10 bg-white/[0.04] pl-8 text-white text-sm placeholder:text-zinc-600"
          />
        </div>

        <div className="mt-2 max-h-64 overflow-y-auto space-y-0.5">
          {membersLoading ? (
            <p className="text-center text-zinc-500 text-sm py-6">
              {t('communities.manage.loadingMembers', { defaultValue: 'Loading members…' })}
            </p>
          ) : candidates.length === 0 ? (
            <p className="text-center text-zinc-500 text-sm py-6">
              {t('communities.manage.noTransferCandidates', {
                defaultValue: 'No other active members to hand this community to.',
              })}
            </p>
          ) : (
            <>
              {candidates.map(member => (
                <CandidateRow
                  key={member.id}
                  member={member}
                  query={search}
                  onSelect={next => setCandidate(next)}
                  onMatchChange={handleMatchChange}
                />
              ))}
              {visibleCount === 0 && (
                <p className="text-center text-zinc-500 text-sm py-6">
                  {t('communities.manage.noMemberMatches', {
                    defaultValue: 'No members match that search.',
                  })}
                </p>
              )}
            </>
          )}
        </div>
      </section>

      {/* ── Delete community ───────────────────────────────────────────────── */}
      <section className="rounded-xl border border-red-500/20 bg-white/[0.04] p-3.5">
        <h3 className="text-white font-medium text-sm flex items-center gap-2">
          <Trash2 className="w-4 h-4 text-red-400" />
          {t('communities.manage.deleteCommunity', { defaultValue: 'Delete community' })}
        </h3>
        <p className="text-zinc-500 text-xs mt-1">
          {t('communities.manage.deleteCommunityHint', {
            defaultValue:
              'Every member, message, event and invite link is removed permanently.',
          })}
        </p>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setDeleteOpen(true)}
          disabled={deleteMutation.isPending}
          className="mt-2.5 rounded-xl h-9 px-3 text-red-400 hover:bg-red-500/15 border border-white/[0.08] gap-1.5"
        >
          {deleteMutation.isPending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Trash2 className="w-3.5 h-3.5" />
          )}
          {t('communities.manage.deleteCommunity', { defaultValue: 'Delete community' })}
        </Button>
      </section>

      {/* ── Transfer confirmation ──────────────────────────────────────────── */}
      <AlertDialog
        open={!!candidate}
        onOpenChange={next => {
          if (!next) closeTransfer();
        }}
      >
        <AlertDialogContent className="bg-zinc-900/90 backdrop-blur-xl border-white/10">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white text-base">
              {t('communities.manage.transferConfirmTitle', {
                defaultValue: 'Make {{name}} the owner?',
                name: candidate?.displayName ?? '',
              })}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400 text-sm">
              {t('communities.manage.transferConfirmBody', {
                defaultValue:
                  '{{name}} becomes the owner of {{community}}. You are demoted to admin with every right, and this cannot be undone.',
                name: candidate?.displayName ?? '',
                community: community.name,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-1.5">
            <label htmlFor="transfer-confirm" className="block text-zinc-500 text-xs">
              {t('communities.manage.typeNameToConfirm', {
                defaultValue: 'Type {{name}} to confirm',
                name: community.name,
              })}
            </label>
            <Input
              id="transfer-confirm"
              value={transferConfirm}
              onChange={event => setTransferConfirm(event.target.value)}
              autoComplete="off"
              className="h-9 rounded-xl border-white/10 bg-white/[0.04] text-white text-sm placeholder:text-zinc-600"
            />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={transferMutation.isPending}
              className="rounded-xl h-9 px-3 border border-white/[0.08] bg-transparent text-zinc-300 hover:bg-white/[0.06]"
            >
              {t('communities.manage.cancel', { defaultValue: 'Cancel' })}
            </AlertDialogCancel>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleTransfer}
              disabled={!nameMatches(transferConfirm) || transferMutation.isPending}
              className="rounded-xl h-9 px-3 text-red-400 hover:bg-red-500/15 border border-white/[0.08] gap-1.5"
            >
              {transferMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {t('communities.manage.transferConfirmAction', {
                defaultValue: 'Transfer ownership',
              })}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Delete confirmation ────────────────────────────────────────────── */}
      <AlertDialog
        open={deleteOpen}
        onOpenChange={next => {
          setDeleteOpen(next);
          if (!next) setDeleteConfirm('');
        }}
      >
        <AlertDialogContent className="bg-zinc-900/90 backdrop-blur-xl border-white/10">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white text-base">
              {t('communities.manage.deleteConfirmTitle', {
                defaultValue: 'Delete {{name}}?',
                name: community.name,
              })}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400 text-sm">
              {t('communities.manage.deleteConfirmBody', {
                defaultValue:
                  'Every member, message, event and invite link for {{name}} is removed permanently. This cannot be undone.',
                name: community.name,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-1.5">
            <label htmlFor="delete-confirm" className="block text-zinc-500 text-xs">
              {t('communities.manage.typeNameToConfirm', {
                defaultValue: 'Type {{name}} to confirm',
                name: community.name,
              })}
            </label>
            <Input
              id="delete-confirm"
              value={deleteConfirm}
              onChange={event => setDeleteConfirm(event.target.value)}
              autoComplete="off"
              className="h-9 rounded-xl border-white/10 bg-white/[0.04] text-white text-sm placeholder:text-zinc-600"
            />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={deleteMutation.isPending}
              className="rounded-xl h-9 px-3 border border-white/[0.08] bg-transparent text-zinc-300 hover:bg-white/[0.06]"
            >
              {t('communities.manage.cancel', { defaultValue: 'Cancel' })}
            </AlertDialogCancel>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleDelete}
              disabled={!nameMatches(deleteConfirm) || deleteMutation.isPending}
              className="rounded-xl h-9 px-3 text-red-400 hover:bg-red-500/15 border border-white/[0.08] gap-1.5"
            >
              {deleteMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {t('communities.manage.deleteConfirmAction', {
                defaultValue: 'Delete permanently',
              })}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
