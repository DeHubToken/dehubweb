/**
 * Notification Settle Action
 * ==========================
 * Settle a fraction trade from the notification that told you about it.
 *
 * A fraction swap has a leg that lands second, and the person who owes it finds
 * out by notification. Making them then go and find the Fractions page to press
 * the button is the kind of gap a 24-hour deadline quietly runs out in — so the
 * button goes on the notification.
 *
 * What this cannot remove is the wallet signature. Fractions live in the
 * seller's own wallet, and only that wallet can authorise moving them; the only
 * way to skip the signature would be for DeHub to hold everyone's keys. For a
 * social-login (Web3Auth) account the transaction is sponsored, so it is a
 * confirm rather than a gas payment.
 *
 * Renders nothing unless the signed-in wallet actually owes this leg, so it is
 * safe to drop into every notification row.
 */

import { Loader2, Send, Coins, Check } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useOpenTrades } from '@/hooks/use-fraction-marketplace';
import { useSettleTrade } from '@/hooks/use-fraction-checkout';
import { getChainConfig } from '@/lib/contracts/dhb-token';
import type { ChainId } from '@/components/app/ChainSelector';

interface NotificationSettleActionProps {
  /** The notification's type string. */
  type: string;
  /** The notification's reference id — the post's token id. */
  tokenId: string | undefined;
}

export function NotificationSettleAction({ type, tokenId }: NotificationSettleActionProps) {
  const { walletAddress } = useAuth();
  const { data: open } = useOpenTrades(walletAddress);
  const { deliver, pay } = useSettleTrade();

  const isSale = type === 'fraction_sold';
  const isDelivery = type === 'fraction_delivered';
  if (!isSale && !isDelivery) return null;
  if (!walletAddress || !tokenId || !open) return null;

  // Match the notification to the obligation it is about. Both sides of a swap
  // are keyed by token id, so the direction comes from the notification type:
  // `fraction_sold` reaches the seller, `fraction_delivered` reaches the buyer.
  const trade = (isSale ? open.toDeliver : open.toPay).find(t => t.token_id === tokenId);

  if (!trade) {
    // The obligation is gone — either settled from another surface, or this
    // notification belongs to a wallet that is no longer signed in. Say so
    // rather than leaving a button that would fail.
    const wasMine = open.all.some(t => t.token_id === tokenId);
    if (!wasMine) return null;
    return (
      <span className="mt-2 inline-flex items-center gap-1 text-xs text-emerald-300/80">
        <Check className="w-3 h-3" />
        Settled
      </span>
    );
  }

  const busy =
    (isSale && deliver.isPending && deliver.variables?.id === trade.id) ||
    (isDelivery && pay.isPending && pay.variables?.trade.id === trade.id);

  const handle = () => {
    if (isSale) {
      deliver.mutate(trade);
      return;
    }
    // The chain decides the DHB address — copying Base's onto BNB is the exact
    // mistake that made fraction transfers mine successfully and move nothing.
    const dhb = getChainConfig((trade.chain_id || 8453) as ChainId).dhbToken;
    pay.mutate({ trade, tokenAddress: dhb });
  };

  return (
    <div className="flex items-center gap-1.5 mt-2" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={handle}
        disabled={busy}
        className="h-7 px-2.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-medium flex items-center gap-1 transition-colors disabled:opacity-50"
      >
        {busy ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : isSale ? (
          <Send className="w-3 h-3" />
        ) : (
          <Coins className="w-3 h-3" />
        )}
        {isSale
          ? `Send ${trade.quantity} fraction${trade.quantity === 1 ? '' : 's'}`
          : `Pay ${(trade.quantity * trade.price_per_fraction).toLocaleString(undefined, { maximumFractionDigits: 2 })} DHB`}
      </button>
    </div>
  );
}
