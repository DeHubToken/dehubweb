/**
 * Santa Snake — all-time leaderboard.
 * ===================================
 * Backed by the `santa_snake_scores` Supabase table (one row per wallet, holding
 * that player's best run). Reads are direct — the board is public. Writes go
 * through the `santa-score` edge function, which verifies the DeHub token and
 * writes only for that wallet. Every call is defensively wrapped so the game
 * never throws — the board simply stays empty if anything is unavailable.
 */
import { supabase } from '@/integrations/supabase/client';
import { dehubAuthHeaders } from '@/lib/ai-invoke';

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
  // Writes go through the santa-score function: it takes the wallet off the
  // verified DeHub token and only keeps a run that beats that wallet's best.
  // The table no longer accepts direct writes.
  const headers = dehubAuthHeaders();
  if (!headers['x-dehub-token']) return false;
  try {
    const { data, error } = await supabase.functions.invoke<{ ok?: boolean; improved?: boolean }>(
      'santa-score',
      {
        body: { score: Math.round(params.score), username: params.username || null },
        headers,
      },
    );
    return !error && data?.improved === true;
  } catch {
    return false;
  }
}

export function shortWallet(addr?: string | null): string {
  if (!addr) return 'anon';
  return addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}
