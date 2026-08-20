/**
 * arcade-score
 * ============
 * The only writer to `public.arcade_scores` and `public.arcade_runs` — the run
 * boards behind the arcade's leaderboards. Both tables have service-role-only
 * writes, exactly like `chess_matches`, so a client cannot reach either.
 *
 * Actions:
 *
 *   start      open a run before it is played; answers with a run id
 *   progress   report how the run is going, while it is going
 *   submit     close the run; the server scores what IT saw and keeps the best
 *
 * Reads need no action here: the board is publicly readable and the clients
 * query it directly.
 *
 * WHY IT IS SHAPED LIKE THIS
 * --------------------------
 * Street Slayer is a Construct 2 build running on the player's own machine.
 * There is no server-side simulation to check a result against and there never
 * can be, so every "did this really happen" question has exactly one honest
 * answer available: TIME. A client can claim anything it likes; it cannot
 * fabricate minutes on our clock.
 *
 * So a run is opened here before it is played. Progress arrives while the run
 * is running, and each report is credited against the run's own `started_at`:
 *
 *   credited = max(previous, min(claimed, elapsed / MS_PER_PERMILLE))
 *
 * Monotone, and capped by how far a person could physically have got in the
 * time that has actually passed. Note that it CAPS rather than rejects — a good
 * player who sprints a quiet stretch is briefly held at the bound and catches
 * up the moment they hit the next fight, because the cap is cumulative from the
 * start of the run rather than per segment. A rule that rejected them instead
 * would silently cost real players their place on the board, which is a worse
 * failure than the one it prevents.
 *
 * The final score is composed from the run row — what this function watched
 * happen — not from the payload that closes it. `submit` may add at most one
 * checkpoint's worth of progress, because losing the last report as the frame
 * tears down is the one dropped message that actually happens.
 *
 * WHAT THIS DOES NOT DO
 * ---------------------
 * It does not make cheating impossible; nothing can, for a single-player game
 * shipped to the player. It makes cheating cost the same real minutes as
 * playing, rate limits how often it can be attempted, and writes down the
 * anomalies. That is the whole claim. Anything that pays out money must be
 * settled from a match the server refereed (`chess-match`) or from the chain,
 * never from a number that reached us through a game.
 */

import {
  checkRateLimit,
  handleCorsPreflight,
  jsonResponse,
  requireDeHubAuth,
  serviceClient,
} from '../_shared/auth.ts';

/** A run left open longer than this is over, whatever the client thinks. */
const RUN_TTL_MS = 6 * 60 * 60 * 1000;

/**
 * Ignore reports that arrive closer together than this.
 *
 * The bridge reports on crossing a checkpoint, so a legitimate run sends of the
 * order of ten. A tighter stream is a script, and answering it with the current
 * state rather than an error keeps a merely over-eager client working.
 */
const MIN_REPORT_GAP_MS = 900;

interface RunState {
  progress: number;
  life: number;
}

interface Board {
  /** Ceiling on the game-specific secondary, for clamping a claim. */
  maxLife: number;
  /**
   * The most the secondary may rise between two reports. Health that climbs
   * faster than the game can heal it is the cheapest lie to tell and the
   * cheapest to catch.
   */
  maxLifeGain: number;
  /**
   * The physical floor: milliseconds of real time per permille of progress.
   *
   * Chosen well BELOW any human play rather than at it, because this bounds
   * what is possible, not what is good — see the cap-not-reject note above.
   * Worth revisiting downwards or upwards once the board has real runs in it,
   * which is the first honest data anyone will have about it.
   */
  msPerPermille: number;
  /** Progress below which a run does not make the board at all. */
  minProgress: number;
  /** Progress a single dropped report can be worth at `submit`. */
  checkpointPermille: number;
  score: (run: RunState) => number;
}

