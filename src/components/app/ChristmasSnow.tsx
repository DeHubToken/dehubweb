import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAppTheme } from '@/contexts/ThemeContext';

/**
 * Christmas snow overlay. Snowflakes fall and accumulate at the bottom of
 * the viewport. The accumulated drift wipes every time the user navigates
 * to a different route (back/forward included).
 */
export function ChristmasSnow() {
  const { theme } = useAppTheme();
  const { pathname } = useLocation();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const heightsRef = useRef<Float32Array | null>(null);
  const flakesRef = useRef<
    Array<{ x: number; y: number; r: number; vy: number; vx: number; o: number }>
  >([]);
  const rafRef = useRef<number | null>(null);

  // Only wipe the built-up drift on navigation. Falling flakes keep falling.
  useEffect(() => {
    if (heightsRef.current) heightsRef.current.fill(0);
  }, [pathname]);


  useEffect(() => {
    if (theme !== 'christmas') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const BUCKET = 6; // px wide accumulation columns
    const MAX_PILE = 80; // px max snow drift height
    const MAX_FLAKES = 260;

    let width = 0;
    let height = 0;
    let cols = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.ceil(width / BUCKET);
      const prev = heightsRef.current;
      const next = new Float32Array(cols);
      if (prev) {
        for (let i = 0; i < Math.min(prev.length, cols); i++) next[i] = prev[i];
      }
      heightsRef.current = next;
    };
    resize();
    window.addEventListener('resize', resize);

    const spawn = () => {
      flakesRef.current.push({
        x: Math.random() * width,
        y: -4,
        r: 1 + Math.random() * 2.5,
        vy: 0.4 + Math.random() * 1.2,
        vx: (Math.random() - 0.5) * 0.4,
        o: 0.5 + Math.random() * 0.5,
      });
    };

    const tick = () => {
      ctx.clearRect(0, 0, width, height);
      const heights = heightsRef.current!;

      // Spawn
      if (flakesRef.current.length < MAX_FLAKES && Math.random() < 0.85) spawn();

      // Update + draw flakes
      const flakes = flakesRef.current;
      for (let i = flakes.length - 1; i >= 0; i--) {
        const f = flakes[i];
        f.y += f.vy;
        f.x += f.vx + Math.sin((f.y + i) * 0.01) * 0.3;
        if (f.x < -10) f.x = width + 10;
        if (f.x > width + 10) f.x = -10;

        const col = Math.max(0, Math.min(cols - 1, Math.floor(f.x / BUCKET)));
        const ground = height - heights[col];
        if (f.y + f.r >= ground) {
          // Land: bump neighboring columns slightly so the drift looks soft.
          const add = 1.2 + f.r * 0.6;
          heights[col] = Math.min(MAX_PILE, heights[col] + add);
          if (col > 0) heights[col - 1] = Math.min(MAX_PILE, heights[col - 1] + add * 0.5);
          if (col < cols - 1) heights[col + 1] = Math.min(MAX_PILE, heights[col + 1] + add * 0.5);
          flakes.splice(i, 1);
          continue;
        }
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${f.o})`;
        ctx.fill();
      }

      // Draw accumulated drift along the bottom.
      ctx.beginPath();
      ctx.moveTo(0, height);
      for (let i = 0; i < cols; i++) {
        ctx.lineTo(i * BUCKET + BUCKET / 2, height - heights[i]);
      }
      ctx.lineTo(width, height);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.fill();

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('resize', resize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [theme]);

  if (theme !== 'christmas') return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 9998 }}
    />
  );
}
