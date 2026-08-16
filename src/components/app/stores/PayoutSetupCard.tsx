/**
 * Payout Setup Card
 * =================
 * Where a seller turns card payments on.
 *
 * Sits above the orders list because that is where a seller goes to look at
 * money. The wallet's SellerEarningsCard renders nothing until there is
 * activity — deliberately, so the majority of wallets do not carry a store
 * widget — which means it cannot be the place someone first learns they need
 * to onboard to accept cards at all.
 *
 * Until Stripe reports `payouts_enabled`, the card button does not appear on
 * this seller's listings. That is enforced server-side in the checkout quote,
 * not here: a balance that can never be transferred out is worse for the buyer
 * and the seller than simply not offering the option.
 */

import { CreditCard, CheckCircle2, Loader2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSellerBalance, useSellerPayoutActions, formatUsd } from '@/hooks/use-seller-balance';

export function PayoutSetupCard() {
  const { balance, pendingUsd, availableUsd, payoutsEnabled, isLoading } = useSellerBalance();
  const { onboard, openDashboard } = useSellerPayoutActions();

  if (isLoading || !balance) return null;

  if (payoutsEnabled) {
    return (
      <div className="mb-3 flex items-center gap-3 p-3 rounded-xl border border-white/10 bg-white/5">
        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-white">Card payments are on</p>
          <p className="text-[11px] text-zinc-500">
            {formatUsd(availableUsd)} available
            {pendingUsd > 0 && ` · ${formatUsd(pendingUsd)} unlocking`}
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => openDashboard.mutate()}
          disabled={openDashboard.isPending}
        >
          {openDashboard.isPending
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : <ExternalLink className="w-3.5 h-3.5" />}
        </Button>
      </div>
    );
  }

  return (
    <div className="mb-3 p-3 rounded-xl border border-white/10 bg-white/5 space-y-2.5">
      <div className="flex items-start gap-3">
        <CreditCard className="w-4 h-4 text-zinc-400 shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-xs text-white font-medium">
            {balance.onboardingStarted ? 'Finish payout setup' : 'Accept card payments'}
          </p>
          <p className="text-[11px] text-zinc-500 mt-0.5">
            {balance.onboardingStarted
              ? 'Stripe still needs a few details before you can be paid.'
              : `Buyers can pay by card as well as DHB. Sales unlock ${balance.holdDays} days after payment, then you withdraw to your bank.`}
          </p>
        </div>
      </div>
      <Button
        size="sm"
        className="w-full"
        onClick={() => onboard.mutate()}
        disabled={onboard.isPending}
      >
        {onboard.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" />}
        {balance.onboardingStarted ? 'Continue setup' : 'Set up payouts'}
      </Button>
    </div>
  );
}
