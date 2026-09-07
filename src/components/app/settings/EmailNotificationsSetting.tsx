/**
 * Email notifications (Settings → Notifications, and the gear sheet on the
 * notifications page).
 *
 * The switch writes `notificationPreferences.emailEnabled` on the account
 * document — the same store the notification service reads before it mails
 * anything, so this is a real control and not a second copy of the state.
 *
 * Two things it has to say that a plain toggle cannot:
 *
 *  - **There has to be an address.** Notifications are mailed to the address
 *    the account signs in with, and most accounts here are wallet-first and
 *    have none. Flipping this on for one of those would be a switch that sits
 *    on over a channel that can never deliver, so the row disables itself and
 *    points at the place the address is added instead.
 *  - **Which address.** Anyone who linked an email months ago has no idea
 *    which one it was, so the row names it (masked, as the API returns it)
 *    rather than making them go and look.
 *
 * Which *types* get mailed is deliberately not here: the backend reuses the
 * per-type switches below this row, so turning Comments off stops comment
 * email too. One matrix, not two.
 */

import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Mail } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { Switch } from '@/components/ui/switch';
import { SettingsRow } from '@/components/app/settings/SettingsRow';
import { useAuth } from '@/contexts/AuthContext';

interface EmailNotificationsSettingProps {
  variant?: 'row' | 'card';
}

export function EmailNotificationsSetting({ variant = 'row' }: EmailNotificationsSettingProps) {
  const { t } = useTranslation();
  const { isAuthenticated, walletAddress } = useAuth();
  const queryClient = useQueryClient();

  // Same key Settings and the notifications sheet already use, so the two
  // surfaces cannot disagree about the state of this switch.
  const prefsKey = ['account-notification-preferences', walletAddress?.toLowerCase() ?? null];

  const { data: prefs, isLoading: prefsLoading } = useQuery({
    queryKey: prefsKey,
    queryFn: () => import('@/lib/api/dehub').then(m => m.getAccountNotificationPreferences(walletAddress!)),
    enabled: isAuthenticated && !!walletAddress,
    staleTime: 5 * 60_000,
  });

  const { data: emailStatus, isLoading: statusLoading } = useQuery({
    queryKey: ['email-link-status', walletAddress?.toLowerCase() ?? null],
    queryFn: () => import('@/lib/api/dehub').then(m => m.getEmailLinkStatus()),
    enabled: isAuthenticated && !!walletAddress,
    staleTime: 5 * 60_000,
  });

  // `notifyEmail`, not `linked` — see EmailLinkStatusResponse. The mailer
  // sends to whatever address the account holds, however it got there.
  const linkedEmail = emailStatus?.notifyEmail ?? null;
  const isOn = prefs?.emailEnabled === true;

  const mutation = useMutation({
    mutationFn: (value: boolean) =>
      import('@/lib/api/dehub').then(m => m.updateEmailNotificationsEnabled(value)),
    onMutate: async (value: boolean) => {
      await queryClient.cancelQueries({ queryKey: prefsKey });
      const prev = queryClient.getQueryData(prefsKey);
      queryClient.setQueryData(prefsKey, (old: any) => ({ ...old, emailEnabled: value }));
      return { prev };
    },
    onError: (_err, _value, context) => {
      if (context?.prev) queryClient.setQueryData(prefsKey, context.prev);
      toast.error(t('settings.failedUpdateProfile'));
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: prefsKey }),
  });

  const loading = prefsLoading || statusLoading;
  const disabled = loading || !linkedEmail || mutation.isPending;

  const title = t('settings.emailNotifications');
  const description = linkedEmail
    ? t('settings.emailNotificationsDescLinked', 'Sent to {{email}}', { email: linkedEmail })
    : t('settings.emailNotificationsDesc');

  const control = (
    <Switch
      checked={isOn}
      onCheckedChange={(value) => mutation.mutate(value)}
      disabled={disabled}
      aria-label={title}
    />
  );

  const footer = !loading && !linkedEmail && (
    <p className="mt-2 text-xs text-zinc-400">
      {t(
        'settings.emailNotificationsNoAddress',
        'Add an email address to your account first — that is where these would go.',
      )}{' '}
      <Link
        to="/app/settings?highlight=sign-in"
        className="underline underline-offset-2 transition-colors hover:text-white"
      >
        {t('settings.emailNotificationsAddAddress', 'Add an email address')}
      </Link>
    </p>
  );

  if (variant === 'card') {
    return (
      <div>
        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl bg-white/10 p-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10">
              <Mail className="h-5 w-5 text-white" />
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
    <div data-setting-anchor="email-notifications">
      <SettingsRow
        as="label"
        icon={<Mail />}
        title={title}
        description={description}
        className={disabled ? undefined : 'cursor-pointer'}
        disabled={disabled}
        action={control}
      />
      {footer}
    </div>
  );
}
