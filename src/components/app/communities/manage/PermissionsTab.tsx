/**
 * Permissions tab
 * ===============
 * What a plain member of this community may do, plus slow mode. Both write
 * through community_update_settings, which replaces `default_permissions`
 * wholesale — so every toggle sends the full resolved map, never a delta.
 */

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Timer } from 'lucide-react';
import { toast } from 'sonner';

import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DEFAULT_MEMBER_PERMISSIONS,
  MEMBER_RIGHTS,
  SLOW_MODE_OPTIONS,
  useCommunityAbilities,
  useUpdateCommunitySettings,
  type MemberRight,
} from '@/hooks/use-community-admin';
import type { Community, CommunityMember } from '@/hooks/use-communities';

export interface PermissionsTabProps {
  community: Community;
  membership: CommunityMember | null | undefined;
}

/** Stored value wins; anything unset falls back to the shipped default. */
function resolveMemberPermissions(
  stored: Record<string, boolean> | null | undefined,
): Record<MemberRight, boolean> {
  const resolved = {} as Record<MemberRight, boolean>;
  for (const right of MEMBER_RIGHTS) {
    const value = stored?.[right.key];
    resolved[right.key] = typeof value === 'boolean' ? value : DEFAULT_MEMBER_PERMISSIONS[right.key];
  }
  return resolved;
}

export function PermissionsTab({ community, membership }: PermissionsTabProps) {
  const { t } = useTranslation();
  const abilities = useCommunityAbilities(community, membership);
  const updateMutation = useUpdateCommunitySettings();

  const serverPermissions = useMemo(
    () => resolveMemberPermissions(community.default_permissions),
    [community.default_permissions],
  );
  // Serialised so a refetch that returns an identical map does not stomp the
  // optimistic state with a fresh object identity.
  const serverKey = JSON.stringify(serverPermissions);

  const [draft, setDraft] = useState<Record<MemberRight, boolean>>(serverPermissions);
  const [savingRight, setSavingRight] = useState<MemberRight | null>(null);

  const serverSlowMode = community.slow_mode_seconds ?? 0;
  const [slowMode, setSlowMode] = useState<number>(serverSlowMode);
  const [savingSlowMode, setSavingSlowMode] = useState(false);

  useEffect(() => {
    setDraft(JSON.parse(serverKey) as Record<MemberRight, boolean>);
  }, [serverKey]);

  useEffect(() => {
    setSlowMode(serverSlowMode);
  }, [serverSlowMode]);

  const canEdit = abilities.can('change_info');

  const handleToggle = (right: MemberRight, next: boolean) => {
    const previous = draft;
    // Built by assignment rather than a computed spread key: a union-typed key
    // in an object literal widens the result to a string index signature.
    const nextMap: Record<MemberRight, boolean> = { ...draft };
    nextMap[right] = next;
    setDraft(nextMap);
    setSavingRight(right);
    updateMutation.mutate(
      { communityId: community.id, patch: { default_permissions: nextMap } },
      {
        onSuccess: () =>
          toast.success(
            t('communities.manage.permissionsUpdated', { defaultValue: 'Permissions updated' }),
          ),
        onError: () => setDraft(previous),
        onSettled: () => setSavingRight(null),
      },
    );
  };

  const handleSlowMode = (value: string) => {
    const seconds = Number(value);
    if (!Number.isFinite(seconds) || seconds === slowMode) return;
    const previous = slowMode;
    setSlowMode(seconds);
    setSavingSlowMode(true);
    updateMutation.mutate(
      { communityId: community.id, patch: { slow_mode_seconds: seconds } },
      {
        onSuccess: () =>
          toast.success(
            t('communities.manage.slowModeUpdated', { defaultValue: 'Slow mode updated' }),
          ),
        onError: () => setSlowMode(previous),
        onSettled: () => setSavingSlowMode(false),
      },
    );
  };

  if (!canEdit) {
    return (
      <p className="text-center text-zinc-500 text-sm py-8">
        {t('communities.manage.permissionsNoAccess', {
          defaultValue: 'You do not have permission to change these settings.',
        })}
      </p>
    );
  }

  const currentOption = SLOW_MODE_OPTIONS.find(option => option.seconds === slowMode);
  const slowModeLabel = currentOption?.label ?? `${slowMode}s`;

  return (
    <div className="space-y-3">
      <section className="rounded-xl border border-white/10 bg-white/[0.04] p-3.5">
        <h3 className="text-white font-medium text-sm">
          {t('communities.manage.defaultMemberPermissions', {
            defaultValue: 'Default member permissions',
          })}
        </h3>
        <p className="text-zinc-500 text-xs mt-1">
          {t('communities.manage.defaultMemberPermissionsHint', {
            defaultValue: 'Applies to everyone without an admin role.',
          })}
        </p>

        <div className="mt-2 space-y-0.5">
          {MEMBER_RIGHTS.map(right => (
            <label
              key={right.key}
              className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/[0.06] transition-colors cursor-pointer"
            >
              <span className="flex-1 min-w-0">
                <span className="block text-white text-sm">{right.label}</span>
                <span className="block text-zinc-500 text-xs">{right.hint}</span>
              </span>
              {savingRight === right.key && (
                <Loader2 className="w-3.5 h-3.5 text-zinc-400 animate-spin shrink-0" />
              )}
              <Switch
                checked={draft[right.key]}
                onCheckedChange={next => handleToggle(right.key, next)}
                disabled={savingRight !== null}
                aria-label={right.label}
                className="shrink-0"
              />
            </label>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-white/10 bg-white/[0.04] p-3.5">
        <h3 className="text-white font-medium text-sm flex items-center gap-2">
          <Timer className="w-4 h-4 text-zinc-400" />
          {t('communities.manage.slowMode', { defaultValue: 'Slow mode' })}
        </h3>

        <div className="mt-2.5 flex items-center gap-2">
          <Select
            value={String(slowMode)}
            onValueChange={handleSlowMode}
            disabled={savingSlowMode}
          >
            <SelectTrigger
              aria-label={t('communities.manage.slowMode', { defaultValue: 'Slow mode' })}
              className="h-9 w-40 rounded-xl border-white/10 bg-white/[0.04] text-white text-sm"
            >
              <SelectValue placeholder={slowModeLabel} />
            </SelectTrigger>
            <SelectContent>
              {SLOW_MODE_OPTIONS.map(option => (
                <SelectItem key={option.seconds} value={String(option.seconds)}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {savingSlowMode && <Loader2 className="w-3.5 h-3.5 text-zinc-400 animate-spin" />}
        </div>

        <p className="text-zinc-400 text-sm mt-2.5">
          {slowMode === 0
            ? t('communities.manage.slowModeOff', {
                defaultValue: 'Members can send messages without a delay.',
              })
            : t('communities.manage.slowModeOn', {
                defaultValue:
                  'Members can send one message every {{label}}. Admins are exempt.',
                label: slowModeLabel,
              })}
        </p>
      </section>
    </div>
  );
}
