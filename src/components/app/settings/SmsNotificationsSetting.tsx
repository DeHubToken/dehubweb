/**
 * Text notifications (Settings → Notifications, and the gear sheet on the
 * notifications page).
 *
 * The paid sibling of `EmailNotificationsSetting`, and shaped like it on
 * purpose — same row, same switch, same store: the toggle writes
 * `notificationPreferences.smsEnabled` on the account document, which is what
 * the notification service reads before it texts anything.
 *
 * What email does not have to say, and this does:
 *
 *  - **It costs money.** The row carries the price of a message and what is
 *    left on the balance, because a switch that quietly starts spending is the
 *    one thing this feature must never be. Nothing here can turn on until the
 *    channel is unlocked and a number is proven, and both of those happen in a
 *    dialog the reader has to open deliberately.
 *  - **It can run out.** A verified number with an empty balance is a switch
 *    that is on over a channel that will not deliver, so the row says so and
 *    points at the top-up rather than looking healthy and doing nothing.
 *
 * The per-type switches below this row still decide what a notification IS,
 * exactly as they do for email. What this row adds on top is **what to
 * text** — one choice, because the reader is billed per message and the
 * in-app toggles cannot say "only tell me when money arrives" without also
 * silencing the notification inside the app. It only ever narrows: `all`
 * means every eligible type already switched on, which is what the channel
 * did before the dropdown existed.
 *
 * The options come from the server, never from a list in here. A scope this
 * client invented would be refused on write and read as `all` on send, so
 * the reader would be billed for exactly what they thought they had turned
 * off.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ListFilter, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';

import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SettingsRow, SETTINGS_CONTROL_CLASS } from '@/components/app/settings/SettingsRow';
import {
  SmsNotificationsDialog,
  useSmsNotificationStatus,
} from '@/components/app/settings/SmsNotificationsDialog';
import { useAuth } from '@/contexts/AuthContext';

interface SmsNotificationsSettingProps {
  variant?: 'row' | 'card';
}

const nf = (value: number) => value.toLocaleString('en-US');

export function SmsNotificationsSetting({ variant = 'row' }: SmsNotificationsSettingProps) {
  const { t } = useTranslation();
  const { isAuthenticated, walletAddress } = useAuth();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);

  // Same key Settings and the notifications sheet already use, so the two
  // surfaces cannot disagree about the state of this switch.
  const prefsKey = ['account-notification-preferences', walletAddress?.toLowerCase() ?? null];

  const { data: prefs, isLoading: prefsLoading } = useQuery({
    queryKey: prefsKey,
    queryFn: () =>
      import('@/lib/api/dehub').then(m => m.getAccountNotificationPreferences(walletAddress!)),
    enabled: isAuthenticated && !!walletAddress,
    staleTime: 5 * 60_000,
  });

  const {
    statusKey,
    data: status,
    isLoading: statusLoading,
  } = useSmsNotificationStatus(isAuthenticated && !!walletAddress, walletAddress);

  const isOn = prefs?.smsEnabled === true;
  const ready = !!status?.available && status.unlocked && status.phoneVerified;

  const mutation = useMutation({
    mutationFn: (value: boolean) =>
      import('@/lib/api/dehub').then(m => m.updateSmsNotificationsEnabled(value)),
    onMutate: async (value: boolean) => {
      await queryClient.cancelQueries({ queryKey: prefsKey });
      const prev = queryClient.getQueryData(prefsKey);
      queryClient.setQueryData(prefsKey, (old: any) => ({ ...old, smsEnabled: value }));
      return { prev };
    },
    onError: (_err, _value, context) => {
      if (context?.prev) queryClient.setQueryData(prefsKey, context.prev);
      toast.error(t('settings.failedUpdateProfile'));
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: prefsKey }),
  });

  const scopeMutation = useMutation({
    mutationFn: (value: string) =>
      import('@/lib/api/dehub').then(m => m.updateSmsNotificationScope(value)),
    onMutate: async (value: string) => {
      await queryClient.cancelQueries({ queryKey: prefsKey });
      const prev = queryClient.getQueryData(prefsKey);
      queryClient.setQueryData(prefsKey, (old: any) => ({ ...old, smsScope: value }));
      return { prev };
    },
    onError: (_err, _value, context) => {
      if (context?.prev) queryClient.setQueryData(prefsKey, context.prev);
      toast.error(t('settings.failedUpdateProfile'));
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: prefsKey }),
  });

  const loading = prefsLoading || statusLoading;
  const disabled = loading || !ready || mutation.isPending;

  // Absent means `all` — every account that predates this dropdown carries
  // nothing here, and none of them asked for their texts to stop.
  const scope = prefs?.smsScope || 'all';

  const title = t('settings.smsNotifications');
  const description = describe();

  function describe(): string {
    if (loading) return t('settings.smsNotificationsDesc');
    if (!status?.available) return t('settings.smsUnavailable');
    if (!status.unlocked) {
      return t('settings.smsNotificationsLocked', {
        dhb: nf(status.minDepositDhb),
        usd: status.minDepositUsd,
      });
    }
    if (!status.phoneVerified) return t('settings.smsNotificationsNeedsNumber');
    // Out of credit is the state a plain "on" would hide, so it leads.
    if (status.priceDhb && status.balanceDhb < status.priceDhb) {
      return t('settings.smsNotificationsEmpty');
    }
    return t('settings.smsNotificationsDescReady', {
      phone: status.phone,
      dhb: nf(status.priceDhb ?? 0),
      count: status.messagesRemaining ?? 0,
    });
  }

  const control = (
    <Switch
      checked={isOn && ready}
      onCheckedChange={value => mutation.mutate(value)}
      disabled={disabled}
      aria-label={title}
    />
  );

  const manageLabel = !status?.available
    ? null
    : !status.unlocked
      ? t('settings.smsUnlockAction')
      : t('settings.smsManage');

  const footer = !loading && manageLabel && (
    <p className="mt-2 text-xs text-zinc-400">
      <button
        type="button"
        onClick={() => setDialogOpen(true)}
        className="underline underline-offset-2 transition-colors hover:text-white"
      >
        {manageLabel}
      </button>
    </p>
  );

  /**
   * The dropdown itself, shared by both variants.
   *
   * Options come from `status.scopes` and never from a list in here — a
   * scope this client invented would be refused on write and read as `all`
   * on send, so the reader would be billed for exactly what they thought
   * they had turned off.
   */
  const scopeSelect = (
    <Select
      value={scope}
      onValueChange={value => scopeMutation.mutate(value)}
      disabled={scopeMutation.isPending}
    >
      <SelectTrigger
        className={`w-44 ${SETTINGS_CONTROL_CLASS}`}
        aria-label={t('settings.smsScopeLabel')}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {(status?.scopes ?? []).map(option => (
          <SelectItem key={option} value={option}>
            {t(`settings.smsScope.${option}`, option)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  /**
   * Only while the switch is on. A "what to text" picker above a channel
   * that is off is a control over nothing, and the row above already carries
   * two states — locked, no number — that need the reader's attention more.
   *
   * Two shapes because the two surfaces are two materials: Settings is a
   * SettingsRow, the notifications sheet is a white/10 card. Rendering the
   * settings material inside the sheet is what makes an added control look
   * bolted on.
   */
  const showScope = ready && isOn && !!status?.scopes?.length;

  const scopePickerRow = showScope && (
    <SettingsRow
      icon={<ListFilter />}
      title={t('settings.smsScopeLabel')}
      description={t('settings.smsScopeDesc')}
      action={scopeSelect}
    />
  );

  const scopePickerCard = showScope && (
    <div className="mt-2 flex items-center justify-between gap-3 rounded-xl bg-white/10 p-4">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10">
          <ListFilter className="h-5 w-5 text-white" />
        </div>
        <div className="min-w-0">
          <p className="font-medium text-white">{t('settings.smsScopeLabel')}</p>
          <p className="text-sm text-white/50">{t('settings.smsScopeDesc')}</p>
        </div>
      </div>
      {scopeSelect}
    </div>
  );

  const dialog = (
    <SmsNotificationsDialog
      open={dialogOpen}
      onOpenChange={setDialogOpen}
      status={status}
      statusKey={statusKey}
    />
  );

  if (variant === 'card') {
    return (
      <div>
        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl bg-white/10 p-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10">
              <MessageSquare className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0">
              <p className="font-medium text-white">{title}</p>
              <p className="text-sm text-white/50">{description}</p>
            </div>
          </div>
          {control}
        </label>
        {footer}
        {scopePickerCard}
        {dialog}
      </div>
    );
  }

  return (
    <div data-setting-anchor="sms-notifications">
      <SettingsRow
        as="label"
        icon={<MessageSquare />}
        title={title}
        description={description}
        className={disabled ? undefined : 'cursor-pointer'}
        disabled={disabled}
        action={control}
      />
      {footer}
      {scopePickerRow}
      {dialog}
    </div>
  );
}
