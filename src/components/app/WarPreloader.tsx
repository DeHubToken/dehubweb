import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { useAppTheme } from '@/contexts/ThemeContext';
import { capPixelRatio, releaseContext } from '@/lib/three/scene-helpers';
import { createFrameThrottle } from '@/lib/raf-throttle';
import { scheduleBackgroundResume, setBackgroundPaused } from '@/lib/background-gate';

/**
 * "War" theme boot sequence: the army boot readout.
 * =================================================
 * A recon globe (latitude/longitude graticule, landmass dot cloud, sweeping
 * scan plane, five target locks that acquire one by one behind bracket
 * reticles, one orbit ring carrying a tracked contact) sits inside a HUD frame
 * of corner brackets, tick rulers, a segmented progress meter, a boot log and
 * corner status readouts.
 *
 * Contract, in priority order:
 *
 *  1. IT CAN NEVER TRAP THE USER. Three independent exits: a rAF timeline, a
 *     `setTimeout` hard ceiling that still fires when rAF is halted in a
 *     background tab, and Escape / click / a real focusable skip button. The
 *     panel also releases pointer events the instant the wipe starts.
 *  2. IT PLAYS ONCE PER SESSION, ON A COLD START. `sessionStorage` scopes it to
 *     the session (a hard refresh replays it, which is what people expect from
 *     this device); `isColdStart()` additionally suppresses it when the chunk
 *     is pulled in by picking War from Settings, so choosing a theme never
 *     locks the settings page behind a boot animation.
 *  3. IT DOES NOT FIGHT THE APP FOR THE GPU. The terrain background is paused
 *     through `background-gate` for the whole boot, so only one WebGL context
 *     is doing work while the app's lazy chunks land, and it is spun back up as
 *     the shutter opens rather than after it.
 *  4. REACT STATE IS ONLY WRITTEN WHEN A RENDERED VALUE CHANGES. The meter
 *     cells, the log line count and the lock count are integers, so the whole
 *     sequence commits at most ~28 times. The percent readout would commit ~100
 *     times on its own, so it is written straight to its node through a ref.
 *
 * Colour note: the custom shaders write `gl_FragColor` with no colour-space
 * encode, so HUD_CYAN is constructed in the working space (LinearSRGBColorSpace
 * tells THREE.Color "these components are already working space") and the raw
 * sRGB triple reaches the framebuffer unconverted. That is what makes the
 * canvas cyan match `--war-hud: 79 227 224` in war-theme.css instead of
 * displaying as a darker, greener #15C1BE.
 */

/** Session flag. Written on mount, so an abandoned boot still counts as played. */
const SESSION_KEY = 'dehub.war.booted';

/** Time on screen, so the sequence never flashes on a warm cache. */
const MIN_DURATION_MS = 2200;
/** Hard ceiling, so a slow network can never hold the screen. */
const MAX_DURATION_MS = 4200;
/** prefers-reduced-motion: static frame, minimal dwell. */
const REDUCED_DURATION_MS = 700;
/** Shutter wipe. Must match the transition duration on [data-war-boot]. */
const WIPE_MS = 620;

/** Cells in the segmented meter. Also the upper bound on React commits. */
const CELL_COUNT = 28;
const METER_CELLS = Array.from({ length: CELL_COUNT }, (_, i) => i);

const EASE_POWER = 2.2;
/** Decelerating progress, so the bar does not sit pinned at 100% waiting. */
const easeOut = (t: number) => 1 - Math.pow(1 - t, EASE_POWER);
/** Inverse of easeOut, used to place globe events on the same timeline. */
const easeOutInverse = (v: number) => 1 - Math.pow(1 - v, 1 / EASE_POWER);

interface BootLine {
  label: string;
  value: string;
}

const BOOT_LINES: BootLine[] = [
  { label: 'POWER ON SELF TEST', value: 'OK' },
  { label: 'CRYPTO MODULE / AES-256', value: 'OK' },
  { label: 'UPLINK / GEOSTATIONARY', value: 'ACQUIRED' },
  { label: 'NODE HANDSHAKE 0x4F3A', value: 'COMPLETE' },
  { label: 'MAP DATA / TERRAIN CACHE', value: 'SYNCED' },
  { label: 'TRACK / 05 CONTACTS', value: 'LOCKED' },
  { label: 'OPERATOR CLEARANCE', value: 'GRANTED' },
];

/** Eased-progress point at which each log line commits. */
const LOG_AT = [0.05, 0.17, 0.31, 0.45, 0.60, 0.76, 0.93];

interface TrackRow {
  id: string;
  bearing: string;
  /** Latitude in degrees, on the globe. */
  lat: number;
  /** Longitude in degrees, on the globe. */
  lon: number;
}

/**
 * The five target locks. One record drives both the globe instances and the
 * DOM track list, so the readout and the canvas can never disagree.
 */
