import { apiCall } from './core';

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

export async function getLeaderboard(
  sort: LeaderboardSortMode = 'holdings',
  period: LeaderboardPeriod = 'all'
): Promise<LeaderboardResponse> {
  // For "all time", call the new /api/leaderboard endpoint directly
  if (period === 'all') {
    const params: Record<string, string> = { sort };
    const raw = await apiCall<any>("/api/leaderboard", { params });
    // The API may return { result: [...] } or { result: { byWalletBalance: [...] } }
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

  // For time-based periods (day/week/month/year), try server cache with timeout, fall back to API
  try {
    const { supabase } = await import('@/integrations/supabase/client');
    
    const cachePromise = supabase
      .from('leaderboard_cache')
      .select('data, updated_at')
      .eq('sort_mode', sort)
      .eq('period', period)
      .single();
    
    const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000));
    
    const cached = await Promise.race([cachePromise, timeoutPromise]);
    
    if (cached && 'data' in cached && !cached.error && cached.data?.data) {
      console.log(`[Leaderboard] Using cached data from ${cached.data.updated_at}`);
      return cached.data.data as unknown as LeaderboardResponse;
    }
  } catch (cacheError) {
    console.warn('[Leaderboard] Cache unavailable, falling back to API:', cacheError);
  }
  
  const params: Record<string, string> = { sort, period };
  return apiCall<LeaderboardResponse>("/api/leaderboard", { params });
}
