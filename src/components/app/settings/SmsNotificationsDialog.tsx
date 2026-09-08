/**
 * Unlocking text notifications: deposit, then prove the number.
 * ============================================================
 * Two steps, in that order, and the order is the whole design.
 *
 * Sending a verification code costs us a real SMS fragment. If the number came
 * first, anybody could spend our prepaid balance one code at a time without
 * ever paying for anything — which is the exact attack the phone-login function
 * carries a global daily cap to survive. Taking the deposit first means the
 * verification text is bought and paid for before it is sent, and the code
 * doubles as proof that the route works before the reader is promised messages
 * on it.
 *
 * The deposit itself is an ordinary DHB transfer to an address the server
 * names. The client never says how much arrived — it hands over the hash and
 * the server reads the amount off the chain. Claiming is safe to repeat and
 * answers `pending` while the receipt catches up, so a dropped response is a
 * retry rather than a second payment.
 */

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { SETTINGS_FIELD_CLASS, SETTINGS_LABEL_CLASS } from '@/components/app/settings/SettingsRow';
import {
  claimSmsDeposit,
  getSmsNotificationStatus,
  quoteSmsNumber,
  removeSmsPhone,
  requestSmsPhoneCode,
  verifySmsPhoneCode,
  type SmsNotificationStatus,
} from '@/lib/api/dehub/sms-notifications';

interface SmsNotificationsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  status: SmsNotificationStatus | undefined;
  /** Key the parent's status query lives under, so both refresh together. */
  statusKey: readonly unknown[];
}

/** How long to keep asking the server about a transfer the chain has not shown yet. */
const CLAIM_ATTEMPTS = 12;
const CLAIM_GAP_MS = 5_000;

const nf = (value: number) => value.toLocaleString('en-US');

