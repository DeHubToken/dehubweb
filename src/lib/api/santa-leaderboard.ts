/**
 * Santa Snake — all-time leaderboard.
 * ===================================
 * Backed by the `santa_snake_scores` Supabase table (one row per wallet, holding
 * that player's best run). Wallet-native app → permissive RLS, same pattern as
 * ai_conversations. Every call is defensively wrapped: if the table does not exist
 * yet (migration not applied) the reads return [] and writes return false, so the
 * game never throws — the board simply stays empty until the table is live.
 */
import { supabase } from '@/integrations/supabase/client';

export interface SantaScore {
  wallet_address: string;
  username: string | null;
  score: number;
}

// The generated Database type doesn't include this table (managed via migration),
// so reach it through a loosely-typed handle — same escape hatch leaderboard.ts uses.
const scores = () =>
  (supabase as unknown as { from: (t: string) => any }).from('santa_snake_scores');

export async function fetchSantaLeaderboard(limit = 8): Promise<SantaScore[]> {
  try {
    const { data, error } = await scores()
      .select('wallet_address, username, score')
      .order('score', { ascending: false })
      .order('updated_at', { ascending: true }) // ties: whoever got there first ranks higher
      .limit(limit);
    if (error || !Array.isArray(data)) return [];
    return data as SantaScore[];
  } catch {
    return [];
  }
}

export async function submitSantaScore(params: {
  walletAddress: string;
  username: string | null;
  score: number;
}): Promise<boolean> {
  const wallet = params.walletAddress?.toLowerCase();
  if (!wallet || !Number.isFinite(params.score) || params.score <= 0) return false;
  try {
    // Only overwrite the stored row when this run beats the player's own best.
    const { data: existing } = await scores()
      .select('score')
      .eq('wallet_address', wallet)
      .maybeSingle();
    if (existing && typeof existing.score === 'number' && existing.score >= params.score) {
      return false;
    }
    const { error } = await scores().upsert(
      {
        wallet_address: wallet,
        username: params.username || null,
        score: Math.round(params.score),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'wallet_address' }
    );
    return !error;
  } catch {
    return false;
  }
}

export function shortWallet(addr?: string | null): string {
  if (!addr) return 'anon';
  return addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}
