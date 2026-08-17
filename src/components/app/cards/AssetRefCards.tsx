/**
 * Asset Reference Cards
 * =====================
 * The card a contract address or a `$TICKER` turns into: logo, name, price, the
 * 24h move and a 24h sparkline.
 *
 * Two decisions worth keeping:
 *
 * **The chart is hand-drawn SVG, not the charting library.** These render in the
 * eager feed path, and `recharts` is ~500 kB raw — `CashtagPriceCard` already
 * has to lazy-load it behind a fixed-height placeholder for exactly that reason.
 * A 24-point sparkline is a `<path>`; pulling a chart engine into the feed to
 * draw one would cost more than the feature.
 *
 * **A failed lookup still renders.** The surfaces strip a contract address out
 * of the caption once they card it, so an unresolvable token — a fresh launch
 * with no pool yet, a chain DexScreener does not index, a rate-limited minute —
 * would silently delete the address from the post. `AddressChip` is that
 * fallback, and it keeps the address copyable.
 */

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TrendingUp, TrendingDown, ClipboardCopy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { explorerUrlFor, findAssetRefs, stripAssetRefs, type AssetRef } from '@/lib/asset-refs';
import type { ResolvedAsset } from '@/lib/api/market';
import type { PricePoint } from '@/hooks/use-token-chart';
import { useAsset24hSeries, useResolvedAsset } from '@/hooks/use-asset-ref';
import { recordTickerSearch } from '@/lib/ticker-search-tracker';

const CARD_HEIGHT = 'min-h-[92px]';

