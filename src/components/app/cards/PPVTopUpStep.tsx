/**
 * PPV Top-Up Step
 * ===============
 * What the PPV sheet turns into when the wallet is short of DHB.
 *
 * It keeps the viewer exactly where they are: they pick anything they hold —
 * USDC on Arc, ETH on Ethereum, USDT on BNB, anything on Base — and one tap
 * turns it into DHB and hands straight back to the unlock. The DHB comes from
 * DeHub Pay first and the Uniswap pool only if DPay cannot fill it (see
 * lib/tip-funding). No wallet page, no buy page, no second decision.
 *
 * Bundle note: this renders inside eager feed cards, so nothing here may
 * statically import the wallet stack. The picker is lazy and the funding code
 * is imported on use (scripts/check-entry-bundle.mjs fails the build otherwise).
 */

import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AlertCircle, ArrowRight, CreditCard, Loader2, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BASE_CHAIN_ID } from '@/lib/contracts/dhb-token';
import { DhbAmount } from '@/components/app/DhbAmount';
import { useAuth } from '@/contexts/AuthContext';
import { fundTipFromSource } from '@/lib/tip-funding-run';
import type { TipFundingSource } from '@/lib/tip-funding';
import type { PPVShortfall } from '@/hooks/use-ppv-payment';

const TipPayWith = lazy(() => import('@/components/app/tips/TipPayWith'));

type Phase = 'checking' | 'ready' | 'funding' | 'paused' | 'offchain';

interface PPVTopUpStepProps {
  shortfall: PPVShortfall;
  formatCompact: (num: number) => string;
  /** DHB has landed — the parent sends the unlock straight away. */
  onFunded: () => void;
  /** Back to the price view, sheet still open. */
  onCancel: () => void;
  /** Dismiss the sheet entirely, for the routes that navigate away. */
  onClose: () => void;
}