const TRACKS: TrackRow[] = [
  { id: 'TGT-01', bearing: '034', lat: 34, lon: -22 },
  { id: 'TGT-02', bearing: '112', lat: -12, lon: 48 },
  { id: 'TGT-03', bearing: '208', lat: 51, lon: 96 },
  { id: 'TGT-04', bearing: '295', lat: -38, lon: -104 },
  { id: 'TGT-05', bearing: '341', lat: 8, lon: 155 },
];

/** Eased-progress point at which each lock acquires. */
const LOCK_AT = [0.22, 0.38, 0.54, 0.70, 0.86];
/** The same events in seconds on the globe clock. */
const LOCK_ACQUIRE_S = LOCK_AT.map(
  (fraction) => (MIN_DURATION_MS / 1000) * easeOutInverse(fraction),
);

const HEAD_LEFT = [
  { label: 'NODE', value: 'DH-114' },
  { label: 'GRID', value: '37N 05E' },
  { label: 'MODE', value: 'RECON' },
];

const HEAD_RIGHT = [
  { label: 'LINK', value: 'SATCOM' },
  { label: 'CIPHER', value: 'AES-256' },
  { label: 'BAND', value: 'KU 12.4' },
];

const FOOT_CHIPS = ['SECTOR 07', 'BEARING 214', 'ELEV 1180 M', 'RANGE 4.2 KM'];

/**
 * Milliseconds from navigation start to this chunk being evaluated. On a real
 * page load the chunk is imported during the app's first render; picking War in
 * Settings imports it much later, after the user has already clicked something.
 */
const CHUNK_LOADED_AT =
  typeof performance !== 'undefined' ? performance.now() : 0;
const COLD_START_WINDOW_MS = 10_000;

function isColdStart(): boolean {
  if (CHUNK_LOADED_AT > COLD_START_WINDOW_MS) return false;
  if (typeof navigator === 'undefined') return true;
  // Sticky activation resets per document, so it is false on a fresh load and
  // true the moment the user clicks a theme tile.
  const activation = (
    navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }
  ).userActivation;
  if (activation && activation.hasBeenActive) return false;
  return true;
}

function shouldArm(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (window.sessionStorage.getItem(SESSION_KEY) === '1') return false;
  } catch {
    // Private mode: fall through and let the cold-start check decide.
  }
  return isColdStart();
}

export function WarPreloader() {
  const { theme } = useAppTheme();
  // Resolved once, on the first render of the session. Re-running it after a
  // theme switch would re-arm the sequence mid-session.
  const [armed] = useState(shouldArm);

  if (theme !== 'war' || !armed) return null;
  return <WarBootSequence />;
}

interface Stage {
  cells: number;
  logs: number;
  locks: number;
}

const STAGE_ZERO: Stage = { cells: 0, logs: 0, locks: 0 };

