/**
 * Settlement Rail
 * ===============
 * Swaps with a leg still outstanding, and the button that closes it.
 *
 * This is the component that makes an escrowless market workable. A fraction
 * trade moves DHB one way and an ERC-1155 balance the other, and with no swap
 * contract deployed one of those lands second — so the gap has to be somewhere
 * a person can see and act on, not an assumption buried in a toast. Every row
 * here has a first leg that is already verified on-chain, a named counterparty,
 * and a deadline.
 *
 * It renders nothing when you have no open trades, so it can sit at the top of
 * the portfolio and the post panel without taking up space in the normal case.
 */

import { Button } from '@/components/ui/button';
import { Loader2, ArrowUpRight, ArrowDownLeft, Clock, AlertTriangle } from 'lucide-react';
import { useOpenTrades, type FractionTrade } from '@/hooks/use-fraction-marketplace';
import { useSettleTrade } from '@/hooks/use-fraction-checkout';
import { useAuth } from '@/contexts/AuthContext';
import { truncateAddress } from '@/lib/api/token-holders';
import { cn } from '@/lib/utils';
import dehubCoin from '@/assets/dehub-coin.png';

/** DHB address per chain, for the buyer's payment leg. */
const DHB_BY_CHAIN: Record<number, string> = {
  8453: '0xD20ab1015f6a2De4a6FdDEbAB270113F689c2F7c',
  56: '0x680D3113caf77B61b510f332D5Ef4cf5b41A761D',
};

/** "3h left", "overdue by 2h" — the deadline is the whole point of the row. */
function deadlineLabel(settleBy: string | null): { text: string; overdue: boolean } {
  if (!settleBy) return { text: '', overdue: false };
  const ms = new Date(settleBy).getTime() - Date.now();
  const overdue = ms < 0;
  const abs = Math.abs(ms);
  const hours = Math.floor(abs / 3600_000);
  const mins = Math.floor((abs % 3600_000) / 60_000);
  const span = hours > 0 ? `${hours}h` : `${mins}m`;
  return { text: overdue ? `overdue by ${span}` : `${span} left`, overdue };
}

function TradeRow({
  trade,
  action,
  actionLabel,
  onAction,
  pending,
  direction,
}: {
  trade: FractionTrade;
  action: boolean;
  actionLabel: string;
  onAction?: () => void;
  pending?: boolean;
  direction: 'in' | 'out';
}) {
  const { text, overdue } = deadlineLabel(trade.settle_by);
  const counterparty = direction === 'out' ? trade.buyer_address : trade.seller_address;
  const Icon = direction === 'out' ? ArrowUpRight : ArrowDownLeft;

  return (
    <div
      className={cn(
        'rounded-xl p-3 border space-y-2',
        overdue ? 'bg-amber-500/5 border-amber-500/20' : 'bg-white/5 border-white/10',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-white/60 flex items-center gap-1.5 min-w-0">
          <Icon className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">
            Post #{trade.token_id} · {truncateAddress(counterparty)}
          </span>
        </span>
        {text && (
          <span
            className={cn(
              'text-[10px] flex items-center gap-1 shrink-0',
              overdue ? 'text-amber-300' : 'text-white/40',
            )}
          >
            {overdue ? <AlertTriangle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
            {text}
          </span>
        )}
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-white font-medium text-sm">
            {trade.quantity} fraction{trade.quantity === 1 ? '' : 's'}
          </p>
          <p className="text-xs text-white/50 flex items-center gap-1">
            <img src={dehubCoin} alt="DHB" className="w-3 h-3" />
            {(trade.quantity * trade.price_per_fraction).toLocaleString(undefined, {
              maximumFractionDigits: 2,
            })}{' '}
            DHB
          </p>
        </div>
        {action ? (
          <Button
            size="sm"
            onClick={onAction}
            disabled={pending}
            className="bg-white/10 hover:bg-white/20 text-white border border-white/20 text-xs h-8 shrink-0"
          >
            {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : actionLabel}
          </Button>
        ) : (
          <span className="text-[11px] text-white/40 shrink-0">{actionLabel}</span>
        )}
      </div>
    </div>
  );
}

interface SettlementRailProps {
  /** Limit the rail to one post — used inside a post's fraction panel. */
  tokenId?: string;
  className?: string;
}

export function SettlementRail({ tokenId, className }: SettlementRailProps) {
  const { walletAddress } = useAuth();
  const { data, isLoading } = useOpenTrades(walletAddress);
  const { deliver, pay } = useSettleTrade();

  if (!walletAddress || isLoading || !data) return null;

  const filter = (trades: FractionTrade[]) =>
    tokenId ? trades.filter(t => t.token_id === tokenId) : trades;

  const toDeliver = filter(data.toDeliver);
  const toPay = filter(data.toPay);
  const waiting = filter(data.waiting);

  if (!toDeliver.length && !toPay.length && !waiting.length) return null;

  return (
    <section className={cn('space-y-3', className)}>
      <h2 className="text-sm font-medium text-white/60">
        Open trades
        <span className="text-white/30 ml-1.5">
          ({toDeliver.length + toPay.length + waiting.length})
        </span>
      </h2>

      {toDeliver.map(trade => (
        <TradeRow
          key={trade.id}
          trade={trade}
          direction="out"
          action
          actionLabel="Send fractions"
          pending={deliver.isPending && deliver.variables?.id === trade.id}
          onAction={() => deliver.mutate(trade)}
        />
      ))}

      {toPay.map(trade => (
        <TradeRow
          key={trade.id}
          trade={trade}
          direction="in"
          action
          actionLabel="Pay now"
          pending={pay.isPending && pay.variables?.trade.id === trade.id}
          onAction={() =>
            pay.mutate({
              trade,
              tokenAddress: DHB_BY_CHAIN[trade.chain_id] || DHB_BY_CHAIN[8453],
            })
          }
        />
      ))}

      {waiting.map(trade => (
        <TradeRow
          key={trade.id}
          trade={trade}
          direction={trade.status === 'awaiting_delivery' ? 'in' : 'out'}
          action={false}
          actionLabel={
            trade.status === 'awaiting_delivery' ? 'Waiting on seller' : 'Waiting on buyer'
          }
        />
      ))}
    </section>
  );
}
