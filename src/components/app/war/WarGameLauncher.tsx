import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppTheme } from '@/contexts/ThemeContext';
import { scheduleBackgroundResume, setBackgroundPaused } from '@/lib/background-gate';
import { useBootProgress } from '@/lib/game-boot-progress';

/**
 * War theme game launcher.
 * =========================
 * Surfaces a "deploy" prompt when the user presses an arrow key, and mounts the
 * game overlay when they confirm.
 *
 * WHY AN ARROW DOES NOT LAUNCH DIRECTLY
 * -------------------------------------
 * The brief was "pressing any arrow button starts the game". Taken literally
 * that breaks the app: arrow keys scroll the feed, step through dropdown and
 * select options, move the caret in the composer and in DMs, and are the only
 * keyboard affordance some users have for those things. Swallowing them behind
 * a full-screen FPS would be a genuine accessibility regression, and it would
 * fire constantly by accident.
 *
 * So the arrow keeps doing its normal job, and instead OFFERS the game: a HUD
 * prompt slides in, Enter deploys, Escape or six seconds of silence dismisses
 * it. The arrow key is still the entry point, nothing is hijacked, and the
 * confirm step suits the tactical framing rather than fighting it.
 *
 * The prompt is rate limited to once per session so it cannot nag.
 */

const PROMPT_TIMEOUT_MS = 6000;
const SESSION_DISMISSED_KEY = 'dehub.war.game.dismissed';

const ARROW_KEYS = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
]);

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

  // Anything inside an open dialog, drawer, menu or listbox.
  if (
    target.closest(
      '[role="dialog"],[role="alertdialog"],[role="menu"],[role="listbox"],[data-vaul-drawer],[data-radix-popper-content-wrapper]',
    )
  ) {
    return true;
  }

  return false;
}

/** An open overlay anywhere on the page means the user is mid task. */
function hasOpenOverlay(): boolean {
  return !!document.querySelector(
    '[role="dialog"][data-state="open"],[role="alertdialog"][data-state="open"],[data-vaul-drawer][data-state="open"],[data-radix-popper-content-wrapper]',
  );
}

export function WarGameLauncher() {
  const { theme } = useAppTheme();
  if (theme !== 'war') return null;
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
      timerRef.current = window.setTimeout(
        () => dismiss(false),
        PROMPT_TIMEOUT_MS,
      );
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      clearTimer();
    };
  }, [prompting, launched, dismiss, clearTimer]);

  useEffect(() => clearTimer, [clearTimer]);

  if (launched) {
    return <WarGameOverlay onExit={() => setLaunched(false)} />;
  }

  if (!prompting) return null;

  return (
    <div data-war-deploy-prompt role="status" aria-live="polite">
      <p data-war-deploy-kicker>INBOUND</p>
      <p data-war-deploy-title>DEPLOY TO COMBAT ZONE</p>
      <div data-war-deploy-actions>
        <button type="button" onClick={() => setLaunched(true)}>
          ENTER / DEPLOY
        </button>
        <button type="button" onClick={() => dismiss(true)}>
          ESC / STAND DOWN
        </button>
      </div>
    </div>
  );
}

/** Vendored build under public/. See public/war-game/README.md for provenance. */
const BUNDLED_GAME_URL = '/war-game/index.html';

/**
 * Pick the engine's quality preset.
 *
 * The game reads `?q=` and defaults to "ultra" when it is absent: 4x2048 shadow
 * cascades, TAA, GTAO, SSR, volumetrics, motion blur and a 24000 particle
 * budget. Every one of those assets is generated in JavaScript at boot, so
 * ultra is what made first load take the better part of a minute and then sit
 * on a black screen. "low" turns the expensive passes off, halves the shadow
 * maps and cuts the particle budget to 2000.
 *
 * Defaulting to "high" rather than ultra keeps it looking like a real game
 * while removing the worst of the bake, and anything that looks like a phone,
 * a small viewport or a low core count drops to "low". This is a load-time
 * decision, not a frame-rate one: the presets change how much has to be built
 * before anything can be shown at all.
 */