export function PPVTopUpStep({ shortfall, formatCompact, onFunded, onCancel, onClose }: PPVTopUpStepProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { walletAddress } = useAuth();
  const [phase, setPhase] = useState<Phase>('checking');
  const [payWith, setPayWith] = useState<TipFundingSource | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Funding lands DHB on Base; a post that settles elsewhere needs DHB there.
    if (!shortfall.canTopUpInApp || shortfall.chainId !== BASE_CHAIN_ID) {
      setPhase('offchain');
      return;
    }
    setPhase('checking');
    // A paused token makes both the funding and the unlock revert. Saying so
    // beats letting them sign into a failure.
    import('@/lib/contracts/aa-utils')
      .then(m => m.checkDHBPaused(BASE_CHAIN_ID))
      .then(paused => { if (!cancelled) setPhase(paused ? 'paused' : 'ready'); })
      .catch(() => { if (!cancelled) setPhase('ready'); });
    return () => { cancelled = true; };
  }, [shortfall]);

  const handleTopUp = useCallback(async () => {
    if (!payWith || !walletAddress) return;
    setPhase('funding');
    // The whole unlock price, not the gap: funding measures the Base balance
    // itself and only buys what is missing.
    const ready = await fundTipFromSource(payWith, shortfall.priceDhb, walletAddress, t, 'ppv-topup');
    if (!ready) {
      setPhase('ready');
      return;
    }
    toast.dismiss('ppv-topup');
    // Straight back into the unlock — the sheet never closes and the viewer
    // never taps twice.
    onFunded();
  }, [payWith, walletAddress, shortfall.priceDhb, t, onFunded]);

  const goTo = (path: string) => {
    onClose();
    navigate(path);
  };

  const fundingRoutes = (
    <div className="space-y-2">
      <button
        onClick={() => goTo('/app/buy')}
        className="w-full flex items-center gap-3 p-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.10] border border-white/10 transition-colors"
      >
        <CreditCard className="w-5 h-5 text-white/70" />
        <div className="text-left flex-1">
          <span className="text-sm font-medium text-white">{t('ppvTopUp.buyCard', 'Buy DHB with card')}</span>
          <p className="text-xs text-white/40">{t('ppvTopUp.buyCardHint', 'Visa, Mastercard, Apple Pay')}</p>
        </div>
      </button>
      <button
        onClick={() => goTo('/app/wallet')}
        className="w-full flex items-center gap-3 p-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.10] border border-white/10 transition-colors"
      >
        <Wallet className="w-5 h-5 text-white/70" />
        <div className="text-left flex-1">
          <span className="text-sm font-medium text-white">{t('ppvTopUp.moveFunds', 'Move funds in')}</span>
          <p className="text-xs text-white/40">{t('ppvTopUp.moveFundsHint', 'Swap or deposit from another chain')}</p>
        </div>
      </button>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3.5 space-y-2.5">
        <div className="flex items-center justify-between text-sm">
          <span className="text-zinc-400">{t('drawers.unlockPrice')}</span>
          <DhbAmount amount={formatCompact(shortfall.priceDhb)} className="text-zinc-300" />
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-zinc-400">{t('ppvTopUp.yourBalance', 'Your balance')}</span>
          <DhbAmount amount={formatCompact(shortfall.balanceDhb)} className="text-zinc-300" />
        </div>
        <div className="h-px bg-white/10" />
        <div className="flex items-center justify-between">
          <span className="text-white text-sm">{t('ppvTopUp.youNeed', 'You need')}</span>
          <DhbAmount
            amount={formatCompact(shortfall.needDhb)}
            className="text-white text-lg font-bold"
            iconClassName="h-5 w-5"
          />
        </div>
      </div>

      {phase === 'checking' && (
        <div className="flex items-center justify-center gap-2 py-3 text-sm text-zinc-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          {t('ppvTopUp.checking', 'Checking your wallet…')}
        </div>
      )}

      {(phase === 'ready' || phase === 'funding') && (
        <>
          <p className="text-center text-xs text-zinc-400 px-2">
            {t('ppvTopUp.payHint', 'Pay with anything in your wallet. It becomes DHB and unlocks straight away.')}
          </p>
          {walletAddress ? (
            <Suspense fallback={null}>
              <TipPayWith amountDhb={shortfall.priceDhb} value={payWith} onChange={setPayWith} requireSource />
            </Suspense>
          ) : null}
          <div className="flex gap-3">
            <Button variant="glass" className="flex-1" onClick={onCancel} disabled={phase === 'funding'}>
              {t('common.cancel')}
            </Button>
            <Button variant="glass" className="flex-1" onClick={handleTopUp} disabled={phase === 'funding' || !payWith}>
              {phase === 'funding' ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {t('ppvTopUp.toppingUp', 'Topping up…')}
                </>
              ) : (
                <>
                  {t('ppvTopUp.topUpUnlock', 'Top up & unlock')}
                  <ArrowRight className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
          </div>
          {phase === 'ready' && (
            <>
              <p className="text-center text-[11px] text-zinc-500">{t('ppvTopUp.orFund', 'Or add funds another way')}</p>
              {fundingRoutes}
            </>
          )}
        </>
      )}

      {phase === 'paused' && (
        <>
          <div className="flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-200">
            <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
            <span>{t('ppvTopUp.paused', "DHB transfers are paused on-chain right now, so this unlock can't go through yet. Try again shortly.")}</span>
          </div>
          <Button variant="glass" className="w-full" onClick={onCancel}>
            {t('common.close')}
          </Button>
        </>
      )}

      {phase === 'offchain' && (
        <>
          <p className="text-center text-xs text-zinc-400 px-2">
            {t('ppvTopUp.otherChain', 'This post settles on another chain, so it needs DHB in your wallet there.')}
          </p>
          {fundingRoutes}
          <Button variant="glass" className="w-full" onClick={onCancel}>
            {t('ppvTopUp.notNow', 'Not now')}
          </Button>
        </>
      )}
    </div>
  );
}
