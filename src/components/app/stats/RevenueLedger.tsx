/**
 * Revenue ledger
 * ==============
 * Every line behind the revenue figure above, with the evidence for it.
 *
 * A total is a claim; this is how anyone checks it. Anything that happened on
 * a chain links to the transaction on BscScan or BaseScan, so a reader can see
 * the money arrive without trusting this page. What happened off-chain — card
 * payments, plan invoices — has no public record to link, and says so rather
 * than inventing one; those appear as each day's total and how many payments
 * made it up.
 *
 * It loads only when opened: the ledger is hundreds of lines, and most visits
 * to /stats never need them. The whole ledger, or any filtered slice of it,
 * downloads as CSV.
 *
 * The same list, as `kind="tax"`, proves where the original token's trading
 * tax went: every burn, every day of holder claims, every operations payout. That
 * one is fixed 2021–23 history, so it ignores the page's range.
 */

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Loader2, ReceiptText } from "lucide-react";
import { ExternalLink } from "@/components/ui/cut-icons";

import { Download } from "@/components/ui/cut-icons";


import {
  financeLedgerEndpoint,
  useFinanceLedger,
  type FinanceLedger,
  type LedgerItem,
} from '@/hooks/use-finance-stats';
import { cn } from '@/lib/utils';

const PAGE = 25;

function formatUsd(n: number): string {
  const abs = Math.abs(n);
  const body =
    abs < 10
      ? `$${abs.toFixed(2)}`
      : `$${abs.toLocaleString('en-US', { maximumFractionDigits: abs < 10_000 ? 2 : 0, minimumFractionDigits: abs < 10_000 ? 2 : 0 })}`;
  return n < 0 ? `−${body}` : body;
}

function formatAmount(item: LedgerItem): string | null {
  if (item.amount == null || !item.unit) return null;
  const digits = item.unit === 'BNB' ? 4 : item.unit === 'DHB' ? 0 : 2;
  return `${item.amount.toLocaleString('en-US', { maximumFractionDigits: digits })} ${item.unit}`;
}