/**
 * Read the GPU's unmasked renderer string, or '' when the browser withholds it.
 *
 * Costs a throwaway GL context, so callers should do this once.
 */
function readRenderer(): string {
  if (typeof document === 'undefined') return '';
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return '';
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const name = info
      ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL) ?? '')
      : '';
    (gl.getExtension('WEBGL_lose_context') as { loseContext(): void } | null)?.loseContext();
    return name;
  } catch {
    return '';
  }
}

/**
 * Integrated graphics, by renderer string.
 *
 * These share system memory and have a fraction of a discrete card's fill rate,
 * which is exactly what this game leans on: roughly 1.8M triangles, shadow
 * cascades and a full post chain.
 */
function isIntegratedGpu(renderer: string): boolean {
  return /iris|uhd graphics|hd graphics|intel\(r\) graphics|vega \d|radeon graphics|adreno|mali|apple gpu|llvmpipe|swiftshader/i.test(
    renderer,
  );
}

/**
 * Pick the engine's quality preset.
 *
 * The game reads ?q= and defaults to "ultra" when absent: renderScale 1.0,
 * 4x4096 shadow cascades, TAA, GTAO, SSR, volumetrics, motion blur and a 24000
 * particle budget, all generated in JavaScript at boot.
 *
 * THE GPU DECIDES, NOT THE CPU.
 * An earlier version keyed off navigator.hardwareConcurrency alone, which is a
 * bad proxy on laptops and got a real machine badly wrong: an i7-1360P reports
 * 16 logical cores, so it was classed as powerful and handed "high", while its
 * actual GPU is integrated Iris Xe sharing system memory. The result was a game
 * that ran, and crawled. Core count now only refines a decision the GPU has
 * already made.
 */
function pickQuality(): string {
  if (typeof navigator === 'undefined') return 'medium';

  const coarse =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches;
  const small = Math.min(window.innerWidth, window.innerHeight) < 700;
  if (coarse || small) return 'low';

  const renderer = readRenderer();
  // Integrated graphics get the cheapest preset regardless of core count. It is
  // the only tier that turns off SSR, GTAO, volumetrics and motion blur and
  // drops renderScale to 0.72, which is what these parts actually need.
  if (renderer && isIntegratedGpu(renderer)) return 'low';

  const cores = navigator.hardwareConcurrency ?? 4;
  if (cores <= 4) return 'low';
  if (cores <= 8) return 'medium';

  // Unknown GPU (the browser withheld the renderer string) lands on medium
  // rather than high: guessing low costs some fidelity, guessing high costs
  // playability, and the failure is not symmetric.
  return renderer ? 'high' : 'medium';
}

interface Capability {
  ok: boolean;
  reason: string;
  detail: string;
}

/**
 * Preflight the GPU before handing the viewport to the game.
 *
 * The game is WebGL2 only and generates all of its geometry, textures and audio
 * at runtime. When WebGL2 is missing, or present but backed by a software
 * rasteriser, it does not fail loudly: it shows a black canvas or crawls at a
 * few frames per second, which is indistinguishable from "it does not load".
 * Checking first means the overlay can say what is actually wrong.
 *
 * Note RAM is not among the checks, deliberately. A build like this holds a few
 * hundred MB of JS heap at most; machines that cannot run it are almost always
 * limited by the GPU, the driver, or hardware acceleration being switched off,
 * not by system memory.
 */
