import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { followSigningOn, turnOffFollowSigning, turnOnFollowSigning } from '@/lib/follow-graph';
import { SETTINGS_HEADING_CLASS, SETTINGS_INLINE_ACTION_CLASS } from './SettingsRow';

/**
 * Settings → Profile → "Your follows, on chain". Each follow is signed by the
 * wallet (through a device key it OKs once) and the daily list is stamped on
 * Base, see lib/follow-graph and riftn-backend src/follow-graph. This is
 * where a person turns that on or off for this device.
 */
export function SignedFollowsSetting() {
  const { t } = useTranslation();
  const [on, setOn] = useState(followSigningOn);
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    setBusy(true);
    try {
      if (on) {
        await turnOffFollowSigning();
        setOn(false);
        toast.success(t('signedFollows.turnedOff'));
      } else if (await turnOnFollowSigning()) {
        setOn(true);
        toast.success(t('signedFollows.turnedOn'));
      } else {
        toast.error(t('signedFollows.failed'));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-setting-anchor="signed-follows">
      <h3 className={SETTINGS_HEADING_CLASS}>
        <Link2 className="size-4" />
        {t('signedFollows.title')}
      </h3>
      <p className="-mt-2 mb-3 text-xs text-zinc-500">{t('signedFollows.description')}</p>
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm text-zinc-300">{on ? t('signedFollows.on') : t('signedFollows.off')}</span>
        <Button type="button" variant="outline" disabled={busy} className={cn(SETTINGS_INLINE_ACTION_CLASS)} onClick={() => void toggle()}>
          {on ? t('signedFollows.turnOff') : t('signedFollows.setUp')}
        </Button>
      </div>
      <p className="mt-2 text-xs text-zinc-500">{t('signedFollows.hiddenNote')}</p>
    </div>
  );
}
