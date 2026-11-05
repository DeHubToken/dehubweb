import { useEffect, useRef, useState } from 'react';
import { escapePose, knobCutoff, tubeNote } from './bubbleLift';
import { paintNote } from './bubbleLiftCanvas';
import { canEscapeMusicNote, escapeMusicNote } from './escapedMusicNotes';

interface VolumeSoundCueProps { level: number; active: boolean; trackHeight: number; thumbRadius: number; }

export function VolumeSoundCue({ level, active, trackHeight, thumbRadius }: VolumeSoundCueProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const live = useRef({ level, active }); live.current = { level, active };
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const kickRef = useRef<() => void>();
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(query.matches);
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);
  useEffect(() => {
    const canvas = ref.current, ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || reduced) return;
    const input = canvas.parentElement?.querySelector('input');
    const height = Math.max(64, trackHeight * 5);
    let width = 0, frame = 0, fade = 0, clock = 0, last = 0, escapedCycle = -1;
    let inView = true;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const size = () => {
      width = input?.clientWidth ?? canvas.parentElement?.clientWidth ?? 0;
      canvas.style.left = `${input?.offsetLeft ?? 0}px`;
      canvas.style.width = `${width + 36}px`; canvas.style.height = `${height}px`;
      canvas.width = Math.round((width + 36) * dpr); canvas.height = height * dpr;
    };
    size();
    const observer = new ResizeObserver(size);
    if (input) observer.observe(input);
    const visible = () => !document.hidden && inView;
    const draw = (now: number) => {
      frame = 0;
      if (!visible()) return;
      const dt = Math.min(.05, (now - last) / 1000); last = now;
      const on = live.current.active && live.current.level > 0;
      if (on) clock += dt;
      fade += ((on ? 1 : 0) - fade) * Math.min(1, dt * 5);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, width + 36, height);
      if (fade > .01 && width > 0) {
        const radius = input?.hasAttribute('data-glass-held') ? 15 : thumbRadius;
        const value = Math.max(0, Math.min(1, live.current.level));
        const cy = height / 2, thumb = radius + value * (width - radius * 2);
        const ink = canvas.closest('[data-material="light"]') ? '#eff9fc' : '#203944';
        ctx.save(); ctx.translate(0, cy);
        ctx.beginPath(); ctx.roundRect(thumbRadius, -trackHeight / 2, Math.max(0, width - thumbRadius * 2), trackHeight, trackHeight / 2); ctx.clip();
        ctx.save(); ctx.clip(new Path2D(knobCutoff(thumb, radius, trackHeight / 2)));
        for (let i = 0; i < Math.min(64, Math.ceil(width / 9)); i++) {
          const n = tubeNote(i, clock, width, trackHeight);
          paintNote(ctx, n.x, n.y, n.size, n.rotation, n.opacity * fade, ink, i % 4 === 0);
        }
        ctx.restore();
        ctx.restore();
        // The rare traveller can leave the tube even at full volume.
        ctx.save(); ctx.translate(0, cy);
        ctx.beginPath(); ctx.rect(thumbRadius, -trackHeight / 2, width + 36, trackHeight); ctx.clip();
        const p = escapePose(clock, thumb, radius, trackHeight);
        if (canEscapeMusicNote()) {
          if (!p.ready) paintNote(ctx, p.x, p.y, .48 * trackHeight / 8, -.18, p.opacity * fade * .9, p.x > thumb + radius ? '#dae9ef' : ink);
          else if (on && escapedCycle !== p.cycle) {
            escapedCycle = p.cycle;
            const bounds = canvas.getBoundingClientRect();
            escapeMusicNote(bounds.left + p.x, bounds.top + cy + p.y);
          }
        }
        ctx.restore();
        const beats = clock * 112 / 60;
        ctx.strokeStyle = '#f0f8fa'; ctx.lineCap = 'round';
        for (let j = 0; j < 2; j++) {
          const age = (((beats + j) / 2) % 1) * 2 / 1.15;
          if (age >= 1) continue;
          ctx.globalAlpha = .55 * fade * (.55 + .45 * value) * Math.pow(1 - age, 1.6);
          ctx.lineWidth = 1.3 * (1 - age * .5); ctx.beginPath();
          ctx.arc(thumb, cy, radius + 2 + age * 12, -.62, .62); ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
      if (on || fade > .01) frame = requestAnimationFrame(draw);
    };
    const kick = () => { if (!frame && visible()) { last = performance.now(); frame = requestAnimationFrame(draw); } };
    const visibility = () => { if (!visible()) { cancelAnimationFrame(frame); frame = 0; } else kick(); };
    const intersection = new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; visibility(); });
    if (canvas.parentElement) intersection.observe(canvas.parentElement);
    document.addEventListener('visibilitychange', visibility);
    kickRef.current = kick; kick();
    return () => { cancelAnimationFrame(frame); observer.disconnect(); intersection.disconnect(); document.removeEventListener('visibilitychange', visibility); kickRef.current = undefined; };
  }, [reduced, thumbRadius, trackHeight]);
  useEffect(() => { kickRef.current?.(); }, [active, level]);
  if (reduced) return null;
  return <canvas ref={ref} aria-hidden="true" data-volume-sound-cue="bubble-lift"
    style={{ position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />;
}
