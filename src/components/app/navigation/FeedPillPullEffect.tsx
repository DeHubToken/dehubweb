import { useEffect, useRef } from 'react';
import { PULL_ECHO_CYCLE_MS, pillPullVisual } from '@/lib/pill-pull-motion';

export function FeedPillPullEffect({ distance, pulling, refreshing }: { distance: number; pulling: boolean; refreshing: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const values = useRef({ distance, pulling, refreshing });
  values.current = { distance, pulling, refreshing };
  const active = distance > 0 || refreshing;
  useEffect(() => {
    const node = canvas.current;
    if (!node || !active) return;
    const context = node.getContext('2d');
    if (!context) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const began = performance.now();
    let frame = 0;
    const paint = (now: number) => {
      const width = node.parentElement?.getBoundingClientRect().width ?? 149.1;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      if (node.width !== Math.round((width + 48) * ratio)) { node.width = Math.round((width + 48) * ratio); node.height = 224 * ratio; }
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width + 48, 224);
      const { distance: d, pulling: drag, refreshing: busy } = values.current;
      const visual = pillPullVisual(d, drag, busy, reduced ? 0 : ((now - began) / PULL_ECHO_CYCLE_MS) % 1);
      const half = width / 2;
      const lower = (opacity: number, blur: number, stroke: number) => {
        context.save(); context.beginPath();
        context.moveTo(-half, 28);
        context.bezierCurveTo(-half, 36.84, -half + 7.16, 44, -half + 16, 44);
        context.lineTo(half - 16, 44);
        context.bezierCurveTo(half - 7.16, 44, half, 36.84, half, 28);
        const gradient = context.createLinearGradient(0, 28, 0, 45);
        gradient.addColorStop(0, 'rgba(237,245,255,0)');
        gradient.addColorStop(.28, `rgba(237,245,255,${opacity * .22})`);
        gradient.addColorStop(.62, `rgba(237,245,255,${opacity * .7})`);
        gradient.addColorStop(1, `rgba(248,251,255,${opacity})`);
        context.strokeStyle = gradient; context.lineWidth = stroke; context.lineCap = 'round';
        context.shadowColor = `rgba(228,240,255,${opacity * .85})`; context.shadowBlur = blur;
        context.stroke(); context.restore();
      };
      context.save(); context.translate(half + 24, 0);
      context.save(); context.beginPath(); context.rect(-half - 24, 44, width + 48, visual.gapHeight); context.clip();
      context.beginPath(); context.roundRect(-half, visual.echoOffset, width, 44, 16);
      context.fillStyle = `rgba(222,232,246,${visual.echoOpacity * .045})`; context.fill();
      context.strokeStyle = `rgba(231,239,250,${visual.echoOpacity})`; context.lineWidth = .7; context.stroke();
      context.restore();
      // An elliptical falloff carries the rim into the surrounding air.
      context.save(); context.translate(0, 44); context.scale(half + 12, 24);
      const halo = context.createRadialGradient(0, 0, 0, 0, 0, 1);
      halo.addColorStop(0, `rgba(228,240,255,${visual.rimOpacity * .065})`);
      halo.addColorStop(.4, `rgba(228,240,255,${visual.rimOpacity * .03})`);
      halo.addColorStop(.75, `rgba(228,240,255,${visual.rimOpacity * .008})`);
      halo.addColorStop(1, 'rgba(228,240,255,0)');
      context.fillStyle = halo; context.fillRect(-1, -1, 2, 2); context.restore();
      lower(visual.rimOpacity * .22, 18, 2.3);
      lower(visual.rimOpacity * .62, 10, .8);
      context.restore();
      frame = requestAnimationFrame(paint);
    };
    frame = requestAnimationFrame(paint);
    return () => { cancelAnimationFrame(frame); context.clearRect(0, 0, node.width, node.height); };
  }, [active]);
  return <canvas ref={canvas} data-feed-pull-effect aria-hidden="true" className="pointer-events-none absolute top-0 -left-6 z-20 h-[224px]" style={{ width: 'calc(100% + 48px)', opacity: active ? 1 : 0 }} />;
}