function WarBootSequence() {
  const [visible, setVisible] = useState(true);
  const [leaving, setLeaving] = useState(false);
  const [stage, setStage] = useState<Stage>(STAGE_ZERO);

  const [prefersReducedMotion] = useState(
    () =>
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  const pctRef = useRef<HTMLParagraphElement>(null);
  const meterRef = useRef<HTMLDivElement>(null);
  const skipRef = useRef<HTMLButtonElement>(null);
  const dismissedRef = useRef(false);
  const wipeTimerRef = useRef<number | null>(null);

  const wipeMs = prefersReducedMotion ? 0 : WIPE_MS;

  /**
   * Idempotent. Safe to call from the timeline, the ceiling timer, Escape, a
   * click anywhere on the panel, the skip button, or a hidden tab.
   */
  const dismiss = useCallback(() => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;

    // Hand the GPU back before the shutter opens, so the terrain is already
    // running by the time it is visible rather than popping in after.
    scheduleBackgroundResume(0);

    // Never strand focus on a node that is about to be removed.
    const skip = skipRef.current;
    if (skip && typeof document !== 'undefined' && document.activeElement === skip) {
      skip.blur();
    }

    setLeaving(true);
    wipeTimerRef.current = window.setTimeout(() => {
      wipeTimerRef.current = null;
      setVisible(false);
    }, wipeMs);
  }, [wipeMs]);

  // ---- Timeline -----------------------------------------------------------
  useEffect(() => {
    // Written on mount, not on dismiss: a boot abandoned by a theme switch or a
    // navigation still counts as played, so it cannot replay on arrival.
    try {
      window.sessionStorage.setItem(SESSION_KEY, '1');
    } catch {
      // Private mode. The sequence simply replays next session.
    }

    const started = performance.now();
    let raf = 0;

    const writePercent = (value: number) => {
      const node = pctRef.current;
      if (node) node.textContent = `${String(value).padStart(3, '0')}%`;
      const meter = meterRef.current;
      if (meter) meter.style.setProperty('--war-fill', (value / 100).toFixed(3));
    };

    // Safety net independent of the rAF clock, which stops in a hidden tab.
    const ceiling = window.setTimeout(dismiss, MAX_DURATION_MS);

    // Escape always releases the screen. Never trap a returning user.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss();
    };
    window.addEventListener('keydown', onKey);

    // Nobody is watching a boot animation in a background tab, and rAF is
    // halted there anyway, so drop straight through to the app.
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') dismiss();
    };
    document.addEventListener('visibilitychange', onVisibility);

    if (prefersReducedMotion) {
      // No globe, no animated fill: the completed readout, then out.
      writePercent(100);
      setStage({
        cells: CELL_COUNT,
        logs: BOOT_LINES.length,
        locks: TRACKS.length,
      });
      const settle = window.setTimeout(dismiss, REDUCED_DURATION_MS);
      return () => {
        window.clearTimeout(settle);
        window.clearTimeout(ceiling);
        window.removeEventListener('keydown', onKey);
        document.removeEventListener('visibilitychange', onVisibility);
      };
    }

    // React state is committed only when one of these integers changes, so the
    // whole sequence costs at most CELL_COUNT renders rather than one a frame.
    let lastPct = -1;
    let lastCells = -1;
    let lastLogs = -1;
    let lastLocks = -1;

    const tick = (now: number) => {
      // The ceiling can win in a throttled tab. Stop committing once it has.
      if (dismissedRef.current) return;

      const t = Math.min((now - started) / MIN_DURATION_MS, 1);
      const eased = easeOut(t);

      const pct = Math.round(eased * 100);
      if (pct !== lastPct) {
        lastPct = pct;
        writePercent(pct);
      }

      const cells = Math.min(CELL_COUNT, Math.floor(eased * CELL_COUNT));
      let logs = 0;
      for (let i = 0; i < LOG_AT.length; i++) {
        if (eased >= LOG_AT[i]) logs = i + 1;
      }
      let locks = 0;
      for (let i = 0; i < LOCK_AT.length; i++) {
        if (eased >= LOCK_AT[i]) locks = i + 1;
      }

      if (cells !== lastCells || logs !== lastLogs || locks !== lastLocks) {
        lastCells = cells;
        lastLogs = logs;
        lastLocks = locks;
        setStage({ cells, logs, locks });
      }

      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        dismiss();
      }
    };

    writePercent(0);
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(ceiling);
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [dismiss, prefersReducedMotion]);

  // The wipe timer lives outside the timeline effect because dismiss() can be
  // called after it has torn down. Clearing it here stops a setState landing on
  // an unmounted tree when the theme is switched mid-wipe.
  useEffect(
    () => () => {
      if (wipeTimerRef.current !== null) {
        window.clearTimeout(wipeTimerRef.current);
        wipeTimerRef.current = null;
      }
    },
    [],
  );

  // Park the terrain scene: two full-screen WebGL contexts rendering at once,
  // one of them fully occluded, is the worst thing this theme can do to a phone.
  useEffect(() => {
    setBackgroundPaused(true);
    return () => {
      scheduleBackgroundResume(0);
    };
  }, []);

  // Style hook for the sheet, so chrome (scanlines, overlays) can stand down
  // while the boot panel owns the screen.
  useEffect(() => {
    const root = document.documentElement;
    if (!visible) {
      delete root.dataset.warBooting;
      return;
    }
    root.dataset.warBooting = leaving ? 'leaving' : 'active';
    return () => {
      delete root.dataset.warBooting;
    };
  }, [visible, leaving]);

  // Give keyboard and screen reader users a real, reachable way out. This moves
  // focus INTO the panel but never contains it: Tab and Shift+Tab leave freely.
  useEffect(() => {
    const btn = skipRef.current;
    if (!btn) return;
    const id = window.setTimeout(() => btn.focus({ preventScroll: true }), 0);
    return () => window.clearTimeout(id);
  }, []);

  if (!visible) return null;

  const complete = stage.logs >= BOOT_LINES.length;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Secure link boot sequence"
      aria-busy={!complete}
      data-war-boot
      data-leaving={leaving ? 'true' : 'false'}
      data-reduced={prefersReducedMotion ? 'true' : 'false'}
      onClick={dismiss}
      style={{ pointerEvents: leaving ? 'none' : 'auto' }}
      className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden"
    >
      {/*
        The only text in the live region. Everything else is aria-hidden, so the
        percent readout walking 000 to 100 cannot queue ~100 announcements.
      */}
      <span className="sr-only">
        {complete
          ? 'Secure link established.'
          : 'Establishing secure link. Please wait.'}
      </span>

      {!prefersReducedMotion && <BootGlobe />}

      {/* ---- HUD chrome ---------------------------------------------------- */}
      <div aria-hidden="true" data-war-boot-chrome className="absolute inset-0 pointer-events-none">
        <span data-war-bracket="tl" />
        <span data-war-bracket="tr" />
        <span data-war-bracket="bl" />
        <span data-war-bracket="br" />

        {/* Tick rulers. The marks themselves are a CSS gradient, zero DOM. */}
        <span data-war-ruler="top" className="absolute inset-x-0 top-0" />
        <span data-war-ruler="bottom" className="absolute inset-x-0 bottom-0" />

        {/* Crosshair. CSS owns width/height; auto margins centre it. */}
        <span data-war-reticle className="absolute inset-0 m-auto" />

        <div
          data-war-boot-corner="tl"
          className="absolute left-5 top-16 flex flex-col gap-1 sm:left-14"
        >
          {HEAD_LEFT.map((row) => (
            <span key={row.label} data-war-readout>
              <span data-war-readout-label>{row.label}</span>
              <span data-war-readout-value>{row.value}</span>
            </span>
          ))}
        </div>

        <div
          data-war-boot-corner="tr"
          className="absolute right-5 top-16 hidden flex-col items-end gap-1 sm:right-14 sm:flex"
        >
          {HEAD_RIGHT.map((row) => (
            <span key={row.label} data-war-readout>
              <span data-war-readout-label>{row.label}</span>
              <span data-war-readout-value>{row.value}</span>
            </span>
          ))}
        </div>

        <ol
          data-war-boot-tracks
          className="absolute bottom-28 right-5 hidden list-none flex-col items-end gap-1 md:flex lg:right-14"
        >
          {TRACKS.map((track, i) => (
            <li
              key={track.id}
              data-war-track
              data-acquired={i < stage.locks ? 'true' : 'false'}
            >
              <span data-war-track-id>{track.id}</span>
              <span data-war-track-bearing>BRG {track.bearing}</span>
              <span data-war-track-state>
                {i < stage.locks ? 'LOCK' : 'SCAN'}
              </span>
            </li>
          ))}
        </ol>
      </div>

      {/* ---- Centre readout ------------------------------------------------ */}
      <div
        aria-hidden="true"
        data-war-boot-panel
        className="relative z-10 w-full max-w-xl px-6 text-center"
      >
        <p data-war-boot-kicker>DEHUB // TACTICAL NETWORK</p>
        <h1 data-war-boot-title>ESTABLISHING SECURE LINK</h1>
        <p data-war-boot-sub>STAND BY FOR OPERATOR CLEARANCE</p>

        <div data-war-boot-bar data-war-meter ref={meterRef}>
          {METER_CELLS.map((cell) => (
            <span
              key={cell}
              data-filled={cell < stage.cells ? 'true' : 'false'}
              data-lead={cell === stage.cells - 1 ? 'true' : 'false'}
            />
          ))}
        </div>

        {/*
          Written imperatively by the timeline. The children prop is a constant,
          so React sets it once on mount and never diffs it again.
        */}
        <p data-war-boot-pct ref={pctRef}>000%</p>

        <ol data-war-boot-log className="list-none">
          {BOOT_LINES.slice(0, stage.logs).map((line) => (
            <li key={line.label} data-war-boot-line>
              <span data-war-log-label>{line.label}</span>
              <span data-war-log-dots />
              <span data-war-log-value>{line.value}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* ---- Exit ---------------------------------------------------------- */}
      <div className="absolute inset-x-0 bottom-8 z-10 flex flex-col items-center gap-3 px-6">
        <div
          aria-hidden="true"
          data-war-boot-status
          className="hidden flex-wrap justify-center gap-2 sm:flex"
        >
          {FOOT_CHIPS.map((chip) => (
            <span key={chip} data-war-chip>
              {chip}
            </span>
          ))}
        </div>

        <button
          type="button"
          ref={skipRef}
          data-war-boot-skip
          aria-label="Skip boot sequence"
          onClick={dismiss}
        >
          SKIP
          <span data-war-key aria-hidden="true">
            ESC
          </span>
        </button>
      </div>
    </div>
  );
}

