/**
 * Browser notifications control (Settings → Notifications, and the gear sheet
 * on the notifications page).
 *
 * The soft-ask toast (NotificationsPromptToast) is a one-shot: it needs scroll
 * plus dwell to appear at all, a dismissal snoozes it for 60 days, and an
 * answer retires it for good. So the readers who most want this — the ones who
 * hit the wrong button on the native prompt, or never saw it — are exactly the
 * ones the toast will never offer again. This row is their only way back, and
 * it therefore has to do more than flip a flag:
 *
 *  - it reports what the *browser* thinks, not just our stored flag, so a
 *    permission revoked in site settings shows here instead of leaving a
 *    switch sitting on over a dead channel;
 *  - when the browser has recorded "Block" it says so, explains the way out,
 *    and remembers the click so allowing it in the browser finishes the job
 *    without a second trip here. Asking again is pointless —
 *    `requestPermission()` resolves 'denied' instantly, showing nothing — and
 *    re-prompting is the exact pattern Chrome's abusive-notification
 *    heuristics penalise;
 *  - turning it on fires one real notification, which both confirms delivery
 *    to the reader and catches browsers where the constructor throws.
 */

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bell, BellOff, BellRing } from 'lucide-react';
import { toast } from 'sonner';

import { Switch } from '@/components/ui/switch';
import { SettingsRow } from '@/components/app/settings/SettingsRow';
import {
  requestNotificationPermission,
  setStoredEnabled,
  showTestNotification,
  useNotificationPermission,
  useStoredEnabled,
} from '@/hooks/use-browser-notifications';

/** iOS only delivers web notifications to a home-screen install, never a tab. */
function isIOS(): boolean {
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  // iPadOS 13+ reports itself as a Mac; touch points give it away.
  return /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
}

/** Where this browser hides the switch that undoes a "Block". */
function useUnblockHint(): string {
  const { t } = useTranslation();
  const ua = navigator.userAgent;

  if (/Firefox\//.test(ua)) {
    return t(
      'settings.browserNotificationsUnblockFirefox',
      'Click the padlock at the left of the address bar, clear the “Blocked” next to Receive Notifications, then reload this page.',
    );
  }
  // Chrome, Edge, Brave, Opera and friends all sit behind the same menu.
  if (/Chrome\/|Chromium\/|Edg\//.test(ua)) {
    return t(
      'settings.browserNotificationsUnblockChromium',
      'Click the icon at the left of the address bar → Site settings → set Notifications to Allow, then reload this page.',
    );
  }
  if (/Safari\//.test(ua)) {
    return t(
      'settings.browserNotificationsUnblockSafari',
      'In the menu bar: Safari → Settings → Websites → Notifications, then set this site to Allow.',
    );
  }
  return t(
    'settings.browserNotificationsUnblockGeneric',
    "Open your browser's site settings for this page and set Notifications to Allow, then reload.",
  );
}

interface BrowserNotificationsSettingProps {
  /** 'row' matches Settings → Notifications; 'card' matches the gear sheet. */
  variant?: 'row' | 'card';
}

