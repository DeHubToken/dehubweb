/**
 * Revenue and costs
 * =================
 * Reads the finance-stats edge function — the one place DeHub's money is added
 * up: what people buy in the app, the fees kept on payments between people,
 * and what running the platform costs. Every figure is a daily total in USD.
 *
 * Companion to use-site-stats (traffic) and use-user-stats (members).
 */

import { useQuery } from '@tanstack/react-query';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://aigxuutjaqsywioxjefr.supabase.co';

export const FINANCE_STATS_ENDPOINT = `${SUPABASE_URL}/functions/v1/finance-stats`;

export type FinanceKind = 'revenue' | 'cost';

export interface FinanceSource {
  id: string;
  label: string;
  kind: FinanceKind;
  /** `buys`, `fees` and `tax` for revenue; `compute`, `ai_tools`, `infrastructure`, `payments` for costs. */
  group: string;
  origin: 'database' | 'api' | 'digitalocean' | 'stripe' | 'config' | 'chain';
  /** `unavailable` means it could not be read this time — not that it was zero. */
  status: 'ok' | 'unavailable';
  note: string;
}

export interface FinanceDay {
  date: string;
  /** USD per source id. Sources with nothing that day are absent. */
  revenue: Record<string, number>;
  costs: Record<string, number>;
}

export interface FinanceStats {
  ok: true;
  fetchedAt: string;
  currency: 'USD';
  dhb: { priceUsd: number; priceSource: 'market' | 'peg'; pegUsd: number };
  sources: FinanceSource[];
  days: FinanceDay[];
  /** Plain-language caveats about this particular read, e.g. unpriced models. */
  notes: string[];
  provenance: {
    endpoint: string;
    timezone: 'UTC';
    conversion: string;
    excluded: string[];
  };
}

async function fetchFinanceStats(): Promise<FinanceStats> {
  const res = await fetch(FINANCE_STATS_ENDPOINT, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`finance stats endpoint returned ${res.status}`);

  const body = (await res.json()) as FinanceStats;
  if (!body || body.ok !== true || !Array.isArray(body.days)) {
    throw new Error('finance stats endpoint returned an unexpected shape');
  }
  return body;
}

export function useFinanceStats() {
  return useQuery({
    queryKey: ['finance-stats'],
    queryFn: fetchFinanceStats,
    // The function caches for five minutes; polling faster re-reads the same answer.
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: true,
    staleTime: 4 * 60_000,
    retry: 1,
  });
}

// ---------------------------------------------------------------------------
// The revenue ledger
// ---------------------------------------------------------------------------

export type ProofChain = 'bsc' | 'base';

/**
 * One line of the public revenue ledger: a single payment where the source
 * records payments one by one, or a day's total (with `count`) where it only
 * reports totals. `ref` is the on-chain transaction, when there is one.
 */
export interface LedgerItem {
  date: string;
  source: string;
  usd: number;
  amount?: number;
  unit?: string;
  count?: number;
  ref?: { chain: ProofChain; tx: string };
  note?: string;
}

export interface FinanceLedger {
  ok: true;
  fetchedAt: string;
  currency: 'USD';
  sources: { id: string; label: string; status: 'ok' | 'unavailable'; note: string }[];
  explorers: Record<ProofChain, string>;
  addresses: { label: string; address: string; chains: ProofChain[] }[];
  /** Newest first. */
  items: LedgerItem[];
}

export const FINANCE_LEDGER_ENDPOINT = `${FINANCE_STATS_ENDPOINT}?view=ledger`;

async function fetchFinanceLedger(): Promise<FinanceLedger> {
  const res = await fetch(FINANCE_LEDGER_ENDPOINT, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`finance ledger endpoint returned ${res.status}`);
  const body = (await res.json()) as FinanceLedger;
  if (!body || body.ok !== true || !Array.isArray(body.items)) {
    throw new Error('finance ledger endpoint returned an unexpected shape');
  }
  return body;
}

/** Only fetched once someone opens the ledger — it is every line behind the totals. */
export function useFinanceLedger(enabled: boolean) {
  return useQuery({
    queryKey: ['finance-ledger'],
    queryFn: fetchFinanceLedger,
    enabled,
    staleTime: 4 * 60_000,
    retry: 1,
  });
}
