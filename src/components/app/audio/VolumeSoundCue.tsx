import { useEffect, useRef, useState } from 'react';

/**
 * While a track is audible the volume bar shows it: a loose swarm of notes
 * floats up out of the filled part toward the handle, and a thin arc slides out of the handle
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

const NOTE_SLOTS = 9;
const rand = (n: number) => { const v = Math.sin(n * 12.9898) * 43758.5453; return v - Math.floor(v); };

/** Where note slot `i` is at time `t`: every cycle it reappears at a new random spot. */
function noteAt(i: number, t: number, level: number, fillEnd: number, cy: number, trackHeight: number) {
  const lift = trackHeight / 8;
  const duration = (1.8 + 1.6 * rand(i + 0.13)) / (0.75 + 0.5 * level);
  const phase = t / duration + rand(i + 0.71);
  const cycle = Math.floor(phase);
  const p = phase - cycle;
  const r = (j: number) => rand(i * 31.7 + cycle * 7.3 + j);
  const x = r(1) * fillEnd * 0.85 + p * (18 + 30 * r(2));
  const y = cy + (r(3) - 0.5) * trackHeight * 0.8 - p * (5 + 10 * r(4)) * lift
    + Math.sin(p * Math.PI * 2 * (0.6 + r(5)) + r(6) * Math.PI * 2) * 2 * lift;
  const alpha = Math.pow(Math.sin(Math.PI * p), 0.8) * Math.max(0, Math.min(1, (fillEnd + 14 - x) / 10));
  return { x, y, alpha, scale: 0.75 + 0.6 * r(7), rot: (r(8) - 0.5) * 0.7, glyph: i % 2 };
}

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
    const height = Math.max(trackHeight, (thumbRadius + 16) * 2, (trackHeight / 8) * 30 + 24);
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

        // A loose swarm of notes: each pops up somewhere along the fill and
        // floats off up and to the right on its own path, then fades.
        const note = Math.max(6, trackHeight + 1);
        const lift = trackHeight / 8;
        const count = Math.max(2, Math.min(NOTE_SLOTS, Math.round(fillEnd / 18)));
        if (fillEnd > note) {
          ctx.lineJoin = 'round';
          for (let i = 0; i < count; i++) {
            const n = noteAt(i, t, value, fillEnd, cy, trackHeight);
            const alpha = 0.75 * fade * n.alpha;
            if (alpha <= 0.01) continue;
            const scale = (note * n.scale) / 12;
            ctx.globalAlpha = alpha;
            ctx.setTransform(dpr * scale * Math.cos(n.rot), dpr * scale * Math.sin(n.rot), -dpr * scale * Math.sin(n.rot), dpr * scale * Math.cos(n.rot), dpr * n.x, dpr * (n.y - (note * n.scale) / 2));
            ctx.fillStyle = '#f4fbfc';
            ctx.strokeStyle = 'rgba(10,20,26,.5)';
            ctx.lineWidth = 1 / Math.max(lift, .75);
            shapes[n.glyph].forEach(part => { ctx.stroke(part); ctx.fill(part); });
          }
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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
