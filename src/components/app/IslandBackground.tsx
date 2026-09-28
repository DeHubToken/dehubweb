import { useEffect, useRef } from 'react';
import { useAppTheme } from '@/contexts/ThemeContext';
import { runCanvasBackdrop, type CanvasScene } from '@/lib/canvas-backdrop';

/**
 * "Island" — a lagoon at golden hour that follows the viewer's local clock.
 *
 * Through the day it holds a low golden-hour sun (never a flat noon). From
 * late afternoon the sun sinks to the horizon and the whole scene slides
 * through sunset into a blue / pink / purple dusk, then a deep violet night
 * with stars and a moon laying a lilac path on the water. Morning runs the
 * same way back. Plain 2D canvas: gradients and a few hundred strokes a frame.
 */
export function IslandBackground() {
  const { theme } = useAppTheme();
  if (theme !== 'island') return null;
  return (
    <div aria-hidden="true" className="fixed inset-0 pointer-events-none" style={{ zIndex: 0 }}>
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
};

const hex = (s: string): Rgb => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16)) as Rgb;

// Keyed by sun altitude, highest first. Between two keys the scene blends.
const KEYS: Palette[] = [
  { a: 0.45, skyTop: hex('#f09470'), skyMid: hex('#ffc28a'), skyLow: hex('#ffe1ae'), waterTop: hex('#3cc4c0'), waterBot: hex('#0b5b78'), glint: hex('#ffeecd'), sun: hex('#fff3d2') },
  { a: 0.12, skyTop: hex('#c2578c'), skyMid: hex('#ef7868'), skyLow: hex('#ffb478'), waterTop: hex('#2c8ea6'), waterBot: hex('#0b3c63'), glint: hex('#ffc8aa'), sun: hex('#ffcf9e') },
  { a: -0.12, skyTop: hex('#2c2466'), skyMid: hex('#87489a'), skyLow: hex('#ef88a8'), waterTop: hex('#3b4f90'), waterBot: hex('#0d1a44'), glint: hex('#ffaad2'), sun: hex('#ff9aa8') },
  { a: -0.42, skyTop: hex('#08091f'), skyMid: hex('#201548'), skyLow: hex('#56296c'), waterTop: hex('#1a2358'), waterBot: hex('#050a22'), glint: hex('#dcb4ff'), sun: hex('#ff9aa8') },
];

