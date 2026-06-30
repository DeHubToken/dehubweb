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

    const BUCKET = 6;
    const MAX_PILE = 80;
    const MAX_FLAKES = 260;
    const PUSH_RADIUS = 90;
    const WIPE_RADIUS = 55;

    let width = 0;
    let height = 0;
    let cols = 0;

    const mouse = { x: -9999, y: -9999, vx: 0, vy: 0, active: false, lastMove: 0 };

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

    const setPointer = (x: number, y: number) => {
      if (mouse.active) {
        mouse.vx = x - mouse.x;
        mouse.vy = y - mouse.y;
      } else {
        mouse.vx = 0;
        mouse.vy = 0;
      }
      mouse.x = x;
      mouse.y = y;
      mouse.active = true;
      mouse.lastMove = performance.now();
    };
    const onPointerMove = (e: PointerEvent) => setPointer(e.clientX, e.clientY);
    const onTouchMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (t) setPointer(t.clientX, t.clientY);
    };
    const onPointerLeave = () => {
      mouse.active = false;
      mouse.x = -9999;
      mouse.y = -9999;
      mouse.vx = 0;
      mouse.vy = 0;
    };
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('pointerleave', onPointerLeave);
    window.addEventListener('blur', onPointerLeave);

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

      if (performance.now() - mouse.lastMove > 60) {
        mouse.vx *= 0.6;
        mouse.vy *= 0.6;
      }
      const speed = Math.hypot(mouse.vx, mouse.vy);

      if (flakesRef.current.length < MAX_FLAKES && Math.random() < 0.85) spawn();

      const flakes = flakesRef.current;
      for (let i = flakes.length - 1; i >= 0; i--) {
        const f = flakes[i];

        if (mouse.active) {
          const dx = f.x - mouse.x;
          const dy = f.y - mouse.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < PUSH_RADIUS * PUSH_RADIUS) {
            const d = Math.sqrt(d2) || 1;
            const falloff = 1 - d / PUSH_RADIUS;
            const force = 0.6 + speed * 0.08;
            f.vx += (dx / d) * falloff * force;
            f.vy += (dy / d) * falloff * force * 0.4;
          }
        }
        f.vx *= 0.94;
        if (f.vy > 1.6) f.vy *= 0.96;

        f.y += f.vy;
        f.x += f.vx + Math.sin((f.y + i) * 0.01) * 0.3;
        if (f.x < -10) f.x = width + 10;
        if (f.x > width + 10) f.x = -10;

        const col = Math.max(0, Math.min(cols - 1, Math.floor(f.x / BUCKET)));
        const ground = height - heights[col];
        if (f.y + f.r >= ground) {
          const add = (1.2 + f.r * 0.6) * 3.5;
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

      // Wipe pile: when the pointer moves through the drift, rub it off.
      if (mouse.active && speed > 0.5) {
        const radiusCols = Math.ceil(WIPE_RADIUS / BUCKET);
        const centerCol = Math.floor(mouse.x / BUCKET);
        const wipeStrength = Math.min(8, 0.6 + speed * 0.25);
        for (let i = -radiusCols; i <= radiusCols; i++) {
          const c = centerCol + i;
          if (c < 0 || c >= cols) continue;
          const colX = c * BUCKET + BUCKET / 2;
          const surfaceY = height - heights[c];
          if (mouse.y < surfaceY - 12) continue;
          const dx = colX - mouse.x;
          const falloff = Math.max(0, 1 - Math.abs(dx) / WIPE_RADIUS);
          heights[c] = Math.max(0, heights[c] - wipeStrength * falloff);
        }
      }

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
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('pointerleave', onPointerLeave);
      window.removeEventListener('blur', onPointerLeave);
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
