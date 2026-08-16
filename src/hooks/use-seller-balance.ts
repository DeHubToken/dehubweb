/**
 * Seller Balance
 * ==============
 * Card earnings for the signed-in wallet: what is still inside the 30-day hold,
 * and what can be withdrawn now.
 *
 * Served by the `store-payouts` edge function rather than read from
 * `seller_ledger` directly. The table does have a SELECT policy, but it resolves
 * the caller through `get_request_wallet_address()`, which reads an unsigned
 * request header — anyone could read anyone's earnings by setting it. Under
 * `requireDeHubAuth` the wallet comes off a verified DeHub token instead. Same
 * reason `use-ai-credits.ts` fetches its balance through a function.
 */

import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { getAuthToken } from '@/lib/api/dehub/core';
import { toast } from 'sonner';

export interface SellerBalance {
  pendingCents: number;
  availableCents: number;
  pendingUsd: number;
  availableUsd: number;
  lifetimeEarnedUsd: number;
  lifetimeWithdrawnUsd: number;
  nextReleaseAt: string | null;
  minWithdrawalUsd: number;
  payoutsEnabled: boolean;
  onboardingStarted: boolean;
  requirementsDue: string[] | null;
  hasActivity: boolean;
  holdDays: number;
}

/** The wallet page's own convention — never formatDhb's K/M abbreviation. */
export function formatUsd(value: number): string {
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function authHeaders(walletAddress: string | null): Record<string, string> {
  const token = getAuthToken();
  if (!walletAddress || !token) return {};
  return { 'x-wallet-address': walletAddress.toLowerCase(), 'x-dehub-token': token };
}

async function callPayouts<T>(
  body: Record<string, unknown>,
  walletAddress: string | null,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke('store-payouts', {
    body,
    headers: authHeaders(walletAddress),
  });
  // supabase-js only hands back a body on 2xx and buries the rest in
  // error.context — without this the user sees "non-2xx status code" instead of
  // "That is more than your available balance".
  if (error) {
    let detail = '';
    try {
      const context = (error as { context?: Response }).context;
      if (context) detail = String((await context.json())?.error || '');
    } catch {
      // Not JSON — fall back to the transport message.
    }
    throw new Error(detail || error.message || 'Request failed');
  }
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
  return data as T;
}

export function useSellerBalance() {
  const { walletAddress, isAuthenticated } = useAuth();

  const query = useQuery({
    queryKey: ['seller-balance', walletAddress],
    queryFn: () => callPayouts<SellerBalance>({ action: 'balance' }, walletAddress),
    enabled: !!walletAddress && isAuthenticated,
    staleTime: 30_000,
    // A seller with no card history gets a 200 with hasActivity false, not an
    // error — so a failure here is genuinely exceptional and worth one retry.
    retry: 1,
  });

  return {
    balance: query.data ?? null,
    pendingUsd: query.data?.pendingUsd ?? 0,
    availableUsd: query.data?.availableUsd ?? 0,
    hasActivity: query.data?.hasActivity ?? false,
    payoutsEnabled: query.data?.payoutsEnabled ?? false,
    nextReleaseAt: query.data?.nextReleaseAt ?? null,
    isLoading: query.isLoading,
    refresh: query.refetch,
  };
}

/** Onboarding, the Express dashboard, and withdrawal. */
export function useSellerPayoutActions() {
  const { walletAddress } = useAuth();
  const queryClient = useQueryClient();

  const openExternal = (url: string) => {
    // Full navigation rather than window.open: an in-app browser or a popup
    // blocker silently swallows the second, and Stripe onboarding is the step
    // a seller cannot skip.
    window.location.assign(url);
  };

  const onboard = useMutation({
    mutationFn: () => callPayouts<{ url: string }>({ action: 'onboard' }, walletAddress),
    onSuccess: (data) => openExternal(data.url),
    onError: (e: Error) => toast.error(e.message),
  });

  const openDashboard = useMutation({
    mutationFn: () => callPayouts<{ url: string }>({ action: 'dashboard' }, walletAddress),
    onSuccess: (data) => openExternal(data.url),
    onError: (e: Error) => toast.error(e.message),
  });

  const withdraw = useMutation({
    mutationFn: (amountCents: number) =>
      callPayouts<{ success: boolean; amountUsd: number }>(
        { action: 'withdraw', amountCents },
        walletAddress,
      ),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['seller-balance'] });
      toast.success(`${formatUsd(data.amountUsd)} on its way to your bank`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return { onboard, openDashboard, withdraw };
}
