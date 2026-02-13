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
  onChainVerified?: boolean;
}

export type LeaderboardSortMode = 'holdings' | 'sentTips' | 'receivedTips' | 'followers' | 'likes' | 'subscribers';
export type LeaderboardPeriod = 'day' | 'week' | 'month' | 'year' | 'all';

/**
 * Fetch on-chain tip data from tip_leaderboard_cache and merge with user info from the DeHub API.
 */
async function getOnChainTipLeaderboard(
  sort: 'sentTips' | 'receivedTips',
  period: LeaderboardPeriod
): Promise<LeaderboardResponse | null> {
  try {
    const { supabase } = await import('@/integrations/supabase/client');
    
    const column = sort === 'sentTips' ? 'sent_total' : 'received_total';
    const cachePeriod = period === 'all' ? 'all' : period;
    
    const { data: tipData, error } = await supabase
      .from('tip_leaderboard_cache')
      .select('wallet_address, sent_total, received_total, chain_id')
      .eq('period', cachePeriod)
      .gt(column, 0)
      .order(column, { ascending: false })
      .limit(200);
    
    if (error || !tipData || tipData.length === 0) {
      console.log('[Leaderboard] No on-chain tip data available, falling back to API');
      return null;
    }

    // Aggregate across chains (Base + BNB)
    const walletAgg: Record<string, { sent: number; received: number }> = {};
    for (const row of tipData) {
      const w = row.wallet_address.toLowerCase();
      if (!walletAgg[w]) walletAgg[w] = { sent: 0, received: 0 };
      walletAgg[w].sent += Number(row.sent_total);
      walletAgg[w].received += Number(row.received_total);
    }

    // Get user info from DeHub API (all-time holdings has usernames)
    let userMap: Record<string, LeaderboardEntry> = {};
    try {
      const apiData = await apiCall<LeaderboardResponse>("/api/leaderboard", { params: { sort: 'holdings' } });
      for (const entry of apiData.result?.byWalletBalance || []) {
        userMap[entry.account.toLowerCase()] = entry;
      }
    } catch {
      console.warn('[Leaderboard] Could not fetch user info from API');
    }

    // Build merged entries
    const entries: LeaderboardEntry[] = Object.entries(walletAgg)
      .map(([wallet, agg]) => {
        const userInfo = userMap[wallet];
        return {
          account: userInfo?.account || wallet,
          total: userInfo?.total || 0,
          username: userInfo?.username,
          userDisplayName: userInfo?.userDisplayName,
          avatarUrl: userInfo?.avatarUrl,
          sentTips: Math.round(agg.sent),
          receivedTips: Math.round(agg.received),
          followers: userInfo?.followers,
          likes: userInfo?.likes,
          subscribers: userInfo?.subscribers,
          badgeBalance: userInfo?.badgeBalance,
        };
      })
      .sort((a, b) => {
        const aVal = sort === 'sentTips' ? a.sentTips : a.receivedTips;
        const bVal = sort === 'sentTips' ? b.sentTips : b.receivedTips;
        return bVal - aVal;
      });

    // For time-based periods, compute delta as the period value itself (it IS the delta)
    if (period !== 'all') {
      for (const entry of entries) {
        entry.delta = sort === 'sentTips' ? entry.sentTips : entry.receivedTips;
      }
    }

    console.log(`[Leaderboard] On-chain tip data: ${entries.length} wallets for ${sort}/${period}`);
    
    return {
      result: { byWalletBalance: entries },
      hasHistoricalData: true,
      onChainVerified: true,
    };
  } catch (e) {
    console.warn('[Leaderboard] On-chain tip lookup failed:', e);
    return null;
  }
}

export async function getLeaderboard(
  sort: LeaderboardSortMode = 'holdings',
  period: LeaderboardPeriod = 'all'
): Promise<LeaderboardResponse> {
  // For tip categories, try on-chain data first
  if (sort === 'sentTips' || sort === 'receivedTips') {
    const onChainResult = await getOnChainTipLeaderboard(sort, period);
    if (onChainResult) return onChainResult;
  }

  // Try to get from server cache first
  try {
    const { supabase } = await import('@/integrations/supabase/client');
    
    const { data: cached, error } = await supabase
      .from('leaderboard_cache')
      .select('data, updated_at')
      .eq('sort_mode', sort)
      .eq('period', period)
      .single();
    
    if (!error && cached?.data) {
      console.log(`[Leaderboard] Using cached data from ${cached.updated_at}`);
      return cached.data as unknown as LeaderboardResponse;
    }
  } catch (cacheError) {
    console.warn('[Leaderboard] Cache unavailable, falling back to API:', cacheError);
  }
  
  const params: Record<string, string> = { sort };
  if (period !== 'all') {
    params.period = period;
  }
  
  return apiCall<LeaderboardResponse>("/api/leaderboard", { params });
}
