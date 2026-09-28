import { lazy, Suspense, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { BASE_CHAIN_ID } from '@/lib/contracts';
import { toastTxError } from '@/lib/tx-error-toast';
import { fundTipFromSource } from '@/lib/tip-funding-run';
import type { TipFundingSource } from '@/lib/tip-funding';
import {
  claimSubscriptionCreditTopUp,
  clearPendingCreditTopUp,
  FINAL_TOPUP_STATUSES,
  getSubscriptionCreditTopUpTarget,
  rememberPendingCreditTopUp,
} from '@/lib/api/dehub/credits';
import { useSubscriptionCredits } from '@/hooks/use-subscription-credits';
import dehubCoin from '@/assets/dehub-coin.png';

// Reads wallet balances (wallet stack), so it loads with the open dialog.
const TipPayWith = lazy(() => import('@/components/app/tips/TipPayWith'));

const PRESETS = [5, 10, 25, 50];
const MIN_USD = 1;
const MAX_USD = 10_000;
const CLAIM_ATTEMPTS = 6;
const CLAIM_RETRY_MS = 3_000;

type Stage = 'idle' | 'funding' | 'wallet' | 'confirming' | 'crediting';

const usdFormat = (value: number) => value.toLocaleString(undefined, { style: 'currency', currency: 'USD' });

/**
 * Add subscription tokens. The subscriber picks a dollar amount, sends that
 * much DHB at today's price to DeHub, and the API credits it at the price
 * when the transfer landed. Loaded only when opened: it carries the wallet.
 */
export default function SubscriptionCreditsTopUpDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { walletAddress } = useAuth();
  const { data: credits } = useSubscriptionCredits();
  const [preset, setPreset] = useState<number | null>(10);
  const [custom, setCustom] = useState('');
  const [payWith, setPayWith] = useState<TipFundingSource | null>(null);
  const [stage, setStage] = useState<Stage>('idle');
  // State updates land after the click that caused them, so a fast double
  // click would start two transfers. This flag is set synchronously.
  const inFlight = useRef(false);

  const usd = preset ?? Number(custom);
  const validUsd = Number.isFinite(usd) && usd >= MIN_USD && usd <= MAX_USD;
  const price = credits?.dhbPriceUsd || 0;
  // Whole tokens, rounded up, so the transfer always covers the dollars chosen.
  const tokens = useMemo(() => (validUsd && price > 0 ? Math.ceil(usd / price) : 0), [validUsd, usd, price]);
  const busy = stage !== 'idle';

  const stageLabel: Record<Stage, string> = {
    idle: '',
    funding: t('credits.topUpStageFunding'),
    wallet: t('credits.topUpStageWallet'),
    confirming: t('credits.topUpStageConfirming'),
    crediting: t('credits.topUpStageCrediting'),
  };

  const handleTopUp = async () => {
    if (!validUsd || !tokens || !walletAddress || inFlight.current) return;
    inFlight.current = true;
    setStage('wallet');
    try {
      const target = await getSubscriptionCreditTopUpTarget(BASE_CHAIN_ID);

      if (payWith) {
        setStage('funding');
        const ready = await fundTipFromSource(payWith, tokens, walletAddress, t, 'credit-topup-fund');
        if (!ready) {
          setStage('idle');
          return;
        }
      }

      setStage('wallet');
      const { sendERC20Token } = await import('@/lib/wallet/send');
      const tx = await sendERC20Token(target.dhbToken, target.treasuryAddress, String(tokens), 18, BASE_CHAIN_ID);
      // Saved the moment it is sent, before waiting: if the wait fails or the
      // tab closes, the transfer may still land, and the hash is what gets it
      // credited. The API answers "pending" for a hash not yet mined.
      rememberPendingCreditTopUp({ hash: tx.hash, chainId: BASE_CHAIN_ID, address: walletAddress });
      setStage('confirming');
      try {
        await tx.wait();
      } catch {
        // Confirmation could not be read, which is not the same as failed.
        queryClient.invalidateQueries({ queryKey: ['subscription-credits'] });
        toast.info(t('credits.topUpPending'));
        onOpenChange(false);
        return;
      }
      setStage('crediting');
      let credited = false;
      for (let attempt = 0; attempt < CLAIM_ATTEMPTS && !credited; attempt++) {
        if (attempt) await new Promise((r) => setTimeout(r, CLAIM_RETRY_MS));
        try {
          const result = await claimSubscriptionCreditTopUp(tx.hash, BASE_CHAIN_ID);
          credited = !result?.pending;
        } catch (err) {
          const status = (err as { httpStatus?: number })?.httpStatus;
          if (status && FINAL_TOPUP_STATUSES.has(status)) {
            clearPendingCreditTopUp(tx.hash);
            throw err;
          }
        }
      }

      queryClient.invalidateQueries({ queryKey: ['subscription-credits'] });
      if (credited) {
        clearPendingCreditTopUp(tx.hash);
        toast.success(t('credits.topUpDone', { amount: usdFormat(usd) }));
      } else {
        toast.info(t('credits.topUpPending'));
      }
      onOpenChange(false);
    } catch (error) {
      toastTxError(error, t('credits.topUpFailed'), { context: 'send' });
    } finally {
      inFlight.current = false;
      setStage('idle');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="bg-black/70 backdrop-blur-[24px] border border-white/10 sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <img src={dehubCoin} alt="" className="w-5 h-5" />
            {t('credits.topUpTitle')}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-4 gap-2">
          {PRESETS.map((value) => (
            <button
              key={value}
              type="button"
              disabled={busy}
              onClick={() => {
                setPreset(value);
                setCustom('');
              }}
              className={cn(
                'rounded-xl border py-2 text-sm font-semibold transition-colors',
                preset === value ? 'bg-white text-black border-white' : 'bg-white/5 text-white border-white/10 hover:bg-white/10',
              )}
            >
              ${value}
            </button>
          ))}
        </div>
        <Input
          inputMode="decimal"
          disabled={busy}
          placeholder={t('credits.topUpCustom')}
          value={custom}
          onChange={(e) => {
            setCustom(e.target.value.replace(/[^0-9.]/g, ''));
            setPreset(null);
          }}
          className="bg-white/5 border-white/10 text-white rounded-xl"
        />

        <div className="rounded-xl bg-white/5 border border-white/10 p-3 text-sm">
          <div className="flex justify-between text-zinc-400">
            <span>{t('credits.topUpYouSend')}</span>
            <span className="text-white font-medium">
              {tokens ? t('credits.tokenAmount', { amount: tokens.toLocaleString() }) : '—'}
            </span>
          </div>
          <div className="flex justify-between text-zinc-400 mt-1.5">
            <span>{t('credits.topUpYouGet')}</span>
            <span className="text-white font-medium">{validUsd ? usdFormat(usd) : '—'}</span>
          </div>
          <p className="mt-2 pt-2 border-t border-white/10 text-[11px] leading-relaxed text-zinc-500">
            {t('credits.subscriptionTokensValueNote')}
          </p>
        </div>

        {walletAddress && tokens ? (
          <Suspense fallback={null}>
            <TipPayWith amountDhb={tokens} value={payWith} onChange={setPayWith} />
          </Suspense>
        ) : null}

        <Button
          onClick={handleTopUp}
          disabled={!validUsd || !tokens || busy || !walletAddress}
          className="w-full rounded-xl bg-white text-black hover:bg-white/90 font-semibold"
        >
          {busy ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              {stageLabel[stage]}
            </>
          ) : validUsd ? (
            t('credits.topUpConfirm', { amount: usdFormat(usd) })
          ) : (
            t('credits.topUpRange', { min: usdFormat(MIN_USD), max: usdFormat(MAX_USD) })
          )}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
