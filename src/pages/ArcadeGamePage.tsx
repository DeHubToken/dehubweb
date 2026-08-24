/**
 * Arcade game player
 * ==================
 * `/arcade/:slug` — one game, the whole viewport, nothing else.
 *
 * This is a STANDALONE route, outside AppLayout. The sidebars and the header
 * are the right frame for a feed and the wrong one for a game: all three of
 * these want the full window, two of them take the pointer, and one of them
 * runs a post chain that has to share a frame budget with whatever else is on
 * screen. So the app chrome steps aside and the host draws no exit of its own:
 * the browser's own Back is always there, and each game's pause menu has a
 * close that routes through the exit bridge below.
 *
 * Everything game-specific — the URL and its settings, the boot shape, the
 * preflight — comes from `config/arcade-games`. This component knows how to
 * host a sandboxed game and nothing about any particular one.
 *
 * WHY AN IFRAME AND NOT AN IMPORT
 * -------------------------------
 * Each game is a separate Vite app pinned to its own Three.js (r170, r180,
 * r185) against this app's 0.181, and one is on React 19. The frame keeps the
 * dependency trees from ever meeting and keeps megabytes of engine out of the
 * entry bundle until somebody actually plays. `allow-same-origin` is withheld,
 * so third-party code served from our own origin still cannot reach app
 * storage, cookies or the parent DOM — see ARCADE_SANDBOX for what that costs
 * and how the vendored builds pay for it.
 */

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Gamepad2, Loader2 } from 'lucide-react';
import { SEOHead } from '@/components/SEOHead';
import { useAuth } from '@/contexts/AuthContext';
import { useBootProgress } from '@/lib/game-boot-progress';
import { useGameExitRequest } from '@/lib/game-exit-request';
import { useGameHostBridge } from '@/lib/game-host-bridge';
import { useGameRun } from '@/lib/game-run-report';
import { formatProgress } from '@/lib/api/arcade-leaderboard';
import { ArcadeLeaderboard } from '@/components/app/arcade/ArcadeLeaderboard';
import { scheduleBackgroundResume, setBackgroundPaused } from '@/lib/background-gate';
import { ARCADE_SANDBOX, getArcadeGame } from '@/config/arcade-games';

/**
 * Hard ceiling on the boot readout, in ms.
 *
 * The readiness signal is a `postMessage` from a vendored `index.html`, and two
 * of the three games have no such bridge at all — they have their own loading
 * screens instead. If the panel could only be retired by a signal, a game whose
 * bridge went stale on a re-vendor would sit behind a progress bar forever. So
 * the cap retires it regardless, well past the slowest boot measured.
 */
const BOOT_CAP_MS = 180000;

/**
 * The real composer, opened over the game when a game asks for it.
 *
 * Lazy for the same reason every other mount of it is: PostModal reaches
 * usePostForm, which reaches the wallet and contract stack. A player who never
 * touches Trenchstar's desk must not pay for that in the arcade bundle —
 * scripts/check-entry-bundle.mjs fails the build if it leaks in.
 */
const PostModal = React.lazy(() =>
  import('@/features/post/PostModal').then((m) => ({ default: m.PostModal })),
);

function NotInTheArcade({ slug }: { slug: string | undefined }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-black px-6 text-center">
      <SEOHead title="Arcade | DeHub" noindex />
      <Gamepad2 className="h-8 w-8 text-zinc-600" />
      <p className="text-sm text-zinc-400">
        There is no game called <span className="font-mono text-zinc-200">{slug}</span> in the arcade.
      </p>
      <Link to="/arcade" className="rounded-full bg-white px-4 py-2 text-xs font-semibold text-black">
        See what is here
      </Link>
    </div>
  );
}