const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const mixRgb = (p: Rgb, q: Rgb, t: number): Rgb => [0, 1, 2].map((i) => p[i] + (q[i] - p[i]) * t) as Rgb;
const css = (c: Rgb, alpha = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${alpha})`;

function paletteAt(a: number): Palette {
  if (a >= KEYS[0].a) return KEYS[0];
  const lastKey = KEYS[KEYS.length - 1];
  if (a <= lastKey.a) return lastKey;
  for (let i = 0; i < KEYS.length - 1; i++) {
    const hi = KEYS[i];
    const lo = KEYS[i + 1];
    if (a <= hi.a && a >= lo.a) {
      const t = (hi.a - a) / (hi.a - lo.a);
      return {
        a,
        skyTop: mixRgb(hi.skyTop, lo.skyTop, t),
        skyMid: mixRgb(hi.skyMid, lo.skyMid, t),
        skyLow: mixRgb(hi.skyLow, lo.skyLow, t),
        waterTop: mixRgb(hi.waterTop, lo.waterTop, t),
        waterBot: mixRgb(hi.waterBot, lo.waterBot, t),
        glint: mixRgb(hi.glint, lo.glint, t),
        sun: mixRgb(hi.sun, lo.sun, t),
      };
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

export function createIslandScene(): CanvasScene {
  // Stars are fixed points in the upper sky, placed once per size.
  let stars: Array<[number, number, number]> = [];
  let alt = sunAltitude();
  let sinceAlt = 0;

  return {
    resize(w, h) {
      const n = Math.round((w * h) / 9000);
      stars = Array.from({ length: n }, () => [Math.random() * w, Math.random() * h * 0.4, Math.random()]);
    },
    draw(x, w, h, t, dt) {
      // The clock moves slowly; re-read it every few seconds, not every frame.
      sinceAlt += dt;
      if (sinceAlt > 5) {
        alt = sunAltitude();
        sinceAlt = 0;
      }
      // Daytime holds golden hour: the sun never climbs above this.
      const a = Math.min(alt, 0.45);
      const p = paletteAt(a);
      const hz = h * 0.42;

      // Sky
      let g = x.createLinearGradient(0, 0, 0, hz);
      g.addColorStop(0, css(p.skyTop));
      g.addColorStop(0.62, css(p.skyMid));
      g.addColorStop(1, css(p.skyLow));
      x.fillStyle = g;
      x.fillRect(0, 0, w, hz + 1);

      // Stars fade in after sunset and twinkle.
      const starA = clamp((-a - 0.05) / 0.3);
      if (starA > 0) {
        for (const [sx, sy, k] of stars) {
          const tw = 0.55 + 0.45 * Math.sin(t * (0.8 + k * 1.6) + k * 20);
          x.fillStyle = `rgba(255,240,255,${starA * tw * (0.35 + k * 0.65)})`;
          const r = 0.6 + k * 0.9;
          x.fillRect(sx, sy * (1 - 0.15 * (1 - starA)), r, r);
        }
      }

      const R = Math.min(w, h) * 0.09;
      const sunX = w * 0.62;
      const sunY = hz - a * hz * 1.05 + R * 0.35;

      // Glow round the sun (or its afterglow once below the horizon)
      const glowA = clamp(0.55 + a);
      g = x.createRadialGradient(sunX, Math.min(sunY, hz), R * 0.5, sunX, Math.min(sunY, hz), R * 6);
      g.addColorStop(0, css(p.sun, 0.55 * glowA));
      g.addColorStop(1, css(p.sun, 0));
      x.fillStyle = g;
      x.fillRect(0, 0, w, hz);

      // Sun disc, cut off by the horizon as it sets.
      if (sunY - R < hz) {
        x.save();
        x.beginPath();
        x.rect(0, 0, w, hz);
        x.clip();
        x.fillStyle = css(p.sun, 0.95);
        x.beginPath();
        x.arc(sunX, sunY, R, 0, Math.PI * 2);
        x.fill();
        x.restore();
      }

      // Moon, once it is properly dark.
      const moonA = clamp((-a - 0.12) / 0.2);
      const moonX = w * 0.26;
      const moonY = hz * 0.34;
      if (moonA > 0) {
        g = x.createRadialGradient(moonX, moonY, R * 0.3, moonX, moonY, R * 4);
        g.addColorStop(0, `rgba(230,200,255,${0.35 * moonA})`);
        g.addColorStop(1, 'rgba(230,200,255,0)');
        x.fillStyle = g;
        x.fillRect(moonX - R * 4, moonY - R * 4, R * 8, R * 8);
        x.fillStyle = `rgba(250,240,255,${0.95 * moonA})`;
        x.beginPath();
        x.arc(moonX, moonY, R * 0.55, 0, Math.PI * 2);
        x.fill();
      }

      // Horizon haze
      g = x.createLinearGradient(0, hz - h * 0.06, 0, hz + h * 0.03);
      g.addColorStop(0, css(p.skyLow, 0));
      g.addColorStop(0.7, css(p.skyLow, 0.55));
      g.addColorStop(1, css(p.skyLow, 0));
      x.fillStyle = g;
      x.fillRect(0, hz - h * 0.06, w, h * 0.09);

      // Water
      g = x.createLinearGradient(0, hz, 0, h);
      g.addColorStop(0, css(p.waterTop));
      g.addColorStop(1, css(p.waterBot));
      x.fillStyle = g;
      x.fillRect(0, hz, w, h - hz);

      // Light path on the water: under the sun by day, under the moon by night.
      const pathX = moonA > 0.5 ? moonX : sunX;
      const pathStrength = Math.max(clamp(0.4 + a * 2), moonA * 0.8);

      const rows = Math.round(h / 12);
      const segs = Math.max(3, Math.round(w / 220));
      for (let i = 0; i < rows; i++) {
        const d = i / rows;
        const y = hz + Math.pow(d, 1.55) * (h - hz);
        const lw = 0.8 + d * 2.2;
        for (let s = 0; s < segs; s++) {
          const seed = i * 7.13 + s * 3.7;
          const base = ((s + 0.5) / segs) * w;
          const off = base + Math.sin(t * 0.55 + seed) * (w / segs) * 0.45;
          const len = (12 + d * 70) * (0.6 + 0.4 * Math.sin(seed * 1.9));
          const nearPath = 1 - clamp(Math.abs(off - pathX) / (R * (2.2 + d * 5)));
          const alpha = (0.1 + 0.28 * (1 - d)) * (0.55 + 0.45 * Math.sin(t * 1.3 + seed)) + nearPath * pathStrength * 0.55;
          x.strokeStyle = css(p.glint, Math.min(0.9, alpha));
          x.lineWidth = lw;
          x.beginPath();
          x.moveTo(off - len / 2, y);
          x.lineTo(off + len / 2, y);
          x.stroke();
        }
      }

      // A slow swell of light rolling toward the viewer.
      const sweep = ((t * 0.045) % 1.3) - 0.15;
      const sy = hz + sweep * (h - hz);
      g = x.createLinearGradient(0, sy - h * 0.08, 0, sy + h * 0.08);
      g.addColorStop(0, css(p.glint, 0));
      g.addColorStop(0.5, css(p.glint, 0.07));
      g.addColorStop(1, css(p.glint, 0));
      x.fillStyle = g;
      x.fillRect(0, hz, w, h - hz);
    },
  };
}

export default IslandBackground;
