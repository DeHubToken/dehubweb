import { useEffect, useRef } from 'react';
import { useAppTheme } from '@/contexts/ThemeContext';
import { makeNoiseTile, runCanvasBackdrop, type CanvasScene } from '@/lib/canvas-backdrop';

/**
 * "Horror" — a dungeon, in the same black iron and blood red as the theme's
 * icon pack. A vaulted stone passage runs to a barred gate with red light
 * behind it; torches burn on both walls, chains hang from the vault, embers
 * drift up and a low mist creeps along the flagstones.
 *
 * The stonework is painted once per size to an offscreen canvas; each frame
 * only adds the moving light: flames, torch glow, the gate's pulse, embers and
 * mist. Nothing here is text, because page cards are see-through glass and
 * anything legible behind them reads as part of the page.
 */
export function HorrorBackground() {
  const { theme } = useAppTheme();
  if (theme !== 'horror') return null;
  return (
    <div aria-hidden="true" className="fixed inset-0 pointer-events-none" style={{ zIndex: 0, background: '#070506' }}>
      <HorrorCanvas />
    </div>
  );
}

function HorrorCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    return runCanvasBackdrop(ref.current, createHorrorScene(), { fps: 24, dprCap: 1 });
  }, []);
  return <canvas ref={ref} className="block" />;
}

interface Layout {
  vx: number;
  vy: number;
  /** Far gate: left, top, width, height. */
  gx: number;
  gy: number;
  gw: number;
  gh: number;
  torches: { x: number; y: number; s: number }[];
}

function layout(w: number, h: number): Layout {
  const vx = w * 0.5;
  const vy = h * 0.47;
  const gw = Math.min(w * 0.27, h * 0.16);
  const gh = gw * 1.45;
  const gx = vx - gw / 2;
  const gy = vy - gh * 0.62;
  // Torches on both walls, one near and one further down the passage.
  const at = (side: -1 | 1, d: number) => {
    const x = vx + side * (w / 2) * d * 0.92;
    const y = vy - (vy - h * 0.3) * d;
    return { x, y, s: Math.max(0.45, d) * 1.5 * Math.min(1.25, Math.max(0.85, w / 520)) };
  };
  return { vx, vy, gx, gy, gw, gh, torches: [at(-1, 0.86), at(1, 0.86), at(-1, 0.42), at(1, 0.42)] };
}

/** Random but stable per seed, so a resize repaints the same stones. */
function seeded(seed: number) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

