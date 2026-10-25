import { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Filter, UserCheck, UserPlus, UserX } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import type {
  AccountNotificationPreferences,
  NotificationPolicyKey,
  NotificationPolicyValue,
} from '@/lib/api/dehub/push';
import { SETTINGS_CONTROL_CLASS, SETTINGS_HEADING_CLASS } from './SettingsRow';

const ROWS: Array<{ key: NotificationPolicyKey; icon: typeof Filter }> = [
  { key: 'notFollowing', icon: UserX },
  { key: 'notFollowers', icon: UserCheck },
  { key: 'newAccounts', icon: UserPlus },
];

// The held-back list renders notification rows, which live with the
// notifications page; load them only when this setting is on screen.
const FilteredNotificationsSection = lazy(() =>
  import('@/pages/app/NotificationsPage').then(m => ({ default: m.FilteredNotificationsSection })),
);

const VALUES: NotificationPolicyValue[] = ['accept', 'filter', 'drop'];

/**
 * Settings → Notifications → Filter notifications from. Mastodon's
 * notification policy: for each group of accounts, notify as usual, keep it
 * under Filtered (no badge, no push), or drop it. The server applies it as
 * each notification is made — see dehub-stream-backend notification-policy.
 * Shares the notification tab's preferences query, so it stays in step with
 * the toggles above it.
 */
export function NotificationFiltersSetting() {
  const { t } = useTranslation();
  const { isAuthenticated, walletAddress } = useAuth();
  const queryClient = useQueryClient();
  const prefsKey = ['account-notification-preferences', walletAddress?.toLowerCase() ?? null];

  const { data: prefs, isLoading } = useQuery({
    queryKey: prefsKey,
    queryFn: () => import('@/lib/api/dehub').then(m => m.getAccountNotificationPreferences(walletAddress!)),
    enabled: isAuthenticated && !!walletAddress,
    staleTime: 5 * 60_000,
  });

  const mutation = useMutation({
    mutationFn: ({ key, value }: { key: NotificationPolicyKey; value: NotificationPolicyValue }) =>
      import('@/lib/api/dehub').then(m => m.updateNotificationPolicy(key, value)),
    onMutate: async ({ key, value }) => {
      await queryClient.cancelQueries({ queryKey: prefsKey });
      const prev = queryClient.getQueryData(prefsKey);
      queryClient.setQueryData(prefsKey, (old: AccountNotificationPreferences | undefined) => ({
        ...old,
        policy: { ...(old?.policy ?? {}), [key]: value },
      }));
      return { prev };
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) queryClient.setQueryData(prefsKey, context.prev);
      toast.error(t('notificationFilters.failed'));
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: prefsKey }),
  });

  return (
    <div data-setting-anchor="notification-filters">
      <h3 className={SETTINGS_HEADING_CLASS}>
        <Filter className="size-4" />
        {t('notificationFilters.title')}
      </h3>
      <p className="mb-4 text-sm text-zinc-500">{t('notificationFilters.description')}</p>
      <div className="space-y-3">
        {ROWS.map(({ key, icon: Icon }) => (
          <label key={key} className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-3">
              <Icon className="size-4 shrink-0 text-zinc-400" aria-hidden="true" />
              <span className="text-sm text-white">{t(`notificationFilters.${key}`)}</span>
            </span>
            <select
              value={(prefs as AccountNotificationPreferences | undefined)?.policy?.[key] ?? 'accept'}
              onChange={(e) => mutation.mutate({ key, value: e.target.value as NotificationPolicyValue })}
              disabled={isLoading || mutation.isPending}
              aria-label={t(`notificationFilters.${key}`)}
              className={cn(SETTINGS_CONTROL_CLASS, 'shrink-0 outline-none')}
            >
              {VALUES.map(value => (
                <option key={value} value={value}>
                  {t(`notificationFilters.${value}`)}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      {isAuthenticated && (
        <Suspense fallback={null}>
          <FilteredNotificationsSection />
        </Suspense>
      )}
    </div>
  );
}