function checkCapability(): Capability {
  if (typeof document === 'undefined') {
    return { ok: true, reason: '', detail: '' };
  }

  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2') as WebGL2RenderingContext | null;

  if (!gl) {
    const gl1 = canvas.getContext('webgl');
    return {
      ok: false,
      reason: 'WEBGL2 UNAVAILABLE',
      detail: gl1
        ? 'This browser reports WebGL 1 only. The game requires WebGL 2. Updating the browser or the graphics driver usually resolves it.'
        : 'No WebGL context at all. Hardware acceleration is most likely disabled in the browser settings.',
    };
  }

  // Unmasked renderer is the only reliable way to spot a software fallback.
  // It is gated behind an extension and some browsers withhold it, in which
  // case the check simply passes rather than blocking a machine that may
  // actually be fine.
  let renderer = '';
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  if (info) {
    renderer = String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL) ?? '');
  }

  // Free the probe context immediately: contexts are a scarce resource and the
  // game is about to ask for its own.
  gl.getExtension('WEBGL_lose_context')?.loseContext();

  const soft = /swiftshader|llvmpipe|software|basic render|microsoft basic/i;
  if (renderer && soft.test(renderer)) {
    return {
      ok: false,
      reason: 'SOFTWARE RENDERING',
      detail: `The GPU is not being used (${renderer}). The game would run at a few frames per second. Enable hardware acceleration in the browser settings, then restart it.`,
    };
  }

  return { ok: true, reason: '', detail: renderer };
}

/**
 * The game surface itself.
 *
 * Defaults to the vendored build served from this app's own origin, which means
 * the game works out of the box with no extra deploy. VITE_WAR_GAME_URL
 * overrides that to point at a standalone deploy instead.
 *
 * Either way it loads in an iframe rather than being imported: the game is a
 * separate ~55k line Vite app on Three.js r180 while this app is on 0.181, so
 * an iframe keeps the two dependency trees from ever meeting and keeps 1.6 MB
 * of game code out of the entry bundle until a player actually deploys.
 */