function paintDungeon(w: number, h: number, L: Layout): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d');
  if (!x) return c;
  const { vx, vy, gx, gy, gw, gh } = L;
  const rnd = seeded(7);

  x.fillStyle = '#0c0a0b';
  x.fillRect(0, 0, w, h);

  const quad = (pts: number[][], fill: string | CanvasGradient) => {
    x.fillStyle = fill;
    x.beginPath();
    x.moveTo(pts[0][0], pts[0][1]);
    for (const [px, py] of pts.slice(1)) x.lineTo(px, py);
    x.closePath();
    x.fill();
  };
  const fr = gx + gw;
  const fb = gy + gh;

  // Vault, floor and the two walls, darkest nearest the viewer.
  let g = x.createLinearGradient(0, 0, 0, gy);
  g.addColorStop(0, '#060505');
  g.addColorStop(1, '#1d1718');
  quad([[0, 0], [w, 0], [fr, gy], [gx, gy]], g);
  g = x.createLinearGradient(0, fb, 0, h);
  g.addColorStop(0, '#241c1c');
  g.addColorStop(1, '#080606');
  quad([[gx, fb], [fr, fb], [w, h], [0, h]], g);
  g = x.createLinearGradient(0, 0, gx, 0);
  g.addColorStop(0, '#0a0809');
  g.addColorStop(1, '#251e1f');
  quad([[0, 0], [gx, gy], [gx, fb], [0, h]], g);
  g = x.createLinearGradient(w, 0, fr, 0);
  g.addColorStop(0, '#0a0809');
  g.addColorStop(1, '#251e1f');
  quad([[w, 0], [fr, gy], [fr, fb], [w, h]], g);

  // Stone courses on the walls: mortar lines that run to the vanishing point,
  // with staggered joints between them, and a little tone per block.
  const wall = (side: -1 | 1) => {
    const ex = side < 0 ? 0 : w;
    const nx = side < 0 ? gx : fr;
    const rows = 11;
    for (let r = 0; r <= rows; r++) {
      const f = r / rows;
      const y0 = h * f;
      const y1 = gy + gh * f;
      x.strokeStyle = 'rgba(0,0,0,0.55)';
      x.lineWidth = 1.2;
      x.beginPath();
      x.moveTo(ex, y0);
      x.lineTo(nx, y1);
      x.stroke();
      if (r === rows) break;
      const f2 = (r + 1) / rows;
      // Joints: denser toward the far end, offset every other course.
      let d = 0.04 + (r % 2) * 0.05;
      while (d < 1) {
        const px = ex + (nx - ex) * d;
        const top = y0 + (y1 - y0) * d;
        const bot = h * f2 + (gy + gh * f2 - h * f2) * d;
        x.beginPath();
        x.moveTo(px, top);
        x.lineTo(px, bot);
        x.stroke();
        const next = d + (1 - d) * 0.22 + 0.02;
        // Block tone
        const qx = ex + (nx - ex) * next;
        x.fillStyle = `rgba(${rnd() < 0.5 ? '255,235,225' : '0,0,0'},${0.015 + rnd() * 0.05})`;
        x.beginPath();
        x.moveTo(px, top);
        x.lineTo(qx, y0 + (y1 - y0) * next);
        x.lineTo(qx, h * f2 + (gy + gh * f2 - h * f2) * next);
        x.lineTo(px, bot);
        x.closePath();
        x.fill();
        d = next;
      }
    }
  };
  wall(-1);
  wall(1);

  // Flagstones: lines to the vanishing point and cross joints that tighten.
  x.strokeStyle = 'rgba(0,0,0,0.5)';
  x.lineWidth = 1;
  for (let i = -5; i <= 5; i++) {
    x.beginPath();
    x.moveTo(gx + gw / 2 + i * gw * 0.1, fb);
    x.lineTo(vx + i * w * 0.2, h);
    x.stroke();
  }
  for (let k = 1; k < 9; k++) {
    const y = fb + (h - fb) * Math.pow(k / 9, 1.8);
    const spread = (y - fb) / (h - fb);
    x.beginPath();
    x.moveTo(gx - (gx) * spread, y);
    x.lineTo(fr + (w - fr) * spread, y);
    x.stroke();
  }

  // Ribs of the vault: arches across the passage at a few depths.
  for (const d of [0.92, 0.7, 0.5, 0.33]) {
    const lx = gx * (1 - d);
    const rx = w - (w - fr) * (1 - d);
    const top = gy * (1 - d);
    const spring = top + (fb - top) * 0.28 + (h - fb) * (1 - d) * 0.05;
    x.strokeStyle = `rgba(0,0,0,${0.35 + d * 0.35})`;
    x.lineWidth = Math.max(4, 26 * (1 - d) + 3);
    x.beginPath();
    x.moveTo(lx, h * (1 - d) + fb * d);
    x.lineTo(lx, spring);
    x.quadraticCurveTo((lx + rx) / 2, top - (rx - lx) * 0.12, rx, spring);
    x.lineTo(rx, h * (1 - d) + fb * d);
    x.stroke();
    x.strokeStyle = `rgba(255,220,210,${0.04 + (1 - d) * 0.04})`;
    x.lineWidth = 1;
    x.stroke();
  }

  // The gate: a pointed arch cut into the far wall, red light beyond, bars.
  const arch = () => {
    x.beginPath();
    x.moveTo(gx, fb);
    x.lineTo(gx, gy + gh * 0.36);
    x.quadraticCurveTo(gx, gy, gx + gw / 2, gy - gh * 0.02);
    x.quadraticCurveTo(fr, gy, fr, gy + gh * 0.36);
    x.lineTo(fr, fb);
    x.closePath();
  };
  x.save();
  arch();
  g = x.createRadialGradient(vx, gy + gh * 0.55, 2, vx, gy + gh * 0.55, gh * 0.75);
  g.addColorStop(0, '#c8402c');
  g.addColorStop(0.4, '#6e0b13');
  g.addColorStop(1, '#170204');
  x.fillStyle = g;
  x.fill();
  x.clip();
  x.fillStyle = 'rgba(8,4,5,0.92)';
  const bars = 7;
  const bw = Math.max(3, gw * 0.055);
  for (let i = 1; i < bars; i++) x.fillRect(gx + (gw * i) / bars - bw / 2, gy - gh * 0.05, bw, gh * 1.1);
  for (const f of [0.3, 0.62]) x.fillRect(gx, gy + gh * f, gw, bw * 1.2);
  // Spikes at the foot of the raised portcullis
  for (let i = 1; i < bars; i++) {
    const bx = gx + (gw * i) / bars;
    x.beginPath();
    x.moveTo(bx - bw, fb - gh * 0.12);
    x.lineTo(bx + bw, fb - gh * 0.12);
    x.lineTo(bx, fb - gh * 0.05);
    x.fill();
  }
  x.restore();
  arch();
  x.strokeStyle = '#120d0e';
  x.lineWidth = Math.max(3, gw * 0.06);
  x.stroke();

  // Red spill from the gate across the floor and up the walls.
  g = x.createRadialGradient(vx, fb, 2, vx, fb, Math.max(w, h) * 0.55);
  g.addColorStop(0, 'rgba(200,30,40,0.22)');
  g.addColorStop(0.5, 'rgba(120,10,20,0.10)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, w, h);

  // Chains from the vault, swaying is not worth a repaint: they hang still.
  const chain = (cx: number, len: number, s: number) => {
    x.strokeStyle = '#050404';
    x.lineWidth = Math.max(1.5, 3 * s);
    const lh = 11 * s;
    for (let y = -lh; y < len; y += lh * 0.8) {
      x.beginPath();
      if (Math.round(y / (lh * 0.8)) % 2) x.ellipse(cx, y, 2.2 * s, lh / 2, 0, 0, Math.PI * 2);
      else x.ellipse(cx, y, 0.8 * s, lh / 2, 0, 0, Math.PI * 2);
      x.stroke();
    }
    // Shackle
    x.lineWidth = Math.max(2, 4 * s);
    x.beginPath();
    x.arc(cx, len + 6 * s, 7 * s, 0.15 * Math.PI, 0.85 * Math.PI, true);
    x.stroke();
  };
  chain(w * 0.2, h * 0.2, 1.1);
  chain(w * 0.27, h * 0.12, 0.8);
  chain(w * 0.79, h * 0.16, 1);
  chain(vx + gw * 0.9, h * 0.07, 0.55);

  // Torch sconces: iron brackets, the flames are drawn per frame.
  for (const t of L.torches) {
    x.fillStyle = '#0a0707';
    x.fillRect(t.x - 3 * t.s, t.y, 6 * t.s, 34 * t.s);
    x.beginPath();
    x.moveTo(t.x - 9 * t.s, t.y);
    x.lineTo(t.x + 9 * t.s, t.y);
    x.lineTo(t.x + 5 * t.s, t.y + 9 * t.s);
    x.lineTo(t.x - 5 * t.s, t.y + 9 * t.s);
    x.fill();
  }

  // Grit over everything so the stone is not flat
  const d = x.getImageData(0, 0, w, h);
  for (let i = 0; i < d.data.length; i += 4) {
    const n = (rnd() - 0.5) * 16;
    d.data[i] += n;
    d.data[i + 1] += n * 0.85;
    d.data[i + 2] += n * 0.85;
  }
  x.putImageData(d, 0, 0);
  return c;
}

