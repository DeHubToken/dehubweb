import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { followSigningOn, turnOffFollowSigning, turnOnFollowSigning } from '@/lib/follow-graph';
import { efpState, turnOffEfp, turnOnEfp, type EfpState } from '@/lib/efp';
import { SETTINGS_HEADING_CLASS, SETTINGS_INLINE_ACTION_CLASS } from './SettingsRow';

/**
 * Settings → Profile → "Your follows, on chain". Each follow is signed by the
 * wallet (through a device key it OKs once) and the daily list is stamped on
 * Base, see lib/follow-graph and riftn-backend src/follow-graph. This is
 * where a person turns that on or off for this device, and where they can
 * also keep a copy on EFP (lib/efp).
 */
export function SignedFollowsSetting() {
  const { t } = useTranslation();
  const [on, setOn] = useState(followSigningOn);
  const [busy, setBusy] = useState(false);
  const [efp, setEfp] = useState<EfpState | null>(null);
  const [efpBusy, setEfpBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void efpState().then((state) => { if (alive) setEfp(state); });
    return () => { alive = false; };
  }, []);

  const efpOn = efp?.status === 'on';
  const toggleEfp = async () => {
    setEfpBusy(true);
    try {
      if (efpOn) {
        await turnOffEfp();
        toast.success(t('signedFollows.efpStopped'));
      } else {
        const result = await turnOnEfp();
        if (result === 'on') toast.success(t('signedFollows.efpDone'));
        else if (result === 'already-has-list') toast.error(t('signedFollows.efpHasList'));
        else if (result === 'no-gas') toast.error(t('signedFollows.efpNoGas'));
        else toast.error(t('signedFollows.efpFailed'));
      }
      setEfp(await efpState());
    } finally {
      setEfpBusy(false);
    }
  };

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
      <div className="mt-3 flex items-center gap-2" data-efp-row>
        <span className="min-w-0 flex-1 truncate text-sm text-zinc-300">
          {efpOn ? t('signedFollows.efpOn', { count: efp?.synced ?? 0 }) : t('signedFollows.efpOff')}
        </span>
        <Button type="button" variant="outline" disabled={efpBusy} className={cn(SETTINGS_INLINE_ACTION_CLASS)} onClick={() => void toggleEfp()}>
          {efpOn ? t('signedFollows.efpTurnOff') : t('signedFollows.efpTurnOn')}
        </Button>
      </div>
      <p className="mt-2 text-xs text-zinc-500">{t('signedFollows.efpNote')}</p>
      <p className="mt-2 text-xs text-zinc-500">{t('signedFollows.hiddenNote')}</p>
    </div>
  );
}
