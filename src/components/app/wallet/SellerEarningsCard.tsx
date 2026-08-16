/**
 * Seller Earnings Card
 * ====================
 * Card sales, in the wallet, beside the DHB balance and AI credit.
 *
 * Two numbers, and the distinction between them is the whole feature: what has
 * cleared the 30-day hold and can be withdrawn now, and what is still inside it.
 * The hold exists because a chargeback can arrive weeks after a sale — paying
 * out on day one would mean chasing sellers for money already spent.
 *
 * Container and header deliberately mirror AiCreditCard so the wallet reads as
 * one column of cards. `data-page-bento` is load-bearing for the bento-flat
 * theme contract, not decoration.
 */

import { useState } from 'react';
import { Store, Loader2, ArrowUpRight, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatDistanceToNowStrict } from 'date-fns';
import {
  useSellerBalance,
  useSellerPayoutActions,
  formatUsd,
} from '@/hooks/use-seller-balance';

export function SellerEarningsCard() {
  const { balance, pendingUsd, availableUsd, hasActivity, payoutsEnabled, nextReleaseAt, isLoading } =
    useSellerBalance();
  const { onboard, openDashboard, withdraw } = useSellerPayoutActions();
  const [confirming, setConfirming] = useState(false);

  // A wallet that has never sold anything by card should not carry a store
  // widget at all — this is the majority of wallets.
  if (isLoading || !hasActivity || !balance) return null;

  const minUsd = balance.minWithdrawalUsd;
  const canWithdraw = payoutsEnabled && availableUsd >= minUsd && !withdraw.isPending;

  return (
    <div data-page-bento className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800 mb-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Store className="w-4 h-4 text-emerald-400" />
          <span className="text-sm text-zinc-400">Store earnings</span>
        </div>
        <div className="text-right">
          <p className="text-white font-bold text-lg">{formatUsd(availableUsd)}</p>
          {pendingUsd > 0 && (
            <p className="text-xs text-emerald-400">
              + {formatUsd(pendingUsd)} unlocking
            </p>
          )}
        </div>
      </div>

      {!payoutsEnabled ? (
        <>
          <Button
            variant="glass"
            className="w-full rounded-xl"
            onClick={() => onboard.mutate()}
            disabled={onboard.isPending}
          >
            {onboard.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <ArrowUpRight className="w-4 h-4 mr-2" />
            )}
            {balance.onboardingStarted ? 'Finish payout setup' : 'Set up payouts'}
          </Button>
          <p className="text-[11px] text-zinc-500 mt-2 text-center">
            {balance.onboardingStarted
              ? 'Stripe still needs a few details before you can be paid.'
              : 'Verify your details with Stripe to receive card sales.'}
          </p>
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="glass"
              className="rounded-xl"
              disabled={!canWithdraw}
              onClick={() => (confirming ? withdraw.mutate(balance.availableCents) : setConfirming(true))}
            >
              {withdraw.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <ArrowUpRight className="w-4 h-4 mr-2" />
              )}
              {confirming ? 'Confirm' : 'Withdraw'}
            </Button>
            <Button
              variant="glass"
              className="rounded-xl"
              onClick={() => openDashboard.mutate()}
              disabled={openDashboard.isPending}
            >
              <Settings2 className="w-4 h-4 mr-2" />
              Payouts
            </Button>
          </div>

          <p className="text-[11px] text-zinc-500 mt-2 text-center">
            {availableUsd < minUsd && pendingUsd > 0 && nextReleaseAt
              ? `Next ${formatUsd(pendingUsd)} unlocks in ${formatDistanceToNowStrict(new Date(nextReleaseAt))}.`
              : availableUsd < minUsd
                ? `Minimum withdrawal is ${formatUsd(minUsd)}.`
                : `Card sales unlock ${balance.holdDays} days after payment.`}
          </p>
        </>
      )}
    </div>
  );
}
