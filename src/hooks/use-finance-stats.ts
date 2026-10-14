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

export const FINANCE_STATS_ENDPOINT = 'https://dehub.io/api/finance-stats';

export type FinanceKind = 'revenue' | 'cost';

export interface FinanceSource {
  id: string;
  label: string;
  kind: FinanceKind;
  /** `buys`, `fees` and `tax` for revenue; `compute`, `ai_tools`, `infrastructure`, `payments` for costs. */
  group: string;
  origin: 'database' | 'api' | 'digitalocean' | 'stripe' | 'config' | 'chain' | 'estimate';
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
  /**
   * Where the original token's trading tax went in 2021–22. Fixed history, so
   * it does not follow the page's range. Absent from older deploys.
   */
  taxSplit?: TaxSplit;
  provenance: {
    endpoint: string;
    timezone: 'UTC';
    conversion: string;
    excluded: string[];
  };
}

/** All amounts in BNB as paid, and in USD at that day's BNB price. */
export interface TaxSplit {
  period: { from: string; to: string };
  /** The tax BNB that went to DeHub operations: what reached the operations wallets, less what they passed on to holders. */
  team: { bnb: number; usd: number; grossBnb: number; passedOnBnb: number; payouts: number };
  /** BNB spent buying DeHub back from the pool and sending it to the burn address. */
  burned: { bnb: number; usd: number; tokens: number; buybacks: number; firstDay: string; lastDay: string };
  /** BNB holders and stakers claimed from the rewards contract. */
  shared: {
    bnb: number;
    usd: number;
    holderBnb: number;
    stakerBnb: number;
    holderClaims: number;
    stakerClaims: number;
    wallets: number;
    firstDay: string;
    lastDay: string;
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
  /** The transaction, or for a day's total of many events, the contract that logged them. */
  ref?: { chain: ProofChain; tx?: string; address?: string };
  note?: string;
  /** Wallet movements stay visible but do not count as fresh revenue. */
  counted?: boolean;
  /** False when no historical USD quote is available. */
  priced?: boolean;
}

export interface FinanceLedger {
  ok: true;
  fetchedAt: string;
  currency: 'USD';
  sources: { id: string; label: string; status: 'ok' | 'unavailable'; note: string }[];
  explorers: Record<ProofChain, string>;
  addresses: { label: string; address: string; chains: ProofChain[] }[];
  /** Plain-language notes on how the lines were traced (token-tax ledger only). */
  notes?: string[];
  /** Newest first. */
  items: LedgerItem[];
}

/** `ledger`: every line behind revenue. `tax`: every line behind the token-tax split. */
export type LedgerView = 'ledger' | 'tax';

export function financeLedgerEndpoint(view: LedgerView): string {
  return `${FINANCE_STATS_ENDPOINT}?view=${view}`;
}

export const FINANCE_LEDGER_ENDPOINT = financeLedgerEndpoint('ledger');

async function fetchFinanceLedger(view: LedgerView): Promise<FinanceLedger> {
  const res = await fetch(financeLedgerEndpoint(view), { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`finance ledger endpoint returned ${res.status}`);
  const body = (await res.json()) as FinanceLedger;
  if (!body || body.ok !== true || !Array.isArray(body.items)) {
    throw new Error('finance ledger endpoint returned an unexpected shape');
  }
  return body;
}

/** Only fetched once someone opens the ledger — it is every line behind the totals. */
export function useFinanceLedger(enabled: boolean, view: LedgerView = 'ledger') {
  return useQuery({
    queryKey: ['finance-ledger', view],
    queryFn: () => fetchFinanceLedger(view),
    enabled,
    staleTime: 4 * 60_000,
    retry: 1,
  });
}
