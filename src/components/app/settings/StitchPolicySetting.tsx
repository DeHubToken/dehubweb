/**
 * Who may stitch your videos (Settings → Privacy): the account default. A post
 * can override it from the composer or Edit post. Enforced by the remix-links
 * function when a stitch is opened and again when it is posted.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Scissors } from 'lucide-react';
import { toast } from 'sonner';

import { SettingsRow } from '@/components/app/settings/SettingsRow';
import { SettingDrawerSelect } from '@/components/app/settings/SettingDrawerSelect';
import { useAuth } from '@/contexts/AuthContext';
import { getRemixSettings, saveRemixSettings, type RemixPolicy } from '@/lib/remix-links';

const remixSettingsKey = (owner: string | null | undefined, tokenId?: string | number | null) =>
  ['remix-settings', (owner ?? '').toLowerCase(), tokenId == null ? 'account' : String(tokenId)] as const;

export function StitchPolicySetting() {
  const { t } = useTranslation();
  const { walletAddress } = useAuth();
  const queryClient = useQueryClient();
  const key = remixSettingsKey(walletAddress);
  const { data, isLoading } = useQuery({
    queryKey: key,
    queryFn: () => getRemixSettings(walletAddress!.toLowerCase()),
    enabled: !!walletAddress,
    staleTime: 60_000,
    retry: 1,
  });
  const save = useMutation({
    mutationFn: (allowStitch: RemixPolicy) => saveRemixSettings({ allowStitch }),
    onSuccess: (next) => queryClient.setQueryData(key, next),
    onError: () => toast.error(t('remixLinks.stitch.saveFailed', 'Could not save your stitch setting. Try again.')),
  });
  const title = t('remixLinks.stitch.allow', 'Allow stitches');

  return (
    <SettingsRow
      icon={<Scissors />}
      anchor="allow-stitches"
      title={title}
      description={t('remixLinks.stitch.allowDesc', 'Who can use up to 5 seconds of your videos in their own. You can change it per post too.')}
      action={
        <SettingDrawerSelect
          value={save.variables ?? data?.settings.stitch.account ?? 'everyone'}
          onValueChange={(value) => save.mutate(value as RemixPolicy)}
          disabled={!walletAddress || isLoading || save.isPending}
          title={title}
          options={[
            { value: 'everyone', label: t('remixLinks.policy.everyone', 'Everyone') },
            { value: 'followers', label: t('remixLinks.policy.followers', 'Followers') },
            { value: 'nobody', label: t('remixLinks.policy.nobody', 'No one') },
          ]}
        />
      }
    />
  );
}

/**
 * The same choice for one post (Edit post). Saves on change — it is a
 * Supabase row of its own, not a field the post's Save sends.
 */
export function StitchPolicyPostSelect({ tokenId, className }: { tokenId: string | number; className?: string }) {
  const { t } = useTranslation();
  const { walletAddress } = useAuth();
  const queryClient = useQueryClient();
  const key = remixSettingsKey(walletAddress, tokenId);
  const { data } = useQuery({
    queryKey: key,
    queryFn: () => getRemixSettings(walletAddress!.toLowerCase(), tokenId),
    enabled: !!walletAddress,
    staleTime: 60_000,
    retry: 1,
  });
  const save = useMutation({
    mutationFn: (allowStitch: RemixPolicy | null) => saveRemixSettings({ tokenId, allowStitch }),
    onSuccess: (next) => queryClient.setQueryData(key, next),
    onError: () => toast.error(t('remixLinks.stitch.saveFailed', 'Could not save your stitch setting. Try again.')),
  });
  const value = save.isPending ? (save.variables ?? '') : (data?.settings.stitch.post ?? '');
  return (
    <select
      id={`stitch-policy-${tokenId}`}
      value={value}
      disabled={!walletAddress || save.isPending}
      onChange={(e) => save.mutate((e.target.value || null) as RemixPolicy | null)}
      aria-label={t('remixLinks.stitch.allow', 'Allow stitches')}
      className={className}
    >
      <option value="">{t('remixLinks.policy.default', 'My default')}</option>
      <option value="everyone">{t('remixLinks.policy.everyone', 'Everyone')}</option>
      <option value="followers">{t('remixLinks.policy.followers', 'Followers')}</option>
      <option value="nobody">{t('remixLinks.policy.nobody', 'No one')}</option>
    </select>
  );
}
