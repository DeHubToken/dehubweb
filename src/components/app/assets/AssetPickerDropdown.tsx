/**
 * Asset Picker Dropdown
 * =====================
 * The list that opens when somebody types `$` in a composer, so they choose the
 * asset instead of hoping the reader's card resolves to the one they meant.
 *
 * Presentational on purpose: the parent owns the search query, because it also
 * needs the results for arrow-key navigation. The @mention drawer solved that by
 * parking its results on `window.__mentionResults`; passing them down is the
 * same thing without the global.
 *
 * Rendered through a portal into `document.body` at fixed coordinates. The
 * composer is inside a modal with its own transform and overflow, and an
 * absolutely-positioned dropdown inside it gets clipped at the text box edge.
 */

import { createPortal } from 'react-dom';
import { Loader2, TrendingDown, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AssetSuggestion } from '@/lib/api/market';

interface AssetPickerDropdownProps {
  isOpen: boolean;
  position: { top: number; left: number };
  results: AssetSuggestion[];
  loading: boolean;
  selectedIndex: number;
  onSelectedIndexChange: (index: number) => void;
  onSelect: (suggestion: AssetSuggestion) => void;
}

function formatPrice(value: number | null): string | null {
  if (value == null) return null;
  if (value >= 1000) return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  if (value >= 1) return `$${value.toFixed(2)}`;
  if (value >= 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(8)}`;
}

export function AssetPickerDropdown({
  isOpen,
  position,
  results,
  loading,
  selectedIndex,
  onSelectedIndexChange,
  onSelect,
}: AssetPickerDropdownProps) {
  if (!isOpen) return null;
  if (!loading && results.length === 0) return null;

  return createPortal(
    <div
      className="fixed z-[9999] w-[300px] max-h-[296px] overflow-y-auto rounded-2xl border border-white/[0.08] bg-black/95 shadow-2xl"
      style={{
        top: position.top,
        left: position.left,
        backdropFilter: 'blur(40px)',
        WebkitBackdropFilter: 'blur(40px)',
      }}
      // The composer must keep focus and the caret must not move, so the
      // pointer-down that would take both is swallowed and selection happens on
      // mouse-down instead of click.
      onMouseDown={(e) => e.preventDefault()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-white/40">
          Tokens &amp; stocks
        </span>
        {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-white/30" />}
      </div>

      {results.map((item, index) => {
        const change = item.changePercent24h;
        const positive = change == null ? true : change >= 0;
        const price = formatPrice(item.price);
        return (
          <button
            key={`${item.assetClass}:${item.symbol}:${item.address ?? item.exchange ?? index}`}
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onSelect(item);
            }}
            onTouchEnd={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onSelect(item);
            }}
            onMouseEnter={() => onSelectedIndexChange(index)}
            className={cn(
              'flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors',
              index === selectedIndex ? 'bg-white/[0.08]' : 'hover:bg-white/[0.05]',
            )}
          >
            {item.logo ? (
              <img src={item.logo} alt="" className="h-7 w-7 shrink-0 rounded-full bg-white/10 object-cover" />
            ) : (
              <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/10">
                <span className="text-[9px] font-bold text-white/60">
                  {item.symbol.replace(/[^A-Za-z0-9]/g, '').slice(0, 3)}
                </span>
              </div>
            )}

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-semibold text-white">${item.symbol}</span>
                <span className="shrink-0 rounded px-1 py-0.5 text-[9px] font-medium uppercase tracking-wide text-white/45 ring-1 ring-white/10">
                  {item.assetClass === 'stock' ? item.exchange || 'Stock' : item.chainId || 'Crypto'}
                </span>
              </div>
              <p className="truncate text-[11px] text-white/45">{item.name}</p>
            </div>

            {price && (
              <div className="shrink-0 text-right">
                <p className="text-xs font-medium text-white/80">{price}</p>
                {change != null && (
                  <p
                    className={cn(
                      'flex items-center justify-end gap-0.5 text-[10px]',
                      positive ? 'text-emerald-400' : 'text-red-400',
                    )}
                  >
                    {positive ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
                    {change.toFixed(1)}%
                  </p>
                )}
              </div>
            )}
          </button>
        );
      })}
    </div>,
    document.body,
  );
}

export default AssetPickerDropdown;
