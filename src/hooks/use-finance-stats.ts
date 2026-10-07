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
  /** `buys` and `fees` for revenue; `compute`, `ai_tools`, `infrastructure` for costs. */
  group: string;
  origin: 'database' | 'api' | 'digitalocean' | 'stripe' | 'config';
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