/* ==========================================================================
   Recon globe
   ========================================================================== */

/**
 * HUD cyan, matching `--war-hud: 79 227 224`.
 *
 * Built in the working colour space on purpose. THREE.ColorManagement is on by
 * default in r181, so `new THREE.Color('#4fe3e0')` would store the linear-sRGB
 * triple; these shaders write gl_FragColor with no `<colorspace_fragment>`
 * encode, so that linear triple would reach an sRGB framebuffer unconverted and
 * display markedly darker and greener than the CSS chrome.
 */
const HUD_CYAN = new THREE.Color().setRGB(
  79 / 255,
  227 / 255,
  224 / 255,
  THREE.LinearSRGBColorSpace,
);

const GLOBE_R = 2.35;
/** Radius that must stay fully on screen. Slightly beyond the orbit ring. */
const FIT_RADIUS = 4.4;
const RING_R = 3.25;
const TAIL_POINTS = 9;
/** Marker size in CSS pixels. Locks hold this size at any depth, like a real HUD. */
const MARKER_PX = 30;

const MERIDIAN_COUNT = 12;
const MERIDIAN_SEGS = 56;
const PARALLEL_LATS = [-60, -30, 0, 30, 60];
const PARALLEL_SEGS = 80;

const LAND_SAMPLES = 2800;
const LAND_THRESHOLD = 0.545;

