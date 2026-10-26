/**
 * LiveMicBars
 * ===========
 * The recording half of the voice note strip: the microphone's level, drawn
 * as the same thin bars the player uses, newest on the right, so what you are
 * saying scrolls in as you say it. Painted in currentColor.
 *
 * Without Web Audio (or before the stream arrives) it holds a flat line.
 */

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

const BAR_W = 2;
const BAR_GAP = 1.5;
const STEP_MS = 70;

export function LiveMicBars({ stream, className }: { stream: MediaStream | null; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof requestAnimationFrame !== 'function') return;
    const levels: number[] = [];
    let analyser: AnalyserNode | null = null;
    let ctx: AudioContext | null = null;
    let raf = 0;
    let last = 0;
    const Ctx = typeof window !== 'undefined' ? (window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) : undefined;
    if (stream && Ctx) {
      try {
        ctx = new Ctx();
        const source = ctx.createMediaStreamSource(stream);
        analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
      } catch {
        analyser = null;
      }
    }
    const buf = analyser ? new Uint8Array(analyser.fftSize) : null;

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (now - last < STEP_MS) return;
      last = now;
      let level = 0.04;
      if (analyser && buf) {
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
        level = Math.min(1, Math.max(0.04, Math.sqrt(sum / buf.length) * 3.2));
      }
      levels.push(level);
      if (levels.length > 300) levels.shift();

      const rect = canvas.getBoundingClientRect();
      if (!rect.width) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.round(rect.width * dpr);
      const h = Math.round(rect.height * dpr);
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      const g = canvas.getContext('2d');
      if (!g) return;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, rect.width, rect.height);
      g.fillStyle = getComputedStyle(canvas).color;
      const n = Math.floor(rect.width / (BAR_W + BAR_GAP));
      for (let i = 0; i < n; i++) {
        const j = levels.length - n + i;
        const v = j >= 0 ? levels[j] : 0.04;
        const bh = Math.max(2, v * rect.height * 0.9);
        g.globalAlpha = 0.85;
        g.beginPath();
        if (g.roundRect) g.roundRect(i * (BAR_W + BAR_GAP), (rect.height - bh) / 2, BAR_W, bh, 1);
        else g.rect(i * (BAR_W + BAR_GAP), (rect.height - bh) / 2, BAR_W, bh);
        g.fill();
      }
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ctx?.close().catch(() => {});
    };
  }, [stream]);

  return <canvas ref={canvasRef} aria-hidden="true" className={cn('block w-full min-w-0 h-[26px] text-white', className)} />;
}

export default LiveMicBars;