export function SmsNotificationsDialog({
  open,
  onOpenChange,
  status,
  statusKey,
}: SmsNotificationsDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [stage, setStage] = useState<'idle' | 'paying' | 'confirming'>('idle');
  const cancelled = useRef(false);

  useEffect(() => {
    if (!open) {
      setCode('');
      setStage('idle');
    }
    cancelled.current = false;
    return () => {
      cancelled.current = true;
    };
  }, [open]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: statusKey });

  // Priced live as the number is typed, because the price depends on where the
  // number is and a reader typing an unreachable one should find out now
  // rather than after paying.
  const trimmedPhone = phone.trim();
  const { data: quote } = useQuery({
    queryKey: ['sms-quote', trimmedPhone],
    queryFn: () => quoteSmsNumber(trimmedPhone),
    enabled: open && /^\+?[0-9][0-9\s()-]{6,}$/.test(trimmedPhone),
    staleTime: 60_000,
  });

  const deposit = useMutation({
    mutationFn: async () => {
      if (!status?.depositAddress) throw new Error(t('settings.smsUnavailable'));

      // Imported at call time: this dialog is reachable from a cached page and
      // scripts/check-entry-bundle.mjs fails the build if wagmi lands in the
      // entry chunk.
      const { sendERC20Token } = await import('@/lib/wallet/send');
      const { pickPayChain } = await import('@/lib/wallet/pay-chain');
      const { getWalletAddress } = await import('@/lib/contracts/aa-utils');
      const { toWei } = await import('@/lib/contracts/dhb-token');

      const amount = status.minDepositDhb;
      const payer = await getWalletAddress();
      const { chainId } = await pickPayChain(
        payer,
        toWei(amount),
        status.chains.map(chain => chain.chainId),
      );
      const chain = status.chains.find(entry => entry.chainId === chainId);
      if (!chain?.tokenAddress) throw new Error(t('settings.smsChainUnsupported'));

      setStage('paying');
      const sent = await sendERC20Token(
        chain.tokenAddress,
        status.depositAddress,
        String(amount),
        18,
        chainId,
      );
      if (!sent?.hash) throw new Error(t('settings.smsDepositNotSent'));

      // Past this line the money has left. Giving up here would strand a real
      // transfer with no credit behind it, so the loop runs to the end and the
      // hash is surfaced rather than swallowed if it still has not landed.
      setStage('confirming');
      for (let attempt = 0; attempt < CLAIM_ATTEMPTS; attempt++) {
        if (cancelled.current) break;
        const result = await claimSmsDeposit(sent.hash, chainId);
        if (!result.pending) return result;
        await new Promise(resolve => setTimeout(resolve, CLAIM_GAP_MS));
      }
      throw new Error(t('settings.smsDepositSlow', { hash: sent.hash }));
    },
    onSuccess: () => {
      setStage('idle');
      toast.success(t('settings.smsUnlocked'));
      refresh();
    },
    onError: (error: Error) => {
      setStage('idle');
      toast.error(error.message, { duration: 12000 });
    },
  });

  const requestCode = useMutation({
    mutationFn: () => requestSmsPhoneCode(trimmedPhone),
    onSuccess: result => {
      toast.success(t('settings.smsCodeSent', { price: nf(result.priceDhb) }));
      refresh();
    },
    onError: (error: Error) => toast.error(error.message, { duration: 10000 }),
  });

  const verify = useMutation({
    mutationFn: () => verifySmsPhoneCode(code),
    onSuccess: () => {
      toast.success(t('settings.smsNumberVerified'));
      setCode('');
      refresh();
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const forget = useMutation({
    mutationFn: () => removeSmsPhone(),
    onSuccess: () => {
      toast.success(t('settings.smsNumberRemoved'));
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const busy =
    deposit.isPending || requestCode.isPending || verify.isPending || forget.isPending;

  return (
    <Dialog open={open} onOpenChange={value => !busy && onOpenChange(value)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            {t('settings.smsNotifications')}
          </DialogTitle>
          <DialogDescription>{t('settings.smsDialogIntro')}</DialogDescription>
        </DialogHeader>

        {!status?.available && (
          <p className="text-sm text-zinc-400">{t('settings.smsUnavailable')}</p>
        )}

        {status?.available && !status.unlocked && (
          <div className="space-y-4">
            <div className="rounded-xl border border-zinc-700 bg-zinc-800/60 p-4">
              <p className="text-sm text-white">
                {t('settings.smsUnlockPrice', {
                  dhb: nf(status.minDepositDhb),
                  usd: status.minDepositUsd,
                })}
              </p>
              <p className="mt-1 text-xs text-zinc-400">{t('settings.smsUnlockExplainer')}</p>
            </div>
            <PriceList status={status} />
            <Button
              className="w-full"
              disabled={busy}
              onClick={() => deposit.mutate()}
            >
              {stage !== 'idle' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {stage === 'paying'
                ? t('settings.smsDepositPaying')
                : stage === 'confirming'
                  ? t('settings.smsDepositConfirming')
                  : t('settings.smsDepositAction', { dhb: nf(status.minDepositDhb) })}
            </Button>
          </div>
        )}

        {status?.available && status.unlocked && (
          <div className="space-y-5">
            <div className="rounded-xl border border-zinc-700 bg-zinc-800/60 p-4">
              <p className="text-sm text-white">
                {t('settings.smsBalance', {
                  dhb: nf(status.balanceDhb),
                  usd: status.balanceUsd.toFixed(2),
                })}
              </p>
              {status.messagesRemaining !== null && (
                <p className="mt-1 text-xs text-zinc-400">
                  {t('settings.smsBalanceMessages', { count: status.messagesRemaining })}
                </p>
              )}
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                disabled={busy}
                onClick={() => deposit.mutate()}
              >
                {t('settings.smsTopUp', { dhb: nf(status.minDepositDhb) })}
              </Button>
            </div>

            {status.phoneVerified ? (
              <div>
                <p className={SETTINGS_LABEL_CLASS}>{t('settings.smsNumberLabel')}</p>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-white">{status.phone}</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => forget.mutate()}
                  >
                    {t('settings.smsRemoveNumber')}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className={SETTINGS_LABEL_CLASS} htmlFor="sms-phone">
                    {t('settings.smsNumberLabel')}
                  </label>
                  <div className="flex gap-2">
                    <Input
                      id="sms-phone"
                      className={SETTINGS_FIELD_CLASS}
                      placeholder="+447700900123"
                      inputMode="tel"
                      value={phone}
                      onChange={event => setPhone(event.target.value)}
                    />
                    <Button
                      disabled={busy || !trimmedPhone || quote?.blocked}
                      onClick={() => requestCode.mutate()}
                    >
                      {t('settings.smsSendCode')}
                    </Button>
                  </div>
                  {quote?.blocked ? (
                    <p className="mt-2 text-xs text-amber-400">
                      {t('settings.smsCountryBlocked')}
                    </p>
                  ) : quote ? (
                    <p className="mt-2 text-xs text-zinc-400">
                      {t('settings.smsPricePerMessage', {
                        dhb: nf(quote.priceDhb),
                        usd: quote.priceUsd.toFixed(2),
                      })}
                    </p>
                  ) : null}
                </div>

                {status.pendingPhone && (
                  <div>
                    <label className={SETTINGS_LABEL_CLASS} htmlFor="sms-code">
                      {t('settings.smsCodeLabel', { phone: status.pendingPhone })}
                    </label>
                    <div className="flex gap-2">
                      <Input
                        id="sms-code"
                        className={SETTINGS_FIELD_CLASS}
                        placeholder="123456"
                        inputMode="numeric"
                        maxLength={6}
                        value={code}
                        onChange={event => setCode(event.target.value)}
                      />
                      <Button disabled={busy || code.length < 4} onClick={() => verify.mutate()}>
                        {t('settings.smsVerify')}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * What a message costs, by where it is going.
 *
 * Shown before the deposit rather than after, because a reader outside the
 * cheap band is buying a third as many messages for their ten dollars and
 * should know that before they pay rather than when the balance runs down.
 */
function PriceList({ status }: { status: SmsNotificationStatus }) {
  const { t } = useTranslation();
  if (!status.prices?.length) return null;

  return (
    <div>
      <p className="mb-2 text-xs uppercase tracking-wider text-zinc-500">
        {t('settings.smsPricesHeading')}
      </p>
      <ul className="space-y-1 text-sm">
        {status.prices.map(band => (
          <li key={band.band} className="flex items-center justify-between text-zinc-300">
            <span>{t(`settings.smsBand.${band.band}`, band.band)}</span>
            <span className="text-zinc-400">
              {t('settings.smsPricePerMessage', {
                dhb: nf(band.priceDhb),
                usd: band.priceUsd.toFixed(2),
              })}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function useSmsNotificationStatus(enabled: boolean, walletAddress?: string | null) {
  const statusKey = ['sms-notification-status', walletAddress?.toLowerCase() ?? null] as const;
  const query = useQuery({
    queryKey: statusKey,
    queryFn: () => getSmsNotificationStatus(),
    enabled,
    staleTime: 60_000,
  });
  return { statusKey, ...query };
}
