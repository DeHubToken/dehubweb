/**
 * chess-match
 * ===========
 * The referee for online King's Gambit. Every state change in an online
 * chess match comes through here; the tables have no client write policies
 * at all. Actions:
 *
 *   create         open a challenge (clock required, stake refused for now)
 *   cancel         withdraw an open challenge you created
 *   join           accept a challenge; the coin flip assigns colours
 *   move           play a move; validated against the live position
 *   resign         lower the banner
 *   claim-timeout  call the opponent's flag; the server does the measuring
 *
 * Reads need no action here — the tables are publicly readable and clients
 * follow matches over Realtime.
 *
 * CLOCKS
 * ------
 * white_ms/black_ms are remaining time AS OF last_move_at; nothing ticks in
 * the database. The mover's spend is settled when their move arrives, and a
 * flag is only ever fallen by this function's own reading of the clock —
 * the boards render countdowns, they do not decide them.
 *
 * CONCURRENCY
 * -----------
 * Every move update is conditioned on the ply it was computed from
 * (`eq('ply', …)`), so two moves racing — a double-submit, a reconnect
 * replay — settle as one winner and one 409 rather than a corrupted match.
 * Join is conditioned on `status = 'open'` the same way.
 *
 * STAKES
 * ------
 * stake_dhb is in the schema so wagering ships as an additive change, but
 * this function refuses non-zero stakes until the DHB escrow work lands.
 * Refusing here rather than hiding the field in the UI means a hand-rolled
 * request cannot open a "wagered" match that nothing will ever pay out.
 */

import { Chess } from 'https://esm.sh/chess.js@1.4.0';

import {
  checkRateLimit,
  handleCorsPreflight,
  jsonResponse,
  requireDeHubAuth,
  serviceClient,
} from '../_shared/auth.ts';

const STANDARD_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
/** After 1.e4 e5 2.f4 — the opening the game is named for, black to answer. */
const KINGS_GAMBIT_FEN = 'rnbqkbnr/pppp1ppp/8/4p3/4PP2/8/PPPP2PP/RNBQKBNR b KQkq f3 0 2';

/** Clock bounds: 1 minute to 60 minutes a side. Untimed is refused — an
 * online game with no clock has no answer to an opponent who just leaves. */
const MIN_CLOCK_MS = 60_000;
const MAX_CLOCK_MS = 3_600_000;

/** Open challenges one wallet may have outstanding. */
const MAX_OPEN_CHALLENGES = 3;

interface MatchRow {
  id: string;
  status: string;
  created_by: string;
  opponent: string | null;
  white_wallet: string | null;
  black_wallet: string | null;
  stake_dhb: number;
  clock_initial_ms: number;
  start_fen: string | null;
  fen: string;
  turn: 'w' | 'b';
  ply: number;
  white_ms: number | null;
  black_ms: number | null;
  last_move_at: string | null;
  winner: string | null;
  end_reason: string | null;
}

/** The shape every action answers with — enough for a client to render the
 * whole match without a second query. */
function matchPayload(match: MatchRow) {
  return { match };
}

async function loadMatch(matchId: unknown): Promise<MatchRow | null> {
  if (typeof matchId !== 'string' || matchId.length === 0) return null;
  const { data } = await serviceClient()
    .from('chess_matches')
    .select('*')
    .eq('id', matchId)
    .maybeSingle();
  return (data as MatchRow | null) ?? null;
}

function sideOf(match: MatchRow, wallet: string): 'w' | 'b' | null {
  if (match.white_wallet === wallet) return 'w';
  if (match.black_wallet === wallet) return 'b';
  return null;
}

/** Milliseconds left for a side at `now`, charging the side to move for the
 * time since the last move landed. */
function remainingMs(match: MatchRow, side: 'w' | 'b', now: number): number | null {
  const stored = side === 'w' ? match.white_ms : match.black_ms;
  if (stored === null) return null;
  if (match.status !== 'active' || match.turn !== side || !match.last_move_at) return stored;
  return stored - Math.max(0, now - new Date(match.last_move_at).getTime());
}

/** Marks a match finished. Conditioned on it still being active at the ply
 * the caller computed from, so a verdict can never overwrite another. */
