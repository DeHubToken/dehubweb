/**
 * MemberActionsDialog
 * ===================
 * The per-member action sheet behind a row in the Members tab. Every row is
 * gated on the acting moderator's rights *and* on who the target is: nobody
 * moderates the owner or themselves, and only the owner may moderate another
 * admin. A control the server would refuse never renders.
 */

import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Ban,
  Crown,
  ExternalLink,
  Loader2,
  Mic,
  MicOff,
  Shield,
  ShieldCheck,
  Trash2,
  Undo2,
  User,
  UserX,
} from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  useCommunityAbilities,
  useKickMember,
  usePurgeMemberMessages,
  useUnbanMember,
  useUnmuteMember,
} from '@/hooks/use-community-admin';
import { useDeHubProfile } from '@/hooks/use-dehub-profile';
import { useAuth } from '@/contexts/AuthContext';
import type { Community, CommunityMember } from '@/hooks/use-communities';
import { RestrictionDialog } from './RestrictionDialog';

export interface MemberActionsDialogProps {
  community: Community;
  membership: CommunityMember | null | undefined;
  target: CommunityMember | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** The parent owns AdminRightsDialog — this sheet just hands the member over. */
  onEditRights: (member: CommunityMember) => void;
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function ActionRow({
  icon,
  label,
  onClick,
  pending,
  disabled,
  tone = 'neutral',
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  pending?: boolean;
  disabled?: boolean;
  tone?: 'neutral' | 'destructive' | 'positive';
}) {
  const toneClass =
    tone === 'destructive'
      ? 'text-red-400 hover:bg-red-500/15'
      : tone === 'positive'
      ? 'text-emerald-400 hover:bg-emerald-500/15'
      : 'text-white hover:bg-white/[0.06]';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || pending}
      className={`w-full flex items-center gap-3 p-2.5 rounded-xl transition-colors text-left text-sm disabled:opacity-50 disabled:cursor-not-allowed ${toneClass}`}
    >
      <span className="w-4 flex items-center justify-center flex-shrink-0">
        {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : icon}
      </span>
      <span className="flex-1 min-w-0 truncate">{label}</span>
    </button>
  );
}

