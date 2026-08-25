/**
 * AdTopUpPanel
 * ============
 * Funding the advertiser's prepaid balance, without the dialog chrome — the
 * Billing tab wraps it in a modal, the campaign wizard drops it in as its last
 * step, and both get the same flow:
 *
 *   pick an amount → transfer DHB to the ads treasury → ads-topup verifies the
 *   transfer on-chain and credits USD → the caller carries on with whatever it
 *   was doing.
 *
 * Two things it does that the old modal did not:
 *
 * 1. **Quotes at the price that settles.** The amount used to be sized off
 *    get-dhb-price, which pins DHB at $0.001. ads-topup credits at the live
 *    market price. With DHB trading around $0.00057 that gap is not cosmetic:
 *    the $25 minimum top-up sent 25,000 DHB, arrived worth $14.27, and was
 *    refused by the minimum guard — with the DHB already gone and the manual
 *    recovery input failing the same way. The quote now comes from ads-topup
 *    itself, so one number sizes the transfer and credits it.
 *
 * 2. **Sells DHB to people who have none.** A wallet short of DHB used to get
 *    a toast and a dead end. It now gets AdFundingStep, and the top-up resumes
 *    itself the moment the DHB lands.
 */

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, AlertCircle, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Interface } from 'ethers';
import { useTopUpCredit, useAdsTopUpQuote } from '@/hooks/use-ads';
import { AdFundingStep } from '@/components/app/ads/AdFundingStep';
import dhbCoinImage from '@/assets/dehub-coin.png';
import {
  checkDHBPaused,
  getERC20Balance,
  getWalletAddress,
  parseTxError,
  switchChain,
  writeContractAA,
} from '@/lib/contracts/aa-utils';
import { DHB_TOKEN, toWei, getChainConfig, BASE_CHAIN_ID, BNB_CHAIN_ID } from '@/lib/contracts/dhb-token';
import type { ChainId } from '@/components/app/ChainSelector';
import { formatCompact } from '@/lib/ads/povr';
import { cn } from '@/lib/utils';

// Same treasury the AI credits / paywalls pay into (see ads-topup edge fn).
const ADS_TREASURY = '0xbf3039b0bb672b268e8384e30d81b1e6a8a43b2c';
const erc20TransferInterface = new Interface([
  'function transfer(address to, uint256 amount) returns (bool)',
]);

const PRESETS = [25, 100, 500] as const;

/**
 * Send slightly more DHB than the credit is worth. The price moves between
 * the quote and the block the transfer lands in, and a tick down would credit
 * under the requested amount — or under the minimum, which refuses outright.
 */
const TRANSFER_HEADROOM = 1.02;

interface AdTopUpPanelProps {
  /** Preselects an amount — what the caller needs in the balance. */
  suggestedUsd?: number;
  /** Balance credited. The caller resumes whatever it was doing. */
  onCredited?: (usdCredited: number) => void;
  /** Cancel out of the flow entirely. */
  onCancel?: () => void;
  /** Label for the cancel button. */
  cancelLabel?: string;
  /** Told whenever a transaction is in flight, so hosts can lock their chrome. */
  onBusyChange?: (busy: boolean) => void;
}

