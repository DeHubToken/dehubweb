/**
 * Activity
 * ========
 * The tape: what has actually traded, market-wide.
 *
 * A market with no visible trade history gives a first-time seller nothing to
 * price against — the listing grid only shows what people are *asking*, which
 * is exactly the number that is wrong when nothing is selling. Settled trades
 * are the only prices here that someone actually paid.
 */

import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Activity, ArrowRight, Clock } from 'lucide-react';
import { useRecentTrades, type FractionTrade } from '@/hooks/use-fraction-marketplace';
import { truncateAddress } from '@/lib/api/token-holders';
import { useTokenPrices } from '@/hooks/use-token-prices';
import { cn } from '@/lib/utils';
import dehubCoin from '@/assets/dehub-coin.png';

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const STATUS_LABEL: Record<string, { text: string; className: string }> = {
  settled: { text: 'Settled', className: 'text-emerald-300/80' },
  awaiting_delivery: { text: 'Awaiting fractions', className: 'text-amber-300/80' },
  awaiting_payment: { text: 'Awaiting payment', className: 'text-amber-300/80' },
};

function TradeRow({ trade, onOpen }: { trade: FractionTrade; onOpen: () => void }) {
  const status = STATUS_LABEL[trade.status] || STATUS_LABEL.settled;
  const total = trade.quantity * trade.price_per_fraction;

  return (
    <button
      onClick={onOpen}
      className="w-full text-left rounded-xl border border-white/10 bg-white/5 p-3 hover:border-white/20 transition-colors"
    >
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="text-xs text-white/60 truncate">Post #{trade.token_id}</span>
        <span className="text-[10px] text-white/30 flex items-center gap-1 shrink-0">
          <Clock className="w-3 h-3" />
          {relativeTime(trade.created_at)}
        </span>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-white font-medium text-sm">
            {trade.quantity} fraction{trade.quantity === 1 ? '' : 's'}
          </p>
          <p className="text-[11px] text-white/40 font-mono truncate flex items-center gap-1">
            {truncateAddress(trade.seller_address)}
            <ArrowRight className="w-3 h-3 shrink-0" />
            {truncateAddress(trade.buyer_address)}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-white font-semibold text-sm flex items-center gap-1 justify-end">
            <img src={dehubCoin} alt="DHB" className="w-3.5 h-3.5" />
            {total.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </p>
          <p className={cn('text-[10px]', status.className)}>{status.text}</p>
        </div>
      </div>
    </button>
  );
}

export function ActivityTab() {
  const navigate = useNavigate();
  const { data: trades = [], isLoading } = useRecentTrades(40);
  const { data: prices } = useTokenPrices();
  const dhbUsd = prices?.DHB ?? 0;

  // Last-traded price across settled trades. Asks tell you what people want;
  // this tells you what someone paid.
  const summary = useMemo(() => {
    const settled = trades.filter(t => t.status === 'settled');
    if (!settled.length) return null;
    const volume = settled.reduce((sum, t) => sum + t.quantity * t.price_per_fraction, 0);
    const fractions = settled.reduce((sum, t) => sum + t.quantity, 0);
    return {
      count: settled.length,
      volume,
      avgPrice: fractions > 0 ? volume / fractions : 0,
    };
  }, [trades]);

  return (
    <div className="space-y-4">
      {summary && (
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <p className="text-[10px] text-white/40 uppercase tracking-wide">Trades</p>
            <p className="text-white font-semibold">{summary.count}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <p className="text-[10px] text-white/40 uppercase tracking-wide">Volume</p>
            <p className="text-white font-semibold">
              {summary.volume.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              <span className="text-[10px] text-white/40 ml-1">DHB</span>
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <p className="text-[10px] text-white/40 uppercase tracking-wide">Avg / fraction</p>
            <p className="text-white font-semibold">
              {summary.avgPrice.toLocaleString(undefined, { maximumFractionDigits: 3 })}
              {dhbUsd > 0 && (
                <span className="text-[10px] text-white/40 ml-1">
                  ${(summary.avgPrice * dhbUsd).toFixed(4)}
                </span>
              )}
            </p>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 text-white/30 animate-spin" />
        </div>
      ) : trades.length === 0 ? (
        <div className="text-center py-16">
          <Activity className="w-10 h-10 text-white/15 mx-auto mb-3" />
          <p className="text-white/40 text-sm">Nothing has traded yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {trades.map((trade) => (
            <TradeRow
              key={trade.id}
              trade={trade}
              onOpen={() => navigate(`/app/post/${trade.token_id}/info`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
