/**
 * RestrictionDialog
 * =================
 * The mute / ban sheet. Both restrictions share a duration picker; a ban also
 * carries an optional reason (shown to moderators in the banned list) and can
 * sweep the member's messages out of the chat on the way.
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  RESTRICTION_DURATIONS,
  durationToTimestamp,
  useBanMember,
  useCommunityAbilities,
  useMuteMember,
  usePurgeMemberMessages,
} from '@/hooks/use-community-admin';
import { useDeHubProfile } from '@/hooks/use-dehub-profile';
import type { Community, CommunityMember } from '@/hooks/use-communities';

const REASON_MAX = 200;

export interface RestrictionDialogProps {
  community: Community;
  /** The caller's own membership — banning and purging are separate rights. */
  membership: CommunityMember | null | undefined;
  target: CommunityMember | null;
  mode: 'mute' | 'ban';
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function RestrictionDialog({ community, membership, target, mode, open, onOpenChange }: RestrictionDialogProps) {
  const { t } = useTranslation();
  const { data: profile } = useDeHubProfile({ userId: target?.wallet_address });
  const abilities = useCommunityAbilities(community, membership);
  // Purging messages needs delete_messages, which banning does not imply.
  const canPurge = abilities.can('delete_messages');

  const muteMutation = useMuteMember();
  const banMutation = useBanMember();
  const purgeMutation = usePurgeMemberMessages();

  const [durationIndex, setDurationIndex] = useState(0);
  const [reason, setReason] = useState('');
  const [alsoPurge, setAlsoPurge] = useState(false);

  const wallet = target?.wallet_address ?? '';

  // Every open starts from a clean slate — a reason typed for one member must
  // never ride along to the next one.
  useEffect(() => {
    if (open) {
      setDurationIndex(0);
      setReason('');
      setAlsoPurge(false);
    }
  }, [open, mode, wallet]);

  const displayName =
    profile?.name || (wallet ? `${wallet.slice(0, 6)}...${wallet.slice(-4)}` : '');

  const isBan = mode === 'ban';
  const isPending = isBan
    ? banMutation.isPending || purgeMutation.isPending
    : muteMutation.isPending;

  const handleConfirm = () => {
    if (!target) return;
    const until = durationToTimestamp(RESTRICTION_DURATIONS[durationIndex].seconds);
    const base = { communityId: community.id, wallet: target.wallet_address, displayName };

    if (isBan) {
      banMutation.mutate(
        { ...base, reason: reason.trim() || undefined, until },
        {
          onSuccess: () => {
            if (alsoPurge && canPurge) purgeMutation.mutate(base);
            onOpenChange(false);
          },
        },
      );
    } else {
      muteMutation.mutate({ ...base, until }, { onSuccess: () => onOpenChange(false) });
    }
  };

  if (!target) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white font-medium text-base">
            {isBan
              ? t('communities.manage.banTitle', { defaultValue: 'Ban {{name}}', name: displayName })
              : t('communities.manage.muteTitle', { defaultValue: 'Mute {{name}}', name: displayName })}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-zinc-400 text-sm">
            {isBan
              ? t('communities.manage.banEffect', {
                  defaultValue: 'They are removed from the chat and cannot rejoin until the ban is lifted.',
                })
              : t('communities.manage.muteEffect', {
                  defaultValue: 'They stay in the community but cannot post until the mute expires.',
                })}
          </p>

          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3.5">
            <p className="text-white font-medium text-sm mb-2.5">
              {t('communities.manage.duration', { defaultValue: 'Duration' })}
            </p>
            <div
              role="radiogroup"
              aria-label={t('communities.manage.duration', { defaultValue: 'Duration' })}
              className="flex flex-wrap gap-1.5"
            >
              {RESTRICTION_DURATIONS.map((option, index) => {
                const selected = index === durationIndex;
                return (
                  <button
                    key={option.label}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setDurationIndex(index)}
                    className={`h-9 px-3 rounded-xl text-sm transition-colors border ${
                      selected
                        ? 'bg-white text-black border-white'
                        : 'bg-white/[0.04] text-zinc-400 border-white/[0.08] hover:bg-white/[0.08] hover:text-white'
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          {isBan && (
            <div className="space-y-3">
              <div>
                <label htmlFor="restriction-reason" className="text-white font-medium text-sm">
                  {t('communities.manage.reason', { defaultValue: 'Reason' })}
                  <span className="text-zinc-500 text-xs font-normal ml-1.5">
                    {t('communities.manage.optional', { defaultValue: 'optional' })}
                  </span>
                </label>
                <Textarea
                  id="restriction-reason"
                  value={reason}
                  onChange={e => setReason(e.target.value.slice(0, REASON_MAX))}
                  maxLength={REASON_MAX}
                  rows={3}
                  placeholder={t('communities.manage.reasonPlaceholder', {
                    defaultValue: 'Only moderators see this',
                  })}
                  className="mt-1.5 min-h-[72px] rounded-xl border-white/[0.08] bg-white/[0.04] text-white placeholder:text-zinc-600 resize-none focus-visible:border-white/20"
                />
                <p className="text-zinc-500 text-xs mt-1 text-right">
                  {reason.length}/{REASON_MAX}
                </p>
              </div>

              {canPurge && (
                <label
                  htmlFor="restriction-purge"
                  className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/[0.06] transition-colors cursor-pointer"
                >
                  <Checkbox
                    id="restriction-purge"
                    checked={alsoPurge}
                    onCheckedChange={value => setAlsoPurge(value === true)}
                    className="border-white/20 data-[state=checked]:bg-white data-[state=checked]:text-black"
                  />
                  <span className="text-zinc-400 text-sm">
                    {t('communities.manage.alsoDeleteMessages', {
                      defaultValue: 'Also delete all their messages',
                    })}
                  </span>
                </label>
              )}
            </div>
          )}

          <div className="flex items-center justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
              className="rounded-xl h-9 px-3 text-zinc-400 hover:text-white"
            >
              {t('communities.manage.cancel', { defaultValue: 'Cancel' })}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleConfirm}
              disabled={isPending}
              className="rounded-xl h-9 px-3 gap-1.5 text-red-400 hover:bg-red-500/15 border border-white/[0.08]"
            >
              {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {isBan
                ? t('communities.manage.confirmBan', { defaultValue: 'Ban' })
                : t('communities.manage.confirmMute', { defaultValue: 'Mute' })}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
