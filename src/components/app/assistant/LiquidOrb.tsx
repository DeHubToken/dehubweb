/**
 * Liquid Orb
 * ==========
 * The Assistant's voice button: a ball of liquid metal that wobbles on its own
 * and moves with the conversation. It swells with the mic while you talk and
 * moves the most while the reply is playing.
 *
 * Every frame writes straight to the DOM. Nothing here re-renders while it
 * animates, and the loop stops when the orb is off screen.
 */

import { useEffect, useRef, type CSSProperties } from 'react';
import { useAppTheme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';
import './liquid-orb.css';

export type LiquidOrbMode = 'idle' | 'listening' | 'thinking' | 'speaking';

interface LiquidOrbProps {
  size: number;
  mode: LiquidOrbMode;
  /** Loudness 0–1, read every frame. */
  getLevel?: () => number;
  onClick?: () => void;
  label: string;
  disabled?: boolean;
  className?: string;
}

// Fixed-colour themes. The customisable ones (glass, hazy, swarms, lavalamp)
// follow the picked Theme Color through --tint-accent instead.
const THEME_TINTS: Record<string, [string, string]> = {
  osaka: ['#ff4fa3', '#36d6ff'],
  jungle: ['#4ade80', '#d9f99d'],
  winter: ['#7dd3fc', '#e0f2fe'],
  war: ['#eab308', '#fde68a'],
  island: ['#fb923c', '#22d3ee'],
  hacker: ['#22c55e', '#bbf7d0'],
  horror: ['#ef4444', '#fca5a5'],
};
const TINT_THEMES = new Set(['glass', 'hazy', 'swarms', 'lavalamp']);
const CHROME_THEMES = new Set(['system', 'immersive', 'cosmic', 'light', 'minimal']);

function paletteFor(theme: string, choice: string): { name: string; style: CSSProperties } {
  if (CHROME_THEMES.has(theme) || !(theme in THEME_TINTS || TINT_THEMES.has(theme))) {
    const onLight = choice === 'system-light' || theme === 'light' || theme === 'minimal';
    return { name: onLight ? 'chrome-light' : 'chrome', style: {} };
  }
  const [a, b] = THEME_TINTS[theme] ?? ['var(--tint-accent, #a855f7)', '#ffffff'];
  return { name: 'tint', style: { '--orb-a': a, '--orb-b': b } as CSSProperties };
}

// Energy per mode, before the live level is added on top.
const MODE_BASE: Record<LiquidOrbMode, number> = { idle: 0.22, thinking: 0.3, listening: 0.32, speaking: 0.5 };
const MODE_GAIN: Record<LiquidOrbMode, number> = { idle: 0, thinking: 0, listening: 1, speaking: 1.7 };

export function LiquidOrb({ size, mode, getLevel, onClick, label, disabled, className }: LiquidOrbProps) {
  const { theme, themeChoice } = useAppTheme();
  const rootRef = useRef<HTMLButtonElement>(null);
  const blobRef = useRef<HTMLSpanElement>(null);
  const sheenRef = useRef<HTMLSpanElement>(null);
  const streakRef = useRef<HTMLSpanElement>(null);
  const glowRef = useRef<HTMLSpanElement>(null);
  const modeRef = useRef(mode);
  const getLevelRef = useRef(getLevel);
  modeRef.current = mode;
  getLevelRef.current = getLevel;

  useEffect(() => {
    const root = rootRef.current;
    const blob = blobRef.current;
    const sheen = sheenRef.current;
    const glow = glowRef.current;
    const streak = streakRef.current;
    if (!root || !blob || !sheen || !glow || !streak) return;

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Eight radii, each on its own slow sine, make the outline wobble without
    // ever repeating in an obvious way.
    const rates = [1.0, 1.37, 0.83, 1.21, 0.71, 1.53, 0.93, 1.13];
    const offsets = [0, 1.9, 3.7, 5.1, 2.6, 4.4, 0.8, 3.1];
    let raf = 0;
    let visible = false;
    let level = 0;
    let energy = MODE_BASE[modeRef.current];
    let phase = 0;
    let spin = 0;
    let last = performance.now();

    const draw = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const m = modeRef.current;
      const raw = m === 'listening' || m === 'speaking' ? getLevelRef.current?.() ?? 0 : 0;
      // Fast attack, slow release, like a VU meter.
      level += (raw - level) * (raw > level ? 0.4 : 0.08);
      const target = MODE_BASE[m] + level * MODE_GAIN[m];
      energy += (target - energy) * 0.08;

      phase += dt * (0.55 + energy * 2.4);
      spin += dt * (10 + energy * 70);

      const amp = 4 + energy * 14;
      const r = rates.map((k, i) => Math.max(28, Math.min(72, 50 + amp * Math.sin(phase * k + offsets[i]))));
      blob.style.borderRadius = `${r[0]}% ${100 - r[0]}% ${r[1]}% ${100 - r[1]}% / ${r[2]}% ${r[3]}% ${100 - r[3]}% ${100 - r[2]}%`;

      const swell = 1 + level * 0.09 * (m === 'speaking' ? 1.6 : 1) + 0.02 * Math.sin(phase * 0.9);
      const squash = m === 'speaking' ? 0.05 * energy * Math.sin(phase * 3.1) : 0.015 * Math.sin(phase * 1.7);
      blob.style.transform = `scale(${(swell * (1 + squash)).toFixed(4)}, ${(swell * (1 - squash)).toFixed(4)})`;
      // The horizon sways, harder the more it is moving.
      const sway = 12 * Math.sin(phase * 0.6) + 14 * energy * Math.sin(phase * 2.1);
      sheen.style.transform = `rotate(${sway.toFixed(2)}deg) translateY(${(4 * energy * Math.sin(phase * 1.3)).toFixed(2)}%)`;
      streak.style.transform = `rotate(${spin.toFixed(2)}deg)`;
      glow.style.opacity = (0.3 + energy * 0.45).toFixed(3);
      glow.style.transform = `scale(${(1 + level * 0.35).toFixed(3)})`;

      if (visible && !document.hidden) raf = requestAnimationFrame(draw);
      else raf = 0;
    };

    const start = () => {
      if (reduce || raf || !visible || document.hidden) return;
      last = performance.now();
      raf = requestAnimationFrame(draw);
    };

    if (reduce) draw(performance.now());

    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      start();
    });
    io.observe(root);
    const onVis = () => start();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  const palette = paletteFor(theme, themeChoice);

  return (
    <button
      ref={rootRef}
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={mode !== 'idle'}
      data-liquid-orb
      data-palette={palette.name}
      data-mode={mode}
      className={cn('liquid-orb', className)}
      style={{ '--orb-size': `${size}px`, ...palette.style } as CSSProperties}
    >
      <span ref={glowRef} className="liquid-orb__glow" aria-hidden="true" />
      <span ref={blobRef} className="liquid-orb__blob" aria-hidden="true">
        <span ref={sheenRef} className="liquid-orb__sheen" />
        <span ref={streakRef} className="liquid-orb__streak" />
        <span className="liquid-orb__shade" />
        <span className="liquid-orb__spec" />
      </span>
    </button>
  );
}