const BOARDS: Record<string, Board> = {
  /**
   * Street Slayer — how far down the street, then how much health was left.
   *
   * The build ships one 4600px stage and a `number_of_complete_stages` global
   * that is compared in six places and incremented in none, so there is no
   * stage progression to rank and the obvious metric is a dead end. What the
   * runtime does expose truthfully is the camera (`running_layout.scrollX`)
   * across a street of known width, and `life_of_p1`, which starts at 500, is
   * subtracted from by every hit and added to by the life pickup. So: distance
   * as the primary, health left to separate the players who reach the end.
   *
   * 60 seconds is the floor for the whole street (6s per 10%). A brawler stage
   * takes minutes; this is not a target, it is the wall.
   */
  'street-slayer': {
    maxLife: 500,
    // The one pickup in the game restores 150. Two of them between reports is
    // already generous.
    maxLifeGain: 300,
    msPerPermille: 60,
    minProgress: 50,
    checkpointPermille: 100,
    score: (run) => run.progress * 1000 + run.life,
  },
};

/** Clamp a claimed integer into range, treating anything unusable as 0. */
function claimed(value: unknown, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(max, Math.round(n)));
}

interface RunRow {
  id: string;
  game: string;
  wallet: string;
  status: string;
  progress: number;
  life: number;
  checkpoints: number;
  flags: string[];
  started_at: string;
  last_seen_at: string;
}

/**
 * Credit a report against the run's own clock.
 *
 * `allowancePermille` is how far past what the clock allows this particular
 * report may reach — zero for a mid-run report, one checkpoint for the closing
 * one, which is the only dropped message worth forgiving.
 */
function accrue(
  run: RunRow,
  board: Board,
  body: Record<string, unknown>,
  now: number,
  allowancePermille: number,
): { next: RunState; flags: string[] } {
  const elapsed = Math.max(0, now - new Date(run.started_at).getTime());
  const cap = Math.floor(elapsed / board.msPerPermille) + allowancePermille;

  const wants = claimed(body?.progress, 1000);
  const wantsLife = claimed(body?.life, board.maxLife);
  const flags: string[] = [];

  // Flagged only when the claim is ahead of the clock by more than a whole
  // checkpoint. A good player sprinting a quiet stretch is briefly ahead of the
  // bound and catches up on the next fight; flagging that would fill the ledger
  // with the players it exists to distinguish cheats from.
  if (wants > cap + board.checkpointPermille) flags.push('ahead-of-clock');

  // Monotone: progress never falls. Restarting the stage rewinds the camera,
  // and a run's reach is the furthest it ever got, not where it ended.
  const progress = Math.max(run.progress, Math.min(wants, cap));

  // Health may fall freely and rise only as fast as the game can heal it. The
  // first report has nothing to compare against, so it is taken as given.
  const ceiling = run.checkpoints === 0 ? board.maxLife : run.life + board.maxLifeGain;
  if (wantsLife > ceiling) flags.push('life-jump');
  const life = Math.min(wantsLife, ceiling);

  return { next: { progress, life }, flags };
}

