/**
 * Invite Links
 * ============
 * Create, share and revoke the links that let somebody into a community
 * without going through the public join button. Everything here is gated on
 * the `invite_users` right — the RPCs refuse it anyway, this just keeps the
 * UI honest about it.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDistanceToNow } from 'date-fns';
import { Copy, Link2, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import type { Community, CommunityMember } from '@/hooks/use-communities';
import {
  inviteUrl,
  useCommunityAbilities,
  useCommunityInvites,
  useCreateInvite,
  useRevokeInvite,
  type CommunityInviteLink,
} from '@/hooks/use-community-admin';

interface InviteLinksTabProps {
  community: Community;
  membership?: CommunityMember | null;
}

type InviteState = 'active' | 'revoked' | 'expired' | 'exhausted';

/** Mirrors the checks community_join_via_invite() runs server-side. */
function inviteState(link: CommunityInviteLink): InviteState {
  if (link.revoked_at) return 'revoked';
  if (link.expires_at && new Date(link.expires_at).getTime() <= Date.now()) return 'expired';
  if (link.max_uses !== null && link.uses >= link.max_uses) return 'exhausted';
  return 'active';
}

const HOUR_MS = 60 * 60 * 1000;

const EXPIRY_OPTIONS: { value: string; ms: number | null }[] = [
  { value: 'never', ms: null },
  { value: '1h', ms: HOUR_MS },
  { value: '1d', ms: 24 * HOUR_MS },
  { value: '1w', ms: 7 * 24 * HOUR_MS },
];

const LIMIT_OPTIONS: { value: string; maxUses: number | null }[] = [
  { value: 'none', maxUses: null },
  { value: '1', maxUses: 1 },
  { value: '10', maxUses: 10 },
  { value: '50', maxUses: 50 },
  { value: '100', maxUses: 100 },
];