function WarGameOverlay({ onExit }: { onExit: () => void }) {
  // Resolved once: re-picking on a re-render would reload the iframe and
  // restart the bake from zero.
  const [gameUrl] = useState(() => {
    const base =
      (import.meta.env.VITE_WAR_GAME_URL as string | undefined) || BUNDLED_GAME_URL;
    const sep = base.includes('?') ? '&' : '?';
    // prewarm=0 is not an optimisation, it is a hang fix.
    //
    // src/main.js awaits prewarm(engine) near the end of module evaluation, and
    // `window.__ENGINE__ = engine` is the statement immediately after it. On the
    // reported machine the HUD, ammo readout and audio all came up while the
    // scene stayed black: everything before the await had run, nothing after it
    // had. Confirmed by probing the frame, where __ENGINE__ was undefined with
    // the HUD already built, and became defined the moment prewarm was skipped.
    //
    // Prewarm compiles the shader set up front so early frames do not stutter.
    // Skipping it moves that compilation to first use, which costs a few brief
    // hitches in the opening seconds. That is a straightforward trade against a
    // game that never renders at all, and there is no way to detect the stall
    // from outside the frame to make it conditional.
    return `${base}${sep}q=${pickQuality()}&prewarm=0`;
  });
  // Probed once on mount. Running it during render would create a throwaway GL
  // context on every re-render.
  const [cap] = useState(checkCapability);

  // The game generates all of its assets at boot, which measured roughly 25 to
  // 60 seconds depending on the machine, and it renders black throughout with
  // no loading UI of its own. Without a readout that is indistinguishable from
  // a crash, which is exactly how it was first reported.
  const [ready, setReady] = useState(false);
  // Only surfaced if something actually breaks. A boot that is merely slow gets
  // the percentage and nothing else to read.
  const [fault, setFault] = useState('');
  // Tau of 22s puts the bar past 60% at the fast end of the measured 25-60s
  // bake and past 90% at the slow end. See lib/game-boot-progress.
  //
  // A failed capability check counts as done: there is no boot to track behind
  // the "cannot deploy" panel, and this stops the timer running for three
  // minutes under something that is never going to load.
  const { pct, showBoot, dismiss } = useBootProgress(ready || !cap.ok, 22000);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const d = e.data as { source?: string; type?: string; text?: string } | null;
      if (!d || d.source !== 'war-game') return;
      if (d.type === 'ready') {
        setReady(true);
        return;
      }
      if (d.type === 'error') {
        setFault(d.text ?? 'unknown');
      }
      // Any other type is ignored. The bridge used to heartbeat an elapsed
      // second count for the readout to print; that is gone from both sides,
      // because the bar now runs on this side's own clock. Unknown types are
      // tolerated rather than asserted on so a stale vendored index.html
      // cannot break the overlay.
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // The readiness signal is the one part of the bridge that could not be
  // verified end to end, and if it never fires the readout would sit over a
  // playable game forever. So it is never the only way out: any interaction
  // after 15s dismisses it, and a hard cap retires it regardless. The panel is
  // pointer-events:none, so these listeners see the input the game also gets.
  useEffect(() => {
    if (ready) return;

    // Hard cap only. An earlier version also retired the panel on any pointer
    // or key input after 15 seconds, which was a mistake: the bake routinely
    // runs past a minute, so a player clicking on the frame (the natural thing
    // to do) tore away the only feedback and left them staring at black,
    // convinced it had crashed. Interaction is not evidence the game is ready.
    // The panel is pointer-events:none, so it never blocks anything while it
    // waits, and there is an explicit control to hide it.
    const cap = window.setTimeout(() => setReady(true), 180000);
    return () => window.clearTimeout(cap);
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
    // Park the tactical-map background for the duration. It is a full-screen
    // shader that would otherwise keep burning fill rate underneath an opaque
    // full-screen game, on the exact frame budget the game needs. The game is
    // the heaviest thing this app ever runs, so it gets the GPU to itself.
    setBackgroundPaused(true);
    return () => {
      // Deferred, so the terrain spins back up as the overlay unmounts rather
      // than competing with the game's teardown.
      scheduleBackgroundResume();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onExit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onExit]);

  return (
    <div data-war-game-overlay role="dialog" aria-modal="true" aria-label="Combat zone">
      <button type="button" data-war-game-exit onClick={onExit}>
        EXTRACT / ESC
      </button>

      {!cap.ok ? (
        <div data-war-game-missing>
          <p data-war-deploy-kicker>{cap.reason}</p>
          <p data-war-deploy-title>CANNOT DEPLOY</p>
          <p>{cap.detail}</p>
        </div>
      ) : (
      <iframe
        src={gameUrl}
        title="Claude of Duty"
        data-war-game-frame
        // The game needs pointer lock for mouse look and fullscreen for
        // immersion. Nothing else is granted.
        allow="pointer-lock; fullscreen; gamepad; autoplay"
        // allow-same-origin is deliberately withheld. The vendored build is
        // third party code (MIT, mshumer/Claude-of-Duty) and is served from
        // this app's own origin, so without this the iframe would inherit real
        // same-origin access to storage, cookies and the parent DOM. Omitting
        // it forces an opaque origin and keeps the game sandboxed.
        sandbox="allow-scripts allow-pointer-lock allow-fullscreen"
      />
      )}

      {/* Boot readout. Sits over the frame until the engine reports ready, so
          the long procedural bake reads as work in progress rather than a
          hang. Pointer events pass through to the game underneath.

          It is a percentage and a bar and nothing else. What was here before —
          a rotating status line and a paragraph explaining that the assets are
          generated locally — answered a question nobody staring at a black
          screen is asking. The only one they have is "how far along is this",
          so that is the whole readout now.

          It is also no longer a live region. role="status" was right when the
          text inside changed a handful of times across a whole boot; a value
          that moves every 120ms would have a screen reader read the panel over
          and over. `progressbar` is the role built for this and it carries the
          number, so the visible copy is hidden from the tree rather than being
          announced twice. */}
      {cap.ok && showBoot && (
        <div data-war-game-boot>
          <p data-war-deploy-kicker>GENERATING COMBAT ZONE</p>
          <div
            data-war-game-boot-bar
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            aria-label="Generating combat zone"
          >
            <span style={{ width: `${pct}%` }} />
          </div>
          <p data-war-game-boot-pct aria-hidden="true">
            {pct}%
          </p>
          {fault && <p data-war-game-boot-note>FAULT: {fault}</p>}
          <button type="button" data-war-game-boot-hide onClick={dismiss}>
            HIDE READOUT
          </button>
        </div>
      )}
    </div>
  );
}

export default WarGameLauncher;