Deno.serve(async (req: Request) => {
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

    // ------------------------------------------------------------------ start

    if (action === 'start') {
      const game = String(body?.game ?? '');
      if (!BOARDS[game]) return jsonResponse({ error: `No board for game: ${game}` }, 400);

      // Far above anything a person opens by playing, and low enough that
      // opening runs cannot be used to walk a score up in parallel.
      const rate = await checkRateLimit(db, wallet, 'arcade_run_start', {
        limit: 60,
        windowMs: 60 * 60 * 1000,
      });
      if (!rate.allowed) return jsonResponse({ error: 'Too many runs started.' }, 429);

      const { data, error } = await db
        .from('arcade_runs')
        .insert({ game, wallet })
        .select('id')
        .single();
      if (error) return jsonResponse({ error: error.message }, 500);

      return jsonResponse({ runId: data.id });
    }

    // The two actions below share their loading and their guards.
    if (action === 'progress' || action === 'submit') {
      const runId = String(body?.runId ?? '');
      if (!runId) return jsonResponse({ error: 'runId required.' }, 400);

      const { data: run } = await db
        .from('arcade_runs')
        .select('*')
        .eq('id', runId)
        .maybeSingle<RunRow>();

      // One error for "not yours", "not there" and "already scored": a caller
      // probing run ids learns nothing from the difference.
      if (!run || run.wallet !== wallet || run.status !== 'live') {
        return jsonResponse({ error: 'No live run.' }, 404);
      }
      const board = BOARDS[run.game];
      if (!board) return jsonResponse({ error: 'No board for this run.' }, 400);

      if (now - new Date(run.started_at).getTime() > RUN_TTL_MS) {
        await db.from('arcade_runs').update({ status: 'scored', scored_at: new Date(now).toISOString() }).eq('id', run.id);
        return jsonResponse({ error: 'Run expired.' }, 410);
      }

      // -------------------------------------------------------------- progress

      if (action === 'progress') {
        if (now - new Date(run.last_seen_at).getTime() < MIN_REPORT_GAP_MS) {
          return jsonResponse({ progress: run.progress, life: run.life, throttled: true });
        }

        const { next, flags } = accrue(run, board, body, now, 0);
        const { error } = await db
          .from('arcade_runs')
          .update({
            progress: next.progress,
            life: next.life,
            checkpoints: run.checkpoints + 1,
            // Bounded so a run cannot grow an unbounded array by being spammed.
            flags: Array.from(new Set([...run.flags, ...flags])).slice(0, 8),
            last_seen_at: new Date(now).toISOString(),
          })
          .eq('id', run.id)
          .eq('status', 'live');
        if (error) return jsonResponse({ error: error.message }, 500);

        return jsonResponse({ progress: next.progress, life: next.life });
      }

      // ---------------------------------------------------------------- submit

      const { next, flags } = accrue(run, board, body, now, board.checkpointPermille);
      const stamp = new Date(now).toISOString();

      // Close the run first, conditioned on it still being live, so a
      // double-submitted run is one score and one 404 rather than two scores.
      const { data: closed, error: closeError } = await db
        .from('arcade_runs')
        .update({
          status: 'scored',
          progress: next.progress,
          life: next.life,
          checkpoints: run.checkpoints + 1,
          flags: Array.from(new Set([...run.flags, ...flags])).slice(0, 8),
          last_seen_at: stamp,
          scored_at: stamp,
        })
        .eq('id', run.id)
        .eq('status', 'live')
        .select('id')
        .maybeSingle();
      if (closeError) return jsonResponse({ error: closeError.message }, 500);
      if (!closed) return jsonResponse({ error: 'No live run.' }, 404);

      if (next.progress < board.minProgress) {
        return jsonResponse({
          scored: false,
          progress: next.progress,
          life: next.life,
          reason: 'Get further down the street to make the board.',
        });
      }

      const score = board.score(next);
      const detail = { progress: next.progress, life: next.life };

      const { data: existing } = await db
        .from('arcade_scores')
        .select('score, runs')
        .eq('game', run.game)
        .eq('wallet', wallet)
        .maybeSingle();

      const improved = !existing || score > Number(existing.score);
      if (improved) {
        // achieved_at moves only with the score: it is the tiebreaker, so
        // touching it on a worse run would quietly demote a player's own best
        // below everyone it was already ahead of.
        const { error } = await db.from('arcade_scores').upsert(
          {
            game: run.game,
            wallet,
            score,
            detail,
            runs: (existing?.runs ?? 0) + 1,
            achieved_at: stamp,
            updated_at: stamp,
          },
          { onConflict: 'game,wallet' },
        );
        if (error) return jsonResponse({ error: error.message }, 500);
      } else {
        const { error } = await db
          .from('arcade_scores')
          .update({ runs: (existing?.runs ?? 0) + 1, updated_at: stamp })
          .eq('game', run.game)
          .eq('wallet', wallet);
        if (error) return jsonResponse({ error: error.message }, 500);
      }

      const best = improved ? score : Number(existing!.score);

      // Rank as "how many are strictly ahead of me, plus one". Counting rather
      // than reading a position off a fetched page means the number is right
      // for somebody sitting 340th, who will never be on the page the board
      // renders.
      const { count } = await db
        .from('arcade_scores')
        .select('wallet', { count: 'exact', head: true })
        .eq('game', run.game)
        .gt('score', best);

      return jsonResponse({
        scored: true,
        improved,
        score: best,
        rank: (count ?? 0) + 1,
        progress: next.progress,
        life: next.life,
      });
    }

    return jsonResponse({ error: `Unknown action: ${action}` }, 400);
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Unexpected error' }, 500);
  }
});