export function createHorrorScene(): CanvasScene {
  let dungeon: HTMLCanvasElement | null = null;
  let L: Layout | null = null;
  let grain: HTMLCanvasElement[] = [];
  let embers: { x: number; y: number; v: number; life: number; age: number }[] = [];

  const spawn = (t: { x: number; y: number; s: number }) => ({
    x: t.x + (Math.random() - 0.5) * 10 * t.s,
    y: t.y - 10 * t.s,
    v: (14 + Math.random() * 26) * t.s,
    life: 1.2 + Math.random() * 1.8,
    age: 0,
  });

  return {
    resize(w, h) {
      L = layout(Math.round(w), Math.round(h));
      dungeon = paintDungeon(Math.round(w), Math.round(h), L);
      if (!grain.length) grain = [0, 1, 2].map(() => makeNoiseTile(160, 284, 18));
      embers = [];
    },
    draw(x, w, h, t, dt) {
      if (!dungeon || !L) return;
      const { vx, gy, gh } = L;
      x.drawImage(dungeon, 0, 0, w, h);

      // The gate breathes: a slow red pulse with an occasional deeper beat.
      const beat = Math.pow(Math.max(0, Math.sin(t * 1.3)), 6);
      const pulse = 0.55 + Math.sin(t * 0.7) * 0.15 + beat * 0.3;
      x.globalCompositeOperation = 'lighter';
      let g = x.createRadialGradient(vx, gy + gh * 0.6, 2, vx, gy + gh * 0.6, gh * 1.6);
      g.addColorStop(0, `rgba(255,40,40,${0.14 * pulse})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g;
      x.fillRect(0, 0, w, h);

      // Torches: warm light on the stone, then the flame itself.
      for (let i = 0; i < L.torches.length; i++) {
        const tc = L.torches[i];
        const fl = 0.8 + Math.sin(t * 9 + i * 2.1) * 0.08 + Math.sin(t * 23 + i) * 0.06 + (Math.random() - 0.5) * 0.08;
        const r = 140 * tc.s * fl;
        g = x.createRadialGradient(tc.x, tc.y - 12 * tc.s, 2, tc.x, tc.y - 12 * tc.s, r);
        g.addColorStop(0, `rgba(255,120,50,${0.34 * fl})`);
        g.addColorStop(0.4, `rgba(200,40,20,${0.12 * fl})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        x.fillStyle = g;
        x.fillRect(tc.x - r, tc.y - 12 * tc.s - r, r * 2, r * 2);
        const fh = 26 * tc.s * fl;
        const sway = Math.sin(t * 6 + i) * 2.5 * tc.s;
        for (const [k, col] of [[1, 'rgba(220,40,20,0.85)'], [0.68, 'rgba(255,140,40,0.9)'], [0.38, 'rgba(255,235,170,0.95)']] as const) {
          x.fillStyle = col;
          x.beginPath();
          x.moveTo(tc.x - 6 * tc.s * k, tc.y);
          x.quadraticCurveTo(tc.x - 7 * tc.s * k, tc.y - fh * k * 0.5, tc.x + sway * k, tc.y - fh * k);
          x.quadraticCurveTo(tc.x + 7 * tc.s * k, tc.y - fh * k * 0.5, tc.x + 6 * tc.s * k, tc.y);
          x.closePath();
          x.fill();
        }
        if (embers.length < 36 && Math.random() < dt * 3) embers.push(spawn(tc));
      }

      // Embers rise, drift and fade.
      embers = embers.filter((e) => (e.age += dt) < e.life);
      for (const e of embers) {
        e.y -= e.v * dt;
        e.x += Math.sin(t * 3 + e.v) * 8 * dt;
        const a = 1 - e.age / e.life;
        x.fillStyle = `rgba(255,${120 + a * 80 | 0},60,${a * 0.85})`;
        x.fillRect(e.x, e.y, 1.6, 1.6);
      }
      x.globalCompositeOperation = 'source-over';

      // Mist along the floor, two layers drifting opposite ways.
      for (const [sp, a, yy] of [[14, 0.10, 0.84], [-9, 0.07, 0.93]] as const) {
        const off = (t * sp) % w;
        for (const ox of [off - w, off]) {
          g = x.createRadialGradient(ox + w * 0.5, h * yy, 4, ox + w * 0.5, h * yy, w * 0.6);
          g.addColorStop(0, `rgba(170,150,155,${a})`);
          g.addColorStop(1, 'rgba(0,0,0,0)');
          x.fillStyle = g;
          x.fillRect(ox, h * (yy - 0.2), w, h * 0.4);
        }
      }

      // Film grain, very light
      x.globalAlpha = 0.5;
      x.drawImage(grain[Math.abs(Math.floor(t * 12) || 0) % grain.length], 0, 0, w, h);
      x.globalAlpha = 1;

      // Vignette
      g = x.createRadialGradient(w / 2, h * 0.48, Math.min(w, h) * 0.22, w / 2, h / 2, Math.max(w, h) * 0.72);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.82)');
      x.fillStyle = g;
      x.fillRect(0, 0, w, h);
    },
  };
}

export default HorrorBackground;