export default function ArcadeGamePage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const game = getArcadeGame(slug);
  const { walletAddress } = useAuth();
  const wallet = walletAddress?.toLowerCase() ?? null;
  const frameRef = useRef<HTMLIFrameElement>(null);

  // Resolved once per game. Re-running buildUrl on a render would change the
  // iframe's src and restart a boot that can take the better part of a minute.
  // Same for the preflight, which costs a throwaway GL context each call.
  const gameUrl = useMemo(() => game?.buildUrl() ?? '', [game]);
  const cap = useMemo(() => game?.checkCapability() ?? { ok: true, reason: '', detail: '' }, [game]);

  const [ready, setReady] = useState(false);
  const [fault, setFault] = useState('');
  // A failed preflight counts as "done": there is no boot to track behind the
  // "cannot play" panel, and this stops a timer running for three minutes under
  // something that is never going to load. A game that paints its own loading
  // screen counts as ready from the start for the same reason — the readout
  // it suppresses must not leave a timer ticking behind it either.
  const { pct, showBoot, dismiss } = useBootProgress(
    ready || !cap.ok || Boolean(game?.hasOwnBootScreen),
    game?.bootTauMs ?? 10000,
  );

  // Readiness bridge, for the games that have one.
  useEffect(() => {
    const source = game?.readySource;
    if (!source) return;
    const onMessage = (e: MessageEvent) => {
      const d = e.data as { source?: string; type?: string; text?: string } | null;
      if (!d || d.source !== source) return;
      if (d.type === 'ready') setReady(true);
      else if (d.type === 'error') setFault(d.text ?? 'unknown');
      // Unknown types are tolerated rather than asserted on, so a stale
      // vendored index.html cannot break the host.
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [game?.readySource]);

  useEffect(() => {
    if (ready) return;
    const timer = window.setTimeout(() => setReady(true), BOOT_CAP_MS);
    return () => window.clearTimeout(timer);
  }, [ready]);

  // The close button inside the game's own settings/pause menu. With no host
  // chrome on screen, this and the browser's Back are the way out; it is also
  // the one that works while a pointer lock is held — see lib/game-exit-request.
  useGameExitRequest(
    game?.exitSource,
    useCallback(() => navigate('/arcade'), [navigate]),
  );

  // "Take me to this post", "give me the feed", "here is what I typed" —
  // Trenchstar's desk monitors are DeHub, and neither the data nor the click
  // can reach the app from inside the frame: no allow-same-origin means no
  // window.open, no top navigation, and an `Origin: null` the API will never
  // answer. Paths are allowlisted, every fetch goes out uncredentialed, and a
  // composed post opens the REAL composer rather than being posted for the
  // frame — see lib/game-host-bridge.
  const [draft, setDraft] = useState<string | null>(null);
  // Mounted on first use and left mounted, so the close animation has
  // something to play on — the same shape AppLayout uses.
  const [composerMounted, setComposerMounted] = useState(false);
  const openComposer = useCallback((text: string) => {
    setComposerMounted(true);
    // A space rather than '' when the game sends nothing: PostModal only
    // resets and applies `initialText` when it is truthy, and an empty draft
    // still has to arrive at an empty composer rather than yesterday's.
    setDraft(text || ' ');
  }, []);
  useGameHostBridge(
    game?.exitSource,
    useMemo(() => ({ address: wallet, onCompose: openComposer }), [wallet, openComposer]),
  );

  // The run bridge, for the games that keep a board. It opens a run on the
  // server when the game says one has started and closes it when the game says
  // it is over; `result` is what comes back, and drawing it is the only thing
  // this page does with a leaderboard while a game is on screen.
  //
  // Gated on being signed in as well as on the preflight: a board row is keyed
  // on a wallet, so with nobody signed in there is no row to write and no
  // reason to spend a request per checkpoint finding that out.
  const run = useGameRun(
    game?.leaderboard?.runSource,
    game?.slug ?? '',
    frameRef,
    cap.ok && Boolean(wallet),
  );

  useEffect(() => {
    // The game owns the viewport; stop the document scrolling behind it.
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    // Park any WebGL theme background for the duration. It is a full-screen
    // shader that would otherwise keep burning fill rate underneath an opaque
    // full-screen game, on the exact frame budget the game needs.
    setBackgroundPaused(true);
    // Deferred on the way out, so the background spins back up as this page
    // unmounts rather than competing with the game's teardown.
    return () => scheduleBackgroundResume();
  }, []);

  if (!game) return <NotInTheArcade slug={slug} />;

  return (
    <div className="fixed inset-0 z-[100] bg-black">
      <SEOHead
        title={`${game.title} | DeHub Arcade`}
        description={game.description}
        // The game's own share card, not `game.art`. Two reasons: the worker
        // serves this card to crawlers and declares it 1200x630, so the SPA
        // must not name a different image at that size; and `art` is a WebP,
        // which several scrapers (X among them) will not render as a preview.
        // The capture stays the JSON-LD image, where a real screenshot belongs.
        image={`https://dehub.io/og/arcade-${game.slug}.jpg`}
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'VideoGame',
          name: game.title,
          description: game.description,
          url: `https://dehub.io/arcade/${game.slug}`,
          image: `https://dehub.io${game.art}`,
          applicationCategory: 'Game',
          gamePlatform: 'Web browser',
          operatingSystem: 'Any',
          playMode: 'SinglePlayer',
          offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        }}
      />

      {!cap.ok ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
          <p className="text-[11px] font-semibold tracking-[0.25em] text-amber-400">{cap.reason}</p>
          <p className="text-lg font-semibold text-white">Cannot play {game.title}</p>
          <p className="max-w-md text-xs leading-relaxed text-zinc-400">{cap.detail}</p>
        </div>
      ) : (
        <iframe
          ref={frameRef}
          src={gameUrl}
          title={game.title}
          className="h-full w-full border-0"
          allow={game.allow}
          // allow-same-origin is deliberately withheld — see ARCADE_SANDBOX.
          sandbox={ARCADE_SANDBOX}
          // For a game with no readiness bridge, the document's own load event
          // is the hand-off: those games have real loading screens of their
          // own, driven by real download counts, and that beats anything this
          // side can model. The host panel only has to cover the gap before
          // the frame's first paint, so it retires the moment there is one.
          onLoad={() => {
            if (!game.readySource) setReady(true);
          }}
        />
      )}

      {/* Boot readout. A percentage and a bar, nothing else: the only question
          somebody staring at a black frame has is "how far along is this".
          pointer-events-none throughout, so it never swallows input the game
          should be getting, and the explicit dismiss is there for the case
          where a game is already playable behind it. */}
      {cap.ok && showBoot && !game.hasOwnBootScreen ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-black/85">
          <p className="text-sm font-semibold text-white">{game.title}</p>
          <div
            role="progressbar"
            aria-label={`Loading ${game.title}`}
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            className="h-1 w-56 overflow-hidden rounded-full bg-white/10"
          >
            <div
              className="h-full rounded-full bg-white transition-[width] duration-200 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>
          {/* Hidden from the accessibility tree: the progressbar above already
              carries the number, and announcing a value that moves every
              120ms would have a screen reader read the panel over and over. */}
          <p aria-hidden="true" className="text-xs tabular-nums text-zinc-500">
            {pct}%
          </p>
          {fault ? <p className="max-w-sm px-8 text-center text-xs text-amber-400">{fault}</p> : null}
          <button
            type="button"
            onClick={dismiss}
            className="pointer-events-auto mt-2 text-[11px] text-zinc-500 underline-offset-2 hover:text-zinc-300 hover:underline"
          >
            Hide this
          </button>
        </div>
      ) : null}

      {/* The run is over. Drawn only once the server has answered, and only
          over a game that keeps a board — it is a result, not a game-over
          screen, and the game already has one of those underneath.

          Dismissable rather than blocking: the frame is still live behind it
          and the player may already be back on the title screen. Nothing here
          touches the game, so closing it is the whole interaction. */}
      {run.result ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/80 p-4">
          <div className="max-h-full w-full max-w-md overflow-y-auto rounded-2xl bg-zinc-950 p-5 ring-1 ring-white/10">
            <p className="text-[11px] font-semibold tracking-[0.25em] text-zinc-500">RUN OVER</p>
            <p className="mt-1 text-lg font-semibold text-white">
              {formatProgress(run.result.progress)} down the street
            </p>
            <p className="mt-0.5 text-xs text-zinc-400">
              {run.result.life > 0 ? `${run.result.life} HP left` : 'No health left'}
              {run.result.scored && run.result.rank ? ` · ranked #${run.result.rank}` : ''}
            </p>
            {run.result.scored ? (
              run.result.improved ? (
                <p className="mt-2 text-xs font-medium text-amber-300">A new personal best.</p>
              ) : (
                <p className="mt-2 text-xs text-zinc-500">Not past your own best — the board keeps that one.</p>
              )
            ) : (
              <p className="mt-2 text-xs text-zinc-500">{run.result.reason}</p>
            )}

            <ArcadeLeaderboard slug={game.slug} wallet={wallet} limit={5} className="mt-5" />

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={run.dismiss}
                className="flex-1 rounded-lg bg-white px-4 py-2 text-xs font-semibold text-black transition-opacity hover:opacity-90"
              >
                Keep playing
              </button>
              <Link
                to="/arcade"
                className="flex-1 rounded-lg bg-zinc-800 px-4 py-2 text-center text-xs font-semibold text-zinc-200 transition-colors hover:bg-zinc-700"
              >
                Back to the arcade
              </Link>
            </div>
          </div>
        </div>
      ) : run.settling ? (
        // A beat between the run ending and the board answering. Small and in
        // the corner: the game is still playable underneath and a full-screen
        // spinner over a live game would be a lie about what is blocked.
        <div className="pointer-events-none absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/70 px-3 py-1.5">
          <Loader2 className="h-3 w-3 animate-spin text-zinc-400" />
          <span className="text-[11px] text-zinc-400">Recording your run…</span>
        </div>
      ) : null}

      {/* Written at the desk, posted from here. The game types the words; the
          wallet, the signature and the quota all stay on this side, which is
          the only reason the frame can be allowed to start a post at all. */}
      {composerMounted ? (
        <Suspense fallback={null}>
          <PostModal
            isOpen={draft !== null}
            onClose={() => setDraft(null)}
            initialText={draft ?? undefined}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
