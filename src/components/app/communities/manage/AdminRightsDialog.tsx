/**
 * Admin Rights Dialog
 * ===================
 * Telegram's "Edit administrator" sheet: promote a plain member, or retune an
 * existing admin's rights and custom title.
 *
 * The one rule worth spelling out: an admin can never hand out a right they do
 * not hold themselves. The RPC enforces that, so a switch the server would
 * refuse renders disabled and forced off rather than lying to the operator.
 */

import { useState } from 'react';
import { Loader2, User } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useDeHubProfile } from '@/hooks/use-dehub-profile';
import type { Community, CommunityMember } from '@/hooks/use-communities';
import {
  ADMIN_RIGHTS,
  DEFAULT_ADMIN_PERMISSIONS,
  useCommunityAbilities,
  useSetMemberRole,
  type AdminRight,
} from '@/hooks/use-community-admin';

export interface AdminRightsDialogProps {
  community: Community;
  membership: CommunityMember | null | undefined;
  target: CommunityMember | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const MAX_CUSTOM_TITLE = 16;

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

interface AdminRightsFormProps {
  community: Community;
  membership: CommunityMember | null | undefined;
  target: CommunityMember;
  onOpenChange: (v: boolean) => void;
}

function AdminRightsForm({ community, membership, target, onOpenChange }: AdminRightsFormProps) {
  const { t } = useTranslation();
  const abilities = useCommunityAbilities(community, membership);
  const { data: profile } = useDeHubProfile({ userId: target.wallet_address });
  const setRole = useSetMemberRole();
  const [dismissOpen, setDismissOpen] = useState(false);

  const isExistingAdmin = target.role === 'admin';

  // Mounted under a key of the target's id, so first render is the only render
  // that needs to seed the form — no effect syncing props into state.
  const [rights, setRights] = useState<Record<AdminRight, boolean>>(() => {
    const seed = {} as Record<AdminRight, boolean>;
    for (const right of ADMIN_RIGHTS) {
      if (isExistingAdmin) {
        const granted = target.permissions?.[right.key];
        seed[right.key] = granted === true;
      } else {
        seed[right.key] = DEFAULT_ADMIN_PERMISSIONS[right.key];
      }
    }
    return seed;
  });
  const [customTitle, setCustomTitle] = useState<string>(target.custom_title ?? '');

  const displayName = profile?.name || shortAddress(target.wallet_address);
  const subtitle = profile?.handle || shortAddress(target.wallet_address);
  const avatarUrl = profile?.avatarUrl;

  /** The owner holds everything; anyone else can only pass on what they hold. */
  const mayGrant = (right: AdminRight): boolean => abilities.isOwner || abilities.can(right);
  const effective = (right: AdminRight): boolean => (mayGrant(right) ? rights[right] : false);

  const toggle = (right: AdminRight, checked: boolean) => {
    setRights((prev) => {
      const next: Record<AdminRight, boolean> = { ...prev };
      next[right] = checked;
      return next;
    });
  };

  // Only the owner may retune an existing admin; `add_admins` covers promotions.
  const canManage = abilities.isOwner || (!isExistingAdmin && abilities.can('add_admins'));
  const canDismiss = isExistingAdmin && abilities.isOwner;

  const handleSave = () => {
    const permissions = {} as Record<AdminRight, boolean>;
    for (const right of ADMIN_RIGHTS) permissions[right.key] = effective(right.key);

    setRole.mutate(
      {
        communityId: community.id,
        wallet: target.wallet_address,
        displayName,
        role: 'admin',
        permissions,
        customTitle: customTitle.trim() || null,
      },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  const handleDismiss = () => {
    setRole.mutate(
      {
        communityId: community.id,
        wallet: target.wallet_address,
        displayName,
        role: 'member',
      },
      {
        onSuccess: () => {
          setDismissOpen(false);
          onOpenChange(false);
        },
      },
    );
  };

  return (
    <>
      <DialogHeader className="flex-row items-center gap-3 space-y-0 text-left pr-8">
        <div className="w-9 h-9 rounded-full bg-white/[0.08] flex items-center justify-center overflow-hidden flex-shrink-0">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <User className="w-4 h-4 text-zinc-500" />
          )}
        </div>
        <div className="min-w-0">
          <DialogTitle className="text-white font-medium text-sm truncate">{displayName}</DialogTitle>
          <DialogDescription className="text-zinc-500 text-xs truncate">{subtitle}</DialogDescription>
        </div>
      </DialogHeader>

      <div className="rounded-xl border border-white/10 bg-white/[0.04] p-1.5">
        {ADMIN_RIGHTS.map((right) => {
          const blocked = !mayGrant(right.key);
          return (
            <label
              key={right.key}
              className="flex items-start gap-3 p-2.5 rounded-xl hover:bg-white/[0.06] transition-colors cursor-pointer"
            >
              <span className="flex-1 min-w-0">
                <span className="text-white font-medium text-sm block">
                  {t(`communities.manage.rights.${right.key}`, { defaultValue: right.label })}
                </span>
                <span className="text-zinc-500 text-xs block mt-0.5">
                  {blocked
                    ? t('communities.manage.rightNotHeld', {
                        defaultValue: 'You do not have this right yourself',
                      })
                    : t(`communities.manage.rightHints.${right.key}`, { defaultValue: right.hint })}
                </span>
              </span>
              <Switch
                checked={effective(right.key)}
                onCheckedChange={(checked) => toggle(right.key, checked)}
                disabled={blocked || !canManage || setRole.isPending}
                aria-label={t(`communities.manage.rights.${right.key}`, { defaultValue: right.label })}
                className="scale-75 flex-shrink-0 mt-0.5"
              />
            </label>
          );
        })}
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3.5 space-y-2">
        <label htmlFor="admin-custom-title" className="text-white font-medium text-sm block">
          {t('communities.manage.customTitle', { defaultValue: 'Custom title' })}
        </label>
        <Input
          id="admin-custom-title"
          value={customTitle}
          onChange={(e) => setCustomTitle(e.target.value.slice(0, MAX_CUSTOM_TITLE))}
          maxLength={MAX_CUSTOM_TITLE}
          disabled={!canManage || setRole.isPending}
          placeholder={t('communities.manage.adminBadge', { defaultValue: 'Admin' })}
          className="h-9 rounded-xl bg-white/[0.04] border-white/10 text-white placeholder:text-zinc-600 text-sm"
        />
        <p className="text-zinc-500 text-xs">
          {t('communities.manage.customTitleHint', {
            defaultValue: 'Shown instead of the default Admin badge.',
          })}
        </p>
      </div>

      {canManage && (
        <Button
          size="sm"
          onClick={handleSave}
          disabled={setRole.isPending}
          className="w-full rounded-xl h-9 px-3 bg-white text-black hover:bg-white/90 font-medium"
        >
          {setRole.isPending && !dismissOpen ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
          {isExistingAdmin
            ? t('communities.manage.saveChanges', { defaultValue: 'Save changes' })
            : t('communities.manage.promote', { defaultValue: 'Promote' })}
        </Button>
      )}

      {canDismiss && (
        <>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setDismissOpen(true)}
            disabled={setRole.isPending}
            className="w-full rounded-xl h-9 px-3 text-red-400 hover:bg-red-500/15 border border-white/[0.08]"
          >
            {t('communities.manage.dismissAdmin', { defaultValue: 'Dismiss admin' })}
          </Button>

          <AlertDialog open={dismissOpen} onOpenChange={setDismissOpen}>
            <AlertDialogContent className="bg-black/60 backdrop-blur-[24px] border border-white/10 shadow-2xl">
              <AlertDialogHeader>
                <AlertDialogTitle className="text-white">
                  {t('communities.manage.dismissAdminTitle', {
                    defaultValue: 'Dismiss {{name}} as admin?',
                    name: displayName,
                  })}
                </AlertDialogTitle>
                <AlertDialogDescription className="text-zinc-400">
                  {t('communities.manage.dismissAdminBody', {
                    defaultValue:
                      '{{name}} keeps their membership but loses every administrator right in {{community}}.',
                    name: displayName,
                    community: community.name,
                  })}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel
                  disabled={setRole.isPending}
                  className="rounded-xl bg-zinc-800 border-zinc-700 text-white hover:bg-zinc-700"
                >
                  {t('communities.manage.cancel', { defaultValue: 'Cancel' })}
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={(e) => {
                    e.preventDefault();
                    handleDismiss();
                  }}
                  disabled={setRole.isPending}
                  className="rounded-xl bg-red-600 hover:bg-red-700 text-white border-transparent"
                >
                  {setRole.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                  {t('communities.manage.dismissAdmin', { defaultValue: 'Dismiss admin' })}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </>
  );
}

export function AdminRightsDialog({
  community,
  membership,
  target,
  open,
  onOpenChange,
}: AdminRightsDialogProps) {
  return (
    <Dialog open={open && !!target} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md sm:max-h-[85vh] overflow-y-auto">
        {target && (
          <AdminRightsForm
            key={target.id}
            community={community}
            membership={membership}
            target={target}
            onOpenChange={onOpenChange}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