async function finishMatch(
  match: MatchRow,
  fields: { winner: 'w' | 'b' | null; end_reason: string; white_ms?: number; black_ms?: number },
): Promise<MatchRow | null> {
  const { data } = await serviceClient()
    .from('chess_matches')
    .update({
      status: 'finished',
      winner: fields.winner,
      end_reason: fields.end_reason,
      finished_at: new Date().toISOString(),
      ...(fields.white_ms !== undefined ? { white_ms: fields.white_ms } : {}),
      ...(fields.black_ms !== undefined ? { black_ms: fields.black_ms } : {}),
    })
    .eq('id', match.id)
    .eq('status', 'active')
    .eq('ply', match.ply)
    .select('*')
    .maybeSingle();
  return (data as MatchRow | null) ?? null;
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? '');

    const auth = await requireDeHubAuth(req);
    if (!auth.ok) return auth.response;
    const wallet = auth.wallet;
    const db = serviceClient();
    const now = Date.now();

    // ------------------------------------------------------------- create
    if (action === 'create') {
      const stake = Number(body?.stakeDhb ?? 0);
      if (!Number.isFinite(stake) || stake < 0) {
        return jsonResponse({ error: 'Invalid stake.' }, 400);
      }
      if (stake > 0) {
        // Additive later, refused now — see the header note.
        return jsonResponse({ error: 'Wagered matches are not open yet. Play for honour for now.' }, 400);
      }

      const clockMs = Number(body?.clockMs);
      if (!Number.isFinite(clockMs) || clockMs < MIN_CLOCK_MS || clockMs > MAX_CLOCK_MS) {
        return jsonResponse({ error: 'Clock must be between 1 and 60 minutes a side.' }, 400);
      }

      const variant = String(body?.variant ?? 'standard');
      if (variant !== 'standard' && variant !== 'kings-gambit') {
        return jsonResponse({ error: `Unknown variant: ${variant}` }, 400);
      }
      const startFen = variant === 'kings-gambit' ? KINGS_GAMBIT_FEN : null;

      const rate = await checkRateLimit(db, wallet, 'chess_create', { limit: 20, windowMs: 60 * 60 * 1000 });
      if (!rate.allowed) {
        return jsonResponse({ error: 'Too many challenges this hour. Try again later.' }, 429);
      }

      const { count } = await db
        .from('chess_matches')
        .select('id', { count: 'exact', head: true })
        .eq('created_by', wallet)
        .eq('status', 'open');
      if ((count ?? 0) >= MAX_OPEN_CHALLENGES) {
        return jsonResponse({ error: 'You already have open challenges waiting. Cancel one first.' }, 400);
      }

      const startingFen = startFen ?? STANDARD_FEN;
      const { data, error } = await db
        .from('chess_matches')
        .insert({
          created_by: wallet,
          stake_dhb: 0,
          clock_initial_ms: Math.round(clockMs),
          start_fen: startFen,
          fen: startingFen,
          turn: new Chess(startingFen).turn(),
          white_ms: Math.round(clockMs),
          black_ms: Math.round(clockMs),
        })
        .select('*')
        .single();
      if (error) return jsonResponse({ error: 'Could not open the challenge.' }, 500);
      return jsonResponse(matchPayload(data as MatchRow));
    }

    // ------------------------------------------------------------- cancel
    if (action === 'cancel') {
      const { data } = await db
        .from('chess_matches')
        .update({ status: 'cancelled' })
        .eq('id', String(body?.matchId ?? ''))
        .eq('created_by', wallet)
        .eq('status', 'open')
        .select('*')
        .maybeSingle();
      if (!data) return jsonResponse({ error: 'No open challenge of yours to cancel there.' }, 404);
      return jsonResponse(matchPayload(data as MatchRow));
    }

    // --------------------------------------------------------------- join
    if (action === 'join') {
      const match = await loadMatch(body?.matchId);
      if (!match) return jsonResponse({ error: 'Match not found.' }, 404);
      if (match.created_by === wallet) {
        return jsonResponse({ error: 'You cannot accept your own challenge.' }, 400);
      }

      // The coin flip. crypto, not Math.random — a predictable flip would
      // let a joiner farm white.
      const flip = crypto.getRandomValues(new Uint32Array(1))[0] % 2 === 0;
      const white = flip ? match.created_by : wallet;
      const black = flip ? wallet : match.created_by;

      // Conditioned on still being open: two joiners race, one wins, the
      // other gets told the seat is taken.
      const { data } = await db
        .from('chess_matches')
        .update({
          status: 'active',
          opponent: wallet,
          white_wallet: white,
          black_wallet: black,
          last_move_at: new Date(now).toISOString(),
        })
        .eq('id', match.id)
        .eq('status', 'open')
        .select('*')
        .maybeSingle();
      if (!data) return jsonResponse({ error: 'That challenge has just been taken or withdrawn.' }, 409);
      return jsonResponse(matchPayload(data as MatchRow));
    }

    // --------------------------------------------------------------- move
    if (action === 'move') {
      const match = await loadMatch(body?.matchId);
      if (!match) return jsonResponse({ error: 'Match not found.' }, 404);
      if (match.status !== 'active') return jsonResponse({ error: 'This match is not in play.' }, 400);

      const side = sideOf(match, wallet);
      if (!side) return jsonResponse({ error: 'You are not seated at this board.' }, 403);
      if (match.turn !== side) return jsonResponse({ error: 'Not your move.' }, 400);

      const from = String(body?.from ?? '');
      const to = String(body?.to ?? '');
      const promotion = typeof body?.promotion === 'string' ? body.promotion : undefined;

      // Settle the mover's clock before touching the board: a move that
      // arrives after the flag is a timeout, not a move.
      const left = remainingMs(match, side, now);
      if (left !== null && left <= 0) {
        const finished = await finishMatch(match, {
          winner: side === 'w' ? 'b' : 'w',
          end_reason: 'timeout',
          ...(side === 'w' ? { white_ms: 0 } : { black_ms: 0 }),
        });
        return jsonResponse(matchPayload(finished ?? match));
      }

      const chess = new Chess(match.fen);
      let played;
      try {
        played = chess.move({ from, to, promotion: promotion ?? 'q' });
      } catch {
        played = null;
      }
      if (!played) {
        return jsonResponse({ error: `Illegal move ${from}-${to} in this position.`, fen: match.fen }, 400);
      }

      const whiteMs = side === 'w' ? left : match.white_ms;
      const blackMs = side === 'b' ? left : match.black_ms;

      let status = 'active';
      let winner: 'w' | 'b' | null = null;
      let endReason: string | null = null;
      if (chess.isGameOver()) {
        status = 'finished';
        if (chess.isCheckmate()) {
          winner = side;
          endReason = 'checkmate';
        } else if (chess.isStalemate()) endReason = 'stalemate';
        else if (chess.isThreefoldRepetition()) endReason = 'threefold';
        else if (chess.isInsufficientMaterial()) endReason = 'insufficient';
        else endReason = 'draw';
      }

      // The optimistic lock: this update only lands on the ply the move was
      // computed against.
      const { data: updated } = await db
        .from('chess_matches')
        .update({
          fen: chess.fen(),
          turn: chess.turn(),
          ply: match.ply + 1,
          white_ms: whiteMs,
          black_ms: blackMs,
          last_move_at: new Date(now).toISOString(),
          status,
          winner,
          end_reason: endReason,
          ...(status === 'finished' ? { finished_at: new Date(now).toISOString() } : {}),
        })
        .eq('id', match.id)
        .eq('status', 'active')
        .eq('ply', match.ply)
        .select('*')
        .maybeSingle();
      if (!updated) return jsonResponse({ error: 'The position moved under you. Resync and retry.' }, 409);

      // The move row is what the other board is listening for. A failure
      // here would strand the opponent, so it is surfaced, not swallowed.
      const { error: moveError } = await db.from('chess_moves').insert({
        match_id: match.id,
        ply: match.ply,
        wallet,
        from_sq: played.from,
        to_sq: played.to,
        promotion: played.promotion ?? null,
        san: played.san,
        fen_after: chess.fen(),
        white_ms: whiteMs,
        black_ms: blackMs,
      });
      if (moveError) {
        console.error('[chess-match] move row insert failed', moveError);
      }

      return jsonResponse(matchPayload(updated as MatchRow));
    }

    // ------------------------------------------------------------- resign
    if (action === 'resign') {
      const match = await loadMatch(body?.matchId);
      if (!match) return jsonResponse({ error: 'Match not found.' }, 404);
      if (match.status !== 'active') return jsonResponse({ error: 'This match is not in play.' }, 400);
      const side = sideOf(match, wallet);
      if (!side) return jsonResponse({ error: 'You are not seated at this board.' }, 403);

      const finished = await finishMatch(match, {
        winner: side === 'w' ? 'b' : 'w',
        end_reason: 'resignation',
      });
      return jsonResponse(matchPayload(finished ?? match));
    }

    // ------------------------------------------------------ claim-timeout
    if (action === 'claim-timeout') {
      const match = await loadMatch(body?.matchId);
      if (!match) return jsonResponse({ error: 'Match not found.' }, 404);
      if (match.status !== 'active') return jsonResponse({ error: 'This match is not in play.' }, 400);
      if (!sideOf(match, wallet)) return jsonResponse({ error: 'You are not seated at this board.' }, 403);

      const side = match.turn;
      const left = remainingMs(match, side, now);
      if (left === null || left > 0) {
        return jsonResponse({ error: 'The flag has not fallen.', remainingMs: left }, 400);
      }
      const finished = await finishMatch(match, {
        winner: side === 'w' ? 'b' : 'w',
        end_reason: 'timeout',
        ...(side === 'w' ? { white_ms: 0 } : { black_ms: 0 }),
      });
      return jsonResponse(matchPayload(finished ?? match));
    }

    return jsonResponse({ error: `Unknown action: ${action}` }, 400);
  } catch (error) {
    console.error('[chess-match] unhandled', error);
    return jsonResponse({ error: 'Internal error.' }, 500);
  }
});