export function AdTopUpPanel({
  suggestedUsd,
  onCredited,
  onCancel,
  cancelLabel = 'Cancel',
  onBusyChange,
}: AdTopUpPanelProps) {
  const { data: quote, isLoading: loadingPrice, isError: priceError, refetch: refetchQuote } = useAdsTopUpQuote();
  const minTopup = quote?.minTopupUsd ?? 25;

  const [usdAmount, setUsdAmount] = useState<number>(() => {
    if (!suggestedUsd) return 100;
    return Math.max(25, Math.ceil(suggestedUsd));
  });
  const [customAmount, setCustomAmount] = useState('');
  const [isPaying, setIsPaying] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'transfer' | 'verify'>('idle');
  const [funding, setFunding] = useState<{ needDhb: number; haveDhb: number } | null>(null);

  const topUp = useTopUpCredit();

  useEffect(() => { onBusyChange?.(isPaying); }, [isPaying, onBusyChange]);

  const effectiveUsd = customAmount !== '' ? Math.max(0, Number(customAmount) || 0) : usdAmount;
  const dhbPrice = quote?.dhbPriceUsd ?? null;
  // Headroom is part of what leaves the wallet, so it is part of what we show.
  const costDhb = dhbPrice && effectiveUsd > 0 ? (effectiveUsd / dhbPrice) * TRANSFER_HEADROOM : 0;

  const runTopUp = useCallback(async () => {
    if (!dhbPrice) { toast.error('DHB price unavailable — try again shortly.'); return; }
    if (costDhb <= 0 || effectiveUsd < minTopup) {
      toast.error(`Minimum top-up is $${minTopup}`);
      return;
    }
    setIsPaying(true);
    setPhase('transfer');
    try {
      const signerAddress = await getWalletAddress();
      const amountWei = toWei(costDhb, DHB_TOKEN.decimals);

      // A paused token reverts the transfer after the signature, which reads
      // as "the top-up is broken" rather than "the token is paused".
      if (await checkDHBPaused(BASE_CHAIN_ID)) {
        toast.error('DHB transfers are paused on-chain right now. Try again shortly.');
        setIsPaying(false);
        setPhase('idle');
        return;
      }

      const baseConfig = getChainConfig(BASE_CHAIN_ID);
      const bnbConfig = getChainConfig(BNB_CHAIN_ID);
      const [baseBalance, bnbBalance] = await Promise.all([
        getERC20Balance(baseConfig.dhbToken, signerAddress, BASE_CHAIN_ID),
        getERC20Balance(bnbConfig.dhbToken, signerAddress, BNB_CHAIN_ID),
      ]);

      let payChainId: ChainId;
      if (baseBalance >= amountWei) payChainId = BASE_CHAIN_ID;
      else if (bnbBalance >= amountWei) payChainId = BNB_CHAIN_ID;
      else {
        // Short. Fund on Base — it is the only chain with a DHB pool to swap
        // into and the only one the fiat gateway can deliver on — and hand to
        // the funding step rather than ending on a toast.
        //
        // Buy a shade over the gap. The balance is read as wei and the gap is
        // worked out in floats, so an exact-output swap for exactly the
        // difference can land a few wei short of the transfer and bounce
        // straight back here for dust.
        const haveDhb = Number(baseBalance) / 1e18;
        const gapDhb = Math.max(costDhb - haveDhb, 0);
        setFunding({ needDhb: gapDhb > 0 ? gapDhb * 1.005 + 1 : 0, haveDhb });
        setIsPaying(false);
        setPhase('idle');
        return;
      }

      const chainConfig = getChainConfig(payChainId);
      await switchChain(payChainId);

      toast.loading('Sending DHB…', { id: 'ads-topup' });
      const result = await writeContractAA(
        chainConfig.dhbToken,
        erc20TransferInterface,
        'transfer',
        [ADS_TREASURY, amountWei],
        { context: 'Ads balance top-up', chainId: payChainId },
      );
      await result.wait(1);

      // Verify + credit (retry briefly while the transfer indexes).
      setPhase('verify');
      toast.loading('Verifying on-chain…', { id: 'ads-topup' });
      let credited: number | null = null;
      let lastError: Error | null = null;
      for (let attempt = 0; attempt < 6 && credited === null; attempt++) {
        try {
          const res = await topUp.mutateAsync(result.hash);
          credited = res.usdCredited;
        } catch (e) {
          lastError = e instanceof Error ? e : new Error('verification failed');
          if (lastError.message.includes('already credited')) { credited = effectiveUsd; break; }
          await new Promise((r) => setTimeout(r, 4000));
        }
      }
      toast.dismiss('ads-topup');
      if (credited === null) {
        toast.error(lastError?.message || 'Verification timed out — your DHB is sent; retry crediting from Billing with the same transaction.');
      } else {
        onCredited?.(credited);
      }
    } catch (err) {
      toast.dismiss('ads-topup');
      toast.error(parseTxError(err) || 'Top-up failed.');
    } finally {
      setIsPaying(false);
      setPhase('idle');
    }
  }, [costDhb, dhbPrice, effectiveUsd, minTopup, onCredited, topUp]);

  // ---- funding step ------------------------------------------------------
  if (funding) {
    return (
      <AdFundingStep
        needDhb={funding.needDhb}
        haveDhb={funding.haveDhb}
        onFunded={() => { setFunding(null); void runTopUp(); }}
        onCancel={() => setFunding(null)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="space-y-4">
        {/* Presets */}
        <div className="grid grid-cols-3 gap-2">
          {PRESETS.map((amt) => {
            const selected = customAmount === '' && usdAmount === amt;
            return (
              <button
                key={amt}
                type="button"
                onClick={() => { setUsdAmount(amt); setCustomAmount(''); }}
                className={cn(
                  'rounded-xl border px-3 py-3 text-center transition-colors',
                  selected ? 'border-white/50 bg-white/10' : 'border-white/10 hover:bg-white/5',
                )}
              >
                <span className="block text-white font-semibold">${amt}</span>
                {dhbPrice && (
                  <span className="block text-[11px] text-zinc-500">{formatCompact((amt / dhbPrice) * TRANSFER_HEADROOM)} DHB</span>
                )}
                {selected && <Check className="w-3.5 h-3.5 text-white mx-auto mt-1" />}
              </button>
            );
          })}
        </div>

        <Input
          type="number"
          min={minTopup}
          placeholder={`Custom amount (USD, min $${minTopup})`}
          value={customAmount}
          onChange={(e) => setCustomAmount(e.target.value)}
          className="bg-zinc-900/60 border-zinc-700 text-white"
        />

        {/* Quote */}
        <div className="bg-gradient-to-r from-emerald-900/30 to-blue-900/30 rounded-xl p-4 border border-emerald-500/20">
          {loadingPrice ? (
            <div className="flex items-center justify-center py-1.5">
              <Loader2 className="w-5 h-5 animate-spin text-emerald-400" />
              <span className="ml-2 text-zinc-400 text-sm">Fetching live price…</span>
            </div>
          ) : priceError || !dhbPrice ? (
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-yellow-500 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>Live DHB price unavailable — a top-up can't be credited until it's back.</span>
              </div>
              <Button size="sm" variant="glass" onClick={() => refetchQuote()}>Retry</Button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <img src={dhbCoinImage} alt="DHB" className="w-6 h-6" />
                <span className="text-white font-medium">You send</span>
              </div>
              <div className="text-right">
                <p className="text-xl font-bold text-white">{formatCompact(costDhb)} DHB</p>
                <p className="text-xs text-zinc-500">@ ${dhbPrice.toFixed(7)}/DHB → ${effectiveUsd.toFixed(2)} credit</p>
              </div>
            </div>
          )}
        </div>

        <p className="text-[11px] text-zinc-500 leading-relaxed">
          DHB goes on-chain to the DeHub ads treasury and your balance is credited after independent
          verification, at the DHB price at that moment — the amount above carries a 2% buffer so a
          price tick can't leave you short. Campaign spend comes off this balance per verified impression.
        </p>
      </div>

      <div className="flex gap-3">
        {onCancel && (
          <Button
            variant="outline"
            className="flex-1 bg-zinc-800 border-zinc-700 text-white hover:bg-zinc-700"
            onClick={onCancel}
            disabled={isPaying}
          >
            {cancelLabel}
          </Button>
        )}
        <Button
          variant="glass"
          className="flex-1 font-medium"
          onClick={runTopUp}
          disabled={loadingPrice || !dhbPrice || isPaying || effectiveUsd < minTopup}
        >
          {isPaying ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              {phase === 'verify' ? 'Verifying…' : 'Sending…'}
            </>
          ) : (
            `Top up $${effectiveUsd.toFixed(0)}`
          )}
        </Button>
      </div>
    </div>
  );
}
