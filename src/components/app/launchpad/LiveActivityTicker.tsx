import { useLaunchpadTrades } from '@/hooks/use-launchpad-trades';
import { DhbCoin } from '@/components/app/DhbAmount';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function LiveActivityTicker() {
  const { t } = useTranslation();
  const { data: trades = [] } = useLaunchpadTrades(undefined, 30);
  return (
    <div className="rounded-2xl bg-black/60 backdrop-blur-[24px] border border-white/10 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-white/10 flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
        <span className="text-white/80 text-xs font-semibold uppercase tracking-wide">{t('launchpad.liveActivity')}</span>
      </div>
      <div className="max-h-[420px] overflow-y-auto divide-y divide-white/5">
        {trades.length === 0 && <div className="p-4 text-white/40 text-sm">{t('launchpad.noTrades')}</div>}
        {/* Named `trade`, not `t` — the row translates its own verb now, and
            `t` here is the translator. */}
        {trades.map(trade => (
          <div key={trade.id} className="px-4 py-2 flex items-center gap-2 text-xs">
            {trade.side === 'buy'
              ? <ArrowUpRight className="h-3.5 w-3.5 text-white" />
              : <ArrowDownRight className="h-3.5 w-3.5 text-white/60" />}
            <span className="text-white/80 font-mono truncate">{trade.trader_address.slice(0,6)}…{trade.trader_address.slice(-4)}</span>
            <span className="text-white/50">{t(trade.side === 'buy' ? 'launchpad.bought' : 'launchpad.sold')}</span>
            <span className="text-white font-semibold tabular-nums ml-auto">{Number(trade.dhb_in).toFixed(2)} <DhbCoin /></span>
          </div>
        ))}
      </div>
    </div>
  );
}
