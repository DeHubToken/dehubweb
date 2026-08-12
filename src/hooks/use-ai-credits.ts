/**
 * AI credits, denominated in DHB.
 * ===============================
 * Balance and prices both come from the server. The client deliberately does
 * not work out what a generation costs: the edge function that debits the
 * balance is the one that prices the job, so the number shown in a paywall is
 * the number that will actually be charged.
 *
 * That replaces the old arrangement, where each modal computed a price from
 * src/constants, sent DHB to the treasury itself, and then called a generate
 * function that never checked whether any of it had happened.
 */

import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getAuthToken } from '@/lib/api/dehub';
import { useAuth } from '@/contexts/AuthContext';

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

function authHeaders(walletAddress: string | null): Record<string, string> {
  const token = getAuthToken();
  if (!walletAddress || !token) return {};
  return { 'x-wallet-address': walletAddress.toLowerCase(), 'x-dehub-token': token };
}

async function callCredits<T>(body: Record<string, unknown>, walletAddress: string | null): Promise<T> {
  const { data, error } = await supabase.functions.invoke('ai-credits', {
    body,
    headers: authHeaders(walletAddress),
  });
  if (error) throw error;
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
  return data as T;
}

/** Current balance in DHB, plus its value at the peg. */
export function useAiCredits() {
  const { walletAddress } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['ai-credits', walletAddress],
    queryFn: () => callCredits<{ balanceDhb: number; balanceUsd: number }>(
      { action: 'balance' },
      walletAddress,
    ),
    enabled: !!walletAddress,
    staleTime: 30_000,
  });

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['ai-credits', walletAddress] });
  }, [queryClient, walletAddress]);

  return {
    balanceDhb: query.data?.balanceDhb ?? 0,
    balanceUsd: query.data?.balanceUsd ?? 0,
    isLoading: query.isLoading,
    refresh,
  };
}

/**
 * Server quote for a job. Keyed on every input that moves the price, so
 * changing model, duration, texture quality or batch size re-quotes.
 */
export function useJobQuote(request: QuoteRequest | null, enabled = true) {
  const { walletAddress } = useAuth();

  const query = useQuery({
    queryKey: [
      'ai-quote',
      request?.kind,
      request?.modelId,
      request?.durationSeconds,
      request?.quality,
      request?.quantity,
    ],
    queryFn: () => callCredits<{ priceDhb: number; priceUsd: number }>(
      { action: 'quote', ...request },
      walletAddress,
    ),
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

/**
 * Credit an on-chain DHB transfer to the AI treasury.
 *
 * The caller sends the DHB and passes the tx hash; the function verifies the
 * transfer independently. Replaying a hash is rejected, and a hash belonging to
 * someone else credits them rather than you.
 */
export function useCreditTopUp() {
  const { walletAddress } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (txHash: string) => callCredits<{ creditedDhb: number; balanceDhb: number }>(
      { action: 'topup', txHash },
      walletAddress,
    ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-credits', walletAddress] });
    },
  });
}

// The free starter + daily allowance claim deliberately does NOT live here as
// a hook. useClaimFreeCredits did, and nothing ever mounted it — the grant
// was unreachable for as long as it existed. The claim now rides the app
// shell as a plain call (src/lib/ai-credit-claim.ts), so it cannot be
// orphaned by a surface refactor again.

/** Shared formatting so every credit surface reads the same. */
export function formatDhb(amount: number): string {
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(2)}M`;
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(1)}K`;
  return Math.round(amount).toLocaleString();
}
