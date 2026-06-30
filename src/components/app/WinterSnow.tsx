import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAppTheme } from '@/contexts/ThemeContext';

/**
 * Winter snow overlay.
 *
 * Behaviour:
 * - Flakes fall and accumulate on the bottom of the viewport (ground).
 * - Flakes also accumulate on top of flat surfaces (cards, buttons,
 *   bento tiles). When a pile gets too tall it tips off the side and
 *   falls onto whatever is below.
 * - Scrolling the page blows the surface piles off — they cascade down
 *   to the ground rather than getting wiped completely.
 * - Navigating to a new route wipes the ground drift entirely (the
 *   original "page change" behaviour).
 */

type Surface = {
  /** Stable key derived from the element pointer so we can keep state across rect refreshes. */
  id: number;
  rect: DOMRect;
  /** Per-column pile heights for this surface (BUCKET-wide columns). */
  heights: Float32Array;
};

export function WinterSnow() {
  const { theme } = useAppTheme();
  const { pathname } = useLocation();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const heightsRef = useRef<Float32Array | null>(null);
  const mediaRectsRef = useRef<DOMRect[]>([]);
  const surfacesRef = useRef<Surface[]>([]);
  const surfaceMapRef = useRef<Map<number, Surface>>(new Map());
  const elementIdRef = useRef<WeakMap<Element, number>>(new WeakMap());
  const nextIdRef = useRef(1);
  const frameCountRef = useRef(0);
  const flakesRef = useRef<
    Array<{ x: number; y: number; r: number; vy: number; vx: number; o: number }>
  >([]);
  const blowRef = useRef<
    Array<{ x: number; y: number; vx: number; vy: number; r: number; o: number }>
  >([]);
  const windDirRef = useRef(1);
  const rafRef = useRef<number | null>(null);
  const isFirstNav = useRef(true);

  // On navigation: blow the built-up ground drift away in style. Falling flakes keep falling.
  useEffect(() => {
    if (isFirstNav.current) { isFirstNav.current = false; return; }
    const heights = heightsRef.current;
    if (!heights) return;
    const h = window.innerHeight;
    const dir = Math.random() < 0.5 ? -1 : 1;
    windDirRef.current = dir;
    for (let c = 0; c < heights.length; c++) {
      const pile = heights[c];
      if (pile < 0.5) continue;
      const ratio = Math.min(1, pile / 80);
      const count = Math.floor(ratio * 7 + Math.random() * (ratio + 0.3));
      for (let k = 0; k < count; k++) {
        blowRef.current.push({
          x: c * 6 + Math.random() * 6,
          y: h - Math.random() * pile,
          vx: dir * (1.2 + Math.random() * 3 * (0.4 + ratio)),
          vy: -0.4 - Math.random() * (0.8 + ratio * 1.6),
          r: 1 + Math.random() * (1 + ratio * 1.2),
          o: 0.55 + Math.random() * 0.35,
        });
      }
    }
    heights.fill(0);
    // Also wipe any surface piles on route change.
    for (const s of surfacesRef.current) s.heights.fill(0);
  }, [pathname]);

  useEffect(() => {
    if (theme !== 'winter') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const BUCKET = 6;
    const MAX_PILE = 80;
    const SURFACE_MAX_PILE = 14; // tipping threshold per column on a surface
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

    // Scroll → blow surface piles down to the floor below (don't wipe ground drift).
    let lastScrollY = window.scrollY;
    const onScroll = () => {
      const dy = window.scrollY - lastScrollY;
      lastScrollY = window.scrollY;
      const intensity = Math.min(3, Math.abs(dy) / 30 + 0.4);
      for (const s of surfacesRef.current) {
        for (let c = 0; c < s.heights.length; c++) {
          const pile = s.heights[c];
          if (pile < 0.5) continue;
          const ratio = Math.min(1, pile / SURFACE_MAX_PILE);
          const count = Math.max(1, Math.floor(ratio * 2 + Math.random() * 2));
          const colX = s.rect.left + c * BUCKET + BUCKET / 2;
          const topY = s.rect.top - pile;
          for (let k = 0; k < count; k++) {
            blowRef.current.push({
              x: colX + (Math.random() - 0.5) * BUCKET,
              y: topY + Math.random() * pile,
              vx: (Math.random() - 0.5) * 1.4 * intensity,
              vy: 0.6 + Math.random() * 1.8 * intensity,
              r: 1 + Math.random() * 1.6,
              o: 0.55 + Math.random() * 0.3,
            });
          }
          s.heights[c] = 0;
        }
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });

    const SURFACE_SELECTOR = [
      'button',
      '[role="button"]',
      '.rounded-xl',
      '.rounded-2xl',
      '.rounded-3xl',
      '[data-snow="surface"]',
    ].join(',');

    const refreshSurfaces = () => {
      const seen = new Set<number>();
      const list: Surface[] = [];
      const candidates = document.querySelectorAll(SURFACE_SELECTOR);
      let count = 0;
      candidates.forEach((el) => {
        if (count >= 60) return;
        const rect = (el as HTMLElement).getBoundingClientRect();
        if (rect.width < 60 || rect.width > 900) return;
        if (rect.height < 24) return;
        if (rect.top < -20 || rect.top > height - 20) return;
        // Skip elements off-screen horizontally.
        if (rect.right < 0 || rect.left > width) return;
        // Skip if covered by something opaque directly above: cheap check via topmost element at midpoint.
        const probe = document.elementFromPoint(
          rect.left + rect.width / 2,
          rect.top + 2,
        );
        if (probe && probe !== el && !el.contains(probe) && !probe.contains(el)) return;

        let id = elementIdRef.current.get(el);
        if (id == null) {
          id = nextIdRef.current++;
          elementIdRef.current.set(el, id);
        }
        seen.add(id);
        const surfCols = Math.max(1, Math.ceil(rect.width / BUCKET));
        const existing = surfaceMapRef.current.get(id);
        let heights: Float32Array;
        if (existing && existing.heights.length === surfCols) {
          heights = existing.heights;
        } else if (existing) {
          heights = new Float32Array(surfCols);
          for (let i = 0; i < Math.min(existing.heights.length, surfCols); i++) {
            heights[i] = existing.heights[i];
          }
        } else {
          heights = new Float32Array(surfCols);
        }
        const surface: Surface = { id, rect, heights };
        list.push(surface);
        surfaceMapRef.current.set(id, surface);
        count++;
      });
      // Garbage-collect surfaces that disappeared.
      for (const id of Array.from(surfaceMapRef.current.keys())) {
        if (!seen.has(id)) surfaceMapRef.current.delete(id);
      }
      surfacesRef.current = list;
    };

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

      frameCountRef.current++;
      if (frameCountRef.current % 20 === 0) {
        mediaRectsRef.current = Array.from(document.querySelectorAll('video'))
          .filter((el) => {
            const rect = (el as HTMLElement).getBoundingClientRect();
            return rect.width >= 80 && rect.height >= 80;
          })
          .map((el) => (el as HTMLElement).getBoundingClientRect());
      }
      // Surface rects refresh less often — DOM queries are expensive.
      if (frameCountRef.current % 30 === 0) {
        refreshSurfaces();
      }

      if (flakesRef.current.length < MAX_FLAKES && Math.random() < 0.85) spawn();

      const surfaces = surfacesRef.current;

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
            const vertical = (dy / d) * falloff * force * 0.4;
            if (vertical > 0) f.vy += vertical;
          }
        }
        f.vx *= 0.94;
        if (f.vy > 1.6) f.vy *= 0.96;
        const minFall = 0.3 + f.r * 0.15;
        if (f.vy < minFall) f.vy = minFall;

        const prevY = f.y;
        f.y += f.vy;
        f.x += f.vx + Math.sin((f.y + i) * 0.01) * 0.3;
        if (f.x < -10) f.x = width + 10;
        if (f.x > width + 10) f.x = -10;

        // Surface collision (top edge only — flake must cross from above).
        let landed = false;
        for (let si = 0; si < surfaces.length; si++) {
          const s = surfaces[si];
          if (f.x < s.rect.left || f.x > s.rect.right) continue;
          const col = Math.max(0, Math.min(s.heights.length - 1, Math.floor((f.x - s.rect.left) / BUCKET)));
          const surfaceTop = s.rect.top - s.heights[col];
          if (prevY <= surfaceTop && f.y + f.r >= surfaceTop) {
            const add = (1.0 + f.r * 0.5) * 1.4;
            s.heights[col] = Math.min(SURFACE_MAX_PILE, s.heights[col] + add);
            if (col > 0) s.heights[col - 1] = Math.min(SURFACE_MAX_PILE, s.heights[col - 1] + add * 0.5);
            if (col < s.heights.length - 1)
              s.heights[col + 1] = Math.min(SURFACE_MAX_PILE, s.heights[col + 1] + add * 0.5);

            // Tipping: if pile is near max, spawn a few falling particles that
            // tumble off the side onto whatever is below.
            if (s.heights[col] >= SURFACE_MAX_PILE - 0.1) {
              const sideDir = col < s.heights.length / 2 ? -1 : 1;
              for (let k = 0; k < 2; k++) {
                blowRef.current.push({
                  x: f.x + sideDir * (Math.random() * 4),
                  y: surfaceTop - 1,
                  vx: sideDir * (0.4 + Math.random() * 1.2),
                  vy: 0.3 + Math.random() * 0.8,
                  r: 1 + Math.random() * 1.2,
                  o: 0.55 + Math.random() * 0.3,
                });
              }
              s.heights[col] -= 3;
            }
            flakes.splice(i, 1);
            landed = true;
            break;
          }
        }
        if (landed) continue;

        const col = Math.max(0, Math.min(cols - 1, Math.floor(f.x / BUCKET)));
        const ground = height - heights[col];
        if (f.y + f.r >= ground) {
          const add = (1.2 + f.r * 0.6) * 1.75;
          heights[col] = Math.min(MAX_PILE, heights[col] + add);
          if (col > 0) heights[col - 1] = Math.min(MAX_PILE, heights[col - 1] + add * 0.5);
          if (col < cols - 1) heights[col + 1] = Math.min(MAX_PILE, heights[col + 1] + add * 0.5);
          flakes.splice(i, 1);
          continue;
        }
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
        const overMedia = mediaRectsRef.current.some(
          (r) => f.x >= r.left && f.x <= r.right && f.y >= r.top && f.y <= r.bottom
        );
        ctx.fillStyle = `rgba(255,255,255,${overMedia ? f.o * 0.12 : f.o})`;
        ctx.fill();
      }

      // Wipe ground pile when pointer rubs through it.
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

      // Smooth ground pile.
      if (cols > 2) {
        let prev = heights[0];
        for (let i = 1; i < cols - 1; i++) {
          const cur = heights[i];
          const next = heights[i + 1];
          heights[i] = cur * 0.7 + (prev + next) * 0.15;
          prev = cur;
        }
      }

      // Smooth surface piles too, and let pointer rub them off.
      for (const s of surfaces) {
        const sh = s.heights;
        if (sh.length > 2) {
          let prev = sh[0];
          for (let i = 1; i < sh.length - 1; i++) {
            const cur = sh[i];
            const next = sh[i + 1];
            sh[i] = cur * 0.75 + (prev + next) * 0.125;
            prev = cur;
          }
        }
        if (mouse.active && speed > 0.5) {
          if (mouse.x < s.rect.left - 20 || mouse.x > s.rect.right + 20) continue;
          if (mouse.y < s.rect.top - 30 || mouse.y > s.rect.top + 6) continue;
          const localX = mouse.x - s.rect.left;
          const centerCol = Math.floor(localX / BUCKET);
          const wipeStrength = Math.min(6, 0.6 + speed * 0.2);
          for (let i = -4; i <= 4; i++) {
            const c = centerCol + i;
            if (c < 0 || c >= sh.length) continue;
            const falloff = Math.max(0, 1 - Math.abs(i) / 4);
            sh[c] = Math.max(0, sh[c] - wipeStrength * falloff);
          }
        }
      }

      // Blown / tipping particles.
      const blow = blowRef.current;
      for (let i = blow.length - 1; i >= 0; i--) {
        const b = blow[i];
        b.vy += 0.08;
        b.vx *= 0.99;
        b.x += b.vx;
        b.y += b.vy;
        b.o *= 0.985;
        // Let them land on the floor too so cascades feel real.
        if (b.y + b.r >= height - heights[Math.max(0, Math.min(cols - 1, Math.floor(b.x / BUCKET)))]) {
          const col = Math.max(0, Math.min(cols - 1, Math.floor(b.x / BUCKET)));
          const add = (0.8 + b.r * 0.4) * 1.2;
          heights[col] = Math.min(MAX_PILE, heights[col] + add);
          blow.splice(i, 1);
          continue;
        }
        if (b.o < 0.04 || b.x < -20 || b.x > width + 20 || b.y > height + 20) {
          blow.splice(i, 1);
          continue;
        }
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${b.o})`;
        ctx.fill();
      }

      // Draw surface piles as smooth white caps sitting on top of each surface.
      for (const s of surfaces) {
        const sh = s.heights;
        let any = false;
        for (let i = 0; i < sh.length; i++) if (sh[i] > 0.4) { any = true; break; }
        if (!any) continue;
        const baseY = s.rect.top;
        ctx.beginPath();
        ctx.moveTo(s.rect.left, baseY);
        ctx.lineTo(s.rect.left, baseY - sh[0]);
        for (let i = 0; i < sh.length - 1; i++) {
          const x1 = s.rect.left + i * BUCKET + BUCKET / 2;
          const x2 = s.rect.left + (i + 1) * BUCKET + BUCKET / 2;
          const y1 = baseY - sh[i];
          const y2 = baseY - sh[i + 1];
          const cx = (x1 + x2) / 2;
          const cy = (y1 + y2) / 2;
          ctx.quadraticCurveTo(x1, y1, cx, cy);
        }
        ctx.lineTo(s.rect.right, baseY - sh[sh.length - 1]);
        ctx.lineTo(s.rect.right, baseY);
        ctx.closePath();
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.fill();
      }

      // Draw ground drift.
      ctx.beginPath();
      ctx.moveTo(0, height);
      ctx.lineTo(0, height - heights[0]);
      for (let i = 0; i < cols - 1; i++) {
        const x1 = i * BUCKET + BUCKET / 2;
        const x2 = (i + 1) * BUCKET + BUCKET / 2;
        const y1 = height - heights[i];
        const y2 = height - heights[i + 1];
        const cx = (x1 + x2) / 2;
        const cy = (y1 + y2) / 2;
        ctx.quadraticCurveTo(x1, y1, cx, cy);
      }
      ctx.lineTo(width, height - heights[cols - 1]);
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
      window.removeEventListener('scroll', onScroll);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [theme]);

  if (theme !== 'winter') return null;
  if (pathname === '/prompt') return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 9998 }}
    />
  );
}
