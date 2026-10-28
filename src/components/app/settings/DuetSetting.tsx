import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Columns2 } from 'lucide-react';
import { SettingsRow } from '@/components/app/settings/SettingsRow';
import { SettingDrawerSelect } from '@/components/app/settings/SettingDrawerSelect';
import { getRemixSettings, saveRemixSettings, type RemixPolicy } from '@/lib/remix-links';

/** Account default for who may duet your videos. A post's own setting overrides it. */
export function DuetSetting({ address }: { address?: string | null }) {
  const { t } = useTranslation();
  const [value, setValue] = useState<RemixPolicy>('everyone');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!address) return;
    let live = true;
    void getRemixSettings(address.toLowerCase())
      .then(({ settings }) => { if (live) setValue(settings.duet.account ?? 'everyone'); })
      .catch(() => {});
    return () => { live = false; };
  }, [address]);

  const change = async (next: string) => {
    const previous = value;
    setValue(next as RemixPolicy);
    setBusy(true);
    try {
      await saveRemixSettings({ allowDuet: next as RemixPolicy });
    } catch (error) {
      setValue(previous);
      toast.error(error instanceof Error ? error.message : t('duet.saveFailed', 'Could not save. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsRow
      icon={<Columns2 />}
      title={t('duet.allowLabel', 'Allow duets')}
      description={t('duet.allowDescription', 'Who can record a duet next to your videos. You can change it on each post too.')}
      action={<SettingDrawerSelect
        value={value}
        onValueChange={value => void change(value)}
        disabled={busy || !address}
        title={t('duet.allowLabel', 'Allow duets')}
        options={[
          { value: 'everyone', label: t('duet.policyEveryone', 'Everyone') },
          { value: 'followers', label: t('duet.policyFollowers', 'Followers') },
          { value: 'nobody', label: t('duet.policyNobody', 'No one') },
        ]}
      />}
    />
  );
}
