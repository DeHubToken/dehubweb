import { apiCall } from './core';
import { supabase } from '@/integrations/supabase/client';

export interface LeaderboardEntry {
  account: string;
  total: number;
  username?: string;
  userDisplayName?: string;
  avatarUrl?: string;
  sentTips: number;
  receivedTips: number;
  followers?: number;
  likes?: number;
  subscribers?: number;
  delta?: number;
  badgeBalance?: number;
}

export interface LeaderboardResponse {
  result: {
    byWalletBalance: LeaderboardEntry[];
  };
  hasHistoricalData?: boolean;
}

export type LeaderboardSortMode = 'holdings' | 'sentTips' | 'receivedTips' | 'followers' | 'likes' | 'subscribers';
export type LeaderboardPeriod = 'day' | 'week' | 'month' | 'year' | 'all';

const CACHE_TIMEOUT_MS = 2500;
const CACHE_CIRCUIT_BREAKER_MS = 60_000;
let skipCacheUntil = 0;

// ── Background RPC refresh logic ────────────────────────────────────
const STALE_THRESHOLD_MS = 4 * 60 * 60_000; // 4 hours
let refreshInFlight = new Set<string>();

async function triggerBackgroundRefresh(sort: LeaderboardSortMode, period: LeaderboardPeriod) {
  const key = `${sort}/${period}`;
  if (refreshInFlight.has(key)) return;
  refreshInFlight.add(key);

  try {
    console.log(`[Leaderboard] Triggering background RPC refresh for ${key}...`);
    const { data: { publicUrl } } = supabase.storage.from('stories').getPublicUrl('');
    const baseUrl = publicUrl.replace('/storage/v1/object/public/stories/', '');
    const fnUrl = `${baseUrl}/functions/v1/refresh-leaderboard-cache`;

    await fetch(fnUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'light',
        sorts: [sort],
        periods: [period],
      }),
    });
    console.log(`[Leaderboard] Background RPC refresh completed for ${key}`);
  } catch (err) {
    console.warn(`[Leaderboard] Background refresh failed for ${key}:`, err);
  } finally {
    // Allow re-trigger after 5 minutes
    setTimeout(() => refreshInFlight.delete(key), 5 * 60_000);
  }
}

const isNetworkFailure = (message: string): boolean => {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('failed to fetch') ||
    normalized.includes('network') ||
    normalized.includes('timed out') ||
    normalized.includes('timeout') ||
    normalized.includes('abort')
  );
};

export async function getLeaderboard(
  sort: LeaderboardSortMode = 'holdings',
  period: LeaderboardPeriod = 'all'
): Promise<LeaderboardResponse> {
  // Try server cache first for all periods (cache has enriched on-chain balances)
  const fetchCache = async (attempt = 1): Promise<LeaderboardResponse | null> => {
    if (Date.now() < skipCacheUntil) {
      return null;
    }

    try {
      const { supabase } = await import('@/integrations/supabase/client');

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), CACHE_TIMEOUT_MS);

      let cached: any;

      try {
        cached = await supabase
          .from('leaderboard_cache')
          .select('data, updated_at')
          .eq('sort_mode', sort)
          .eq('period', period)
          .abortSignal(controller.signal)
          .single();
      } finally {
        clearTimeout(timeoutId);
      }

      if (!cached.error && cached.data?.data) {
        console.log(`[Leaderboard] Using cached data from ${cached.data.updated_at}`);
        return cached.data.data as unknown as LeaderboardResponse;
      }

      const errorMessage = cached.error?.message || '';
      if (isNetworkFailure(errorMessage)) {
        skipCacheUntil = Date.now() + CACHE_CIRCUIT_BREAKER_MS;
      }

      // Retry once on 503 errors
      const is503 = errorMessage.includes('schema cache');
      if (is503 && attempt === 1) {
        console.warn('[Leaderboard] Got 503, retrying in 2s...');
        await new Promise(r => setTimeout(r, 2000));
        return fetchCache(2);
      }

      return null;
    } catch (cacheError) {
      const message = cacheError instanceof Error ? cacheError.message : String(cacheError || '');
      if (isNetworkFailure(message)) {
        skipCacheUntil = Date.now() + CACHE_CIRCUIT_BREAKER_MS;
      }
      console.warn('[Leaderboard] Cache unavailable:', cacheError);
      return null;
    }
  };

  const cached = await fetchCache();
  if (cached) return cached;

  // For non-"all" periods, the API doesn't support period filtering
  // so return empty rather than incorrect all-time data
  if (period !== 'all') {
    console.warn(`[Leaderboard] Cache unavailable for period="${period}", returning empty (API has no period support)`);
    return { result: { byWalletBalance: [] }, hasHistoricalData: false };
  }

  // Fall back to direct API call (only for "all" period)
  const params: Record<string, string> = { sort };
  const raw = await apiCall<any>('/api/leaderboard', { params });
  const entries = Array.isArray(raw?.result)
    ? raw.result
    : Array.isArray(raw?.result?.byWalletBalance)
      ? raw.result.byWalletBalance
      : Array.isArray(raw) ? raw : [];
  return {
    result: { byWalletBalance: entries },
    hasHistoricalData: true,
  };
}