function formatPrice(value: number | null, currency = 'USD'): string {
  if (value == null) return '—';
  const prefix = currency === 'USD' ? '$' : '';
  if (value >= 1000) return `${prefix}${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  if (value >= 1) return `${prefix}${value.toFixed(2)}`;
  if (value >= 0.01) return `${prefix}${value.toFixed(4)}`;
  if (value >= 0.0001) return `${prefix}${value.toFixed(6)}`;
  return `${prefix}${value.toFixed(8)}`;
}

function formatCompact(value: number | null | undefined): string | null {
  if (!value) return null;
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

function shortAddress(address: string): string {
  return address.length > 16 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}

// ── Sparkline ───────────────────────────────────────────────────────────────

const SPARK_W = 240;
const SPARK_H = 40;

function Sparkline({ points, positive }: { points: PricePoint[]; positive: boolean }) {
  if (points.length < 2) return <div style={{ height: SPARK_H }} />;

  const prices = points.map((p) => p.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  // A flat series has zero range; without the guard every y is NaN and the path
  // disappears rather than drawing a straight line.
  const range = max - min || Math.abs(max) || 1;
  const step = SPARK_W / (points.length - 1);

  const coords = prices.map((price, i) => ({
    x: i * step,
    y: SPARK_H - ((price - min) / range) * (SPARK_H - 4) - 2,
  }));

  const line = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  const area = `${line} L${SPARK_W},${SPARK_H} L0,${SPARK_H} Z`;
  const stroke = positive ? '#34d399' : '#f87171';
  const gradientId = `asset-spark-${positive ? 'up' : 'down'}`;

  return (
    <svg
      viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
      preserveAspectRatio="none"
      className="w-full"
      style={{ height: SPARK_H }}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.28" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path d={line} fill="none" stroke={stroke} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

// ── Fallback ────────────────────────────────────────────────────────────────

/**
 * What a stripped address becomes when nothing could resolve it. Not decorative:
 * this is the only remaining copy of an address the caption no longer shows.
 */
function AddressChip({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard?.writeText(address);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="inline-flex items-center gap-1.5 rounded-lg bg-white/5 border border-white/10 px-2.5 py-1.5 font-mono text-xs text-white/60 hover:text-white hover:bg-white/[0.08] transition-colors"
      title={address}
    >
      {shortAddress(address)}
      {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <ClipboardCopy className="w-3 h-3" />}
    </button>
  );
}

// ── Card ────────────────────────────────────────────────────────────────────

function AssetCard({ asset }: { asset: ResolvedAsset }) {
  const navigate = useNavigate();
  const { data: series } = useAsset24hSeries(asset);
  const change = asset.changePercent24h;
  const positive = change == null ? true : change >= 0;

  const meta =
    asset.assetClass === 'stock'
      ? [asset.exchange, formatCompact(asset.marketCap)].filter(Boolean)
      : [
          asset.chainId?.toUpperCase(),
          formatCompact(asset.marketCap) ? `MC ${formatCompact(asset.marketCap)}` : null,
          formatCompact(asset.volume24h) ? `Vol ${formatCompact(asset.volume24h)}` : null,
        ].filter(Boolean);

  const explorer = asset.chainId && asset.address ? explorerUrlFor(asset.chainId, asset.address) : null;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        recordTickerSearch(asset.symbol);
        navigate(`/app/explore?q=${encodeURIComponent(`$${asset.symbol}`)}`);
      }}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.stopPropagation();
        navigate(`/app/explore?q=${encodeURIComponent(`$${asset.symbol}`)}`);
      }}
      className={cn(
        'block w-full text-left rounded-xl border border-white/10 bg-white/5 p-3 transition-colors hover:bg-white/[0.08] cursor-pointer',
        CARD_HEIGHT,
      )}
    >
      <div className="flex items-start gap-3">
        {asset.logo ? (
          <img
            src={asset.logo}
            alt=""
            loading="lazy"
            className="w-9 h-9 rounded-full bg-white/10 object-cover shrink-0"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.visibility = 'hidden';
            }}
          />
        ) : (
          <div className="w-9 h-9 rounded-full bg-white/10 grid place-items-center shrink-0">
            <span className="text-[11px] font-bold text-white/70">
              {asset.symbol.replace(/[^A-Za-z0-9]/g, '').slice(0, 3)}
            </span>
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-white font-bold text-sm">${asset.symbol}</span>
            <span className="text-white/50 text-xs truncate">{asset.name}</span>
          </div>
          {meta.length > 0 && (
            <p className="text-white/40 text-[11px] mt-0.5 truncate">{meta.join(' · ')}</p>
          )}
        </div>

        <div className="text-right shrink-0">
          <p className="text-white font-semibold text-sm">{formatPrice(asset.price, asset.currency)}</p>
          {change != null && (
            <p
              className={cn(
                'flex items-center justify-end gap-0.5 text-xs font-medium',
                positive ? 'text-emerald-400' : 'text-red-400',
              )}
            >
              {positive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {positive ? '+' : ''}
              {change.toFixed(2)}%
            </p>
          )}
        </div>
      </div>

      {series && series.length >= 2 && (
        <div className="mt-2 flex items-end gap-2">
          <div className="flex-1 min-w-0">
            <Sparkline points={series} positive={positive} />
          </div>
          <span className="text-white/30 text-[10px] pb-1 shrink-0">24h</span>
        </div>
      )}

      {explorer && (
        <a
          href={explorer}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="mt-1 inline-block font-mono text-[10px] text-white/30 hover:text-white/60 transition-colors"
        >
          {shortAddress(asset.address as string)}
        </a>
      )}
    </div>
  );
}

// Named `assetRef`, not `ref`: React treats a `ref` prop on a function component
// as a ref forward and strips it out of props, so the card would render blank.
function AssetRefCard({ assetRef }: { assetRef: AssetRef }) {
  const { data: asset, isLoading } = useResolvedAsset(assetRef);

  if (isLoading) {
    return (
      <div
        className={cn('rounded-xl border border-white/10 bg-white/5 animate-pulse', CARD_HEIGHT)}
        aria-hidden="true"
      />
    );
  }

  if (!asset) {
    // A ticker that resolved to nothing is still in the caption, so there is
    // nothing to rescue and nothing to show. A stripped address is not.
    if (!assetRef.strip) return null;
    return <AddressChip address={assetRef.raw} />;
  }

  return <AssetCard asset={asset} />;
}

/**
 * Same cap as the entity embeds: a caption can name a whole portfolio, and each
 * card is a provider round trip.
 */
export const MAX_ASSET_CARDS_PER_MESSAGE = 2;

/**
 * Cards for the refs a surface found. `data-no-navigate` matters: the feed cards
 * make the whole post clickable, and without it opening a token chart also opens
 * the post behind it.
 */
export function AssetRefCards({ refs, className }: { refs: AssetRef[]; className?: string }) {
  if (refs.length === 0) return null;
  return (
    <div className={cn('mt-2 space-y-2', className)} data-no-navigate>
      {refs.map((ref) => (
        <AssetRefCard key={`${ref.kind}:${ref.value}`} assetRef={ref} />
      ))}
    </div>
  );
}

/**
 * The counterpart of `useDehubLinks`, and deliberately the same shape so a
 * surface adds market cards the way it added entity cards: take `refs` and
 * `displayText`, render the text you were given.
 *
 * `displayText` differs from the input only when an address was found — tickers
 * stay in the sentence.
 */
export function useAssetRefsInText(
  text?: string | null,
  max = MAX_ASSET_CARDS_PER_MESSAGE,
): { refs: AssetRef[]; displayText: string } {
  return useMemo(() => {
    const refs = findAssetRefs(text).slice(0, max);
    return { refs, displayText: stripAssetRefs(text, refs) };
  }, [text, max]);
}
