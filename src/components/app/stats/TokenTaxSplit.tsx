/**
 * Where the token tax went
 * ========================
 * The original DeHub token (BSC, 2021–23) taxed every trade. This card splits
 * that tax three ways — DeHub operations, bought back and burned, paid to holders
 * and stakers — each in USD at the BNB price on the day it happened, so a
 * burn in November 2021 is worth what it cost then, not what BNB is worth now.
 *
 * It is closed history, so it shows the whole period whatever range the page
 * is on. Every figure opens the token-tax ledger, where each line links to
 * BscScan.
 */

import { useTranslation } from 'react-i18next';
import { ArrowRight, Flame } from 'lucide-react';

import type { TaxSplit } from '@/hooks/use-finance-stats';

function formatUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}K`;
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

/** 178,286,700 → "178.3M". */
function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  return n.toLocaleString('en-US');
}

function yearOf(day: string): string {
  return day.slice(0, 4);
}

/** One step of the page's ink per part: identity is also carried by the label beside it, never by shade alone. */
const SHADES = [1, 0.55, 0.25];

export function TokenTaxSplit({ split, onOpen }: { split: TaxSplit; onOpen: (sourceId: string) => void }) {
  const { t } = useTranslation();

  const parts = [
    {
      id: 'bsc_token_tax',
      label: t('stats.taxSplit.team', 'DeHub operations'),
      usd: split.team.usd,
      detail: t('stats.money.reinvestment', 'Marketing & developer wages'),
    },
    {
      id: 'bsc_token_burn',
      label: t('stats.taxSplit.burned', 'Bought back and burned'),
      usd: split.burned.usd,
      detail: t('stats.taxSplit.burnedDetail', '{{tokens}} DeHub burned in {{n}} buybacks', {
        tokens: formatCount(split.burned.tokens),
        n: split.burned.buybacks.toLocaleString('en-US'),
      }),
    },
    {
      id: 'bsc_holder_share',
      label: t('stats.taxSplit.shared', 'Paid to holders and stakers'),
      usd: split.shared.usd,
      detail: t('stats.taxSplit.sharedDetail', '{{claims}} claims by {{wallets}} wallets', {
        claims: (split.shared.holderClaims + split.shared.stakerClaims).toLocaleString('en-US'),
        wallets: split.shared.wallets.toLocaleString('en-US'),
      }),
    },
  ];
  const total = parts.reduce((a, p) => a + p.usd, 0);
  const pct = (usd: number) => (total > 0 ? Math.round((usd / total) * 100) : 0);
  const from = yearOf(split.period.from);
  const to = yearOf(split.period.to);

  return (
    <div data-page-bento data-kit-section className="bg-zinc-900 border border-zinc-800 p-4">
      <div className="flex items-center gap-2 mb-1">
        <Flame className="w-4 h-4 text-zinc-400 shrink-0" />
        <span className="text-sm font-semibold text-white">{t('stats.taxSplit.title', 'Where revenue went')}</span>
        <span className="text-[11px] text-zinc-500 ml-auto shrink-0 tabular-nums">
          {from === to ? from : `${from}–${to}`}
        </span>
      </div>
      <p className="text-xs text-zinc-500 leading-relaxed mb-3">
        {t(
          'stats.taxSplit.intro',
          'Historical revenue funded operations, token buybacks and rewards for holders and stakers. Amounts are shown in dollars at the value on each payment date. Open each part to see its original currencies and every transaction.',
        )}
      </p>

      {/* One bar, three parts, in the same order and shade as the figures below. */}
      <div className="text-white flex gap-0.5 h-2.5 mb-4" role="img" aria-label={parts.map((p) => `${p.label} ${pct(p.usd)}%`).join(', ')}>
        {parts.map((p, i) => (
          <div
            key={p.id}
            title={`${p.label}: ${formatUsd(p.usd)} (${pct(p.usd)}%)`}
            className="h-full first:rounded-l last:rounded-r"
            style={{ width: `${(p.usd / total) * 100}%`, backgroundColor: 'currentColor', opacity: SHADES[i] }}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {parts.map((p, i) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onOpen(p.id)}
            aria-label={t('stats.taxSplit.open', 'See every {{part}} line', { part: p.label.toLowerCase() })}
            className="group flex flex-col text-left rounded-xl -m-1 p-1 hover:bg-zinc-800/50 transition-colors"
          >
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-zinc-500">
              <span className="text-white inline-block w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: 'currentColor', opacity: SHADES[i] }} />
              <span className="truncate">{p.label}</span>
              <span className="ml-auto tabular-nums normal-case">{pct(p.usd)}%</span>
            </div>
            <div className="text-xl sm:text-2xl font-bold text-white mt-0.5 tabular-nums">{formatUsd(p.usd)}</div>
            <div className="text-[11px] text-zinc-500 mt-0.5 leading-snug">{p.detail}</div>
            <div className="self-start inline-flex items-center gap-1 text-[11px] text-zinc-400 group-hover:text-white transition-colors mt-auto pt-1">
              {t('stats.taxSplit.see', 'See every line')}
              <ArrowRight className="w-3 h-3" />
            </div>
          </button>
        ))}
      </div>

      <p className="text-[11px] text-zinc-500 leading-relaxed mt-3 pt-3 border-t border-zinc-800">
        {t(
          'stats.taxSplit.grossFootnote',
          'The revenue total above includes BNB shared with holders and stakers. These payments were distributed, not retained by DeHub. Buybacks remain separate. Every amount and original currency can be inspected in the ledger.',
        )}
      </p>
    </div>
  );
}
