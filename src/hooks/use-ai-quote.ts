/**
 * What a generation costs, in DHB.
 * ================================
 * The client deliberately does not work out the price: the edge function that
 * takes the money is the one that quotes it, so the number shown in a paywall
 * is the number that will actually be charged.
 *
 * There is no balance to read alongside it any more. A job is paid for by a
 * live DHB transfer at the moment it runs — see src/lib/ai-payment.ts.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/** Matches the gateway peg. Display only — the server prices every charge. */
export const DHB_USD_PEG = 0.001;

export type JobKind = 'image' | 'video' | 'model3d' | 'tool';

export interface QuoteRequest {
  kind: JobKind;
  modelId: string;
  durationSeconds?: number;
  quality?: 'none' | 'standard' | 'HD';
  quantity?: number;
}

/**
 * Price one job, outside a component.
 *
 * For the flows that pay without ever opening a paywall — the poster builder
 * runs straight from its own dialog — and used by the hook below so both read
 * the same number from the same place.
 */
export async function fetchJobQuote(request: QuoteRequest): Promise<{ priceDhb: number; priceUsd: number }> {
  const { data, error } = await supabase.functions.invoke('ai-quote', { body: { ...request } });
  if (error) throw error;
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
  return data as { priceDhb: number; priceUsd: number };
}

/**
 * Server quote for a job. Keyed on every input that moves the price, so
 * changing model, duration, texture quality or batch size re-quotes.
 */
export function useJobQuote(request: QuoteRequest | null, enabled = true) {
  const query = useQuery({
    queryKey: [
      'ai-quote',
      request?.kind,
      request?.modelId,
      request?.durationSeconds,
      request?.quality,
      request?.quantity,
    ],
    queryFn: () => fetchJobQuote(request!),
    enabled: enabled && !!request?.modelId,
    staleTime: 5 * 60_000,
  });

  return {
    priceDhb: query.data?.priceDhb ?? 0,
    priceUsd: query.data?.priceUsd ?? 0,
    isLoading: query.isLoading,
    error: query.error instanceof Error ? query.error.message : null,
  };
}

/** Shared formatting so every price reads the same. */
export function formatDhb(amount: number): string {
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(2)}M`;
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(1)}K`;
  return Math.round(amount).toLocaleString();
}
