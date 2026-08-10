/**
 * Arcade game player
 * ==================
 * `/arcade/:slug` — one game, the whole viewport, nothing else.
 *
 * This is a STANDALONE route, outside AppLayout. The sidebars and the header
 * are the right frame for a feed and the wrong one for a game: all three of
 * these want the full window, two of them take the pointer, and one of them
 * runs a post chain that has to share a frame budget with whatever else is on
 * screen. So the app chrome steps aside and the only host UI left is a way out.
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

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Gamepad2 } from 'lucide-react';
import { SEOHead } from '@/components/SEOHead';
import { useBootProgress } from '@/lib/game-boot-progress';
import { useGameExitRequest } from '@/lib/game-exit-request';
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

  // Resolved once per game. Re-running buildUrl on a render would change the
  // iframe's src and restart a boot that can take the better part of a minute.
  // Same for the preflight, which costs a throwaway GL context each call.
  const gameUrl = useMemo(() => game?.buildUrl() ?? '', [game]);
  const cap = useMemo(() => game?.checkCapability() ?? { ok: true, reason: '', detail: '' }, [game]);

  const [ready, setReady] = useState(false);
  const [fault, setFault] = useState('');
  // A failed preflight counts as "done": there is no boot to track behind the
  // "cannot play" panel, and this stops a timer running for three minutes under
  // something that is never going to load.
  const { pct, showBoot, dismiss } = useBootProgress(ready || !cap.ok, game?.bootTauMs ?? 10000);

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

  // The close button inside the game's own settings/pause menu. It is the exit
  // that works while a pointer lock is (or has just been) held, when the host's
  // corner link is unaimable — see lib/game-exit-request.
  useGameExitRequest(
    game?.exitSource,
    useCallback(() => navigate('/arcade'), [navigate]),
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
        image={`https://dehub.io${game.art}`}
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

      {/* The way out. Above the frame, and never behind the boot panel: a
          player who decides mid-boot that they did not want this must not have
          to wait for a progress bar to finish before they can leave. Escape is
          NOT bound here — two of these games use Escape to release the pointer
          lock, and stealing it would make them impossible to play. */}
      <Link
        to="/arcade"
        className="absolute right-3 top-3 z-20 inline-flex items-center gap-2 rounded-full bg-black/70 px-3 py-2 text-xs font-semibold text-white ring-1 ring-white/15 backdrop-blur transition-colors hover:bg-black/90"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Arcade
      </Link>

      {!cap.ok ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
          <p className="text-[11px] font-semibold tracking-[0.25em] text-amber-400">{cap.reason}</p>
          <p className="text-lg font-semibold text-white">Cannot play {game.title}</p>
          <p className="max-w-md text-xs leading-relaxed text-zinc-400">{cap.detail}</p>
        </div>
      ) : (
        <iframe
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
      {cap.ok && showBoot ? (
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
    </div>
  );
}
