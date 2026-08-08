/**
 * AI credit balance and top-up.
 * =============================
 * The only place to buy credit without starting a generation first.
 *
 * Until now `useCreditTopUp()` existed and nothing called it: credit could
 * only be acquired as a side effect of a paywall — pay-as-you-go for one job,
 * or a plan grant. Somebody who wanted to load up before working, or top up
 * after running dry mid-session, had nowhere to do it.
 *
 * Buying here is the same verified path the paywall uses: send DHB to the
 * treasury, then have the transfer credited. Credit is DHB at the gateway peg,
 * so 1,000 DHB is $1 of generation and the amounts below are round numbers in
 * both.
 */

import { useState } from 'react';
import { Loader2, Sparkles, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useAiCredits, formatDhb } from '@/hooks/use-ai-credits';
import { payAsYouGo, useSpendableDhb } from '@/lib/ai-payg';
import dhbCoinImage from '@/assets/dehub-coin.png';

/** Round bundles. No bonus — the volume discount lives in the plans. */
const TOP_UP_AMOUNTS = [5_000, 25_000, 100_000];

export function AiCreditCard() {
  const { balanceDhb, balanceUsd, isLoading, refresh } = useAiCredits();
  const { walletDhb, refresh: refreshWallet } = useSpendableDhb();
  const [buying, setBuying] = useState<number | null>(null);

  const handleTopUp = async (amount: number) => {
    if (walletDhb < amount) {
      toast.error(
        `Not enough DHB in your wallet. This needs ${formatDhb(amount)} and you hold ${formatDhb(walletDhb)}.`
      );
      return;
    }

    setBuying(amount);
    try {
      toast.loading(`Buying ${formatDhb(amount)} DHB of credit...`, { id: 'ai-credit-topup' });
      await payAsYouGo(amount);
      refresh();
      refreshWallet();
      toast.success(`${formatDhb(amount)} DHB credited.`, { id: 'ai-credit-topup' });
    } catch (err) {
      toast.dismiss('ai-credit-topup');
      toast.error(err instanceof Error ? err.message : 'Top-up failed.');
    } finally {
      setBuying(null);
    }
  };

  return (
    <div data-page-bento className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800 mb-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-cyan-400" />
          <span className="text-sm text-zinc-400">AI Credit</span>
        </div>
        <div className="text-right">
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
          ) : (
            <>
              <p className="text-white font-bold text-lg">{formatDhb(balanceDhb)} DHB</p>
              <p className="text-xs text-zinc-500">≈ ${balanceUsd.toFixed(2)} of generation</p>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {TOP_UP_AMOUNTS.map((amount) => (
          <Button
            key={amount}
            variant="glass"
            className="flex-col h-auto py-2.5 gap-1 rounded-xl"
            disabled={buying !== null}
            onClick={() => handleTopUp(amount)}
          >
            {buying === amount ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <div className="flex items-center gap-1">
                  <img src={dhbCoinImage} alt="" className="w-3.5 h-3.5" />
                  <Plus className="w-3 h-3" />
                </div>
                <span className="text-xs whitespace-nowrap">{formatDhb(amount)}</span>
              </>
            )}
          </Button>
        ))}
      </div>

      <p className="text-[11px] text-zinc-500 mt-2 text-center">
        Credit is DHB — spend it on any generation, or pay per job from your wallet.
      </p>
    </div>
  );
}
