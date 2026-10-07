/**
 * The arithmetic behind finance-stats, kept free of Deno and network calls so
 * the same file is unit-tested from vitest (src/test/finance-ledger.test.ts).
 *
 * Everything is reduced to one shape — an amount in USD on a UTC day against a
 * named source — and the series is built from that alone. A source that cannot
 * be read contributes nothing and is reported as unavailable; it is never
 * filled with an estimate.
 */

import { DHB_USD_PEG, MARKUP, MARKUP_OVERRIDES, providerCostUsd, type JobKind } from '../_shared/ai-pricing.ts';

export type FinanceKind = 'revenue' | 'cost';

export interface LedgerEntry {
  /** UTC calendar day, `YYYY-MM-DD`. */
  date: string;
  source: string;
  usd: number;
}

export interface FixedCostItem {
  id: string;
  label: string;
  group: string;
  usdMonthly: number;
  since: string;
  until?: string;
}

export interface FinanceDay {
  date: string;
  revenue: Record<string, number>;
  costs: Record<string, number>;
}

const DAY_MS = 86_400_000;

export function dayKey(value: Date | string | number): string {
  return new Date(value).toISOString().slice(0, 10);
}

export function addDays(day: string, days: number): string {
  return dayKey(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS);
}

/** Every day from `from` to `to`, inclusive. Empty when `from` is after `to`. */
export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/**
 * A monthly bill spread over its days: each day carries the share of the
 * month it belongs to, so a 30-day month and a 31-day month both add up to
 * exactly one month's price.
 */
export function spreadFixedCost(item: FixedCostItem, today: string): LedgerEntry[] {
  const end = item.until && item.until < today ? item.until : today;
  return daysBetween(item.since, end).map((date) => ({
    date,
    source: item.id,
    usd: item.usdMonthly / daysInMonth(date.slice(0, 7)),
  }));
}

/**
 * One invoice for a calendar month, spread evenly across it. For the month
 * still running, pass `throughDay`: the month-to-date amount is spread over
 * the days that have actually elapsed instead of the whole month.
 */
export function spreadMonthAmount(source: string, month: string, usd: number, throughDay?: string): LedgerEntry[] {
  const first = `${month}-01`;
  const last = `${month}-${String(daysInMonth(month)).padStart(2, '0')}`;
  const end = throughDay && throughDay < last ? throughDay : last;
  const days = daysBetween(first, end);
  if (!days.length || !Number.isFinite(usd)) return [];
  return days.map((date) => ({ date, source, usd: usd / days.length }));
}

/**
 * What the provider charged for one paid generation, recovered from what the
 * creator was charged for it.
 *
 * Retail is provider cost x (1 + markup) converted at the gateway peg and
 * rounded up to whole DHB (see _shared/ai-pricing.ts), so dividing the markup
 * back out gives the provider cost to within that rounding. Using the price
 * the job actually paid, rather than today's table, keeps an old job at the
 * cost it had on the day it ran.
 */
export function jobProviderCostUsd(priceDhb: number, model: string): number {
  if (!Number.isFinite(priceDhb) || priceDhb <= 0) return 0;
  const markup = MARKUP_OVERRIDES[model] ?? MARKUP;
  return (priceDhb * DHB_USD_PEG) / (1 + markup);
}

/** Provider cost of a free generation, which has no price to work back from. */
export function freeJobProviderCostUsd(model: string): number | null {
  for (const kind of ['image', 'video', 'model3d', 'tool'] as JobKind[]) {
    const cost = providerCostUsd(kind, model);
    if (cost != null) return cost;
  }
  return null;
}

/**
 * List price per million tokens for the models the text router pays for.
 *
 * Only `gateway` and `direct` routes are ever priced. A `free` route is a
 * provider free tier and is counted as zero — which is a claim about the tier,
 * not proof of a zero bill (see docs/provider-usage.md). A paid model missing
 * from this table is counted as unpriced and reported, never guessed.
 */
export const TOKEN_PRICES_PER_M: Record<string, { input: number; output: number; perRequest?: number }> = {
  'gemini-2.5-flash': { input: 0.3, output: 2.5 },
  'gemini-2.5-flash-lite': { input: 0.1, output: 0.4 },
  'gemini-2.5-pro': { input: 1.25, output: 10 },
  sonar: { input: 1, output: 1, perRequest: 0.005 },
  'sonar-pro': { input: 3, output: 15, perRequest: 0.006 },
};

export interface UsageRow {
  day: string;
  route: string;
  served_model: string | null;
  requested_model: string | null;
  attempts: number;
  input_tokens: number;
  output_tokens: number;
}

/** USD for one usage row, `0` for free routes, `null` when the model has no price. */
export function usageCostUsd(row: UsageRow): number | null {
  if (row.route === 'free') return 0;
  const raw = (row.served_model || row.requested_model || '').toLowerCase();
  const model = raw.includes('/') ? raw.slice(raw.lastIndexOf('/') + 1) : raw;
  const price = TOKEN_PRICES_PER_M[model];
  if (!price) {
    // An attempt that reported no tokens cost nothing to price.
    return Number(row.input_tokens) + Number(row.output_tokens) > 0 ? null : 0;
  }
  return (
    (Number(row.input_tokens) / 1e6) * price.input +
    (Number(row.output_tokens) / 1e6) * price.output +
    (price.perRequest ?? 0) * (Number(row.attempts) || 0)
  );
}

/**
 * Fold ledger entries into a gap-filled daily series running from the first
 * entry to `today`. Values keep four decimals rather than cents: a day of
 * metered tokens is often a fraction of a cent, and rounding every day to zero
 * would lose a month of it.
 */
export function buildSeries(
  entries: { kind: FinanceKind; entry: LedgerEntry }[],
  today: string,
): FinanceDay[] {
  const real = entries.filter(({ entry }) => Number.isFinite(entry.usd) && entry.usd !== 0 && entry.date <= today);
  if (!real.length) return [];
  const first = real.reduce((min, { entry }) => (entry.date < min ? entry.date : min), today);

  const byDay = new Map<string, FinanceDay>(
    daysBetween(first, today).map((date) => [date, { date, revenue: {}, costs: {} }]),
  );
  for (const { kind, entry } of real) {
    const day = byDay.get(entry.date);
    if (!day) continue;
    const bucket = kind === 'revenue' ? day.revenue : day.costs;
    bucket[entry.source] = (bucket[entry.source] ?? 0) + entry.usd;
  }

  const days = [...byDay.values()];
  for (const day of days) {
    for (const bucket of [day.revenue, day.costs]) {
      for (const key of Object.keys(bucket)) bucket[key] = Math.round(bucket[key] * 10_000) / 10_000;
    }
  }
  return days;
}
