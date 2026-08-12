/**
 * Online King's Gambit
 * ====================
 * `/arcade/kings-gambit/online` — the lobby, and then the live board.
 *
 * THE SPLIT
 * ---------
 * The game frame stays exactly as sandboxed as it is for single player:
 * opaque origin, no `allow-same-origin`, no network of its own. Everything
 * that talks to a server happens on THIS side — matchmaking through the
 * chess-match edge function, the live feed of the opponent's moves over
 * Supabase Realtime — and crosses into the frame as postMessage. The board
 * never sees a token, a wallet or a socket, which is what makes it safe to
 * keep vendoring a third-party build under it.
 *
 * The frame protocol is documented in the game's own source
 * (web/src/core/hostBridge.ts in the fork this build is vendored from).
 * In short: the frame announces `bridge-ready`, this page answers `start`,
 * then `move` comes out after every local move and `opponent-move`,
 * `clock` and `result` go in. `desync` from the frame or a 409 from the
 * function both mean the boards disagree, and the cure is the same either
 * way: re-`start` the frame from the server's FEN. The server is always
 * right — it is the only party that validates anything.
 *
 * WHY MOVES RIDE chess_moves INSERTS AND NOT MATCH UPDATES
 * --------------------------------------------------------
 * Realtime UPDATE payloads carry the row, but a move is a delta: the frame
 * wants from/to/promotion, not a FEN to diff. The chess_moves row carries
 * exactly that, plus both clocks as the server settled them, so one INSERT
 * event is both the move and the clock sync. Match UPDATEs are still
 * watched — they are how a finish (resignation, timeout, checkmate) and
 * the join handshake arrive.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Crown, Loader2, Plus, Swords, X } from 'lucide-react';
import { toast } from 'sonner';
import { SEOHead } from '@/components/SEOHead';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { dehubAuthHeaders } from '@/lib/ai-invoke';
import { setBackgroundPaused, scheduleBackgroundResume } from '@/lib/background-gate';
import { ARCADE_SANDBOX } from '@/config/arcade-games';

const CHESS_URL = (import.meta.env.VITE_CHESS_GAME_URL as string | undefined) || '/chess-game/index.html';
/** `#online` holds the game's own menu back — the lobby out here is the menu. */
const FRAME_URL = `${CHESS_URL}#online`;

const GAME_SOURCE = 'chess-game';
const HOST_SOURCE = 'dehub-host';

const OPEN_QUERY_KEY = 'chess-open-challenges';
const MINE_QUERY_KEY = 'chess-my-match';

const CLOCK_CHOICES = [
  { label: '5 min', ms: 5 * 60_000 },
  { label: '10 min', ms: 10 * 60_000 },
  { label: '15 min', ms: 15 * 60_000 },
] as const;

interface ChessMatch {
  id: string;
  status: 'open' | 'active' | 'finished' | 'cancelled';
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
  winner: 'w' | 'b' | null;
  end_reason: string | null;
  created_at: string;
}

interface ChessMoveRow {
  match_id: string;
  ply: number;
  wallet: string;
  from_sq: string;
  to_sq: string;
  promotion: string | null;
  white_ms: number | null;
  black_ms: number | null;
}

function short(wallet: string | null | undefined): string {
  if (!wallet) return '…';
  return `${wallet.slice(0, 6)}…${wallet.slice(-4)}`;
}

/** Remaining ms for the side to move, charged for the time since the last
 * move landed — the same arithmetic the edge function settles with. */
function liveClock(match: ChessMatch): { whiteMs: number; blackMs: number } {
  let whiteMs = match.white_ms ?? 0;
  let blackMs = match.black_ms ?? 0;
  if (match.status === 'active' && match.last_move_at) {
    const spent = Math.max(0, Date.now() - new Date(match.last_move_at).getTime());
    if (match.turn === 'w') whiteMs -= spent;
    else blackMs -= spent;
  }
  return { whiteMs: Math.max(0, whiteMs), blackMs: Math.max(0, blackMs) };
}

