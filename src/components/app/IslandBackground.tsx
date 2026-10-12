import { useEffect, useRef } from 'react';
import { useAppTheme } from '@/contexts/ThemeContext';
import { runCanvasBackdrop, type CanvasScene } from '@/lib/canvas-backdrop';
import { createIslandWater } from './island-water';

/**
 * "Island" — a lagoon at golden hour that follows the viewer's local clock.
 *
 * Through the day it holds a low golden-hour sun (never a flat noon). From
 * late afternoon the sun sinks to the horizon and the whole scene slides
 * through sunset into a blue / pink / purple dusk, then a deep violet night
 * with stars and a moon laying a lilac path on the water. Morning runs the
 * same way back. A palm island sits on the left, clouds drift, and the sun
 * and moon are soft layered glows rather than flat discs.
 *
 * Cached 2D sky and coastline, with a small GPU water surface composed into
 * the same capped, pauseable loop. Devices without WebGL retain the 2D sea.
 */
export function IslandBackground() {
  const { theme } = useAppTheme();
  if (theme !== 'island') return null;
  return (
    <div data-island-scene="water-v3" aria-hidden="true" className="fixed inset-0 pointer-events-none" style={{ zIndex: 0 }}>
      <IslandCanvas />
    </div>
  );
}

function IslandCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    return runCanvasBackdrop(ref.current, createIslandScene(), { fps: 30 });
  }, []);
  return <canvas ref={ref} className="block" />;
}

type Rgb = [number, number, number];
type Palette = {
  a: number;
  skyTop: Rgb;
  skyMid: Rgb;
  skyLow: Rgb;
  waterTop: Rgb;
  waterBot: Rgb;
  glint: Rgb;
  sun: Rgb;
  land: Rgb;
};

const hex = (s: string): Rgb => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16)) as Rgb;

// Keyed by sun altitude, highest first. Between two keys the scene blends.
// The upper sky stays deep enough that white type on glass reads over it.
const KEYS: Palette[] = [
  { a: 0.45, skyTop: hex('#3a5896'), skyMid: hex('#e08a82'), skyLow: hex('#ffd39c'), waterTop: hex('#2fb3b5'), waterBot: hex('#07344f'), glint: hex('#fff0cf'), sun: hex('#fff1c9'), land: hex('#1d2440') },
  { a: 0.12, skyTop: hex('#33306e'), skyMid: hex('#cf5f7c'), skyLow: hex('#ffae70'), waterTop: hex('#2a7f9e'), waterBot: hex('#08284a'), glint: hex('#ffc6a0'), sun: hex('#ffc98f'), land: hex('#1a1634') },
  { a: -0.12, skyTop: hex('#1b1a4c'), skyMid: hex('#6e3f8e'), skyLow: hex('#e67f9f'), waterTop: hex('#33487f'), waterBot: hex('#0a1536'), glint: hex('#ffaad2'), sun: hex('#ff9aa8'), land: hex('#120f2a') },
  { a: -0.42, skyTop: hex('#07081c'), skyMid: hex('#1d1444'), skyLow: hex('#50276a'), waterTop: hex('#1a2358'), waterBot: hex('#040920'), glint: hex('#dcb4ff'), sun: hex('#ff9aa8'), land: hex('#07061a') },
];