const DEG = Math.PI / 180;

function buildGraticule(): { position: Float32Array; major: Float32Array } {
  const pos: number[] = [];
  const maj: number[] = [];

  const push = (latRad: number, lonRad: number, isMajor: number) => {
    const cy = Math.cos(latRad);
    pos.push(
      cy * Math.cos(lonRad) * GLOBE_R,
      Math.sin(latRad) * GLOBE_R,
      cy * Math.sin(lonRad) * GLOBE_R,
    );
    maj.push(isMajor);
  };

  const halfPi = Math.PI / 2;
  for (let m = 0; m < MERIDIAN_COUNT; m++) {
    const lon = (m / MERIDIAN_COUNT) * Math.PI * 2;
    // Prime meridian and its antimeridian form one bright great circle.
    const isMajor = m === 0 || m === MERIDIAN_COUNT / 2 ? 1 : 0;
    for (let s = 0; s < MERIDIAN_SEGS; s++) {
      push(-halfPi + (s / MERIDIAN_SEGS) * Math.PI, lon, isMajor);
      push(-halfPi + ((s + 1) / MERIDIAN_SEGS) * Math.PI, lon, isMajor);
    }
  }

  for (let i = 0; i < PARALLEL_LATS.length; i++) {
    const lat = PARALLEL_LATS[i] * DEG;
    const isMajor = PARALLEL_LATS[i] === 0 ? 1 : 0;
    for (let s = 0; s < PARALLEL_SEGS; s++) {
      push(lat, (s / PARALLEL_SEGS) * Math.PI * 2, isMajor);
      push(lat, ((s + 1) / PARALLEL_SEGS) * Math.PI * 2, isMajor);
    }
  }

  return { position: Float32Array.from(pos), major: Float32Array.from(maj) };
}

