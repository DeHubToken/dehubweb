import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Shield } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { SettingsRow, SETTINGS_CONTROL_CLASS } from '@/components/app/settings/SettingsRow';
import {
  disableTwoFactor,
  enableTwoFactor,
  getTwoFactorStatus,
  regenerateTwoFactorCodes,
  startTwoFactorSetup,
} from '@/lib/api/dehub/two-factor';

import { TwoFactorSheet, type TwoFactorApi } from './TwoFactorSheet';

const STATUS_KEY = ['two-factor-status'] as const;

const api: TwoFactorApi = {
  start: startTwoFactorSetup,
  confirm: enableTwoFactor,
  disable: async (code) => { await disableTwoFactor(code); },
  regenerateCodes: regenerateTwoFactorCodes,
};

/** Settings → Privacy & security → Two-step sign-in. */
export function TwoFactorSettings() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data } = useQuery({ queryKey: STATUS_KEY, queryFn: getTwoFactorStatus, staleTime: 30_000 });
  const status = data ?? { enabled: false, enabledAt: null, backupCodesLeft: 0 };

  return (
    <>
      <SettingsRow
        icon={<Shield />}
        anchor="two-factor"
        title={
          <span className="inline-flex items-center gap-2">
            {t('twoFactor.rowTitle', 'Two-step sign-in')}
            {status.enabled && (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[11px] font-semibold leading-none text-emerald-500">
                {t('twoFactor.statusOn', 'On')}
              </span>
            )}
          </span>
        }
        description={status.enabled
          ? t('twoFactor.rowOnDesc', 'New sign-ins need a code from your authenticator app. {{count}} backup codes left.', { count: status.backupCodesLeft })
          : t('twoFactor.rowOffDesc', 'Ask for a code from your authenticator app at sign-in.')}
        action={
          <Button type="button" variant="outline" size="sm" className={SETTINGS_CONTROL_CLASS} onClick={() => setOpen(true)}>
            {status.enabled ? t('twoFactor.manage', 'Manage') : t('twoFactor.turnOn', 'Turn on')}
          </Button>
        }
      />
      <TwoFactorSheet
        open={open}
        onOpenChange={setOpen}
        status={status}
        api={api}
        onChanged={() => void queryClient.invalidateQueries({ queryKey: STATUS_KEY })}
      />
    </>
  );
}
