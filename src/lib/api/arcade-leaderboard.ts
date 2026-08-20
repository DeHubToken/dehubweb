/**
 * Arcade leaderboards — the client half.
 * ======================================
 * Two games, two kinds of board, one shape on screen.
 *
 *  - A RUN board (Street Slayer) keeps each player's best attempt. It is read
 *    straight from `arcade_scores`, which is publicly readable, and written
 *    only by the `arcade-score` edge function — see {@link openRun}.
 *  - A LADDER (King's Gambit) is an Elo rating derived from the finished
 *    matches themselves by the `chess_ladder()` function. Nothing submits to
 *    it and nothing stores it; it is the games, counted.
 *
 * Both are normalised to {@link ArcadeBoardRow} here so one component can draw
 * either. Everything is defensively wrapped: until the migration is applied the
 * reads answer with an empty board rather than throwing, so the panel is empty
 * instead of the page being broken.
 */

import { supabase } from '@/integrations/supabase/client';
import { dehubAuthHeaders } from '@/lib/ai-invoke';

/** One line on a board, whichever kind of board it is. */
export interface ArcadeBoardRow {
  wallet: string;
  /** The ranked figure, formatted — "1,412" or "84%". */
  value: string;
  /** What that figure was made of — "62 games · 41W 18L 3D" or "310 HP left". */
  detail: string;
  /** Too few games for the rating to mean much yet. Ladders only. */
  provisional?: boolean;
}

// ------------------------------------------------------------------ run board

interface ArcadeScoreRow {
  wallet: string;
  score: number;
  detail: { progress?: number; life?: number } | null;
  runs: number;
}

/** Permille of the street, as a percentage a player would say out loud. */
export function formatProgress(permille: number | undefined): string {
  if (!permille) return '0%';
  return `${(permille / 10).toFixed(permille >= 1000 ? 0 : 1)}%`;
}

// The generated Database type does not carry these (both are managed by
// migration), so they are reached through a loosely-typed handle — the same
// escape hatch the chess lobby uses for `chess_records`.
const loose = () => supabase as unknown as {
  from: (t: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

export async function fetchRunBoard(game: string, limit = 10): Promise<ArcadeBoardRow[]> {
  try {
    const { data, error } = await loose()
      .from('arcade_scores')
      .select('wallet, score, detail, runs')
      .eq('game', game)
      // Ties: whoever got there first ranks higher. Same rule the index is
      // built on, so the top of the board never sorts.
      .order('score', { ascending: false })
      .order('achieved_at', { ascending: true })
      .limit(limit);
    if (error || !Array.isArray(data)) return [];

    return (data as ArcadeScoreRow[]).map((row) => ({
      wallet: row.wallet,
      value: formatProgress(row.detail?.progress),
      detail: [
        row.detail?.life ? `${row.detail.life} HP left` : 'no HP left',
        row.runs > 1 ? `best of ${row.runs} runs` : 'first run',
      ].join(' · '),
    }));
  } catch {
    return [];
  }
}

// -------------------------------------------------------------------- ladder

interface ChessLadderRow {
  wallet: string;
  rating: number;
  played: number;
  wins: number;
  losses: number;
  draws: number;
}

/** Games before a rating is treated as settled rather than still finding its level. */
const PROVISIONAL_UNDER = 5;

export async function fetchChessLadder(limit = 10): Promise<ArcadeBoardRow[]> {
  try {
    const { data, error } = await loose().rpc('chess_ladder', { p_limit: limit });
    if (error || !Array.isArray(data)) return [];

    return (data as ChessLadderRow[]).map((row) => ({
      wallet: row.wallet,
      value: String(row.rating),
      detail: `${row.played} game${row.played === 1 ? '' : 's'} · ${row.wins}W ${row.losses}L ${row.draws}D`,
      provisional: row.played < PROVISIONAL_UNDER,
    }));
  } catch {
    return [];
  }
}

// --------------------------------------------------------------- reporting a run

/**
 * What the server said about a finished run.
 *
 * `scored: false` is not a failure — it is a run that did not get far enough to
 * make the board, and the panel says so rather than pretending it counted.
 */
export interface RunResult {
  scored: boolean;
  improved?: boolean;
  rank?: number;
  progress: number;
  life: number;
  reason?: string;
}

async function callArcadeScore(body: Record<string, unknown>): Promise<any | null> {
  const headers = dehubAuthHeaders();
  // Signed out: there is no board row to write and no wallet to write it for.
  // The run is still played, it just is not recorded.
  if (!headers['x-dehub-token']) return null;
  try {
    const { data, error } = await supabase.functions.invoke('arcade-score', { body, headers });
    if (error) return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * Open a run before it is played, and get back the id every later report
 * carries. Null when signed out or when the endpoint is not there yet — the
 * caller treats that as "this run is not being recorded" and plays on.
 */
export async function openRun(game: string): Promise<string | null> {
  const data = await callArcadeScore({ action: 'start', game });
  return typeof data?.runId === 'string' ? data.runId : null;
}

/**
 * Report progress mid-run. Fire and forget: a dropped report costs the player
 * nothing that the closing one cannot make up, and a run must never stall on
 * the network.
 */
export async function reportRun(runId: string, progress: number, life: number): Promise<void> {
  await callArcadeScore({ action: 'progress', runId, progress, life });
}

/** Close a run and get the standing back. */
export async function submitRun(runId: string, progress: number, life: number): Promise<RunResult | null> {
  const data = await callArcadeScore({ action: 'submit', runId, progress, life });
  if (!data || typeof data.scored !== 'boolean') return null;
  return data as RunResult;
}

/** `0xabcd…1234`, for a player with no username. */
export function shortWallet(address?: string | null): string {
  if (!address) return 'anon';
  return address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}
