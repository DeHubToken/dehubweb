import { useParams, Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { DhbCoin } from '@/components/app/DhbAmount';
import { getLaunchpadBase } from '@/lib/launchpad/base-path';
import { SEOHead } from '@/components/SEOHead';
import { ChevronLeft } from 'lucide-react';
import { useLaunchpadToken } from '@/hooks/use-launchpad-tokens';
import { useLaunchpadTrades } from '@/hooks/use-launchpad-trades';
import { TradePanel } from '@/components/app/launchpad/TradePanel';
import { BondingCurveProgress } from '@/components/app/launchpad/BondingCurveProgress';
import { FeeBreakdown } from '@/components/app/launchpad/FeeBreakdown';
import { ThemedIcon } from '@/components/app/war/WarHudIcon';

/** Curve type and status are database slugs; the panel wants the reader's language. */
const CURVE_KEYS: Record<string, string> = {
  standard: 'launchpad.curveStandard',
  fair: 'launchpad.curveFair',
  stealth: 'launchpad.curveStealth',
};
const STATUS_KEYS: Record<string, string> = {
  bonding: 'launchpad.statusBonding',
  graduating: 'launchpad.statusGraduating',
  graduated: 'launchpad.statusGraduated',
};

function fmtUsd(n: number) {
  if (n >= 1_000_000) return `$${(n/1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n/1_000).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}

export default function LaunchpadCoinPage() {
  const { t } = useTranslation();
  const { mintId } = useParams<{ mintId: string }>();
  const location = useLocation();
  const base = getLaunchpadBase(location.pathname);
  const { data: token, isLoading, isError, refetch } = useLaunchpadToken(mintId);
  const { data: trades = [] } = useLaunchpadTrades(mintId);

  if (isLoading) return <div className="p-6 text-white/60">{t('launchpad.loading')}</div>;
  if (isError) return (
    <div className="p-6 pt-16 text-center text-white/60">
      <ThemedIcon icon="search" alt="" className="w-16 h-16 object-contain mx-auto mb-3 opacity-75" />
      {t('launchpad.coinLoadFailed')} <button onClick={() => refetch()} className="text-white underline">{t('launchpad.retry')}</button>
    </div>
  );
  if (!token) return (
    <div className="p-6 pt-16 text-center text-white/60">
      <ThemedIcon icon="search" alt="" className="w-16 h-16 object-contain mx-auto mb-3 opacity-75" />
      {t('launchpad.coinNotFound')}
    </div>
  );

  const target = Number(token.graduation_target_usd) || 42000;
  // Chart scale — computed once, not per bar (the old inline version spread
  // the whole trades array inside every bar's style calculation).
  const maxTradePrice = Math.max(...trades.map(x => Number(x.price_per_token)), 1e-9);

  return (
    <div className="min-h-screen px-4 md:px-6 py-6 max-w-6xl mx-auto">
      <SEOHead
        title={`$${token.symbol} ${token.name} — Launchpad`}
        description={t('launchpad.coinSeoDescription', { symbol: token.symbol })}
        noindex
      />
      <Link to={base} className="inline-flex items-center text-white/60 hover:text-white text-sm">
        <ChevronLeft className="h-4 w-4" /> {t('launchpad.backToLaunchpad')}
      </Link>

      {/* Header */}
      <div className="mt-3 rounded-2xl bg-black/60 backdrop-blur-[24px] border border-white/10 p-5 flex items-center gap-4">
        <div className="h-16 w-16 rounded-xl overflow-hidden border border-white/10 bg-white/5 shrink-0">
          {token.image_url
            ? <img src={token.image_url} alt={token.symbol} className="h-full w-full object-cover" />
            : <div className="h-full w-full flex items-center justify-center text-white/60 font-bold">{token.symbol.slice(0,2)}</div>}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-white text-xl md:text-2xl font-bold truncate">{token.name} <span className="text-white/50 text-sm uppercase">${token.symbol}</span></h1>
          <div className="text-white/60 text-xs mt-0.5">{t('launchpad.byCreator', { creator: `${token.creator_address.slice(0, 6)}…${token.creator_address.slice(-4)}` })} · {token.chain_id === 8453 ? 'Base' : 'BNB'}</div>
        </div>
        <BondingCurveProgress progressBps={token.progress_bps} size={64} />
      </div>

      {/* Graduation banner */}
      <div className="mt-3 rounded-xl bg-white/5 border border-white/10 px-4 py-2.5 text-xs text-white/70 flex items-center justify-between">
        <span>{t('launchpad.mcapToGraduation', { current: fmtUsd(token.market_cap_usd), target: fmtUsd(target) })}</span>
        <span className="text-white">{t(STATUS_KEYS[token.status] ?? 'launchpad.statusBonding')}</span>
      </div>

      <div className="mt-5 grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-5">
        {/* Left: chart placeholder + trades */}
        <div className="space-y-5">
          <div className="rounded-2xl bg-black/60 backdrop-blur-[24px] border border-white/10 p-5 h-64 flex items-end gap-1">
            {trades.slice().reverse().slice(-40).map((t, i) => (
              <div key={t.id} data-keep-square className="flex-1 bg-white/60 rounded-sm" style={{
                height: `${Math.max(4, Math.min(100, (Number(t.price_per_token) / maxTradePrice) * 100))}%`,
                opacity: 0.4 + (i / 40) * 0.6,
              }} />
            ))}
            {trades.length === 0 && <div className="w-full text-center text-white/40 text-sm self-center">{t('launchpad.chartAfterFirstTrade')}</div>}
          </div>

          {token.description && (
            <div className="rounded-2xl bg-black/60 backdrop-blur-[24px] border border-white/10 p-4 text-white/80 text-sm">
              {token.description}
            </div>
          )}

          <div className="rounded-2xl bg-black/60 backdrop-blur-[24px] border border-white/10 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-white/10 text-white/80 text-xs font-semibold uppercase tracking-wide">{t('launchpad.recentTrades')}</div>
            <div className="max-h-80 overflow-y-auto divide-y divide-white/5">
              {trades.length === 0 && <div className="p-4 text-white/40 text-sm">{t('launchpad.noTrades')}</div>}
              {/* Named `trade`, not `t` — the row now translates its own side
                  label, and `t` here is the translator. */}
              {trades.map(trade => (
                <div key={trade.id} className="px-4 py-2 grid grid-cols-4 text-xs">
                  <span className={trade.side === 'buy' ? 'text-white' : 'text-white/60'}>{t(trade.side === 'buy' ? 'launchpad.sideBuy' : 'launchpad.sideSell')}</span>
                  <span className="text-white/70 font-mono">{trade.trader_address.slice(0,6)}…{trade.trader_address.slice(-4)}</span>
                  <span className="text-white tabular-nums text-right">{Number(trade.dhb_in).toFixed(2)} <DhbCoin /></span>
                  <span className="text-white/50 tabular-nums text-right">{new Date(trade.created_at).toLocaleTimeString()}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: trade + meta */}
        <div className="space-y-5">
          <TradePanel token={token} />
          <div className="rounded-2xl bg-black/60 backdrop-blur-[24px] border border-white/10 p-4 space-y-2 text-sm">
            <Row k={t('launchpad.marketCap')} v={fmtUsd(token.market_cap_usd)} />
            <Row k={t('launchpad.volume24h')} v={fmtUsd(token.volume_24h)} />
            <Row k={t('launchpad.supplySold')} v={Math.floor(Number(token.supply_sold)).toLocaleString()} />
            <Row k={t('launchpad.curve')} v={t(CURVE_KEYS[(token as unknown as { curve_type?: string }).curve_type ?? 'standard'] ?? 'launchpad.curveStandard')} />
            <Row k={t('launchpad.pair')} v="DHB" />
          </div>
          <FeeBreakdown />
        </div>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between"><span className="text-white/50">{k}</span><span className="text-white capitalize">{v}</span></div>;
}
