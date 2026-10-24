import { useEffect, useRef, useState } from 'react';

/**
 * While a track is audible the volume bar shows it: faint notes flow through
 * the filled part toward the handle, and a thin arc slides out of the handle
 * on each beat. Drawn over the slider with touches passing through; still and
 * empty when paused, muted or with reduced motion on.
 *
 * The app draws the same thing (dehub-mobile components/Home/VolumeSoundCue.tsx);
 * keep the numbers in step.
 */
const CUE_BPM = 112;
const ECHO_LIFE = 1.15;
// ♪ and ♫ on a 12px box, one shape per part so overlaps never cut holes.
const NOTE_PARTS = [
  ['M1 9.4a2.6 2 0 1 0 5.2 0a2.6 2 0 1 0-5.2 0z', 'M5.4 1h1v8.4h-1z', 'M6.4 1c1.6.8 3.2 2 2.8 4.8c-.4-1.4-1.4-2.2-2.8-2.4z'],
  ['M.6 9.8a2.2 1.7 0 1 0 4.4 0a2.2 1.7 0 1 0-4.4 0z', 'M6.6 8.6a2.2 1.7 0 1 0 4.4 0a2.2 1.7 0 1 0-4.4 0z', 'M4.2 2.4h.8v7.4h-.8z', 'M10.2 1.2h.8v7.4h-.8z', 'M4.2 2.4L11 1.2V3L4.2 4.2z'],
];

interface VolumeSoundCueProps {
  /** 0..1, the slider's value. */
  level: number;
  /** Sound is actually coming out: playing and not muted. */
  active: boolean;
  /** Track thickness and handle radius of the slider underneath, in px. */
  trackHeight: number;
  thumbRadius: number;
}

export function VolumeSoundCue({ level, active, trackHeight, thumbRadius }: VolumeSoundCueProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const live = useRef({ level, active });
  live.current = { level, active };
  const [reduced, setReduced] = useState(false);
  const kickRef = useRef<() => void>();

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || reduced) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const reach = thumbRadius + 18;
    const height = Math.max(trackHeight, (thumbRadius + 16) * 2);
    let width = 0;
    let frame = 0;
    let fade = 0;
    let last = performance.now();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const shapes = NOTE_PARTS.map(parts => parts.map(d => new Path2D(d)));

    const size = () => {
      width = canvas.parentElement?.clientWidth ?? 0;
      canvas.style.width = `${width + reach}px`;
      canvas.style.height = `${height}px`;
      canvas.width = Math.round((width + reach) * dpr);
      canvas.height = Math.round(height * dpr);
    };
    size();
    const observer = new ResizeObserver(size);
    if (canvas.parentElement) observer.observe(canvas.parentElement);

    const draw = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const { level: value, active: on } = live.current;
      fade += ((on ? 1 : 0) - fade) * Math.min(1, dt * 5);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width + reach, height);
      if (fade > 0.01 && width > 0) {
        const t = now / 1000;
        const cy = height / 2;
        const thumbX = thumbRadius + value * (width - thumbRadius * 2);
        const fillEnd = thumbX - thumbRadius;

        // Notes inside the fill, left to right, fading in and out.
        const note = Math.max(5, trackHeight - 1.5);
        const scale = note / 12;
        const count = Math.max(1, Math.min(4, Math.round(fillEnd / 40)));
        const span = Math.max(fillEnd, note * 2);
        const speed = 10 + 14 * value;
        if (fillEnd > note * 1.5) {
          ctx.save();
          ctx.beginPath();
          ctx.roundRect(0, cy - trackHeight / 2, thumbX, trackHeight, trackHeight / 2);
          ctx.clip();
          ctx.fillStyle = '#0a141a';
          for (let i = 0; i < count; i++) {
            const p = ((t * speed) / span + i / count) % 1;
            const x = p * span - note / 2;
            const alpha = 0.5 * fade * Math.sin(Math.PI * p) * Math.max(0, Math.min(1, (fillEnd - x - note) / note));
            if (alpha <= 0.01) continue;
            ctx.globalAlpha = alpha;
            ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * x, dpr * (cy - note / 2));
            shapes[i % 2].forEach(part => ctx.fill(part));
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          }
          ctx.restore();
        }

        // One thin arc out of the handle per beat.
        const beats = (t * CUE_BPM) / 60;
        ctx.strokeStyle = '#f0f8fa';
        ctx.lineCap = 'round';
        for (let j = 0; j < 2; j++) {
          const age = ((((beats + j) / 2) % 1) * 2) / ECHO_LIFE;
          if (age >= 1) continue;
          ctx.globalAlpha = 0.55 * fade * (0.55 + 0.45 * value) * Math.pow(1 - age, 1.6);
          ctx.lineWidth = 1.3 * (1 - age * 0.5);
          ctx.beginPath();
          ctx.arc(thumbX, cy, thumbRadius + 2 + age * 12, -0.62, 0.62);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
      frame = on || fade > 0.01 ? requestAnimationFrame(draw) : 0;
    };
    const kick = () => { if (!frame) { last = performance.now(); frame = requestAnimationFrame(draw); } };
    kickRef.current = kick;
    kick();
    return () => { cancelAnimationFrame(frame); observer.disconnect(); kickRef.current = undefined; };
  }, [reduced, thumbRadius, trackHeight]);

  // Restart the loop when sound comes back after it went still.
  useEffect(() => {
    if (active) kickRef.current?.();
  }, [active]);

  if (reduced) return null;
  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      data-volume-sound-cue
      style={{ position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
    />
  );
}