export function MemberActionsDialog({
  community,
  membership,
  target,
  open,
  onOpenChange,
  onEditRights,
}: MemberActionsDialogProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { walletAddress } = useAuth();
  const abilities = useCommunityAbilities(community, membership);
  const { data: profile } = useDeHubProfile({ userId: target?.wallet_address });

  const unmuteMutation = useUnmuteMember();
  const unbanMutation = useUnbanMember();
  const purgeMutation = usePurgeMemberMessages();
  const kickMutation = useKickMember();

  const [restrictionMode, setRestrictionMode] = useState<'mute' | 'ban'>('mute');
  const [restrictionOpen, setRestrictionOpen] = useState(false);
  const [purgeConfirmOpen, setPurgeConfirmOpen] = useState(false);
  const [kickConfirmOpen, setKickConfirmOpen] = useState(false);

  const wallet = target?.wallet_address ?? '';
  const displayName =
    profile?.name || (wallet ? `${wallet.slice(0, 6)}...${wallet.slice(-4)}` : '');
  const handle = profile?.handle;
  const avatarUrl = profile?.avatarUrl;

  const isSelf = !!walletAddress && !!wallet && walletAddress.toLowerCase() === wallet.toLowerCase();
  const targetIsOwner = target?.role === 'owner';
  const targetIsAdmin = target?.role === 'admin';
  // Non-owners never act on another admin; nobody acts on the owner or themselves.
  const canActOnTarget = !!target && !isSelf && !targetIsOwner && (!targetIsAdmin || abilities.isOwner);

  const isMuted = !!target?.muted_until && new Date(target.muted_until).getTime() > Date.now();
  const isBanned = target?.status === 'banned';

  const canRestrict = canActOnTarget && abilities.can('restrict_members');
  const canDeleteMessages = canActOnTarget && abilities.can('delete_messages');
  const canManageAdmins = canActOnTarget && abilities.can('add_admins');

  const vars = { communityId: community.id, wallet, displayName };

  const openRestriction = (mode: 'mute' | 'ban') => {
    setRestrictionMode(mode);
    onOpenChange(false);
    setRestrictionOpen(true);
  };

  const roleIcon = targetIsOwner ? (
    <Crown className="w-3.5 h-3.5 text-amber-400" />
  ) : targetIsAdmin ? (
    <Shield className="w-3.5 h-3.5 text-blue-400" />
  ) : null;

  const roleLabel = targetIsOwner
    ? t('communities.manage.roleOwner', { defaultValue: 'Owner' })
    : targetIsAdmin
    ? t('communities.manage.roleAdmin', { defaultValue: 'Admin' })
    : t('communities.manage.roleMember', { defaultValue: 'Member' });

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle className="sr-only">
            {t('communities.manage.memberActions', { defaultValue: 'Member actions' })}
          </DialogTitle>

          {!target ? (
            <p className="text-center text-zinc-500 text-sm py-6">
              {t('communities.manage.noMemberSelected', { defaultValue: 'No member selected' })}
            </p>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-3.5">
                <div className="w-9 h-9 rounded-lg bg-white/[0.08] flex items-center justify-center overflow-hidden flex-shrink-0">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <User className="w-4 h-4 text-zinc-500" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-white font-medium text-sm truncate">{displayName}</span>
                    {roleIcon}
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {handle && <span className="text-zinc-500 text-xs">{handle}</span>}
                    <span className="text-zinc-500 text-xs">{roleLabel}</span>
                    {target.custom_title && (
                      <span className="text-xs text-zinc-400 px-1.5 py-0.5 rounded-full bg-white/[0.08]">
                        {target.custom_title}
                      </span>
                    )}
                  </div>
                  {isMuted && (
                    <p className="text-amber-400 text-xs mt-1">
                      {t('communities.manage.mutedUntil', {
                        defaultValue: 'Muted until {{date}}',
                        date: formatDate(target.muted_until),
                      })}
                    </p>
                  )}
                  {isBanned && (
                    <p className="text-red-400 text-xs mt-1">
                      {target.ban_reason
                        ? t('communities.manage.bannedWithReason', {
                            defaultValue: 'Banned — {{reason}}',
                            reason: target.ban_reason,
                          })
                        : t('communities.manage.banned', { defaultValue: 'Banned' })}
                    </p>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-1.5">
                <ActionRow
                  icon={<ExternalLink className="w-3.5 h-3.5" />}
                  label={t('communities.manage.viewProfile', { defaultValue: 'View profile' })}
                  disabled={!handle}
                  onClick={() => {
                    if (!handle) return;
                    onOpenChange(false);
                    navigate(`/${handle.replace('@', '')}`);
                  }}
                />

                {canManageAdmins && (
                  <ActionRow
                    icon={targetIsAdmin ? <Shield className="w-3.5 h-3.5" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                    label={
                      targetIsAdmin
                        ? t('communities.manage.editAdminRights', { defaultValue: 'Edit admin rights' })
                        : t('communities.manage.promoteToAdmin', { defaultValue: 'Promote to admin' })
                    }
                    onClick={() => {
                      onOpenChange(false);
                      onEditRights(target);
                    }}
                  />
                )}

                {canRestrict &&
                  (isMuted ? (
                    <ActionRow
                      icon={<Mic className="w-3.5 h-3.5" />}
                      tone="positive"
                      label={t('communities.manage.unmute', { defaultValue: 'Unmute' })}
                      pending={unmuteMutation.isPending}
                      onClick={() => unmuteMutation.mutate(vars, { onSuccess: () => onOpenChange(false) })}
                    />
                  ) : (
                    <ActionRow
                      icon={<MicOff className="w-3.5 h-3.5" />}
                      label={t('communities.manage.mute', { defaultValue: 'Mute' })}
                      onClick={() => openRestriction('mute')}
                    />
                  ))}

                {canRestrict &&
                  (isBanned ? (
                    <ActionRow
                      icon={<Undo2 className="w-3.5 h-3.5" />}
                      tone="positive"
                      label={t('communities.manage.unban', { defaultValue: 'Unban' })}
                      pending={unbanMutation.isPending}
                      onClick={() => unbanMutation.mutate(vars, { onSuccess: () => onOpenChange(false) })}
                    />
                  ) : (
                    <ActionRow
                      icon={<Ban className="w-3.5 h-3.5" />}
                      tone="destructive"
                      label={t('communities.manage.ban', { defaultValue: 'Ban' })}
                      onClick={() => openRestriction('ban')}
                    />
                  ))}

                {canDeleteMessages && (
                  <ActionRow
                    icon={<Trash2 className="w-3.5 h-3.5" />}
                    tone="destructive"
                    label={t('communities.manage.deleteAllMessages', { defaultValue: 'Delete all messages' })}
                    onClick={() => {
                      onOpenChange(false);
                      setPurgeConfirmOpen(true);
                    }}
                  />
                )}

                {canRestrict && !isBanned && (
                  <ActionRow
                    icon={<UserX className="w-3.5 h-3.5" />}
                    tone="destructive"
                    label={t('communities.manage.removeFromCommunity', { defaultValue: 'Remove from community' })}
                    onClick={() => {
                      onOpenChange(false);
                      setKickConfirmOpen(true);
                    }}
                  />
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <RestrictionDialog
        community={community}
        membership={membership}
        target={target}
        mode={restrictionMode}
        open={restrictionOpen}
        onOpenChange={setRestrictionOpen}
      />

      <AlertDialog open={purgeConfirmOpen} onOpenChange={setPurgeConfirmOpen}>
        <AlertDialogContent className="bg-zinc-900/90 backdrop-blur-xl border-white/10">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white text-base">
              {t('communities.manage.deleteAllMessagesTitle', {
                defaultValue: 'Delete every message from {{name}}?',
                name: displayName,
              })}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400 text-sm">
              {t('communities.manage.deleteAllMessagesBody', {
                defaultValue: 'Every message {{name}} posted in {{community}} is removed from the chat. This cannot be undone.',
                name: displayName,
                community: community.name,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl h-9 px-3 border-white/[0.08] bg-transparent text-zinc-400 hover:bg-white/[0.06] hover:text-white">
              {t('communities.manage.cancel', { defaultValue: 'Cancel' })}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={purgeMutation.isPending}
              onClick={event => {
                event.preventDefault();
                purgeMutation.mutate(vars, { onSuccess: () => setPurgeConfirmOpen(false) });
              }}
              className="rounded-xl h-9 px-3 gap-1.5 bg-none bg-transparent text-red-400 hover:bg-red-500/15 border border-white/[0.08]"
            >
              {purgeMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {t('communities.manage.deleteMessages', { defaultValue: 'Delete messages' })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={kickConfirmOpen} onOpenChange={setKickConfirmOpen}>
        <AlertDialogContent className="bg-zinc-900/90 backdrop-blur-xl border-white/10">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white text-base">
              {t('communities.manage.removeMemberTitle', {
                defaultValue: 'Remove {{name}}?',
                name: displayName,
              })}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400 text-sm">
              {t('communities.manage.removeMemberBody', {
                defaultValue: '{{name}} leaves {{community}} but can join again later.',
                name: displayName,
                community: community.name,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl h-9 px-3 border-white/[0.08] bg-transparent text-zinc-400 hover:bg-white/[0.06] hover:text-white">
              {t('communities.manage.cancel', { defaultValue: 'Cancel' })}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={kickMutation.isPending}
              onClick={event => {
                event.preventDefault();
                kickMutation.mutate(vars, { onSuccess: () => setKickConfirmOpen(false) });
              }}
              className="rounded-xl h-9 px-3 gap-1.5 bg-none bg-transparent text-red-400 hover:bg-red-500/15 border border-white/[0.08]"
            >
              {kickMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {t('communities.manage.remove', { defaultValue: 'Remove' })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
