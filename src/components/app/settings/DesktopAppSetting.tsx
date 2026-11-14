/**
 * Settings entry for installing Riftn as a desktop app.
 *
 * riftn.com installs as its own app window from Chrome, Edge and Safari (see
 * lib/pwa-install). When the browser has offered an install, the button opens
 * that dialog straight away; otherwise it goes to the download page, which
 * explains the one step this browser needs. Computers only: phones have the
 * real app, and the phone layout stays as it is.
 *
 * @module components/app/settings/DesktopAppSetting
 */

import { useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Monitor } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { SETTINGS_CONTROL_CLASS, SettingsRow } from '@/components/app/settings/SettingsRow';
import { getInstallState, isDesktopDevice, promptInstall, subscribeInstall } from '@/lib/pwa-install';

export function DesktopAppSetting() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const state = useSyncExternalStore(subscribeInstall, getInstallState, () => 'manual' as const);

  if (!isDesktopDevice()) return null;

  const installed = state === 'installed';
  const handle = async () => {
    if (state === 'ready') {
      await promptInstall();
      return;
    }
    navigate('/apk?for=desktop');
  };

  return (
    <SettingsRow
      icon={<Monitor />}
      anchor="desktop-app"
      title={t('settings.desktopApp')}
      description={t('settings.desktopAppDesc')}
      action={
        <Button className={SETTINGS_CONTROL_CLASS} onClick={handle} disabled={installed}>
          {installed ? t('settings.desktopAppInstalled') : t('settings.desktopAppInstall')}
        </Button>
      }
    />
  );
}
