/**
 * Public chat alerts (Settings → Notifications → Chat).
 *
 * Two controls, and they ship together on purpose. The switch turns the
 * platform chat into something that can interrupt you; the ceiling under it is
 * what makes that safe. Public chat is the one room anybody can post in, so it
 * is the one feed whose volume is set by strangers — a raid with no limit is a
 * notification tray the reader has to clear rather than read, and the fix for
 * that cannot be a follow-up shipped later.
 *
 * The limit counts cards, not messages: hitting it delays the next card and
 * the buffered messages ride along on it, so a low setting stays informative
 * rather than lossy. hooks/use-public-chat-alerts is where that happens.
 *
 * Delivery rides the browser-notifications switch above, so this says as much
 * when that one is off instead of sitting on and quietly doing nothing.
 */

import { useTranslation } from 'react-i18next';
import { MessagesSquare } from 'lucide-react';

import { Switch } from '@/components/ui/switch';
import { SettingsRow } from '@/components/app/settings/SettingsRow';
import { SettingDrawerSelect } from '@/components/app/settings/SettingDrawerSelect';
import { useStoredEnabled } from '@/hooks/use-browser-notifications';
import { useUserPreferences } from '@/contexts/UserPreferencesContext';
import {
  PUBLIC_CHAT_ALERTS_PREF_KEY,
  PUBLIC_CHAT_MAX_PER_HOUR,
  PUBLIC_CHAT_RATE_PREF_KEY,
  normalisePerHour,
  usePublicChatAlertsEnabled,
  usePublicChatAlertsPerHour,
  writePublicChatAlerts,
  writePublicChatPerHour,
} from '@/lib/public-chat-alerts';

/**
 * A ladder rather than every number to 69: the useful range is logarithmic —
 * the difference between 1 and 3 an hour is a different product, the
 * difference between 44 and 45 is nothing — and 69 is the ceiling the room is
 * allowed to reach for.
 */
const RATE_STEPS = [1, 3, 6, 12, 20, 30, 45, PUBLIC_CHAT_MAX_PER_HOUR];

export function PublicChatAlertsSetting() {
  const { t } = useTranslation();
  const enabled = usePublicChatAlertsEnabled();
  const perHour = usePublicChatAlertsPerHour();
  const browserNotificationsOn = useStoredEnabled();
  // The blob is applied by ViewingPreferencesSync; this pushes the write, so
  // the choice reaches the account's other devices.
  const prefs = useUserPreferences();

  const setEnabled = (checked: boolean) => {
    writePublicChatAlerts(checked);
    prefs?.setPref(PUBLIC_CHAT_ALERTS_PREF_KEY, checked);
  };

  const setPerHour = (value: string) => {
    const next = normalisePerHour(value);
    writePublicChatPerHour(next);
    prefs?.setPref(PUBLIC_CHAT_RATE_PREF_KEY, next);
  };

  const title = t('settings.publicChatAlerts', 'Public chat');

  const description = !enabled
    ? t(
        'settings.publicChatAlertsDesc',
        'Get told when the public chat is talking while you’re in another tab',
      )
    : !browserNotificationsOn
      ? t(
          'settings.publicChatAlertsNeedsBrowser',
          'Turn on browser notifications above for these to arrive',
        )
      : t('settings.publicChatAlertsOnDesc', 'Busy stretches arrive as one combined alert');

  const options = RATE_STEPS.map((n) => ({
    value: String(n),
    label: t('settings.publicChatAlertsRateOption', '{{count}} an hour', { count: n }),
  }));

  return (
    <div data-setting-anchor="public-chat-alerts">
      <SettingsRow
        as="label"
        className="cursor-pointer"
        icon={<MessagesSquare />}
        title={title}
        description={description}
        action={
          <Switch
            checked={enabled}
            onCheckedChange={setEnabled}
            aria-label={title}
          />
        }
      />

      {enabled && (
        <div className="mt-4 pl-8">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="text-sm text-zinc-400">
              {t('settings.publicChatAlertsRate', 'At most')}
            </span>
            <SettingDrawerSelect
              value={String(perHour)}
              onValueChange={setPerHour}
              title={t('settings.publicChatAlertsRate', 'At most')}
              options={options}
            />
          </div>
          <p className="mt-2 text-xs text-zinc-500">
            {t(
              'settings.publicChatAlertsRateHint',
              'Nothing is lost when the room is busier than this — the messages are held and arrive together on the next alert.',
            )}
          </p>
        </div>
      )}
    </div>
  );
}
