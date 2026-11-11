import { useEffect, useRef } from 'react';
import {
  drawBars, drawWaveform, drawCircular, drawSpectrum, drawMirror, drawRings, drawPulse,
  drawTerrain, drawOrb, drawStatic, setVisualizerInk, seededPeaks, idleFrequencyData, idleTimeData,
} from './visualizer-styles';
import { AudioListener, drawExtra, isExtraStyle, makePalette } from './visualizer-extra';

/** These painters keep their state in the module, shared with the playing card, so their tile is one still frame. */
const STILL = new Set(['static', 'bars', 'spectrum', 'rings', 'pulse', 'terrain', 'orb']);
const FRAME_MS = 1000 / 30;
const BINS = 128;

/**
 * A small example of one visualizer style for the style picker. Every tile is
 * one still frame; the tile under the mouse plays (the synthesised groove, no
 * audio). A grid of tiles all moving at once was most of the picker's cost.
 */
export function StylePreview({ style, hue, theme, seed }: { style: string; hue: number; theme: string; seed: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const shape = seededPeaks(seed, 48);
    const idleFreq = idleFrequencyData(shape, BINS);
    const idleTime = idleTimeData(shape, BINS);
    const listener = new AudioListener();
    const state: Record<string, unknown> = {};
    const palette = makePalette(hue, false, theme);
    let raf = 0;
    let last = 0;
    let visible = false;
    const paint = (now: number) => {
      const scale = window.devicePixelRatio || 1;
      const cssW = canvas.clientWidth || 96;
      const cssH = canvas.clientHeight || 44;
      if (canvas.width !== Math.round(cssW * scale)) { canvas.width = Math.round(cssW * scale); canvas.height = Math.round(cssH * scale); }
      const w = canvas.width, h = canvas.height;
      const t = now / 1000;
      const phase = now / 850;
      const freq = Uint8Array.from(idleFreq, (value, index) => Math.round(Math.min(255, value * 1.3 * (.55 + .45 * Math.sin(phase + index * .13) ** 2))));
      const time = Uint8Array.from(idleTime, (value, index) => Math.round(128 + (value - 128) * Math.sin(phase + index * .04)));
      setVisualizerInk(false);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, w, h);
      if (isExtraStyle(style)) {
        listener.fromSynth(t, .4, shape, .65);
        ctx.setTransform(scale, 0, 0, scale, 0, 0);
        drawExtra(style, ctx as never, cssW, cssH, listener.frame, palette, state as never);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        return;
      }
      switch (style) {
        case 'static': drawStatic(ctx, freq, w, h, hue, seed, .4, shape, 48); break;
        case 'bars': drawBars(ctx, freq, w, h, hue); break;
        case 'waveform': drawWaveform(ctx, time, w, h, hue); break;
        case 'circular': drawCircular(ctx, freq, w, h, hue); break;
        case 'spectrum': drawSpectrum(ctx, freq, w, h, hue); break;
        case 'mirror': drawMirror(ctx, freq, w, h, hue); break;
        case 'rings': drawRings(ctx, freq, w, h, hue); break;
        case 'pulse': drawPulse(ctx, freq, w, h, hue); break;
        case 'terrain': drawTerrain(ctx, freq, w, h, hue); break;
        case 'orb': drawOrb(ctx, freq, w, h, hue); break;
      }
    };
    const still = STILL.has(style);
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    // Particle styles start empty; run a second of frames so the tile shows them.
    const warm = () => { const start = performance.now(); for (let i = 30; i > 0; i--) paint(start - i * FRAME_MS); };
    let hovered = false;
    const loop = (now: number) => {
      if (!visible || !hovered) return;
      if (now - last >= FRAME_MS) { last = now; paint(now); }
      raf = requestAnimationFrame(loop);
    };
    let drawn = false;
    let idle = 0;
    const later = (run: () => void) => window.setTimeout(run, 0);
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      cancelAnimationFrame(raf);
      if (!visible) return;
      // One tile per idle slot, so a page of stills never blocks the picker opening.
      if (!drawn) { drawn = true; idle = later(() => { if (isExtraStyle(style)) warm(); paint(performance.now()); }); }
      if (hovered && !still && !reduced) raf = requestAnimationFrame(loop);
    });
    observer.observe(canvas);
    const tile = canvas.closest('button') ?? canvas;
    const enter = (event: Event) => {
      if ((event as PointerEvent).pointerType !== 'mouse' || still || reduced) return;
      hovered = true;
      cancelAnimationFrame(raf);
      if (visible) raf = requestAnimationFrame(loop);
    };
    const leave = () => { hovered = false; cancelAnimationFrame(raf); };
    tile.addEventListener('pointerenter', enter);
    tile.addEventListener('pointerleave', leave);
    return () => { visible = false; observer.disconnect(); cancelAnimationFrame(raf); window.clearTimeout(idle); tile.removeEventListener('pointerenter', enter); tile.removeEventListener('pointerleave', leave); };
  }, [style, hue, theme, seed]);
  return <canvas ref={canvasRef} data-audio-style-preview aria-hidden />;
}
