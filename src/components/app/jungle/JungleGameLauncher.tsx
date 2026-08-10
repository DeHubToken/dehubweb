import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppTheme } from '@/contexts/ThemeContext';
import { scheduleBackgroundResume, setBackgroundPaused } from '@/lib/background-gate';
import { setJunglePhase, setJunglePush } from '@/lib/jungle-cinematic';
import { useBootProgress } from '@/lib/game-boot-progress';
import { isWeakHardware, probeGpu } from '@/lib/game-gpu';

/**
 * Jungle theme game launcher.
 * ===========================
 * Surfaces a "follow the trail" prompt when the user presses an arrow key, and
 * hands the viewport to the game when they confirm.
 *
 * WHY AN ARROW DOES NOT LAUNCH DIRECTLY
 * -------------------------------------
 * Same contract the War launcher settled on, and for the same reason. Taken
 * literally, "an arrow key starts the game" breaks the app: arrow keys scroll
 * the feed, step through dropdown and select options, move the caret in the
 * composer and in DMs, and are the only keyboard affordance some users have for
 * those things. Swallowing them behind a full-screen game would be a genuine
 * accessibility regression and would fire constantly by accident.
 *
 * So the arrow keeps doing its normal job and instead OFFERS the game. The
 * prompt is rate limited to once per session so it cannot nag.
 *
 * THE HAND-OFF IS THE POINT
 * -------------------------
 * The brief: the jungle background is the first scene, so when someone starts
 * the game the side panels slide out and the rest of the content slides up or
 * down off the screen, and then it starts.
 *
 * That is a three-beat sequence and each beat has an owner:
 *
 *   1. CHROME LEAVES.  <html data-jungle-phase="pushing"> — every transition
 *      lives in jungle-coverage.css section 5. No inline styles, so backing out
 *      is a single attribute removal and the same transitions run in reverse.
 *   2. CAMERA PUSHES.  This file eases lib/jungle-cinematic's `push` from 0 to
 *      1 on its own rAF. The background's shader reads it and dollies down the
 *      trail. The easing lives HERE, next to the DOM transition it has to stay
 *      in sync with, rather than inside the background.
 *   3. GAME ARRIVES.   The iframe mounts at the START of the push (its boot is
 *      measured in tens of seconds and must not wait on an animation) but stays
 *      at opacity 0 until the engine reports ready, then crossfades over 900ms
 *      against the live canvas of the same scene.
 *
 * The background is NOT paused during 1 and 2 — it is the scene. It is paused
 * only once the iframe is actually visible, at which point the game gets the
 * GPU to itself.
 */

const PROMPT_TIMEOUT_MS = 7000;
const SESSION_DISMISSED_KEY = 'dehub.jungle.game.dismissed';
/** Camera push duration. Matches the 720ms panel slide plus a beat. */
const PUSH_MS = 900;

const ARROW_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

/**
 * True when the keystroke belongs to something else on the page. Arrow keys are
 * load bearing inside text entry, listboxes, menus, sliders and open dialogs, so
 * the prompt must stay silent in all of them.
 */
function isTypingContext(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;

  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;

  // Radix and friends put these roles on the focused node while open.
  const role = target.getAttribute('role');
  if (
    role === 'combobox' ||
    role === 'listbox' ||
    role === 'option' ||
    role === 'menu' ||
    role === 'menuitem' ||
    role === 'slider' ||
    role === 'textbox'
  ) {
    return true;
  }

  return !!target.closest(
    '[role="dialog"],[role="alertdialog"],[role="menu"],[role="listbox"],[data-vaul-drawer],[data-radix-popper-content-wrapper]',
  );
}

/** An open overlay anywhere on the page means the user is mid task. */
function hasOpenOverlay(): boolean {
  return !!document.querySelector(
    '[role="dialog"][data-state="open"],[role="alertdialog"][data-state="open"],[data-vaul-drawer][data-state="open"],[data-radix-popper-content-wrapper]',
  );
}

export function JungleGameLauncher() {
  const { theme } = useAppTheme();
  if (theme !== 'jungle') return null;
  return <LauncherInner />;
}

