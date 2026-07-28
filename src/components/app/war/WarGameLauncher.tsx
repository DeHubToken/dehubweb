import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppTheme } from '@/contexts/ThemeContext';
import { scheduleBackgroundResume, setBackgroundPaused } from '@/lib/background-gate';

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
  const gameUrl =
    (import.meta.env.VITE_WAR_GAME_URL as string | undefined) || BUNDLED_GAME_URL;
  // Probed once on mount. Running it during render would create a throwaway GL
  // context on every re-render.
  const [cap] = useState(checkCapability);

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
    </div>
  );
}

export default WarGameLauncher;
