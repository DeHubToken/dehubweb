/**
 * "Allow reactions": who may react to a creator's videos, recorded or live.
 * In Settings it is the account default; on a post's edit sheet it is that
 * post's own choice, or "Account default" to inherit. Stored and enforced by
 * the shared remix links (remix_settings), next to duets and stitches.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MonitorPlay } from 'lucide-react';
import { toast } from 'sonner';
import { Label } from '@/components/ui/label';
import { SettingsRow } from '@/components/app/settings/SettingsRow';
import { SettingDrawerSelect } from '@/components/app/settings/SettingDrawerSelect';
import { useAuth } from '@/contexts/AuthContext';
import { getRemixSettings, saveRemixSettings, type RemixPolicy, type RemixPolicySetting } from '@/lib/remix-links';

const POLICIES: RemixPolicy[] = ['everyone', 'followers', 'nobody'];

function useReactPolicy(wallet: string | null | undefined, tokenId: string | number | null, enabled: boolean) {
  const [setting, setSetting] = useState<RemixPolicySetting | null>(null);
  useEffect(() => {
    if (!enabled || !wallet) return;
    let live = true;
    getRemixSettings(wallet.toLowerCase(), tokenId)
      .then((r) => { if (live) setSetting(r.settings.react); })
      .catch(() => { if (live) setSetting({ post: null, account: null, effective: 'everyone' }); });
    return () => { live = false; };
  }, [wallet, tokenId, enabled]);

  const save = async (value: RemixPolicy | null) => {
    const before = setting;
    try {
      const r = await saveRemixSettings({ tokenId, allowReact: value });
      setSetting(r.settings.react);
    } catch (error) {
      setSetting(before);
      toast.error(error instanceof Error ? error.message : 'Could not save this setting.');
    }
  };
  return [setting, save] as const;
}

function usePolicyLabels() {
  const { t } = useTranslation();
  return {
    everyone: t('reactions.policy.everyone', 'Everyone'),
    followers: t('reactions.policy.followers', 'Followers'),
    nobody: t('reactions.policy.nobody', 'No one'),
  } satisfies Record<RemixPolicy, string>;
}

/** One post's choice, for its edit sheet. Saves as soon as it changes. */
export function PostAllowReactions({ tokenId, open }: { tokenId: string | number; open: boolean }) {
  const { t } = useTranslation();
  const { walletAddress } = useAuth();
  const labels = usePolicyLabels();
  const [setting, save] = useReactPolicy(walletAddress, tokenId, open);
  if (!walletAddress) return null;
  const id = `allow-reactions-${tokenId}`;
  return (
    <div className="flex items-center justify-between gap-3">
      <Label htmlFor={id} className="text-sm font-medium text-zinc-300">{t('reactions.allow', 'Allow reactions')}</Label>
      <select
        id={id}
        disabled={!setting}
        value={setting?.post ?? ''}
        onChange={(e) => void save((e.target.value || null) as RemixPolicy | null)}
        className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none"
      >
        <option value="">{t('reactions.policy.default', { value: labels[setting?.account ?? 'everyone'], defaultValue: 'Account default ({{value}})' })}</option>
        {POLICIES.map((p) => <option key={p} value={p}>{labels[p]}</option>)}
      </select>
    </div>
  );
}

/** The account default, for Settings. */
export function AccountAllowReactions() {
  const { t } = useTranslation();
  const { walletAddress } = useAuth();
  const labels = usePolicyLabels();
  const [setting, save] = useReactPolicy(walletAddress, null, !!walletAddress);
  if (!walletAddress) return null;
  return (
    <SettingsRow
      icon={<MonitorPlay />}
      title={t('reactions.allow', 'Allow reactions')}
      description={t('reactions.allowDescription', 'Let other creators react to your videos, recorded or live. You can still change it on each post.')}
      action={
        <SettingDrawerSelect
          value={setting?.account ?? 'everyone'}
          onValueChange={(v) => void save(v as RemixPolicy)}
          disabled={!setting}
          title={t('reactions.allow', 'Allow reactions')}
          options={POLICIES.map((p) => ({ value: p, label: labels[p] }))}
        />
      }
    />
  );
}