function LauncherInner() {
  const [prompting, setPrompting] = useState(false);
  const [launched, setLaunched] = useState(false);
  const timerRef = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const dismiss = useCallback(
    (remember: boolean) => {
      clearTimer();
      setPrompting(false);
      if (remember) {
        try {
          window.sessionStorage.setItem(SESSION_DISMISSED_KEY, '1');
        } catch {
          // private mode: the prompt simply stays available
        }
      }
    },
    [clearTimer],
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Escape always closes whatever this component is showing.
      if (e.key === 'Escape') {
        if (prompting) dismiss(false);
        return;
      }

      if (launched) return;

      if (prompting) {
        if (e.key === 'Enter') {
          // Only now do we take the key, and only because the user is
          // answering a prompt we put on screen.
          e.preventDefault();
          clearTimer();
          setPrompting(false);
          setLaunched(true);
        }
        return;
      }

      if (!ARROW_KEYS.has(e.key)) return;
      // Never react to a shortcut, only to a bare arrow press.
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      if (e.repeat) return;
      if (isTypingContext(e.target)) return;
      if (hasOpenOverlay()) return;

      try {
        if (window.sessionStorage.getItem(SESSION_DISMISSED_KEY) === '1') return;
      } catch {
        // fall through: storage is unavailable, show the prompt
      }

      // Deliberately NOT preventDefault: the arrow still scrolls the feed.
      setPrompting(true);
      clearTimer();
      timerRef.current = window.setTimeout(() => dismiss(false), PROMPT_TIMEOUT_MS);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      clearTimer();
    };
  }, [prompting, launched, dismiss, clearTimer]);

  useEffect(() => clearTimer, [clearTimer]);

  if (launched) {
    return <JungleGameOverlay onExit={() => setLaunched(false)} />;
  }

  if (!prompting) return null;

  return (
    <div data-jungle-deploy-prompt role="status" aria-live="polite">
      <p data-jungle-deploy-kicker>THE TRAIL</p>
      <p data-jungle-deploy-title>Walk into the jungle</p>
      <div data-jungle-deploy-actions>
        <button type="button" onClick={() => setLaunched(true)}>
          ENTER / GO
        </button>
        <button type="button" onClick={() => dismiss(true)}>
          ESC / STAY
        </button>
      </div>
    </div>
  );
}

/** Vendored copy under public/. See public/jungle-game/README.md for provenance. */
const BUNDLED_GAME_URL = '/jungle-game/index.html';

/**
 * Build the game URL.
 *
 * Settings go in the HASH, not the query string — that is where this engine
 * reads them (`new URLSearchParams(location.hash.slice(1))` in src/main.js).
 * Passing `?tier=low` would be silently ignored, which is the kind of bug that
 * looks like "the quality setting does nothing".
 *
 * PINNING IS A LAST RESORT. `pinnedTier` also switches OFF the engine's own
 * adaptive downgrade, which is better than anything guessable from out here: it
 * watches real frame times and steps down after 1.6s of sustained badness. So
 * this pins `low` only where the hardware is not in doubt, and otherwise lets
 * the game open at `high` and find its own level.
 *
 * The GPU decides, not the CPU. Core count is a bad proxy on laptops — an
 * i7-1360P reports 16 logical cores behind integrated Iris Xe — and the War
 * launcher shipped that exact mistake once already.
 */
function buildGameUrl(): string {
  const base = (import.meta.env.VITE_JUNGLE_GAME_URL as string | undefined) || BUNDLED_GAME_URL;

  // Small screen, touch device or integrated graphics — see isWeakHardware for
  // why core count is not part of that decision.
  return isWeakHardware() ? `${base}#tier=low` : base;
}

interface Capability {
  ok: boolean;
  reason: string;
  detail: string;
}

/**
 * Preflight the GPU before handing the viewport to the game.
 *
 * It generates all of its geometry, textures and audio at runtime and does not
 * fail loudly when the GPU cannot keep up: it shows a black canvas or crawls at
 * a few frames per second, which is indistinguishable from "it did not load".
 * Checking first means the overlay can say what is actually wrong.
 *
 * RAM is deliberately not among the checks. A build like this holds a few
 * hundred MB of JS heap at most; machines that cannot run it are almost always
 * limited by the GPU, the driver, or hardware acceleration being switched off.
 */
