/**
 * AdTopUpModal
 * ============
 * Funds the advertiser's prepaid balance with an on-chain DHB transfer to the
 * DeHub treasury (same AA flow as voice-credit purchases: pick the chain with
 * funds, transfer, wait a confirmation), then submits the tx hash to the
 * ads-topup edge function which independently verifies the transfer on-chain
 * and credits USD at the live DHB price. Retries briefly while the indexer
 * catches up.
 */

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Wallet, AlertCircle, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Interface } from 'ethers';
import { supabase } from '@/integrations/supabase/client';
import { useTopUpCredit } from '@/hooks/use-ads';
import dhbCoinImage from '@/assets/dehub-coin.png';
import { writeContractAA, getWalletAddress, getERC20Balance, switchChain, parseTxError } from '@/lib/contracts/aa-utils';
import { DHB_TOKEN, toWei, getChainConfig, BASE_CHAIN_ID, BNB_CHAIN_ID } from '@/lib/contracts/dhb-token';
import type { ChainId } from '@/components/app/ChainSelector';
import { cn } from '@/lib/utils';

// Same treasury the AI credits / paywalls pay into (see ads-topup edge fn).
const ADS_TREASURY = '0xbf3039b0bb672b268e8384e30d81b1e6a8a43b2c';
const erc20TransferInterface = new Interface([
  'function transfer(address to, uint256 amount) returns (bool)',
]);

const PRESETS = [25, 100, 500] as const;

interface AdTopUpModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AdTopUpModal({ open, onOpenChange }: AdTopUpModalProps) {
  const [dhbPrice, setDhbPrice] = useState<number | null>(null);
  const [loadingPrice, setLoadingPrice] = useState(true);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [usdAmount, setUsdAmount] = useState<number>(100);
  const [customAmount, setCustomAmount] = useState('');
  const [isPaying, setIsPaying] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'transfer' | 'verify'>('idle');

  const topUp = useTopUpCredit();

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoadingPrice(true);
      setPriceError(null);
      try {
        const { data, error } = await supabase.functions.invoke('get-dhb-price');
        if (error) throw error;
        const price = data?.prices?.DHB;
        if (!price) throw new Error('no price');
        if (!cancelled) setDhbPrice(price);
      } catch {
        if (!cancelled) {
          setPriceError('Live price unavailable — using fallback.');
          setDhbPrice(0.0006191);
        }
      } finally {
        if (!cancelled) setLoadingPrice(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open]);

  const effectiveUsd = customAmount !== '' ? Math.max(0, Number(customAmount) || 0) : usdAmount;
  const costDhb = dhbPrice && effectiveUsd > 0 ? effectiveUsd / dhbPrice : 0;

  const formatDhb = (amount: number) => {
    if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(2)}M`;
    if (amount >= 1_000) return `${(amount / 1_000).toFixed(1)}K`;
    return amount.toFixed(0);
  };

  const handleTopUp = async () => {
    if (costDhb <= 0 || effectiveUsd < 25) {
      toast.error('Minimum top-up is $25');
      return;
    }
    setIsPaying(true);
    setPhase('transfer');
    try {
      const signerAddress = await getWalletAddress();
      const amountWei = toWei(costDhb, DHB_TOKEN.decimals);

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
        const baseDhb = Number(baseBalance) / 1e18;
        const bnbDhb = Number(bnbBalance) / 1e18;
        toast.error(`Insufficient DHB. Need ${formatDhb(costDhb)} DHB (Base: ${formatDhb(baseDhb)}, BNB: ${formatDhb(bnbDhb)})`);
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
      let credited = false;
      let lastError: Error | null = null;
      for (let attempt = 0; attempt < 6 && !credited; attempt++) {
        try {
          await topUp.mutateAsync(result.hash);
          credited = true;
        } catch (e) {
          lastError = e instanceof Error ? e : new Error('verification failed');
          if (lastError.message.includes('already credited')) { credited = true; break; }
          await new Promise((r) => setTimeout(r, 4000));
        }
      }
      toast.dismiss('ads-topup');
      if (!credited) {
        toast.error(lastError?.message || 'Verification timed out — your DHB is sent; retry crediting from Billing with the same transaction.');
      } else {
        onOpenChange(false);
      }
    } catch (err) {
      toast.dismiss('ads-topup');
      toast.error(parseTxError(err) || 'Top-up failed.');
    } finally {
      setIsPaying(false);
      setPhase('idle');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!isPaying) onOpenChange(o); }}>
      <DialogContent className="bg-black/60 backdrop-blur-[24px] border border-white/10 shadow-2xl max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <Wallet className="w-5 h-5" />
            Top up ads balance
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            Pay in DHB — credited in USD at the live price
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
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
                  {!loadingPrice && dhbPrice && (
                    <span className="block text-[11px] text-zinc-500">{formatDhb(amt / dhbPrice)} DHB</span>
                  )}
                  {selected && <Check className="w-3.5 h-3.5 text-white mx-auto mt-1" />}
                </button>
              );
            })}
          </div>

          <div>
            <Input
              type="number"
              min={25}
              placeholder="Custom amount (USD, min $25)"
              value={customAmount}
              onChange={(e) => setCustomAmount(e.target.value)}
              className="bg-zinc-900/60 border-zinc-700 text-white"
            />
          </div>

          {/* Quote */}
          <div className="bg-gradient-to-r from-emerald-900/30 to-blue-900/30 rounded-xl p-4 border border-emerald-500/20">
            {loadingPrice ? (
              <div className="flex items-center justify-center py-1.5">
                <Loader2 className="w-5 h-5 animate-spin text-emerald-400" />
                <span className="ml-2 text-zinc-400 text-sm">Fetching live price…</span>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <img src={dhbCoinImage} alt="DHB" className="w-6 h-6" />
                  <span className="text-white font-medium">You send</span>
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold text-white">{formatDhb(costDhb)} DHB</p>
                  <p className="text-xs text-zinc-500">@ ${dhbPrice?.toFixed(7)}/DHB → ${effectiveUsd.toFixed(2)} credit</p>
                </div>
              </div>
            )}
            {priceError && (
              <div className="flex items-center gap-2 mt-2 text-yellow-500 text-xs">
                <AlertCircle className="w-3 h-3" /> {priceError}
              </div>
            )}
          </div>

          <p className="text-[11px] text-zinc-500 leading-relaxed">
            DHB is transferred on-chain to the DeHub ads treasury, then your balance is credited after
            independent on-chain verification. Campaign spend is deducted from this balance per verified impression.
          </p>
        </div>

        <div className="flex gap-3">
          <Button
            variant="outline"
            className="flex-1 bg-zinc-800 border-zinc-700 text-white hover:bg-zinc-700"
            onClick={() => onOpenChange(false)}
            disabled={isPaying}
          >
            Cancel
          </Button>
          <Button
            variant="glass"
            className="flex-1 font-medium"
            onClick={handleTopUp}
            disabled={loadingPrice || isPaying || effectiveUsd < 25}
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
      </DialogContent>
    </Dialog>
  );
}