function InviteRow({ link, communityId }: { link: CommunityInviteLink; communityId: string }) {
  const { t } = useTranslation();
  const revokeMutation = useRevokeInvite();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const state = inviteState(link);
  const isActive = state === 'active';
  const url = inviteUrl(link.code);
  const label = link.name || t('communities.manage.invites.defaultName', { defaultValue: 'Invite link' });

  const stateLabel =
    state === 'revoked'
      ? t('communities.manage.invites.chipRevoked', { defaultValue: 'Revoked' })
      : state === 'expired'
      ? t('communities.manage.invites.chipExpired', { defaultValue: 'Expired' })
      : t('communities.manage.invites.chipExhausted', { defaultValue: 'Limit reached' });

  const handleCopy = () => {
    navigator.clipboard
      .writeText(url)
      .then(() => toast.success(t('communities.manage.invites.copied', { defaultValue: 'Link copied' })))
      .catch(() =>
        toast.error(t('communities.manage.invites.copyFailed', { defaultValue: 'Could not copy the link' })),
      );
  };

  return (
    <div
      className={`flex items-center gap-3 p-2.5 rounded-xl transition-colors ${
        isActive ? 'hover:bg-white/[0.06]' : 'opacity-50'
      }`}
    >
      <div className="w-9 h-9 rounded-full bg-white/[0.08] flex items-center justify-center flex-shrink-0">
        <Link2 className="w-4 h-4 text-zinc-500" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-white font-medium text-sm truncate">{label}</span>
          {!isActive && (
            <span className="flex-shrink-0 text-[10px] uppercase tracking-wide text-zinc-500 border border-white/[0.08] rounded-md px-1.5 py-0.5">
              {stateLabel}
            </span>
          )}
        </div>
        <p className="text-zinc-500 text-xs truncate">{url}</p>
        <p className="text-zinc-500 text-xs">
          {t('communities.manage.invites.joined', {
            defaultValue: '{{n}} joined',
            n: link.uses,
          })}
          {link.expires_at && (
            <>
              {' · '}
              {state === 'expired'
                ? t('communities.manage.invites.expiredWhen', {
                    defaultValue: 'expired {{when}}',
                    when: formatDistanceToNow(new Date(link.expires_at), { addSuffix: true }),
                  })
                : t('communities.manage.invites.expires', {
                    defaultValue: 'expires {{when}}',
                    when: formatDistanceToNow(new Date(link.expires_at), { addSuffix: true }),
                  })}
            </>
          )}
          {link.max_uses !== null && (
            <>
              {' · '}
              {t('communities.manage.invites.limit', {
                defaultValue: 'limit {{max}}',
                max: link.max_uses,
              })}
            </>
          )}
          {link.requires_approval && (
            <>
              {' · '}
              {t('communities.manage.invites.needsApproval', { defaultValue: 'needs approval' })}
            </>
          )}
        </p>
      </div>

      {isActive && (
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <Button
            size="sm"
            variant="ghost"
            onClick={handleCopy}
            className="h-9 px-3 rounded-xl text-white border border-white/[0.08]"
            title={t('communities.manage.invites.copyLink', { defaultValue: 'Copy link' })}
            aria-label={t('communities.manage.invites.copyLink', { defaultValue: 'Copy link' })}
          >
            <Copy className="w-3.5 h-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setConfirmOpen(true)}
            disabled={revokeMutation.isPending}
            className="h-9 px-3 rounded-xl text-red-400 hover:bg-red-500/15 border border-white/[0.08]"
            title={t('communities.manage.invites.revoke', { defaultValue: 'Revoke link' })}
            aria-label={t('communities.manage.invites.revoke', { defaultValue: 'Revoke link' })}
          >
            {revokeMutation.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Trash2 className="w-3.5 h-3.5" />
            )}
          </Button>
        </div>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="bg-zinc-950 border border-white/10 rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">
              {t('communities.manage.invites.revokeTitle', {
                defaultValue: 'Revoke {{name}}?',
                name: label,
              })}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400 text-sm">
              {t('communities.manage.invites.revokeBody', {
                defaultValue:
                  'Anyone who still has this link will not be able to join with it. People who already joined stay members.',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl border-white/10 text-white">
              {t('communities.manage.invites.cancel', { defaultValue: 'Cancel' })}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => revokeMutation.mutate({ inviteId: link.id, communityId })}
              className="rounded-xl bg-red-500/20 text-red-300 border border-red-400/30 hover:bg-red-500/30"
            >
              {t('communities.manage.invites.revoke', { defaultValue: 'Revoke link' })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function InviteLinksTab({ community, membership }: InviteLinksTabProps) {
  const { t } = useTranslation();
  const abilities = useCommunityAbilities(community, membership);
  const canInvite = abilities.can('invite_users');

  const { data: invites = [], isLoading } = useCommunityInvites(community.id, canInvite);
  const createMutation = useCreateInvite();

  const [name, setName] = useState('');
  const [expiry, setExpiry] = useState('never');
  const [limit, setLimit] = useState('none');
  const [requiresApproval, setRequiresApproval] = useState(false);

  const expiryLabels: Record<string, string> = {
    never: t('communities.manage.invites.expiryNever', { defaultValue: 'Never' }),
    '1h': t('communities.manage.invites.expiry1h', { defaultValue: '1 hour' }),
    '1d': t('communities.manage.invites.expiry1d', { defaultValue: '1 day' }),
    '1w': t('communities.manage.invites.expiry1w', { defaultValue: '1 week' }),
  };

  const limitLabels: Record<string, string> = {
    none: t('communities.manage.invites.limitNone', { defaultValue: 'No limit' }),
    '1': t('communities.manage.invites.limit1', { defaultValue: '1 member' }),
    '10': t('communities.manage.invites.limit10', { defaultValue: '10 members' }),
    '50': t('communities.manage.invites.limit50', { defaultValue: '50 members' }),
    '100': t('communities.manage.invites.limit100', { defaultValue: '100 members' }),
  };

  if (!canInvite) {
    return (
      <p className="text-center text-zinc-500 text-sm py-8">
        {t('communities.manage.invites.noPermission', {
          defaultValue: 'You do not have permission to manage invite links.',
        })}
      </p>
    );
  }

  const handleCreate = () => {
    const ms = EXPIRY_OPTIONS.find(o => o.value === expiry)?.ms ?? null;
    const maxUses = LIMIT_OPTIONS.find(o => o.value === limit)?.maxUses ?? null;

    createMutation.mutate(
      {
        communityId: community.id,
        name: name.trim() || undefined,
        expiresAt: ms === null ? null : new Date(Date.now() + ms).toISOString(),
        maxUses,
        requiresApproval,
      },
      {
        onSuccess: () => {
          setName('');
          setExpiry('never');
          setLimit('none');
          setRequiresApproval(false);
        },
      },
    );
  };

  return (
    <div className="space-y-4">
      {/* Create */}
      <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3.5 space-y-3">
        <h3 className="text-white font-medium text-sm">
          {t('communities.manage.invites.createTitle', { defaultValue: 'Create invite link' })}
        </h3>

        <div className="space-y-1.5">
          <label htmlFor="invite-name" className="text-zinc-500 text-xs">
            {t('communities.manage.invites.nameLabel', { defaultValue: 'Link name (optional)' })}
          </label>
          <input
            id="invite-name"
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            maxLength={60}
            placeholder={t('communities.manage.invites.namePlaceholder', { defaultValue: 'e.g. Twitter drop' })}
            className="w-full h-10 px-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white placeholder:text-zinc-600 outline-none focus:border-white/20 text-sm"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <span className="text-zinc-500 text-xs block">
              {t('communities.manage.invites.expiryLabel', { defaultValue: 'Expires after' })}
            </span>
            <Select value={expiry} onValueChange={setExpiry}>
              <SelectTrigger
                aria-label={t('communities.manage.invites.expiryLabel', { defaultValue: 'Expires after' })}
                className="h-10 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-sm"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPIRY_OPTIONS.map(option => (
                  <SelectItem key={option.value} value={option.value}>
                    {expiryLabels[option.value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <span className="text-zinc-500 text-xs block">
              {t('communities.manage.invites.limitLabel', { defaultValue: 'Member limit' })}
            </span>
            <Select value={limit} onValueChange={setLimit}>
              <SelectTrigger
                aria-label={t('communities.manage.invites.limitLabel', { defaultValue: 'Member limit' })}
                className="h-10 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-sm"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LIMIT_OPTIONS.map(option => (
                  <SelectItem key={option.value} value={option.value}>
                    {limitLabels[option.value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <span className="text-white text-sm block">
              {t('communities.manage.invites.approvalLabel', { defaultValue: 'Require admin approval' })}
            </span>
            <span className="text-zinc-500 text-xs">
              {t('communities.manage.invites.approvalHint', {
                defaultValue: 'People who use this link have to be approved before they can join.',
              })}
            </span>
          </div>
          <Switch
            checked={requiresApproval}
            onCheckedChange={setRequiresApproval}
            aria-label={t('communities.manage.invites.approvalLabel', { defaultValue: 'Require admin approval' })}
            className="data-[state=checked]:bg-white scale-75 flex-shrink-0"
          />
        </div>

        <Button
          size="sm"
          onClick={handleCreate}
          disabled={createMutation.isPending}
          className="w-full rounded-xl h-9 px-3 bg-white text-black hover:bg-white/90 font-medium"
        >
          {createMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {t('communities.manage.invites.createButton', { defaultValue: 'Create invite link' })}
        </Button>
      </div>

      {/* List */}
      <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3.5">
        <h3 className="text-white font-medium text-sm mb-2">
          {t('communities.manage.invites.listTitle', { defaultValue: 'Invite links' })}
        </h3>

        {isLoading ? (
          <p className="text-center text-zinc-500 text-sm py-6">
            {t('communities.manage.invites.loading', { defaultValue: 'Loading invite links…' })}
          </p>
        ) : invites.length === 0 ? (
          <p className="text-center text-zinc-500 text-sm py-6">
            {t('communities.manage.invites.empty', {
              defaultValue: 'No invite links yet. Create one to invite people directly.',
            })}
          </p>
        ) : (
          <div className="space-y-1">
            {invites.map(link => (
              <InviteRow key={link.id} link={link} communityId={community.id} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