export function BrowserNotificationsSetting({ variant = 'row' }: BrowserNotificationsSettingProps) {
  const { t } = useTranslation();
  const permission = useNotificationPermission();
  const stored = useStoredEnabled();
  const [busy, setBusy] = useState(false);
  // Set when the switch is clicked while the browser is blocking us: the ask
  // stands, it just can't be honoured until they change it in the browser.
  const [pendingEnable, setPendingEnable] = useState(false);
  const unblockHint = useUnblockHint();

  const blocked = permission === 'denied';
  const unsupported = permission === 'unsupported';
  // Our flag alone is not "on": the browser has the last word on delivery.
  const isOn = stored && permission === 'granted';

  const testBody = t(
    'settings.browserNotificationsTestBody',
    "That's what a DeHub notification looks like.",
  );

  /** Permission is in hand — store the flag and prove delivery works. */
  const finishEnable = useCallback(() => {
    setStoredEnabled(true);
    if (showTestNotification('DeHub', testBody)) {
      toast.success(t('settings.browserNotificationsEnabled', 'Browser notifications enabled'));
    } else {
      // Permission granted but the browser won't construct one — Android
      // Chrome. Leaving the switch on would promise delivery that can't
      // happen.
      setStoredEnabled(false);
      toast.error(t('settings.browserNotificationsUnsupported', 'Browser notifications are not supported'));
    }
  }, [t, testBody]);

  // The payoff for the blocked case: unblocking happens in the browser's own
  // UI, and coming back to the tab is what tells us about it. Honour the click
  // they already made rather than making them find this switch a second time.
  useEffect(() => {
    if (!pendingEnable || permission !== 'granted') return;
    setPendingEnable(false);
    finishEnable();
  }, [pendingEnable, permission, finishEnable]);

  const enable = async () => {
    if (unsupported) {
      toast.error(t('settings.browserNotificationsUnsupported', 'Browser notifications are not supported'));
      return;
    }
    if (blocked) {
      setPendingEnable(true);
      toast.error(
        t('settings.browserNotificationsDenied', 'Notifications blocked. Enable them in your browser settings.'),
      );
      return;
    }

    setBusy(true);
    try {
      // Called before any await so the native prompt still sees the click's
      // user activation.
      const result = permission === 'granted' ? 'granted' : await requestNotificationPermission();
      if (result !== 'granted') {
        setStoredEnabled(false);
        if (result === 'denied') {
          toast.error(
            t('settings.browserNotificationsDenied', 'Notifications blocked. Enable them in your browser settings.'),
          );
        } else if (result === 'default') {
          // Prompt waved away, or parked behind Chrome's quiet bell icon.
          // Nothing is blocked and the switch will work on the next try.
          toast.info(
            t('settings.browserNotificationsDismissed', 'Notification request dismissed — try the switch again'),
          );
        } else {
          toast.error(t('settings.browserNotificationsUnsupported', 'Browser notifications are not supported'));
        }
        return;
      }

      finishEnable();
    } finally {
      setBusy(false);
    }
  };

  const handleChange = (checked: boolean) => {
    if (!checked) {
      setPendingEnable(false);
      setStoredEnabled(false);
      return;
    }
    void enable();
  };

  const sendTest = () => {
    if (showTestNotification('DeHub', testBody)) {
      toast.success(t('settings.browserNotificationsTestSent', 'Test notification sent'));
    } else {
      toast.error(t('settings.browserNotificationsUnsupported', 'Browser notifications are not supported'));
    }
  };

  const title = t('settings.browserNotifications', 'Browser notifications');

  const description = unsupported
    ? isIOS()
      ? t(
          'settings.browserNotificationsIosHint',
          'iPhone and iPad only allow this once DeHub is on your Home Screen — tap Share, then “Add to Home Screen”.',
        )
      : t('settings.browserNotificationsUnsupported', 'Browser notifications are not supported')
    : blocked
      ? t('settings.browserNotificationsBlocked', 'Blocked by your browser')
      : isOn
        ? t('settings.browserNotificationsOnDesc', 'Replies, tips and DMs pop up while you’re in another tab')
        : t(
            'settings.browserNotificationsDesc',
            'Get a heads-up about replies, tips and DMs while you’re in another tab',
          );

  const Icon = blocked || unsupported ? BellOff : isOn ? BellRing : Bell;

  const control = (
    <Switch
      checked={isOn}
      onCheckedChange={handleChange}
      disabled={busy || unsupported}
      aria-label={title}
    />
  );

  // Shown under the row: how to undo a block, and a way to prove delivery
  // works without waiting for someone to tip you.
  const footer = (
    <>
      {blocked && (
        <div className="mt-2 rounded-xl border border-amber-400/30 bg-amber-400/[0.07] p-3">
          <p className="text-sm font-medium text-white">
            {t('settings.browserNotificationsBlockedTitle', 'This browser is blocking notifications')}
          </p>
          <p className="mt-1 text-xs text-zinc-400">{unblockHint}</p>
          <p className="mt-1 text-xs text-zinc-500">
            {pendingEnable
              ? t(
                  'settings.browserNotificationsBlockedPending',
                  'Your request is saved — this switches itself on the moment your browser allows it.',
                )
              : t(
                  'settings.browserNotificationsBlockedNote',
                  'Only your browser can undo this — DeHub can’t ask again once it’s blocked.',
                )}
          </p>
        </div>
      )}
      {isOn && (
        <button
          type="button"
          onClick={sendTest}
          className="mt-2 text-xs text-zinc-400 underline underline-offset-2 transition-colors hover:text-white"
        >
          {t('settings.browserNotificationsTest', 'Send a test notification')}
        </button>
      )}
    </>
  );

  if (variant === 'card') {
    return (
      <div>
        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl bg-white/10 p-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10">
              <Icon className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0">
              <p className="font-medium text-white">{title}</p>
              <p className="text-sm text-white/50">{description}</p>
            </div>
          </div>
          {control}
        </label>
        {footer}
      </div>
    );
  }

  return (
    <div>
      <SettingsRow
        as="label"
        icon={<Icon />}
        title={title}
        description={description}
        className={unsupported ? undefined : 'cursor-pointer'}
        disabled={unsupported}
        action={control}
      />
      {footer}
    </div>
  );
}