async function invokeChess(body: Record<string, unknown>): Promise<{ match?: ChessMatch; error?: string }> {
  const { data, error } = await supabase.functions.invoke('chess-match', {
    body,
    headers: dehubAuthHeaders(),
  });
  if (error) {
    // The function answers errors as JSON with a message worth showing;
    // supabase-js buries the body in the error context.
    try {
      const context = (error as { context?: Response }).context;
      if (context) {
        const parsed = await context.json();
        if (parsed?.error) return { error: String(parsed.error) };
      }
    } catch {
      // Fall through to the generic message.
    }
    return { error: error.message || 'The match server did not answer.' };
  }
  return data as { match?: ChessMatch; error?: string };
}

// ---------------------------------------------------------------- the lobby

function ChallengeRow({
  match,
  mine,
  busy,
  onJoin,
  onCancel,
}: {
  match: ChessMatch;
  mine: boolean;
  busy: boolean;
  onJoin: (match: ChessMatch) => void;
  onCancel: (match: ChessMatch) => void;
}) {
  const minutes = Math.round(match.clock_initial_ms / 60_000);
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-zinc-900 px-4 py-3 ring-1 ring-white/[0.06]">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-white">{mine ? 'Your challenge' : short(match.created_by)}</p>
        <p className="text-xs text-zinc-500">
          {minutes} min · {match.start_fen ? "King's Gambit opening" : 'Standard'}
        </p>
      </div>
      {mine ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => onCancel(match)}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-zinc-800 px-3 py-2 text-xs font-semibold text-zinc-300 transition-colors hover:bg-zinc-700 disabled:opacity-50"
        >
          <X className="h-3.5 w-3.5" /> Withdraw
        </button>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => onJoin(match)}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <Swords className="h-3.5 w-3.5" /> Accept
        </button>
      )}
    </div>
  );
}

// ----------------------------------------------------------------- the page

