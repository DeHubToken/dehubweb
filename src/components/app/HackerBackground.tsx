import { useEffect, useRef } from 'react';
import { useAppTheme } from '@/contexts/ThemeContext';
import { runCanvasBackdrop, type CanvasScene } from '@/lib/canvas-backdrop';

/**
 * "Hacker" — falling green characters, slowed right down so the feed in front
 * stays readable. Each column drops at its own pace; a bright head glyph
 * leaves a fading trail. The trail is the previous frames showing through a
 * translucent black wash, so the canvas is never cleared between frames.
 */
export function HackerBackground() {
  const { theme } = useAppTheme();
  if (theme !== 'hacker') return null;
  return (
    <div aria-hidden="true" className="fixed inset-0 pointer-events-none" style={{ zIndex: 0, background: '#000' }}>
      <HackerCanvas />
    </div>
  );
}

function HackerCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    return runCanvasBackdrop(ref.current, createHackerScene(), { fps: 30, dprCap: 1.25 });
  }, []);
  return <canvas ref={ref} className="block" />;
}

const GLYPHS = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789$#<>/=+*';
const pick = () => GLYPHS[(Math.random() * GLYPHS.length) | 0];

type Column = { row: number; speed: number; idle: number };

export function createHackerScene(): CanvasScene {
  let size = 16;
  let cols: Column[] = [];
  let rows = 0;
  let fresh = true;

  const reset = (c: Column, stagger: boolean) => {
    // On first fill the heads start anywhere on screen, so the rain is
    // already falling rather than arriving from the top.
    c.row = stagger ? Math.random() * rows * 1.1 - rows * 0.1 : -Math.random() * 12;
    c.speed = 3 + Math.random() * 6; // rows per second — slow on purpose
    c.idle = !stagger && Math.random() < 0.3 ? Math.random() * 4 : 0;
  };

  return {
    resize(w, h) {
      size = w < 640 ? 14 : 16;
      rows = Math.ceil(h / size);
      cols = Array.from({ length: Math.ceil(w / size) }, () => {
        const c = { row: 0, speed: 0, idle: 0 };
        reset(c, true);
        return c;
      });
      fresh = true;
    },
    draw(x, w, h, _t, dt) {
      if (fresh) {
        x.fillStyle = '#000';
        x.fillRect(0, 0, w, h);
        // Lay down each column's trail up to its head, faded by distance.
        x.font = `${size}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
        x.textBaseline = 'top';
        cols.forEach((c, i) => {
          const head = Math.floor(c.row);
          for (let k = 1; k < 22; k++) {
            const r = head - k;
            if (r < 0) break;
            x.fillStyle = `rgba(57,255,136,${0.62 * Math.pow(0.9, k)})`;
            x.fillText(pick(), i * size, r * size);
          }
        });
        fresh = false;
      }
      // Wash the last frame toward black; what survives is the trail.
      x.fillStyle = `rgba(0,0,0,${Math.min(0.5, 1.1 * (dt || 1 / 30))})`;
      x.fillRect(0, 0, w, h);
      x.font = `${size}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
      x.textBaseline = 'top';

      for (let i = 0; i < cols.length; i++) {
        const c = cols[i];
        if (c.idle > 0) {
          c.idle -= dt;
          continue;
        }
        const before = Math.floor(c.row);
        c.row += c.speed * (dt || 1 / 30);
        const now = Math.floor(c.row);
        if (now > before && now >= 0) {
          const px = i * size;
          // The glyph the head just left turns green; the head is near white.
          x.fillStyle = 'rgba(57,255,136,0.62)';
          x.fillText(pick(), px, (now - 1) * size);
          x.fillStyle = 'rgba(214,255,230,0.9)';
          x.fillText(pick(), px, now * size);
        }
        if (c.row > rows + 8) reset(c, false);
      }
      // Now and then a glyph deep in a trail flips, so the rain looks alive.
      for (let k = 0; k < 3; k++) {
        const i = (Math.random() * cols.length) | 0;
        const r = Math.floor(cols[i].row - 2 - Math.random() * 10);
        if (r < 0) continue;
        x.fillStyle = '#000';
        x.fillRect(i * size, r * size, size, size);
        x.fillStyle = 'rgba(57,255,136,0.45)';
        x.fillText(pick(), i * size, r * size);
      }
    },
  };
}

export default HackerBackground;