function shortHash(value: string): string {
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

/** First day inside the page's range, or null for all time. Days are UTC, like the rest of the page. */
function rangeStart(days: number | null): string | null {
  if (days == null) return null;
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return start.toISOString().slice(0, 10);
}

/** The transaction, or for a day's total, the contract whose event log holds every event in it. */
function proofUrl(ledger: FinanceLedger, item: LedgerItem): string | null {
  const ref = item.ref;
  if (!ref) return null;
  if (ref.tx) return `${ledger.explorers[ref.chain]}/tx/${ref.tx}`;
  if (ref.address) return `${ledger.explorers[ref.chain]}/address/${ref.address}#events`;
  return null;
}

function csvCell(value: string | number | undefined | null): string {
  const text = value == null ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadCsv(ledger: FinanceLedger, items: LedgerItem[], labels: Map<string, string>, name: string) {
  const header = ['date', 'source', 'usd', 'amount', 'unit', 'payments', 'chain', 'transaction', 'proof_url', 'note', 'counts_as_revenue'];
  const lines = items.map((item) =>
    [
      item.date,
      labels.get(item.source) ?? item.source,
      item.priced === false ? '' : item.usd.toFixed(2),
      item.amount,
      item.unit,
      item.count,
      item.ref?.chain,
      item.ref?.tx ?? item.ref?.address,
      proofUrl(ledger, item),
      item.note,
      String(item.counted !== false),
    ]
      .map(csvCell)
      .join(','),
  );
  const blob = new Blob([[header.join(','), ...lines].join('\n') + '\n'], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function RevenueLedger({
  kind = 'revenue',
  windowDays,
  open,
  onOpenChange,
  source,
  onSourceChange,
}: {
  /** `revenue`: every line behind revenue. `tax`: every line behind the token-tax split. */
  kind?: 'revenue' | 'tax';
  /** The page's range in days; null is all time. Ignored for `tax`, which is fixed history. */
  windowDays: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Source id to show, or null for every source. */
  source: string | null;
  onSourceChange: (source: string | null) => void;
}) {
  const { t } = useTranslation();
  const tax = kind === 'tax';
  const endpoint = financeLedgerEndpoint(tax ? 'tax' : 'ledger');
  const { data: ledger, isLoading, isError } = useFinanceLedger(open, tax ? 'tax' : 'ledger');
  const [shown, setShown] = useState(PAGE);

  const start = tax ? null : rangeStart(windowDays);
  const view = useMemo(() => {
    if (!ledger) return null;
    const labels = new Map(ledger.sources.map((s) => [s.id, s.label]));
    const inRange = start ? ledger.items.filter((i) => i.date >= start) : ledger.items;
    const counts = new Map<string, { n: number; usd: number }>();
    for (const item of inRange) {
      const c = counts.get(item.source) ?? { n: 0, usd: 0 };
      c.n += 1;
      c.usd += item.counted === false ? 0 : item.usd;
      counts.set(item.source, c);
    }
    const chips = ledger.sources
      .filter((s) => counts.has(s.id))
      .map((s) => ({ id: s.id, label: s.label, ...counts.get(s.id)! }));
    // Revenue sources rank by size. The token-tax lines keep the server's
    // order — operations, burned, shared — and have no "All": adding a burn to a
    // payout to a claim makes a number that means nothing.
    if (!tax) chips.sort((a, b) => b.usd - a.usd);
    const active = tax ? source ?? chips[0]?.id ?? null : source;
    const items = active ? inRange.filter((i) => i.source === active) : inRange;
    return {
      labels,
      items,
      active,
      chips,
      total: items.reduce((a, i) => a + (i.counted === false ? 0 : i.usd), 0),
      proven: items.filter((i) => i.ref).length,
      unavailable: ledger.sources.filter((s) => s.status === 'unavailable'),
    };
  }, [ledger, start, source, tax]);

  const rangeLabel =
    tax || windowDays == null
      ? t('stats.ledger.allTime', 'all time')
      : windowDays === 1
        ? t('stats.money.today', 'today so far, UTC')
        : t('stats.countries.window', 'last {{days}} days', { days: windowDays });

  return (
    <div
      id={tax ? 'tax-ledger' : 'revenue-ledger'}
      data-page-bento
      data-kit-section
      className="bg-zinc-900 border border-zinc-800 scroll-mt-24"
    >
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
      >
        <ReceiptText className="w-4 h-4 text-zinc-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-white">
            {tax ? t('stats.taxLedger.title', 'Token tax ledger') : t('stats.ledger.title', 'Revenue ledger')}
          </div>
          <div className="text-xs text-zinc-500">
            {tax
              ? t('stats.taxLedger.subtitle', 'Every burn, holder payout and operations payout from 2021–23, with a link to check it')
              : t('stats.ledger.subtitle', 'Every entry behind the revenue figure, with a link to check it')}
          </div>
        </div>
        <ChevronDown className={cn('w-4 h-4 text-zinc-500 transition-transform shrink-0', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="border-t border-zinc-800 px-4 pb-4 pt-3 space-y-3">
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 text-zinc-500 animate-spin" />
            </div>
          )}

          {!isLoading && (isError || !ledger) && (
            <p className="text-sm text-zinc-500 py-4 text-center">
              {t('stats.ledger.error', 'The ledger could not be loaded right now.')}
            </p>
          )}

          {ledger && view && (
            <>
              {/* Source filter. Counts and totals follow the page's range. */}
              <div className="flex flex-wrap gap-1.5">
                {!tax && (
                  <button
                    type="button"
                    onClick={() => {
                      onSourceChange(null);
                      setShown(PAGE);
                    }}
                    className={cn(
                      'text-xs rounded-full px-2.5 py-1 border transition-colors',
                      source == null
                        ? 'bg-white text-black border-white'
                        : 'text-zinc-300 border-zinc-700 hover:border-zinc-500',
                    )}
                  >
                    {t('stats.ledger.all', 'All')}
                  </button>
                )}
                {view.chips.map((chip) => (
                  <button
                    key={chip.id}
                    type="button"
                    onClick={() => {
                      onSourceChange(chip.id);
                      setShown(PAGE);
                    }}
                    className={cn(
                      'text-xs rounded-full px-2.5 py-1 border transition-colors tabular-nums',
                      view.active === chip.id
                        ? 'bg-white text-black border-white'
                        : 'text-zinc-300 border-zinc-700 hover:border-zinc-500',
                    )}
                  >
                    {chip.label} · {chip.n}
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="text-xs text-zinc-400 tabular-nums">
                  {tax
                    ? t('stats.taxLedger.summary', '{{entries}} lines · {{total}} at the BNB price on each day · every line checkable on BscScan', {
                        entries: view.items.length.toLocaleString('en-US'),
                        total: formatUsd(view.total),
                      })
                    : t('stats.ledger.summary', '{{entries}} entries · {{total}} · {{proven}} with an on-chain transaction · {{range}}', {
                        entries: view.items.length.toLocaleString('en-US'),
                        total: formatUsd(view.total),
                        proven: view.proven.toLocaleString('en-US'),
                        range: rangeLabel,
                      })}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    downloadCsv(
                      ledger,
                      view.items,
                      view.labels,
                      tax
                        ? `dehub-token-tax-${view.active ?? 'all'}.csv`
                        : `dehub-revenue-${source ?? 'all'}-${windowDays == null ? 'all-time' : `${windowDays}d`}.csv`,
                    )
                  }
                  disabled={view.items.length === 0}
                  className="inline-flex items-center gap-1.5 text-xs text-zinc-300 hover:text-white bg-zinc-800/50 hover:bg-zinc-800 border border-zinc-800 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-40"
                >
                  <Download className="w-3 h-3" />
                  {t('stats.ledger.csv', 'Download CSV')}
                </button>
              </div>

              {view.items.length === 0 ? (
                <p className="text-sm text-zinc-500 py-4">
                  {tax
                    ? t('stats.taxLedger.empty', 'Nothing to show here.')
                    : t('stats.ledger.empty', 'No revenue entries in this window.')}
                </p>
              ) : (
                <ol className="divide-y divide-zinc-800 border-y border-zinc-800">
                  {view.items.slice(0, shown).map((item, i) => {
                    const url = proofUrl(ledger, item);
                    const proofId = item.ref?.tx ?? item.ref?.address;
                    // The USD column already says it; repeating "40 USD" beside "$40.00" is noise.
                    const amount = item.unit === 'USD' ? null : formatAmount(item);
                    const details = [
                      amount,
                      item.count
                        ? item.count === 1
                          ? t('stats.ledger.paymentOne', '1 payment that day')
                          : t('stats.ledger.payments', '{{n}} payments that day', { n: item.count })
                        : null,
                      item.note,
                    ]
                      .filter(Boolean)
                      .join(' · ');
                    return (
                      <li key={`${item.date}-${item.source}-${proofId ?? i}-${i}`} className="py-2">
                        {/* Two lines on every width, so a phone never has to truncate
                            the source name to make room for the proof link. */}
                        <div className="flex items-baseline gap-3">
                          <span className="hidden sm:block w-[4.75rem] shrink-0 text-[11px] text-zinc-500 tabular-nums">
                            {item.date}
                          </span>
                          <span className="flex-1 min-w-0 text-sm text-white truncate">
                            {view.labels.get(item.source) ?? item.source}
                          </span>
                          <span className="text-sm text-white tabular-nums shrink-0">{item.priced === false ? t('stats.money.sourceUnavailable', 'Unavailable') : formatUsd(item.usd)}</span>
                        </div>
                        <div className="flex items-baseline gap-3 sm:pl-[5.5rem]">
                          <span className="flex-1 min-w-0 text-[11px] text-zinc-500 leading-snug">
                            <span className="sm:hidden tabular-nums">{item.date}</span>
                            <span className="sm:hidden">{details ? ' · ' : ''}</span>
                            {details}
                          </span>
                          {url && proofId ? (
                            <a
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] text-zinc-400 hover:text-white transition-colors shrink-0"
                              title={
                                item.ref!.tx
                                  ? proofId
                                  : t('stats.taxLedger.contractProof', 'Every claim that day is in this contract’s event log: {{address}}', {
                                      address: proofId,
                                    })
                              }
                            >
                              {item.ref!.chain === 'bsc' ? 'BscScan' : 'BaseScan'}
                              <span className="hidden sm:inline font-mono">{shortHash(proofId)}</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          ) : (
                            <span className="text-[11px] text-zinc-600 shrink-0">
                              {t('stats.ledger.private', 'off-chain record')}
                            </span>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}

              {view.items.length > shown && (
                <button
                  type="button"
                  onClick={() => setShown((n) => n + PAGE * 4)}
                  className="w-full text-xs text-zinc-300 hover:text-white bg-zinc-800/50 hover:bg-zinc-800 border border-zinc-800 rounded-lg px-3 py-2 transition-colors tabular-nums"
                >
                  {t('stats.ledger.more', 'Show more ({{left}} left)', {
                    left: (view.items.length - shown).toLocaleString('en-US'),
                  })}
                </button>
              )}

              {/* The wallets and contracts the entries move between, so a reader
                  can audit them directly instead of one transaction at a time. */}
              <div className="pt-2">
                <div className="text-xs font-semibold text-white mb-1.5">
                  {t('stats.ledger.addresses', 'Addresses to check')}
                </div>
                <ul className="space-y-1">
                  {ledger.addresses.map((a) => (
                    <li key={`${a.label}-${a.address}`} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs min-w-0">
                      <span className="text-zinc-400 w-full sm:w-auto sm:flex-1 min-w-0">{a.label}</span>
                      {a.chains.map((chain) => (
                        <a
                          key={chain}
                          href={`${ledger.explorers[chain]}/address/${a.address}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 font-mono text-zinc-300 hover:text-white transition-colors shrink-0"
                          title={a.address}
                        >
                          {chain === 'bsc' ? 'BSC' : 'Base'} {shortHash(a.address)}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ))}
                    </li>
                  ))}
                </ul>
              </div>

              {tax && ledger.notes && ledger.notes.length > 0 && (
                <ul className="space-y-1 text-[11px] text-zinc-500 leading-relaxed">
                  {ledger.notes.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              )}

              <p className="text-[11px] text-zinc-500 leading-relaxed">
                {!tax && t(
                  'stats.ledger.footnote',
                  'On-chain entries link to the transaction itself. Card payments and plan invoices have no public record, so they appear as each day’s total and how many payments made it up. Amounts in USD use the price on the day for history and today’s price for live DHB payments, as described under “What is counted”.',
                )}{' '}
                {view.unavailable.length > 0 &&
                  t('stats.ledger.missing', 'Not in this ledger right now because they could not be read: {{sources}}.', {
                    sources: view.unavailable.map((s) => s.label).join(', '),
                  })}{' '}
                <a
                  href={endpoint}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-zinc-400 hover:text-white underline underline-offset-2"
                >
                  {t('stats.ledger.raw', 'Raw JSON')}
                </a>
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