export default function ArcadeChessOnlinePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { walletAddress } = useAuth();
  const wallet = walletAddress?.toLowerCase() ?? null;

  const [match, setMatch] = useState<ChessMatch | null>(null);
  const [busy, setBusy] = useState(false);
  const [clockMs, setClockMs] = useState<number>(CLOCK_CHOICES[1].ms);
  const [variant, setVariant] = useState<'standard' | 'kings-gambit'>('kings-gambit');

  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const [frameReady, setFrameReady] = useState(false);
  /** Ply the frame was last `start`ed at, or null before the first start.
   * A re-start is only worth a board reset when the server has moved on. */
  const startedAtPly = useRef<number | null>(null);
  /** Last ply relayed into the frame, so a Realtime replay is not a repeat. */
  const relayedPly = useRef(-1);
  /** Throttles flag claims: one call per fallen flag, not one per tick. */
  const claimedAt = useRef(0);

  const inMatch = match !== null && match.status !== 'cancelled';

  // ------------------------------------------------------------- lobby data
  const { data: openChallenges = [], isLoading: lobbyLoading } = useQuery({
    queryKey: [OPEN_QUERY_KEY],
    queryFn: async () => {
      const { data, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- table is newer than the generated types
        .from('chess_matches' as any)
        .select('*')
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as unknown as ChessMatch[];
    },
    enabled: !inMatch,
    staleTime: 10_000,
  });

  // A live match of mine, from a previous visit or another tab. One row is
  // enough — the function will not seat a wallet at two active boards that
  // matter; if several exist, the newest is the one to offer.
  const { data: myLiveMatch } = useQuery({
    queryKey: [MINE_QUERY_KEY, wallet],
    queryFn: async () => {
      if (!wallet) return null;
      const { data, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- table is newer than the generated types
        .from('chess_matches' as any)
        .select('*')
        .in('status', ['open', 'active'])
        .or(`created_by.eq.${wallet},opponent.eq.${wallet}`)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as ChessMatch) ?? null;
    },
    enabled: !!wallet && !inMatch,
    staleTime: 10_000,
  });

  // Keep the lobby honest while it is on screen.
  useEffect(() => {
    if (inMatch) return;
    const channel = supabase
      .channel('chess-lobby')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chess_matches' }, () => {
        void queryClient.invalidateQueries({ queryKey: [OPEN_QUERY_KEY] });
        void queryClient.invalidateQueries({ queryKey: [MINE_QUERY_KEY] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [inMatch, queryClient]);

  // The game owns the viewport while a match is up, same as ArcadeGamePage.
  useEffect(() => {
    if (!inMatch) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    setBackgroundPaused(true);
    return () => {
      document.body.style.overflow = previous;
      scheduleBackgroundResume();
    };
  }, [inMatch]);

  // ------------------------------------------------------- frame messaging
  const postToFrame = useCallback((message: Record<string, unknown>) => {
    // '*' is unavoidable and harmless here: an opaque-origin frame HAS no
    // origin to name, and the payload holds nothing secret — FENs and moves
    // of a publicly readable game.
    frameRef.current?.contentWindow?.postMessage({ source: HOST_SOURCE, ...message }, '*');
  }, []);

  /** (Re)start the frame from the match as the server tells it. Also the
   * desync cure — the board resets to the authoritative FEN. */
  const startFrame = useCallback(
    (current: ChessMatch) => {
      if (!wallet) return;
      const color = current.white_wallet === wallet ? 'w' : 'b';
      const opponentWallet = current.white_wallet === wallet ? current.black_wallet : current.white_wallet;
      const clocks = liveClock(current);
      postToFrame({
        type: 'start',
        color,
        clockMs: current.clock_initial_ms,
        // Mid-game (a reload, a desync) the board opens from the live
        // position; fresh games open from the variant's start.
        fen: current.ply > 0 ? current.fen : current.start_fen ?? undefined,
        opponent: short(opponentWallet),
      });
      postToFrame({ type: 'clock', whiteMs: clocks.whiteMs, blackMs: clocks.blackMs });
      startedAtPly.current = current.ply;
      relayedPly.current = current.ply - 1;
    },
    [postToFrame, wallet],
  );

  // What the frame tells us. Registered for the life of the match view.
  useEffect(() => {
    if (!inMatch) return;
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { source?: string; type?: string; [key: string]: unknown } | null;
      if (!data || data.source !== GAME_SOURCE) return;

      if (data.type === 'bridge-ready') {
        setFrameReady(true);
        return;
      }
      if (data.type === 'exit') {
        setMatch(null);
        return;
      }
      if (!match) return;

      if (data.type === 'move') {
        void (async () => {
          const result = await invokeChess({
            action: 'move',
            matchId: match.id,
            from: data.from,
            to: data.to,
            promotion: data.promotion ?? undefined,
          });
          if (result.match) {
            setMatch(result.match);
            const clocks = liveClock(result.match);
            postToFrame({ type: 'clock', whiteMs: clocks.whiteMs, blackMs: clocks.blackMs });
            relayedPly.current = result.match.ply - 1;
            if (result.match.status === 'finished') {
              postToFrame({ type: 'result', winner: result.match.winner, reason: result.match.end_reason });
            }
          } else if (result.error) {
            // The server refused a move the board believed in: the boards
            // disagree, and the server wins. Reset from its position.
            toast.error(result.error);
            const fresh = await refreshMatch(match.id);
            if (fresh) {
              setMatch(fresh);
              startFrame(fresh);
            }
          }
        })();
        return;
      }
      if (data.type === 'resign') {
        void invokeChess({ action: 'resign', matchId: match.id }).then((result) => {
          if (result.match) setMatch(result.match);
        });
        return;
      }
      if (data.type === 'desync') {
        void refreshMatch(match.id).then((fresh) => {
          if (fresh) {
            setMatch(fresh);
            startFrame(fresh);
          }
        });
      }
      // 'game-ended' is deliberately unused: every ending the host must act
      // on is either this side's own call (move, resign) or arrives from the
      // server as a match UPDATE. The frame's opinion is not a verdict.
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [inMatch, match, postToFrame, startFrame]);

  // Hand the board over once both sides are ready.
  useEffect(() => {
    if (!frameReady || !match || match.status !== 'active') return;
    if (startedAtPly.current !== null) return;
    startFrame(match);
  }, [frameReady, match, startFrame]);

  // The match feed: the opponent's moves and the server's verdicts.
  useEffect(() => {
    if (!match?.id || !wallet) return;
    const channel = supabase
      .channel(`chess-match-${match.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chess_moves', filter: `match_id=eq.${match.id}` },
        (payload) => {
          const row = payload.new as ChessMoveRow;
          if (row.ply <= relayedPly.current) return;
          if (row.wallet === wallet) {
            relayedPly.current = row.ply;
            return;
          }
          relayedPly.current = row.ply;
          postToFrame({ type: 'opponent-move', from: row.from_sq, to: row.to_sq, promotion: row.promotion ?? undefined });
          if (row.white_ms !== null && row.black_ms !== null) {
            postToFrame({ type: 'clock', whiteMs: row.white_ms, blackMs: row.black_ms });
          }
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'chess_matches', filter: `id=eq.${match.id}` },
        (payload) => {
          const next = payload.new as ChessMatch;
          setMatch((current) => (current && current.id === next.id ? next : current));
          if (next.status === 'finished') {
            postToFrame({ type: 'result', winner: next.winner, reason: next.end_reason });
          }
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [match?.id, postToFrame, wallet]);

  // The flag watch. The server is the only judge, but somebody has to ask:
  // when the opponent's clock has been dry for two seconds, claim it.
  useEffect(() => {
    if (!match || match.status !== 'active' || !wallet) return;
    const myColor = match.white_wallet === wallet ? 'w' : 'b';
    if (match.turn === myColor) return;
    const timer = window.setInterval(() => {
      const clocks = liveClock(match);
      const opponentMs = match.turn === 'w' ? clocks.whiteMs : clocks.blackMs;
      const dryForMs = match.last_move_at
        ? Date.now() - new Date(match.last_move_at).getTime() - (match.turn === 'w' ? match.white_ms ?? 0 : match.black_ms ?? 0)
        : 0;
      if (opponentMs > 0 || dryForMs < 2000) return;
      if (Date.now() - claimedAt.current < 10_000) return;
      claimedAt.current = Date.now();
      void invokeChess({ action: 'claim-timeout', matchId: match.id }).then((result) => {
        if (result.match) setMatch(result.match);
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [match, wallet]);

  // ------------------------------------------------------------- actions
  async function refreshMatch(id: string): Promise<ChessMatch | null> {
    const { data } = await supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- table is newer than the generated types
      .from('chess_matches' as any)
      .select('*')
      .eq('id', id)
      .maybeSingle();
    return (data as unknown as ChessMatch) ?? null;
  }

  const enterMatch = useCallback((next: ChessMatch) => {
    setFrameReady(false);
    startedAtPly.current = null;
    relayedPly.current = -1;
    setMatch(next);
  }, []);

  const createChallenge = useCallback(async () => {
    setBusy(true);
    const result = await invokeChess({ action: 'create', clockMs, variant, stakeDhb: 0 });
    setBusy(false);
    if (result.match) enterMatch(result.match);
    else if (result.error) toast.error(result.error);
  }, [clockMs, enterMatch, variant]);

  const joinChallenge = useCallback(
    async (target: ChessMatch) => {
      setBusy(true);
      const result = await invokeChess({ action: 'join', matchId: target.id });
      setBusy(false);
      if (result.match) enterMatch(result.match);
      else if (result.error) {
        toast.error(result.error);
        void queryClient.invalidateQueries({ queryKey: [OPEN_QUERY_KEY] });
      }
    },
    [enterMatch, queryClient],
  );

  const cancelChallenge = useCallback(
    async (target: ChessMatch) => {
      setBusy(true);
      const result = await invokeChess({ action: 'cancel', matchId: target.id });
      setBusy(false);
      if (result.error) toast.error(result.error);
      if (match?.id === target.id) setMatch(null);
      void queryClient.invalidateQueries({ queryKey: [OPEN_QUERY_KEY] });
    },
    [match?.id, queryClient],
  );

  // ------------------------------------------------------------- rendering
  if (inMatch) {
    const waiting = match.status === 'open';
    const finished = match.status === 'finished';
    return (
      <div className="fixed inset-0 z-[100] bg-black">
        <SEOHead title="Online match | King's Gambit | DeHub Arcade" noindex />
        <iframe
          ref={frameRef}
          src={FRAME_URL}
          title="King's Gambit — online match"
          className="h-full w-full border-0"
          allow="fullscreen; autoplay"
          sandbox={ARCADE_SANDBOX}
        />
        {/* No host boot readout here: the game paints its own loading screen
            (the figure count), and in online mode the waiting slate follows
            it. A second bar on top was the thing being loaded twice. */}
        {waiting ? (
          <div className="absolute inset-x-0 bottom-8 z-20 flex justify-center">
            <div className="pointer-events-auto flex items-center gap-4 rounded-full bg-zinc-900/95 py-2 pl-5 pr-2 ring-1 ring-white/10">
              <span className="flex items-center gap-2 text-xs text-zinc-300">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Waiting for an opponent…
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => void cancelChallenge(match)}
                className="rounded-full bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-zinc-200 transition-colors hover:bg-zinc-700 disabled:opacity-50"
              >
                Withdraw
              </button>
            </div>
          </div>
        ) : null}
        {finished ? (
          <div className="absolute inset-x-0 bottom-8 z-20 flex justify-center">
            <button
              type="button"
              onClick={() => setMatch(null)}
              className="pointer-events-auto rounded-full bg-white px-5 py-2 text-xs font-semibold text-black transition-opacity hover:opacity-90"
            >
              Back to the lobby
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black">
      <SEOHead
        title="Play online | King's Gambit | DeHub Arcade"
        description="Challenge another player to cinematic 3D chess. Open a challenge or accept one from the lobby."
        noindex
      />
      <div className="mx-auto max-w-2xl px-4 pb-24 pt-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold text-white">
              <Crown className="h-5 w-5" /> King&apos;s Gambit online
            </h1>
            <p className="mt-1 text-xs text-zinc-500">Live duels against other players. Wagers in DHB are coming.</p>
          </div>
          <Link to="/arcade/kings-gambit" className="text-xs text-zinc-400 underline-offset-2 hover:text-white hover:underline">
            Play the computer instead
          </Link>
        </div>

        {!wallet ? (
          <div className="rounded-2xl bg-zinc-900 px-5 py-8 text-center ring-1 ring-white/[0.06]">
            <p className="text-sm text-zinc-300">Sign in to challenge another player.</p>
            <p className="mt-1 text-xs text-zinc-500">The lobby needs to know whose banner you fly.</p>
          </div>
        ) : (
          <>
            {myLiveMatch ? (
              <button
                type="button"
                onClick={() => enterMatch(myLiveMatch)}
                className="mb-4 flex w-full items-center justify-between rounded-2xl bg-amber-500/10 px-5 py-4 text-left ring-1 ring-amber-500/30 transition-colors hover:bg-amber-500/15"
              >
                <span className="text-sm font-medium text-amber-200">
                  {myLiveMatch.status === 'active' ? 'Your battle is under way' : 'Your challenge is still open'}
                </span>
                <span className="text-xs font-semibold text-amber-400">Return to the board →</span>
              </button>
            ) : null}

            <div className="rounded-2xl bg-zinc-900 p-5 ring-1 ring-white/[0.06]">
              <h2 className="text-sm font-semibold text-white">Open a challenge</h2>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {CLOCK_CHOICES.map((choice) => (
                  <button
                    key={choice.ms}
                    type="button"
                    onClick={() => setClockMs(choice.ms)}
                    className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                      clockMs === choice.ms ? 'bg-white text-black' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                    }`}
                  >
                    {choice.label}
                  </button>
                ))}
                <span className="mx-1 h-5 w-px bg-white/10" aria-hidden="true" />
                <button
                  type="button"
                  onClick={() => setVariant(variant === 'kings-gambit' ? 'standard' : 'kings-gambit')}
                  className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                    variant === 'kings-gambit' ? 'bg-white text-black' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                  }`}
                  title="Every duel opens 1.e4 e5 2.f4 — the gambit the game is named for"
                >
                  King&apos;s Gambit opening
                </button>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => void createChallenge()}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-white px-4 py-2.5 text-xs font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Open the challenge
              </button>
            </div>

            <div className="mt-6">
              <h2 className="mb-3 text-sm font-semibold text-white">Open challenges</h2>
              {lobbyLoading ? (
                <p className="text-xs text-zinc-500">Reading the notice board…</p>
              ) : openChallenges.length === 0 ? (
                <p className="text-xs text-zinc-500">No one is waiting. Open a challenge and hold the board.</p>
              ) : (
                <div className="space-y-2">
                  {openChallenges.map((challenge) => (
                    <ChallengeRow
                      key={challenge.id}
                      match={challenge}
                      mine={challenge.created_by === wallet}
                      busy={busy}
                      onJoin={(target) => void joinChallenge(target)}
                      onCancel={(target) => void cancelChallenge(target)}
                    />
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
