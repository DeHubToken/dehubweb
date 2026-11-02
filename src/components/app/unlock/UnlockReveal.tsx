/**
 * Plays once over media that was just paid for, then removes itself.
 *
 * The overlay starts out looking like the lock the viewer just paid to open
 * (the caller passes that cover in) and moves it out of the way. Each unlock
 * gets the next of three reveals, so they stay fresh: Coin drop, Confetti,
 * Foil peel. Reduced motion gets a plain fade.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import './unlock-reveal.css';

import type { UnlockRevealKind } from './unlock-reveal-kind';
export type { UnlockRevealKind } from './unlock-reveal-kind';

const LENGTH: Record<UnlockRevealKind | 'fade', number> = { coin: 1800, confetti: 1900, foil: 1900, fade: 350 };

const reducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Theme-coloured confetti with a few gold coins, drawn on one short-lived canvas over the page. */
function burst(from: DOMRect) {
  if (typeof document === 'undefined') return;
  const cv = document.createElement('canvas');
  cv.setAttribute('aria-hidden', 'true');
  cv.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:9999';
  document.body.appendChild(cv);
  const W = window.innerWidth, H = window.innerHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = W * dpr; cv.height = H * dpr;
  const ctx = cv.getContext('2d');
  if (!ctx) { cv.remove(); return; }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const css = getComputedStyle(document.documentElement);
  const accent = css.getPropertyValue('--primary').trim();
  const cols = ['#ffd36b', '#ffffff', accent ? `hsl(${accent})` : '#b48cff', '#ff7ad9'];
  const ox = from.left + from.width / 2, oy = from.top + from.height / 2;
  const P = Array.from({ length: 70 }, (_, i) => {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.3, sp = 4 + Math.random() * 7;
    return { x: ox, y: oy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 2, r: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.4,
      w: 4 + Math.random() * 4, h: 6 + Math.random() * 6, c: cols[i % cols.length], coin: i % 9 === 0, fl: Math.random() * 6.28 };
  });
  const t0 = performance.now();
  const step = (t: number) => {
    const e = t - t0;
    ctx.clearRect(0, 0, W, H);
    const fade = e > 1300 ? Math.max(0, 1 - (e - 1300) / 500) : 1;
    for (const p of P) {
      p.vx *= 0.985; p.vy = p.vy * 0.985 + 0.22; p.x += p.vx; p.y += p.vy; p.r += p.vr; p.fl += 0.18;
      ctx.save(); ctx.globalAlpha = fade; ctx.translate(p.x, p.y); ctx.rotate(p.r);
      if (p.coin) {
        ctx.scale(Math.abs(Math.cos(p.fl)) + 0.15, 1);
        const g = ctx.createRadialGradient(-2, -2, 1, 0, 0, 7);
        g.addColorStop(0, '#fff6c7'); g.addColorStop(0.5, '#ffd36b'); g.addColorStop(1, '#b7790f');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 6, 0, 6.28); ctx.fill();
      } else {
        ctx.scale(1, Math.cos(p.fl)); ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      }
      ctx.restore();
    }
    if (e < 1850) requestAnimationFrame(step); else cv.remove();
  };
  requestAnimationFrame(step);
}

interface UnlockRevealProps {
  kind: UnlockRevealKind;
  /** What the lock looked like: the blurred preview the viewer paid to open. */
  cover: ReactNode;
  onDone: () => void;
}

export function UnlockReveal({ kind, cover, onDone }: UnlockRevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const shown = reducedMotion() ? 'fade' : kind;
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    if (shown === 'confetti' && ref.current) {
      const rect = ref.current.getBoundingClientRect();
      const id = window.setTimeout(() => burst(rect), 120);
      const end = window.setTimeout(() => doneRef.current(), LENGTH[shown]);
      return () => { clearTimeout(id); clearTimeout(end); };
    }
    const end = window.setTimeout(() => doneRef.current(), LENGTH[shown]);
    return () => clearTimeout(end);
  }, [shown]);

  const coverLayer = <div className="ur-cover">{cover}</div>;

  if (shown === 'coin') {
    return (
      <div ref={ref} className="ur ur-coin" data-unlock-reveal="coin" aria-hidden>
        <div className="ur-hole">{coverLayer}<div className="ur-shade" /></div>
        <div className="ur-lock">
          <div className="ur-ring" />
          {[20, 65, 110, 155, 200, 245, 290, 335].map(a => <i key={a} className="ur-spark" style={{ ['--a' as string]: `${a}deg` }} />)}
          <div className="ur-coinface"><i>D</i></div>
          <svg viewBox="0 0 30 36">
            <path className="ur-shk" d="M8 17V10a7 7 0 0 1 14 0v7" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" />
            <rect x="3" y="16" width="24" height="18" rx="4" fill="rgb(255 255 255 / .18)" stroke="#fff" strokeWidth="2.4" />
            <rect x="11" y="16" width="8" height="2.6" rx="1.3" fill="#ffd36b" />
          </svg>
        </div>
      </div>
    );
  }
  if (shown === 'foil') {
    return (
      <div ref={ref} className="ur ur-foil" data-unlock-reveal="foil" aria-hidden>
        <div className="ur-sheen" />
        <div className="ur-peel">{coverLayer}<div className="ur-shade" /><div className="ur-holo" /></div>
        <div className="ur-curl" />
      </div>
    );
  }
  return (
    <div ref={ref} className={`ur ${shown === 'fade' ? 'ur-fade' : 'ur-confetti'}`} data-unlock-reveal={shown} aria-hidden>
      {coverLayer}
      <div className="ur-shade" />
      {shown === 'confetti' && <div className="ur-flash" />}
    </div>
  );
}

export default UnlockReveal;