const fract = (v: number) => v - Math.floor(v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const fade = (t: number) => t * t * (3 - 2 * t);

function hash3(x: number, y: number, z: number): number {
  return fract(Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453);
}

/** Trilinear value noise. Deterministic, so the coastlines never shift. */
function valueNoise3(x: number, y: number, z: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = fade(x - ix);
  const fy = fade(y - iy);
  const fz = fade(z - iz);

  const x00 = lerp(hash3(ix, iy, iz), hash3(ix + 1, iy, iz), fx);
  const x10 = lerp(hash3(ix, iy + 1, iz), hash3(ix + 1, iy + 1, iz), fx);
  const x01 = lerp(hash3(ix, iy, iz + 1), hash3(ix + 1, iy, iz + 1), fx);
  const x11 = lerp(hash3(ix, iy + 1, iz + 1), hash3(ix + 1, iy + 1, iz + 1), fx);

  return lerp(lerp(x00, x10, fy), lerp(x01, x11, fy), fz);
}

/**
 * Landmasses as a dot cloud: a Fibonacci sphere filtered by two octaves of 3D
 * value noise. Reads unmistakably as continents without shipping a coastline
 * dataset, and costs a couple of milliseconds once at mount.
 */
function buildLandmass(): Float32Array {
  const out: number[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  const radius = GLOBE_R * 1.004;

  for (let i = 0; i < LAND_SAMPLES; i++) {
    const y = 1 - (i / (LAND_SAMPLES - 1)) * 2;
    const ring = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;
    const x = Math.cos(theta) * ring;
    const z = Math.sin(theta) * ring;

    const n =
      valueNoise3(x * 1.7 + 11.3, y * 1.7 + 4.1, z * 1.7 + 7.7) * 0.65 +
      valueNoise3(x * 3.9, y * 3.9, z * 3.9) * 0.35;
    if (n < LAND_THRESHOLD) continue;

    out.push(x * radius, y * radius, z * radius);
  }

  return Float32Array.from(out);
}

const GRAT_VERT = /* glsl */ `
  attribute float a_major;
  varying float v_face;
  varying float v_axis;
  varying float v_major;

  void main() {
    // Facing term in VIEW space, so the back of the globe stays dim while the
    // sphere spins. Object-space z would rotate with the mesh and read wrong.
    vec3 n = normalize(normalMatrix * position);
    v_face = n.z;
    v_axis = position.y;
    v_major = a_major;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const GRAT_FRAG = /* glsl */ `
  uniform vec3 u_hud;
  uniform float u_scan;
  varying float v_face;
  varying float v_axis;
  varying float v_major;

  void main() {
    float front = smoothstep(-0.85, 0.85, v_face);
    float base = 0.07 + front * 0.26;
    // Scan plane travelling along the globe's own axis.
    float band = exp(-abs(v_axis - u_scan) * 5.5) * (0.28 + front * 0.55);
    float a = (base + band) * mix(0.78, 1.5, v_major);
    gl_FragColor = vec4(u_hud, clamp(a, 0.0, 1.0));
  }
`;

const LAND_VERT = /* glsl */ `
  uniform float u_dpr;
  uniform float u_scan;
  varying float v_a;

  void main() {
    vec3 n = normalize(normalMatrix * position);
    float front = smoothstep(-0.15, 0.42, n.z);
    float band = exp(-abs(position.y - u_scan) * 4.5);
    v_a = front * (0.34 + band * 0.9);
    // gl_PointSize is in device pixels, so it has to carry the pixel ratio or
    // the dot cloud thins out on exactly the hi-DPI phones that need it most.
    gl_PointSize = (1.5 + band * 1.6) * u_dpr;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const LAND_FRAG = /* glsl */ `
  uniform vec3 u_hud;
  varying float v_a;

  void main() {
    gl_FragColor = vec4(u_hud, clamp(v_a, 0.0, 1.0) * 0.62);
  }
`;

const LOCK_VERT = /* glsl */ `
  uniform float u_time;
  uniform vec2 u_resolution;
  uniform float u_px;
  attribute vec3 a_offset;
  attribute float a_acquire;
  varying vec2 v_uv;
  varying float v_state;
  varying float v_flash;
  varying float v_face;
  varying float v_texel;

  void main() {
    vec4 clip = projectionMatrix * modelViewMatrix * vec4(a_offset, 1.0);

    float since = u_time - a_acquire;
    float s = clamp(since / 0.34, 0.0, 1.0);
    float ease = 1.0 - pow(1.0 - s, 4.0);
    // The reticle starts oversized and snaps inward: acquisition, not fade-in.
    float scale = mix(3.1, 1.0, ease);

    vec3 n = normalize(normalMatrix * a_offset);
    v_face = smoothstep(-0.05, 0.30, n.z);
    v_state = ease;
    v_flash = exp(-max(since, 0.0) * 5.0) * step(0.0, since);
    v_uv = uv;
    // Quad-space units per device pixel, so strokes stay hairlines at any DPR.
    v_texel = 2.0 / max(u_px * scale, 1.0);

    // Constant pixel size: HUD markers must not shrink with distance.
    clip.xy += position.xy * scale * (2.0 * u_px) / u_resolution * clip.w;
    if (clip.w <= 0.0) {
      clip = vec4(2.0, 2.0, 2.0, 1.0);
    }
    gl_Position = clip;
  }
`;

const LOCK_FRAG = /* glsl */ `
  uniform vec3 u_hud;
  varying vec2 v_uv;
  varying float v_state;
  varying float v_flash;
  varying float v_face;
  varying float v_texel;

  void main() {
    vec2 p = v_uv * 2.0 - 1.0;
    vec2 q = abs(p);
    float outer = max(q.x, q.y);
    float inner = min(q.x, q.y);

    // Four corner brackets: a thin square stroke, kept only near the corners.
    float stroke = 1.0 - smoothstep(0.0, v_texel * 1.3, abs(outer - 0.94));
    float corner = smoothstep(0.60, 0.60 + v_texel * 2.0, inner);
    float bracket = stroke * corner;

    // Centre pip as a solid diamond, straight off the reference sheet.
    float diamond = q.x + q.y;
    float pip = 1.0 - smoothstep(0.13, 0.13 + v_texel * 2.0, diamond);

    float d = length(p);
    float halo = exp(-d * 3.6) * 0.08;

    float a = (bracket * 0.95 + pip * 0.8 + halo) * v_state * v_face;
    a += v_flash * 0.5 * v_face * (1.0 - smoothstep(0.2, 1.15, d));

    gl_FragColor = vec4(u_hud, clamp(a, 0.0, 1.0));
  }
`;

const TAIL_VERT = /* glsl */ `
  uniform float u_dpr;
  attribute float a_idx;
  varying float v_t;

  void main() {
    v_t = 1.0 - a_idx / float(${TAIL_POINTS});
    gl_PointSize = (1.2 + v_t * v_t * 3.4) * u_dpr;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const TAIL_FRAG = /* glsl */ `
  uniform vec3 u_hud;
  varying float v_t;

  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float a = (1.0 - smoothstep(0.18, 0.5, d)) * v_t * v_t * 0.9;
    gl_FragColor = vec4(u_hud, a);
  }
`;

/**
 * Five draw calls: graticule, landmass, target locks, orbit ring, ring contact.
 * Roughly 3,900 vertex invocations a frame, which is affordable next to a
 * hydrating app because the terrain scene is parked for the duration.
 */
function BootGlobe() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        // 1px HUD strokes read sharper without MSAA, and a full-screen 4x
        // resolve every frame is the last thing a booting app needs.
        antialias: false,
        alpha: true,
        powerPreference: 'high-performance',
      });
    } catch {
      // No WebGL, or the browser's context ceiling was hit by theme churn.
      // The CSS chrome carries the whole sequence on its own.
      return;
    }

    renderer.domElement.addEventListener(
      'webglcontextlost',
      (e) => e.preventDefault(),
      false,
    );
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      42,
      window.innerWidth / Math.max(1, window.innerHeight),
      0.1,
      60,
    );

    // ---- Shared uniforms (one object per value, shared by every material) ---
    const uTime = { value: 0 };
    const uScan = { value: 0 };
    const uHud = { value: HUD_CYAN.clone() };
    const uDpr = { value: 1 };
    const uPx = { value: MARKER_PX };
    const uRes = { value: new THREE.Vector2(1, 1) };

    // Axial tilt, then spin, so the scan plane sweeps the tilted axis.
    const tilt = new THREE.Group();
    tilt.rotation.set(0.1, 0, 0.26);
    scene.add(tilt);
    const spin = new THREE.Group();
    tilt.add(spin);

    // ---- 1. Graticule ------------------------------------------------------
    const grat = buildGraticule();
    const gratGeo = new THREE.BufferGeometry();
    gratGeo.setAttribute('position', new THREE.BufferAttribute(grat.position, 3));
    gratGeo.setAttribute('a_major', new THREE.BufferAttribute(grat.major, 1));
    const gratMat = new THREE.ShaderMaterial({
      uniforms: { u_hud: uHud, u_scan: uScan },
      vertexShader: GRAT_VERT,
      fragmentShader: GRAT_FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });
    const graticule = new THREE.LineSegments(gratGeo, gratMat);
    graticule.renderOrder = 0;
    spin.add(graticule);

    // ---- 2. Landmass -------------------------------------------------------
    const landPos = buildLandmass();
    const landGeo = new THREE.BufferGeometry();
    landGeo.setAttribute('position', new THREE.BufferAttribute(landPos, 3));
    const landMat = new THREE.ShaderMaterial({
      uniforms: { u_hud: uHud, u_scan: uScan, u_dpr: uDpr },
      vertexShader: LAND_VERT,
      fragmentShader: LAND_FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });
    const landmass = new THREE.Points(landGeo, landMat);
    landmass.renderOrder = 1;
    spin.add(landmass);

    // ---- 3. Target locks ---------------------------------------------------
    const lockGeo = new THREE.InstancedBufferGeometry();
    lockGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(
        new Float32Array([
          -0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0,
        ]),
        3,
      ),
    );
    lockGeo.setAttribute(
      'uv',
      new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2),
    );
    lockGeo.setIndex([0, 1, 2, 0, 2, 3]);

    const lockOffsets = new Float32Array(TRACKS.length * 3);
    const lockAcquire = new Float32Array(TRACKS.length);
    for (let i = 0; i < TRACKS.length; i++) {
      const lat = TRACKS[i].lat * DEG;
      const lon = TRACKS[i].lon * DEG;
      const cy = Math.cos(lat);
      const r = GLOBE_R * 1.015;
      lockOffsets[i * 3] = cy * Math.cos(lon) * r;
      lockOffsets[i * 3 + 1] = Math.sin(lat) * r;
      lockOffsets[i * 3 + 2] = cy * Math.sin(lon) * r;
      lockAcquire[i] = LOCK_ACQUIRE_S[i];
    }
    lockGeo.setAttribute(
      'a_offset',
      new THREE.InstancedBufferAttribute(lockOffsets, 3),
    );
    lockGeo.setAttribute(
      'a_acquire',
      new THREE.InstancedBufferAttribute(lockAcquire, 1),
    );
    lockGeo.instanceCount = TRACKS.length;

    const lockMat = new THREE.ShaderMaterial({
      uniforms: {
        u_hud: uHud,
        u_time: uTime,
        u_resolution: uRes,
        u_px: uPx,
      },
      vertexShader: LOCK_VERT,
      fragmentShader: LOCK_FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const locks = new THREE.Mesh(lockGeo, lockMat);
    // The clip-space offset puts the quad outside its own bounds, so culling
    // would pop markers off at the screen edge.
    locks.frustumCulled = false;
    locks.renderOrder = 3;
    spin.add(locks);

    // ---- 4. Orbit ring plus one tracked contact ----------------------------
    const orbit = new THREE.Group();
    orbit.rotation.x = 1.12;
    scene.add(orbit);

    const RING_SEGS = 128;
    const ringPos = new Float32Array(RING_SEGS * 3);
    for (let i = 0; i < RING_SEGS; i++) {
      const a = (i / RING_SEGS) * Math.PI * 2;
      ringPos[i * 3] = Math.cos(a) * RING_R;
      ringPos[i * 3 + 1] = 0;
      ringPos[i * 3 + 2] = Math.sin(a) * RING_R;
    }
    const ringGeo = new THREE.BufferGeometry();
    ringGeo.setAttribute('position', new THREE.BufferAttribute(ringPos, 3));
    // LineBasicMaterial goes through the built-in pipeline, which DOES apply an
    // output colour-space encode, so a plain sRGB hex is correct here.
    const ringMat = new THREE.LineBasicMaterial({
      color: 0x4fe3e0,
      transparent: true,
      opacity: 0.26,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });
    const ring = new THREE.LineLoop(ringGeo, ringMat);
    ring.renderOrder = 2;
    orbit.add(ring);

    // A single bright contact travelling the ring reads as tracking. Two static
    // counter-rotating rings read as a logo.
    const contactSpin = new THREE.Group();
    orbit.add(contactSpin);
    const tailPos = new Float32Array(TAIL_POINTS * 3);
    const tailIdx = new Float32Array(TAIL_POINTS);
    for (let i = 0; i < TAIL_POINTS; i++) {
      const a = -i * 0.055;
      tailPos[i * 3] = Math.cos(a) * RING_R;
      tailPos[i * 3 + 1] = 0;
      tailPos[i * 3 + 2] = Math.sin(a) * RING_R;
      tailIdx[i] = i;
    }
    const tailGeo = new THREE.BufferGeometry();
    tailGeo.setAttribute('position', new THREE.BufferAttribute(tailPos, 3));
    tailGeo.setAttribute('a_idx', new THREE.BufferAttribute(tailIdx, 1));
    const tailMat = new THREE.ShaderMaterial({
      uniforms: { u_hud: uHud, u_dpr: uDpr },
      vertexShader: TAIL_VERT,
      fragmentShader: TAIL_FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });
    const contact = new THREE.Points(tailGeo, tailMat);
    contact.frustumCulled = false;
    contact.renderOrder = 4;
    contactSpin.add(contact);

    // ---- Viewport ----------------------------------------------------------
    // A vertical FOV crops a portrait phone horizontally, so dolly back by the
    // aspect ratio. Without this the globe is a wall of wireframe on mobile.
    const applyViewport = () => {
      const w = window.innerWidth;
      const h = Math.max(1, window.innerHeight);
      const aspect = w / h;
      camera.aspect = aspect;
      const halfFov = (camera.fov * Math.PI) / 360;
      camera.position.z = FIT_RADIUS / Math.tan(halfFov) / Math.min(1, aspect);
      camera.updateProjectionMatrix();

      renderer.setSize(w, h);
      capPixelRatio(renderer, w, h, 1_200_000, 1.5);
      uDpr.value = renderer.getPixelRatio();
      uPx.value = MARKER_PX * renderer.getPixelRatio();
      renderer.getDrawingBufferSize(uRes.value);
    };
    applyViewport();
    window.addEventListener('resize', applyViewport);

    // ---- Loop --------------------------------------------------------------
    const throttle = createFrameThrottle(60);
    const startedAt = performance.now();
    let raf = 0;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      // No render gate here on purpose: createRenderGate consults the same
      // background-gate flag this preloader sets, so it would report inactive
      // for the entire boot. Visibility is the only condition that applies.
      if (document.hidden) return;
      if (!throttle(now)) return;
      if (renderer.getContext().isContextLost()) return;

      const t = (now - startedAt) / 1000;
      uTime.value = t;
      // Scan plane sweeping pole to pole and back.
      uScan.value = Math.sin(t * 0.62) * (GLOBE_R * 1.08);
      spin.rotation.y = t * 0.2;
      orbit.rotation.y = t * 0.05;
      contactSpin.rotation.y = t * 0.8;

      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', applyViewport);

      gratGeo.dispose();
      gratMat.dispose();
      landGeo.dispose();
      landMat.dispose();
      lockGeo.dispose();
      lockMat.dispose();
      ringGeo.dispose();
      ringMat.dispose();
      tailGeo.dispose();
      tailMat.dispose();

      releaseContext(renderer);
      renderer.domElement.remove();
    };
  }, []);

  return (
    <div
      ref={mountRef}
      aria-hidden="true"
      data-war-boot-canvas
      className="absolute inset-0 pointer-events-none"
    />
  );
}

export default WarPreloader;