function checkCapability(): Capability {
  // One probe, one throwaway context, released immediately — contexts are
  // scarce and this page already holds one for the canopy. See lib/game-gpu.
  const gpu = probeGpu();

  if (!gpu.webgl) {
    return {
      ok: false,
      reason: 'NO WEBGL',
      detail:
        'This browser is not giving any page a WebGL context. Hardware acceleration is most likely switched off in the browser settings.',
    };
  }

  // An unknown renderer passes rather than blocking a machine that may be fine.
  if (gpu.software) {
    return {
      ok: false,
      reason: 'SOFTWARE RENDERING',
      detail: `The GPU is not being used (${gpu.renderer}). The walk would run at a few frames per second. Enable hardware acceleration in the browser settings, then restart it.`,
    };
  }

  return { ok: true, reason: '', detail: gpu.renderer };
}

/**
 * The game surface, plus the cinematic that gets us there.
 *
 * The game loads in an iframe rather than being imported: it is a separate
 * ~12k line ES-module app on Three.js r170 while this app is on 0.181, so an
 * iframe keeps the two dependency trees from ever meeting and keeps the whole
 * engine out of the entry bundle until a player actually walks in.
 */
function JungleGameOverlay({ onExit }: { onExit: () => void }) {
  // Resolved once: re-picking on a re-render would change the src and restart
  // the bake from zero.
  const [gameUrl] = useState(buildGameUrl);
  // Probed once on mount. Running it during render would create a throwaway GL
  // context on every re-render.
  const [cap] = useState(checkCapability);

  const [ready, setReady] = useState(false);
  // Only surfaced if something actually breaks. A walk-in that is merely slow
  // gets the percentage and nothing else to read.
  const [fault, setFault] = useState('');
  // Tau of 12s: this bake is a good deal shorter than War's, so the same curve
  // with a smaller constant. See lib/game-boot-progress.
  //
  // A failed capability check counts as done: there is no boot to track behind
  // the "cannot walk in" panel, and this stops the timer running for three
  // minutes under something that is never going to load.
  const { pct, showBoot, dismiss } = useBootProgress(ready || !cap.ok, 12000);

  /* -- beat 1 + 2: chrome leaves, camera pushes ---------------------------- */
  useEffect(() => {
    if (!cap.ok) return;

    setJunglePhase('pushing');

    // Honour reduced motion by skipping the travel, not the outcome: the game
    // still needs the viewport, so the chrome still goes — it just cuts.
    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      setJunglePush(1);
      return;
    }

    let raf = 0;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / PUSH_MS);
      // easeInOutCubic. The push has to START slowly or the canopy appears to
      // jump the moment the panels begin to move, which reads as two separate
      // animations rather than one camera.
      const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      setJunglePush(eased);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);

    return () => cancelAnimationFrame(raf);
  }, [cap.ok]);

  /* Unwind on exit. Runs on unmount so it covers every way out — the button,
     Escape, a route change that unmounts the theme, a theme switch mid-game. */
  useEffect(() => {
    return () => {
      setJunglePhase('idle');
      setJunglePush(0);
    };
  }, []);

  /* -- the bridge --------------------------------------------------------- */
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const d = e.data as { source?: string; type?: string; text?: string } | null;
      if (!d || d.source !== 'jungle-game') return;
      if (d.type === 'ready') {
        setReady(true);
        return;
      }
      if (d.type === 'error') {
        setFault(d.text ?? 'unknown');
      }
      /* Any other type is ignored. The bridge used to heartbeat an elapsed
         second count for the readout to print; that is gone from both sides,
         because the bar now runs on this side's own clock. Unknown types are
         tolerated rather than asserted on so a stale vendored index.html
         cannot break the overlay. */
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  /* The readiness signal must never be the ONLY way out of the readout, or a
     bridge that fails to fire leaves it sitting over a playable game forever.
     A hard cap retires it regardless.

     Note this is a cap and NOT "any interaction dismisses it". The War overlay
     shipped that and it was a mistake: the bake routinely runs past a minute,
     so a player clicking the frame — the natural thing to do — tore away the
     only feedback and left them staring at black, convinced it had crashed.
     Interaction is not evidence the game is ready. */
  useEffect(() => {
    if (ready) return;
    const cap2 = window.setTimeout(() => setReady(true), 180000);
    return () => window.clearTimeout(cap2);
  }, [ready]);

  /* -- beat 3: the game takes the GPU -------------------------------------- */
  useEffect(() => {
    if (!ready) return;
    /* Deliberately NOT at mount. Until the crossfade, the canopy IS the scene
       the user is looking at — pausing it early would freeze the establishing
       shot on its first frame. Once the game is up and opaque, the background
       is a full-screen shader burning fill rate underneath an opaque
       full-screen game, on the exact budget the game needs. */
    const t = window.setTimeout(() => setBackgroundPaused(true), 900);
    return () => {
      window.clearTimeout(t);
      // Deferred, so the canopy spins back up as the overlay unmounts rather
      // than competing with the game's teardown.
      scheduleBackgroundResume();
    };
  }, [ready]);

  useEffect(() => {
    // The game takes over the viewport, so stop the feed scrolling behind it.
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      /* Escape is also how the browser releases pointer lock, so the first
         press while locked belongs to the game, not to us. Checking the lock
         means one press frees the mouse and a second leaves — which is what a
         player expects, and what stops a stray Escape from ending the walk. */
      if (e.key !== 'Escape') return;
      if (document.pointerLockElement) return;
      onExit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onExit]);

  return (
    <div data-jungle-game-overlay role="dialog" aria-modal="true" aria-label="Jungle trail">
      <button type="button" data-jungle-game-exit onClick={onExit}>
        LEAVE / ESC
      </button>

      {!cap.ok ? (
        <div data-jungle-game-missing>
          <p data-jungle-deploy-kicker>{cap.reason}</p>
          <p data-jungle-deploy-title>Cannot walk in</p>
          <p>{cap.detail}</p>
        </div>
      ) : (
        <iframe
          src={gameUrl}
          title="Jungle Trail"
          data-jungle-game-frame
          /* Held at opacity 0 until the engine is up, then crossfaded over the
             live canopy behind it (900ms, in jungle-coverage.css). The frame
             mounts immediately regardless — its bake is the long pole and must
             not wait on an animation. */
          data-visible={ready ? 'true' : 'false'}
          // Pointer lock for mouse look, fullscreen for immersion. Nothing else.
          allow="pointer-lock; fullscreen; gamepad"
          /* allow-same-origin is deliberately withheld. This is third-party code
             (MIT, StarKnightt/jungle-trail) served from our own origin, so
             without this the iframe would inherit real same-origin access to
             storage, cookies and the parent DOM. Omitting it forces an opaque
             origin. The game uses no storage APIs, so it costs nothing. */
          sandbox="allow-scripts allow-pointer-lock allow-fullscreen"
        />
      )}

      {/* Boot readout. Sits over the frame until the engine reports ready, so
          the long procedural bake reads as work in progress rather than a hang.
          Pointer events pass through to the game underneath.

          It is a percentage and a bar and nothing else. What was here before —
          a rotating status line and a paragraph about plants being grown on
          this machine — answered a question nobody staring at a black screen is
          asking. The only one they have is "how far along is this", so that is
          the whole readout now.

          It is also no longer a live region. role="status" was right when the
          text inside changed a handful of times across a whole boot; a value
          that moves every 120ms would have a screen reader read the panel over
          and over. `progressbar` is the role built for this and it carries the
          number, so the visible copy is hidden from the tree rather than being
          announced twice. */}
      {cap.ok && showBoot && (
        <div data-jungle-game-boot>
          <p data-jungle-deploy-title>Growing the forest</p>
          <div
            data-jungle-game-bar
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            aria-label="Growing the forest"
          >
            <span style={{ width: `${pct}%` }} />
          </div>
          <p data-jungle-game-pct aria-hidden="true">
            {pct}%
          </p>
          {fault && <p data-jungle-game-boot-note>Fault: {fault}</p>}
          {/* Both, and in this order. `ready` is what uncovers the frame here
              (it drives data-visible on the iframe), so hiding the readout
              without it would leave the player looking at nothing at all. */}
          <button
            type="button"
            data-jungle-game-boot-hide
            onClick={() => {
              setReady(true);
              dismiss();
            }}
          >
            HIDE
          </button>
        </div>
      )}
    </div>
  );
}

export default JungleGameLauncher;
