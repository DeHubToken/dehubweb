import { useEffect, useRef } from 'react';
import { useAppTheme } from '@/contexts/ThemeContext';
import { makeNoiseTile, runCanvasBackdrop, type CanvasScene } from '@/lib/canvas-backdrop';

/**
 * "Horror" — found footage on a worn VHS tape. A dim corridor with a lit door
 * at the far end, under tape grain, a rolling tracking band, scanlines and a
 * REC timestamp that shows the viewer's real time. Every so often the tape
 * skips: the picture jumps and tears for a moment.
 *
 * The corridor is drawn once per size to an offscreen canvas; each frame only
 * composites it with grain and the tape effects.
 */
export function HorrorBackground() {
  const { theme } = useAppTheme();
  if (theme !== 'horror') return null;
  return (
    <div aria-hidden="true" className="fixed inset-0 pointer-events-none" style={{ zIndex: 0, background: '#0b0c0d' }}>
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

function paintCorridor(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d');
  if (!x) return c;
  const vx = w * 0.5;
  const vy = h * 0.46;
  // Far wall and door
  const fw = Math.min(w, h) * 0.22;
  const fh = fw * 1.35;
  const fx = vx - fw / 2;
  const fy = vy - fh * 0.55;

  x.fillStyle = '#23282a';
  x.fillRect(0, 0, w, h);
  // Ceiling, floor, walls as four trapezoids to the far wall.
  const quad = (pts: number[][], fill: string | CanvasGradient) => {
    x.fillStyle = fill;
    x.beginPath();
    x.moveTo(pts[0][0], pts[0][1]);
    for (const [px, py] of pts.slice(1)) x.lineTo(px, py);
    x.closePath();
    x.fill();
  };
  let g = x.createLinearGradient(0, 0, 0, fy);
  g.addColorStop(0, '#15191a');
  g.addColorStop(1, '#383e41');
  quad([[0, 0], [w, 0], [fx + fw, fy], [fx, fy]], g);
  g = x.createLinearGradient(0, fy + fh, 0, h);
  g.addColorStop(0, '#43443f');
  g.addColorStop(1, '#181917');
  quad([[fx, fy + fh], [fx + fw, fy + fh], [w, h], [0, h]], g);
  g = x.createLinearGradient(0, 0, fx, 0);
  g.addColorStop(0, '#171a1c');
  g.addColorStop(1, '#3b4043');
  quad([[0, 0], [fx, fy], [fx, fy + fh], [0, h]], g);
  g = x.createLinearGradient(w, 0, fx + fw, 0);
  g.addColorStop(0, '#171a1c');
  g.addColorStop(1, '#383d40');
  quad([[w, 0], [fx + fw, fy], [fx + fw, fy + fh], [w, h]], g);

  // Floor boards converging on the door
  x.strokeStyle = 'rgba(0,0,0,0.35)';
  x.lineWidth = 1;
  for (let i = -6; i <= 6; i++) {
    x.beginPath();
    x.moveTo(vx + i * fw * 0.08, fy + fh);
    x.lineTo(vx + i * w * 0.16, h);
    x.stroke();
  }
  // Doors down the side walls
  x.fillStyle = 'rgba(0,0,0,0.45)';
  for (const [a, b] of [[0.08, 0.3], [0.45, 0.62]]) {
    const lx0 = fx * a;
    const lx1 = fx * b;
    const top0 = fy * a;
    const top1 = fy * b;
    const bot0 = h - (h - fy - fh) * a;
    const bot1 = h - (h - fy - fh) * b;
    quad([[lx0, top0 + (bot0 - top0) * 0.18], [lx1, top1 + (bot1 - top1) * 0.18], [lx1, bot1], [lx0, bot0]], 'rgba(0,0,0,0.45)');
    quad([[w - lx0, top0 + (bot0 - top0) * 0.18], [w - lx1, top1 + (bot1 - top1) * 0.18], [w - lx1, bot1], [w - lx0, bot0]], 'rgba(0,0,0,0.4)');
  }
  // The far door, ajar, with warm light behind it
  x.fillStyle = '#0a0b0b';
  x.fillRect(fx + fw * 0.22, fy + fh * 0.12, fw * 0.56, fh * 0.88);
  g = x.createLinearGradient(fx + fw * 0.5, 0, fx + fw * 0.78, 0);
  g.addColorStop(0, 'rgba(255,214,150,0.05)');
  g.addColorStop(1, 'rgba(255,214,150,0.75)');
  x.fillStyle = g;
  x.fillRect(fx + fw * 0.5, fy + fh * 0.12, fw * 0.28, fh * 0.88);
  // Spill of that light across the floor
  g = x.createRadialGradient(vx + fw * 0.15, fy + fh, 2, vx + fw * 0.15, fy + fh, fw * 1.6);
  g.addColorStop(0, 'rgba(255,200,130,0.24)');
  g.addColorStop(1, 'rgba(255,200,130,0)');
  x.fillStyle = g;
  x.fillRect(0, fy, w, h - fy);
  return c;
}

export function createHorrorScene(): CanvasScene {
  let corridor: HTMLCanvasElement | null = null;
  let noise: HTMLCanvasElement[] = [];
  let skipUntil = 0;
  let nextSkip = 9 + Math.random() * 8;

  return {
    resize(w, h) {
      corridor = paintCorridor(Math.round(w), Math.round(h));
      if (!noise.length) noise = [0, 1, 2, 3].map(() => makeNoiseTile(160, 284, 40));
    },
    draw(x, w, h, t) {
      if (!corridor) return;
      if (t > nextSkip) {
        skipUntil = t + 0.22;
        nextSkip = t + 10 + Math.random() * 12;
      }
      const skipping = t < skipUntil;
      const jitterY = skipping ? (Math.random() - 0.5) * h * 0.18 : Math.sin(t * 23) * 0.6;
      const flicker = 0.9 + Math.sin(t * 7.3) * 0.03 + (Math.random() < 0.04 ? -0.12 : 0);

      x.fillStyle = '#060707';
      x.fillRect(0, 0, w, h);
      x.globalAlpha = flicker;
      x.drawImage(corridor, 0, jitterY, w, h);
      // Chroma bleed: a faint red ghost a few pixels right.
      x.globalAlpha = 0.07;
      x.globalCompositeOperation = 'lighter';
      x.fillStyle = '#ff2040';
      x.drawImage(corridor, 3, jitterY, w, h);
      x.globalCompositeOperation = 'source-over';
      x.globalAlpha = 1;

      // Washed-out tape colour
      x.fillStyle = 'rgba(120,140,150,0.06)';
      x.fillRect(0, 0, w, h);

      // Grain
      x.globalAlpha = skipping ? 1 : 0.6;
      x.drawImage(noise[Math.floor(t * 24) % noise.length], 0, 0, w, h);
      x.globalAlpha = 1;

      // Tracking band rolling up the picture
      const bandH = Math.max(10, h * 0.018);
      const band = h - (((t * h) / 9) % (h + bandH * 4));
      const src = x.canvas;
      const sy = (band / h) * src.height;
      if (sy > 0 && sy < src.height - 2) {
        x.drawImage(src, 0, sy, src.width, (bandH / h) * src.height, 7 + Math.sin(t * 40) * 4, band, w, bandH);
      }
      x.fillStyle = 'rgba(255,255,255,0.07)';
      x.fillRect(0, band, w, bandH);

      // Tears while the tape skips
      if (skipping) {
        for (let i = 0; i < 6; i++) {
          const ty = Math.random() * h;
          const th = 2 + Math.random() * 14;
          x.drawImage(src, 0, (ty / h) * src.height, src.width, (th / h) * src.height, (Math.random() - 0.5) * 60, ty, w, th);
        }
      }

      // Scanlines
      x.fillStyle = 'rgba(0,0,0,0.22)';
      for (let y = 0; y < h; y += 3) x.fillRect(0, y, w, 1);

      // Vignette
      const v = x.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.75);
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, 'rgba(0,0,0,0.78)');
      x.fillStyle = v;
      x.fillRect(0, 0, w, h);

      // On-screen display: REC and the real time, as the camera burns it in.
      const d = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const clock = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
      const date = `${pad(d.getMonth() + 1)}.${pad(d.getDate())}.${d.getFullYear()}`;
      const fs = Math.max(12, Math.min(18, w / 34));
      x.font = `600 ${fs}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
      x.textBaseline = 'top';
      x.shadowColor = 'rgba(255,255,255,0.55)';
      x.shadowBlur = 4;
      x.fillStyle = 'rgba(240,240,240,0.85)';
      // Lifted clear of the phone bottom nav.
      const base = h - 84;
      const right = w - fs * 1.2;
      x.textAlign = 'right';
      x.fillText(clock, right, base - fs * 1.4);
      x.fillText(date, right, base);
      x.textAlign = 'left';
      x.fillText('PLAY ▶', fs * 1.2, base);
      if (Math.floor(t * 1.2) % 2 === 0) {
        x.fillStyle = 'rgba(255,40,40,0.9)';
        x.shadowColor = 'rgba(255,40,40,0.6)';
        x.beginPath();
        x.arc(fs * 1.2 + fs * 0.4, base - fs * 1.4 + fs * 0.5, fs * 0.38, 0, Math.PI * 2);
        x.fill();
      }
      x.fillStyle = 'rgba(240,240,240,0.85)';
      x.shadowColor = 'rgba(255,255,255,0.55)';
      x.fillText('REC', fs * 2.3, base - fs * 1.4);
      x.shadowBlur = 0;
    },
  };
}

export default HorrorBackground;