const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const mixRgb = (p: Rgb, q: Rgb, t: number): Rgb => [0, 1, 2].map((i) => p[i] + (q[i] - p[i]) * t) as Rgb;
const css = (c: Rgb, alpha = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${alpha})`;
const WHITE: Rgb = [255, 255, 255];

function paletteAt(a: number): Palette {
  if (a >= KEYS[0].a) return KEYS[0];
  const lastKey = KEYS[KEYS.length - 1];
  if (a <= lastKey.a) return lastKey;
  for (let i = 0; i < KEYS.length - 1; i++) {
    const hi = KEYS[i];
    const lo = KEYS[i + 1];
    if (a <= hi.a && a >= lo.a) {
      const t = (hi.a - a) / (hi.a - lo.a);
      const out = { a } as Palette;
      for (const k of ['skyTop', 'skyMid', 'skyLow', 'waterTop', 'waterBot', 'glint', 'sun', 'land'] as const) {
        out[k] = mixRgb(hi[k], lo[k], t);
      }
      return out;
    }
  }
  return lastKey;
}

/**
 * Sun altitude from the local clock: 1 at 13:00, 0 at 07:00 and 19:00, -1 at
 * 01:00. `window.__ISLAND_HOUR` pins the hour, for previews and screenshots.
 */
function sunAltitude(): number {
  const pinned = (window as unknown as { __ISLAND_HOUR?: number }).__ISLAND_HOUR;
  const d = new Date();
  const hour = typeof pinned === 'number' ? pinned : d.getHours() + d.getMinutes() / 60;
  return Math.cos(((hour - 13) / 24) * Math.PI * 2);
}

/**
 * A soft light: a radial gradient with an eased falloff and no edge, so it
 * reads as a blurred glow (like Hazy's nebula) rather than a flat disc.
 * `sx`/`sy` stretch it into an ellipse.
 */
function glow(x: CanvasRenderingContext2D, cx: number, cy: number, r: number, c: Rgb, alpha: number, core?: Rgb, sx = 1, sy = 1) {
  if (alpha <= 0.001) return;
  x.save();
  x.translate(cx, cy);
  x.scale(sx, sy);
  const g = x.createRadialGradient(0, 0, 0, 0, 0, r);
  g.addColorStop(0, css(core ?? c, alpha));
  g.addColorStop(0.18, css(c, alpha * 0.82));
  g.addColorStop(0.4, css(c, alpha * 0.42));
  g.addColorStop(0.65, css(c, alpha * 0.14));
  g.addColorStop(1, css(c, 0));
  x.fillStyle = g;
  x.fillRect(-r, -r, r * 2, r * 2);
  x.restore();
}

type Cloud = { x: number; y: number; w: number; speed: number; puffs: Array<[number, number, number]>; sprite?: HTMLCanvasElement };
type Palm = { x: number; y: number; h: number; lean: number; phase: number; fronds: Array<[number, number]>; sprite?: HTMLCanvasElement };

// Stable detail placement survives rotations and viewport changes.
const detail = (seed: number) => {
  const n = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return n - Math.floor(n);
};

function layer(w: number, h: number, dpr: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * dpr));
  c.height = Math.max(1, Math.round(h * dpr));
  const x = c.getContext('2d') as CanvasRenderingContext2D;
  x.setTransform(dpr, 0, 0, dpr, 0, 0);
  return [c, x];
}

/** Rolling hill silhouette sitting on the horizon. */
function hill(x: CanvasRenderingContext2D, x0: number, x1: number, base: number, top: number, bumps: number[]) {
  x.beginPath();
  x.moveTo(x0, base + 1);
  const n = bumps.length;
  for (let i = 0; i <= n; i++) {
    const px = x0 + ((x1 - x0) * i) / n;
    const edge = Math.sin((i / n) * Math.PI);
    const py = base - (base - top) * Math.pow(edge, 0.7) * (i < n ? bumps[i] : 0);
    if (i === 0) x.lineTo(px, py);
    else {
      const prev = x0 + ((x1 - x0) * (i - 0.5)) / n;
      x.quadraticCurveTo(prev, py - (base - top) * 0.08, px, py);
    }
  }
  x.lineTo(x1, base + 1);
  x.closePath();
  x.fill();
}

function drawPalm(x: CanvasRenderingContext2D, p: Palm, t: number, color: string) {
  const sway = Math.sin(t * 0.55 + p.phase) * 0.035 + Math.sin(t * 1.3 + p.phase * 2) * 0.012;
  const tipX = p.x + p.lean * p.h + sway * p.h * 0.4;
  const tipY = p.y - p.h;
  const cx = p.x + p.lean * p.h * 0.15;
  const cy = p.y - p.h * 0.62;
  x.fillStyle = color;
  x.strokeStyle = color;
  x.lineCap = 'round';
  // Trunk: a tapering curve built from short strokes.
  const steps = 7;
  let px = p.x;
  let py = p.y;
  for (let i = 1; i <= steps; i++) {
    const s = i / steps;
    const qx = (1 - s) * (1 - s) * p.x + 2 * (1 - s) * s * cx + s * s * tipX;
    const qy = (1 - s) * (1 - s) * p.y + 2 * (1 - s) * s * cy + s * s * tipY;
    x.lineWidth = p.h * (0.07 - 0.035 * s);
    x.beginPath();
    x.moveTo(px, py);
    x.lineTo(qx, qy);
    x.stroke();
    px = qx;
    py = qy;
  }
  // Fronds: drooping leaves that ride the breeze.
  for (let i = 0; i < p.fronds.length; i++) {
    const [ang, len] = p.fronds[i];
    const a = ang + sway * (1.4 + (i % 3) * 0.4);
    const L = p.h * len;
    const dx = Math.cos(a);
    const ex = tipX + dx * L;
    const ey = tipY + Math.sin(a) * L * 0.45 + L * 0.38 * Math.abs(dx);
    const mx = tipX + dx * L * 0.5;
    const my = tipY + Math.sin(a) * L * 0.3 - L * 0.16;
    const wv = L * 0.018;
    x.beginPath();
    x.moveTo(tipX, tipY);
    x.quadraticCurveTo(mx, my - wv, ex, ey);
    x.quadraticCurveTo(mx, my + wv, tipX, tipY + 1);
    x.fill();
    // Individual tapered leaflets give the canopy a porous, wind-cut edge.
    // This geometry is cached in each palm sprite, never rebuilt per frame.
    for (let j = 1; j < 17; j++) {
      const u = j / 18;
      const bx = (1 - u) ** 2 * tipX + 2 * (1 - u) * u * mx + u * u * ex;
      const by = (1 - u) ** 2 * tipY + 2 * (1 - u) * u * my + u * u * ey;
      const feather = L * 0.22 * Math.sin(u * Math.PI) * (1 - u * 0.35);
      for (const side of [-1, 1]) {
        x.beginPath();
        x.moveTo(bx, by);
        x.quadraticCurveTo(bx + dx * feather * 0.25, by + side * feather * 0.45, bx - dx * feather * 0.38, by + side * feather);
        x.lineWidth = Math.max(0.45, L * 0.014 * (1 - u));
        x.stroke();
      }
    }
  }
  x.beginPath();
  x.arc(tipX, tipY + p.h * 0.03, p.h * 0.035, 0, Math.PI * 2);
  x.fill();
}

function paintPalm(x: CanvasRenderingContext2D, p: Palm, t: number) {
  if (!p.sprite) return;
  const extent = p.h * 1.6;
  x.save();
  x.translate(p.x, p.y);
  x.rotate(Math.sin(t * 0.48 + p.phase) * 0.009 + Math.sin(t * 0.91 + p.phase) * 0.003);
  x.drawImage(p.sprite, -extent * 0.5, -extent * 0.92, extent, extent);
  x.restore();
}

export function createIslandScene(): CanvasScene {
  const dpr = Math.min(1.5, window.devicePixelRatio || 1);
  let W = 0;
  let H = 0;
  // Stars are fixed points in the upper sky, placed once per size.
  let stars: Array<[number, number, number]> = [];
  let clouds: Cloud[] = [];
  let palms: Palm[] = [];
  let sparkles: Array<[number, number, number]> = [];
  let alt = sunAltitude();
  let sinceAlt = 0;
  // The sky, sun, land and still water change only with the clock, so they
  // are painted once into `base` and blitted each frame.
  let base: HTMLCanvasElement | null = null;
  let vignette: HTMLCanvasElement | null = null;
  let coast: HTMLCanvasElement | null = null;
  let builtA = NaN;
  let pal = paletteAt(Math.min(alt, 0.45));
  const water = createIslandWater();

  const geom = () => {
    const hz = H * 0.42;
    const R = Math.min(W, H) * 0.065;
    const a = pal.a;
    return { hz, R, sunX: W * 0.69, sunY: hz - a * hz * 1.05 + R * 0.35, moonX: W * 0.64, moonY: hz * 0.3 };
  };

  const buildClouds = () => {
    for (const c of clouds) {
      const [cv, cx] = layer(c.w * 1.2, c.w * 0.5, 1);
      const lit = mixRgb(pal.skyMid, pal.sun, 0.45);
      const shade = mixRgb(pal.skyTop, pal.skyMid, 0.5);
      const alpha = 0.20 + clamp(pal.a + 0.2) * 0.16;
      for (const [px, py, pr] of c.puffs) {
        glow(cx, px * c.w + c.w * 0.1, py * c.w * 0.5, pr * c.w, shade, alpha, undefined, 1.2, 0.35);
        glow(cx, px * c.w + c.w * 0.1, py * c.w * 0.5 + pr * c.w * 0.08, pr * c.w, lit, alpha * 0.5, undefined, 1.25, 0.12);
      }
      c.sprite = cv;
    }
  };

  const buildBase = () => {
    const [cv, x] = layer(W, H, dpr);
    const { hz, R, sunX, sunY, moonX, moonY } = geom();
    const a = pal.a;
    const w = W;
    const h = H;

    // Sky
    let g = x.createLinearGradient(0, 0, 0, hz);
    g.addColorStop(0, css(pal.skyTop));
    g.addColorStop(0.35, css(mixRgb(pal.skyTop, pal.skyMid, 0.32)));
    g.addColorStop(0.72, css(pal.skyMid));
    g.addColorStop(1, css(pal.skyLow));
    x.fillStyle = g;
    x.fillRect(0, 0, w, hz + 1);

    // Long high-altitude wisps, lit from below, separate the sky planes.
    for (let i = 0; i < 7; i++) {
      glow(x, w * detail(i + 81), hz * (0.23 + detail(i + 91) * 0.58), w * (0.16 + detail(i + 101) * 0.2), pal.skyMid, 0.08, undefined, 1, 0.025);
    }

    // The sun: layered soft glows, no hard edge. A wide atmospheric bloom,
    // a warm halo, a bright blurred core and a faint anamorphic streak.
    const sunUp = clamp((sunY - hz) / (R * 2.2) * -1 + 1);
    const sunVis = clamp(0.55 + a);
    const cy = Math.min(sunY, hz + R * 0.2);
    glow(x, sunX, cy, R * 9, pal.sun, 0.42 * sunVis);
    glow(x, sunX, cy, R * 4, mixRgb(pal.sun, pal.skyLow, 0.3), 0.5 * sunVis);
    glow(x, sunX, sunY, R * 1.9, pal.sun, 0.95 * sunUp * sunVis, mixRgb(pal.sun, WHITE, 0.7));
    glow(x, sunX, sunY, R * 0.9, mixRgb(pal.sun, WHITE, 0.6), 0.9 * sunUp * sunVis, WHITE);
    glow(x, sunX, cy, R * 7, pal.sun, 0.22 * sunVis, undefined, 1, 0.08);

    // Moon, once it is properly dark: a soft pearl with a lilac halo.
    const moonA = clamp((-a - 0.12) / 0.2);
    if (moonA > 0) {
      glow(x, moonX, moonY, R * 5, [200, 170, 255], 0.3 * moonA);
      glow(x, moonX, moonY, R * 1.1, [245, 235, 255], 0.9 * moonA, WHITE);
      glow(x, moonX, moonY, R * 0.45, WHITE, 0.95 * moonA, WHITE);
    }

    // Horizon haze
    g = x.createLinearGradient(0, hz - h * 0.08, 0, hz + h * 0.02);
    g.addColorStop(0, css(pal.skyLow, 0));
    g.addColorStop(0.75, css(pal.skyLow, 0.5));
    g.addColorStop(1, css(pal.skyLow, 0));
    x.fillStyle = g;
    x.fillRect(0, hz - h * 0.08, w, h * 0.1);

    // Distant island, faded by the air between.
    x.fillStyle = css(mixRgb(pal.land, pal.skyLow, 0.82), 0.65);
    hill(x, w * 0.46, w * 1.12, hz, hz - Math.min(h * 0.055, w * 0.08), [0.3, 0.55, 0.4, 0.85, 1, 0.7, 0.3]);
    x.fillStyle = css(mixRgb(pal.land, pal.skyLow, 0.62), 0.9);
    hill(x, w * 0.74, w * 1.02, hz, hz - Math.min(h * 0.03, w * 0.05), [0.5, 1, 0.8, 0.55, 0.3]);

    // Water: the horizon mirrors the sky, deepening toward the viewer.
    g = x.createLinearGradient(0, hz, 0, h);
    g.addColorStop(0, css(mixRgb(pal.skyLow, pal.waterTop, 0.55)));
    g.addColorStop(0.10, css(pal.waterTop));
    g.addColorStop(0.42, css(mixRgb(pal.waterTop, pal.waterBot, 0.45)));
    g.addColorStop(1, css(pal.waterBot));
    x.fillStyle = g;
    x.fillRect(0, hz, w, h - hz);

    // Shallow water around the headland picks up a cooler jade bounce.
    const daylight = clamp((a + 0.2) / 0.65);
    glow(x, w * 0.18, hz + h * 0.09, w * 0.42, [54, 184, 162], daylight * 0.16, undefined, 1, 0.35);

    // Blurred reflection column under the sun (or moon).
    const pathX = moonA > 0.5 ? moonX : sunX;
    const pathC = moonA > 0.5 ? ([220, 200, 255] as Rgb) : pal.glint;
    const pathA = Math.max(clamp(0.4 + a * 2) * 0.5, moonA * 0.35);
    x.save();
    x.beginPath();
    x.rect(0, hz, w, h - hz);
    x.clip();
    glow(x, pathX, hz, h - hz, pathC, pathA, undefined, 0.16, 1);
    x.restore();
    glow(x, pathX, hz, R * 3, mixRgb(pathC, WHITE, 0.4), pathA * 1.1, undefined, 1.6, 0.18);

    // Near island on the left, and its reflection in the water.
    const isl = [0.55, 0.85, 1, 0.9, 0.7, 0.45, 0.25];
    const iTop = hz - Math.min(h * 0.045, w * 0.09);
    const [shore, sx] = layer(w * 0.44, hz, dpr);
    const soil = sx.createLinearGradient(0, iTop, 0, hz);
    soil.addColorStop(0, css(mixRgb(pal.land, pal.skyLow, 0.12)));
    soil.addColorStop(0.75, css(pal.land));
    soil.addColorStop(1, css(mixRgb(pal.land, pal.waterBot, 0.2)));
    sx.fillStyle = soil;
    hill(sx, -w * 0.04, w * 0.4, hz - 1, iTop, isl);
    // Small canopy breaks and a narrow, warm sand shelf along the waterline.
    for (let i = 0; i < 70; i++) {
      const u = i / 70;
      const y = hz - (hz - iTop) * Math.sin(u * Math.PI) * (0.7 + detail(i + 212) * 0.15);
      sx.fillStyle = css(pal.land, 0.7);
      sx.beginPath();
      sx.ellipse(u * w * 0.34, y, 2 + detail(i + 230) * 5, 2 + detail(i + 240) * 4, 0, 0, Math.PI * 2);
      sx.fill();
    }
    sx.strokeStyle = css(mixRgb(pal.land, pal.skyLow, 0.38), 0.65);
    sx.lineWidth = 1.5;
    sx.beginPath();
    sx.moveTo(0, hz - 1.5);
    sx.quadraticCurveTo(w * 0.22, hz - 4, w * 0.4, hz - 0.5);
    sx.stroke();
    coast = shore;
    x.drawImage(shore, 0, 0, w * 0.44, hz);

    for (const p of palms) {
      const extent = p.h * 1.6;
      const [sprite, px] = layer(extent, extent, dpr);
      drawPalm(px, { ...p, x: extent * 0.5, y: extent * 0.92 }, 0, css(pal.land));
      p.sprite = sprite;
    }

    base = cv;
    builtA = a;
    buildClouds();
    if (water) {
      // Upload a bounded reflection source only when the clock/size changes.
      // Fine foliage and cloud light belong to the reflected scene as well.
      const [sky, skyContext] = layer(W, hz, Math.min(1, 768 / W, 512 / hz));
      skyContext.drawImage(cv, 0, 0, cv.width, hz * dpr, 0, 0, W, hz);
      for (const c of clouds) {
        if (c.sprite) skyContext.drawImage(c.sprite, c.x % (W + c.w * 1.4) - c.w * 1.2, c.y - c.w * 0.25);
      }
      for (const p of palms) paintPalm(skyContext, p, 0);
      water.setSky(sky);
    }
  };

  const buildVignette = () => {
    const [cv, x] = layer(W, H, 1);
    // A light overall scrim plus edge darkening: depth, and white type on
    // glass stays readable even over the bright horizon.
    x.fillStyle = 'rgba(6,8,24,0.14)';
    x.fillRect(0, 0, W, H);
    const g = x.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.35, W / 2, H * 0.45, Math.hypot(W, H) * 0.62);
    g.addColorStop(0, 'rgba(6,8,24,0)');
    g.addColorStop(1, 'rgba(6,8,24,0.42)');
    x.fillStyle = g;
    x.fillRect(0, 0, W, H);
    const top = x.createLinearGradient(0, 0, 0, H * 0.22);
    top.addColorStop(0, 'rgba(6,8,24,0.28)');
    top.addColorStop(1, 'rgba(6,8,24,0)');
    x.fillStyle = top;
    x.fillRect(0, 0, W, H * 0.22);
    vignette = cv;
  };

  return {
    resize(w, h) {
      W = w;
      H = h;
      water?.resize(w, h * 0.58);
      const n = Math.min(160, Math.round((w * h) / 7000));
      stars = Array.from({ length: n }, (_, i) => [detail(i + 1) * w, detail(i + 201) * h * 0.38, detail(i + 401)]);
      const nc = w > 900 ? 6 : 4;
      clouds = Array.from({ length: nc }, (_, i) => ({
        x: (i / nc) * w * 1.3 + detail(i + 11) * w * 0.1,
        y: h * (0.05 + detail(i + 21) * 0.22),
        w: Math.max(160, w * (0.22 + detail(i + 31) * 0.2)),
        speed: 1.5 + detail(i + 41) * 3,
        puffs: Array.from({ length: 9 }, (_, k) => [0.1 + (k / 8) * 0.8 + (detail(i * 9 + k + 51) - 0.5) * 0.08, 0.35 + detail(i * 9 + k + 71) * 0.35, 0.12 + Math.sin((k / 8) * Math.PI) * 0.14]),
      }));
      const hz = h * 0.42;
      const ph = Math.min(h * 0.2, w * 0.36);
      const fronds = (seed: number) => Array.from({ length: 11 }, (_, k) => [Math.PI * 0.85 + (k / 10) * Math.PI * 1.3 + (detail(seed + k) - 0.5) * 0.18, 0.36 + detail(seed + k + 30) * 0.14] as [number, number]);
      palms = [
        { x: w * 0.1, y: hz - h * 0.018, h: ph, lean: 0.18, phase: 0, fronds: fronds(100) },
        { x: w * 0.2, y: hz - h * 0.022, h: ph * 0.78, lean: -0.1, phase: 1.7, fronds: fronds(200) },
        { x: w * 0.3, y: hz - h * 0.008, h: ph * 0.6, lean: 0.24, phase: 3.1, fronds: fronds(300) },
      ];
      sparkles = Array.from({ length: 28 }, (_, i) => [detail(i + 501), Math.pow(detail(i + 601), 1.6), detail(i + 701) * 10]);
      buildBase();
      buildVignette();
    },
    draw(x, w, h, t, dt) {
      // The clock moves slowly; re-read it every few seconds, not every frame.
      sinceAlt += dt;
      if (sinceAlt > 5) {
        alt = sunAltitude();
        sinceAlt = 0;
        const a = Math.min(alt, 0.45);
        if (Math.abs(a - builtA) > 0.002) {
          pal = paletteAt(a);
          buildBase();
        }
      }
      const a = pal.a;
      const { hz, R, sunX, moonX } = geom();
      if (base) x.drawImage(base, 0, 0, w, h);

      // Stars fade in after sunset and twinkle.
      const starA = clamp((-a - 0.05) / 0.3);
      if (starA > 0) {
        for (const [sx, sy, k] of stars) {
          const tw = 0.55 + 0.45 * Math.sin(t * (0.8 + k * 1.6) + k * 20);
          x.fillStyle = `rgba(255,240,255,${starA * tw * (0.3 + k * 0.7)})`;
          const r = 0.6 + k * 1.1;
          x.fillRect(sx, sy, r, r);
        }
      }

      // Clouds drift slowly across the upper sky.
      for (const c of clouds) {
        if (!c.sprite) continue;
        const span = w + c.w * 1.4;
        const cx = ((((c.x + t * c.speed) % span) + span) % span) - c.w * 1.2;
        x.drawImage(c.sprite, cx, c.y - c.w * 0.25);
      }

      const moonStrength = clamp((-a - 0.12) / 0.2);
      const useMoon = moonStrength > 0.5;
      const geometry = geom();
      const sea = water?.draw({
        time: t,
        aspect: w / h,
        lightX: (useMoon ? moonX : sunX) / w,
        lightHeight: (hz - (useMoon ? geometry.moonY : geometry.sunY)) / h,
        lightStrength: Math.max(clamp(0.4 + a * 2), moonStrength * 0.8),
        lightColor: useMoon ? [220, 200, 255] : pal.glint,
        waterTop: pal.waterTop,
        waterBottom: pal.waterBot,
        skyTop: pal.skyTop,
      });
      if (sea) x.drawImage(sea, 0, hz, w, h - hz);
      const renderer = sea ? 'gpu' : 'fallback';
      if (x.canvas?.dataset && x.canvas.dataset.islandWater !== renderer) x.canvas.dataset.islandWater = renderer;

      // Cached fine foliage sways from its root; reflections stretch and break
      // into water bands rather than looking like a second upside-down island.
      for (const p of palms) paintPalm(x, p, t);
      if (!sea) {
        if (coast) {
        const reflectionDepth = Math.min(h * 0.10, w * 0.16);
        const bands = 18;
        for (let i = 0; i < bands; i++) {
            const depth = (i / bands) * reflectionDepth;
            const bandH = reflectionDepth / bands;
            const sourceH = bandH / 0.65;
            const sourceY = Math.max(0, hz - (depth + bandH) / 0.65);
            x.globalAlpha = 0.26 * (1 - i / bands) ** 1.5;
            x.drawImage(coast, 0, sourceY * dpr, coast.width, sourceH * dpr,
              Math.sin(t * 0.7 + i * 1.1) * (1 + i * 0.35), hz + depth, w * 0.44, bandH + 0.5);
        }
        x.globalAlpha = 1;
        }
        x.save();
        x.beginPath();
        x.rect(0, hz, w * 0.44, h * 0.2);
        x.clip();
        x.translate(Math.sin(t * 0.7) * 2, hz * 1.65);
        x.scale(1, -0.65);
        x.globalAlpha = 0.08;
        for (const p of palms) paintPalm(x, p, t + 0.4);
        x.restore();

        // Perspective swells have a shaded body, a fine crest, and fragmented
        // specular light. The light path widens toward the camera.
        const moonA = clamp((-a - 0.12) / 0.2);
        const pathX = moonA > 0.5 ? moonX : sunX;
        const pathStrength = Math.max(clamp(0.4 + a * 2), moonA * 0.8);
        const rows = Math.min(48, Math.max(24, Math.round(h / 18)));
        const segs = Math.min(16, Math.max(6, Math.round(w / 95)));
        const samples = Math.min(64, Math.max(24, Math.round(w / 24)));
        const seaH = h - hz;
        x.lineCap = 'round';
        for (let i = 0; i < rows; i++) {
        const d = (i + 1) / rows;
        const y = hz + 2 + d ** 2.1 * seaH;
        const amplitude = 0.3 + d ** 1.7 * 7;
        const wave = (u: number) =>
            y + Math.sin(u * 12 + t * 0.52 + i * 1.8) * amplitude
              + Math.sin(u * 27 - t * 0.33 + i * 0.71) * amplitude * 0.32;
        x.beginPath();
        for (let j = 0; j <= samples; j++) {
            const u = j / samples;
            if (j === 0) x.moveTo(0, wave(u));
            else x.lineTo(u * w, wave(u));
        }
        for (let j = samples; j >= 0; j--) {
            const u = j / samples;
            x.lineTo(u * w, wave(u) + 1 + d * 8);
        }
        x.closePath();
        x.fillStyle = css(pal.waterBot, 0.07 + d * 0.1);
        x.fill();

        for (let s = 0; s < segs; s++) {
            const seed = i * 7.13 + s * 3.7;
            const off = ((s + detail(seed + 20)) / segs) * w + Math.sin(t * 0.3 + seed) * 9 * d;
            const len = (3 + d ** 1.4 * 50) * (0.4 + detail(seed + 40));
            const lightX = pathX + Math.sin(t * 0.38 + i * 0.81) * (3 + d * 15);
            const nearPath = Math.exp(-(((off - lightX) / (R * (0.55 + d * 3.8))) ** 2));
            const flicker = 0.45 + 0.55 * Math.sin(t * 0.95 + seed) ** 2;
            const alpha = (0.025 + 0.04 * (1 - d) + nearPath * pathStrength * 0.52) * flicker;
            x.strokeStyle = css(mixRgb(pal.waterTop, pal.glint, nearPath * 0.85), alpha);
            x.lineWidth = 0.5 + d * 1.25;
            x.beginPath();
            x.moveTo(off - len / 2, wave((off - len / 2) / w));
            x.quadraticCurveTo(off, wave(off / w) - 0.4 * d, off + len / 2, wave((off + len / 2) / w));
            x.stroke();
        }
        }

        // Twinkling sparkles on the light path.
        if (pathStrength > 0.05) {
        for (const [u, v, k] of sparkles) {
            const y = hz + 4 + v * (h - hz) * 0.9;
            const spread = R * (0.8 + v * 3.5);
            const sx = pathX + (u - 0.5) * 2 * spread + Math.sin(t * 0.7 + k) * 6;
            const tw = Math.max(0, Math.sin(t * 1.4 + k * 3)) ** 8;
            const r = (0.5 + v * 1.4) * tw;
            if (r < 0.2) continue;
            x.fillStyle = css(mixRgb(pal.glint, WHITE, 0.6), 0.85 * pathStrength * tw);
            x.fillRect(sx - r, y - 0.5, r * 2, 1);
        }
        }

        // A slow swell of light rolling toward the viewer.
        const sweep = ((t * 0.045) % 1.3) - 0.15;
        const sy = hz + sweep * (h - hz);
        const g = x.createLinearGradient(0, sy - h * 0.08, 0, sy + h * 0.08);
        g.addColorStop(0, css(pal.glint, 0));
        g.addColorStop(0.5, css(pal.glint, 0.06));
        g.addColorStop(1, css(pal.glint, 0));
        x.fillStyle = g;
        x.fillRect(0, hz, w, h - hz);
      }

      // The sun breathes very gently.
      glow(x, sunX, Math.min(geom().sunY, hz), R * 2.6, pal.sun, 0.06 * (1 + Math.sin(t * 0.6)) * clamp(0.55 + a));

      if (vignette) x.drawImage(vignette, 0, 0, w, h);
    },
    dispose() { water?.dispose(); },
  };
}

export default IslandBackground;
