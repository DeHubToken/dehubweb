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
      if (node.width !== Math.round((width + 24) * ratio)) { node.width = Math.round((width + 24) * ratio); node.height = 224 * ratio; }
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width + 24, 224);
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
        gradient.addColorStop(0, `rgba(237,245,255,${opacity * .12})`);
        gradient.addColorStop(.4, `rgba(237,245,255,${opacity * .7})`);
        gradient.addColorStop(1, `rgba(248,251,255,${opacity})`);
        context.strokeStyle = gradient; context.lineWidth = stroke;
        context.shadowColor = `rgba(228,240,255,${opacity * .85})`; context.shadowBlur = blur;
        context.stroke(); context.restore();
      };
      context.save(); context.translate(half + 12, 0);
      context.save(); context.beginPath(); context.rect(-half - 12, 44, width + 24, visual.gapHeight); context.clip();
      context.beginPath(); context.roundRect(-half, visual.echoOffset, width, 44, 16);
      context.fillStyle = `rgba(222,232,246,${visual.echoOpacity * .045})`; context.fill();
      context.strokeStyle = `rgba(231,239,250,${visual.echoOpacity})`; context.lineWidth = .7; context.stroke();
      context.restore();
      lower(visual.rimOpacity * .25, 12, 2.3);
      lower(visual.rimOpacity * .87, 6, .9);
      context.restore();
      frame = requestAnimationFrame(paint);
    };
    frame = requestAnimationFrame(paint);
    return () => { cancelAnimationFrame(frame); context.clearRect(0, 0, node.width, node.height); };
  }, [active]);
  return <canvas ref={canvas} data-feed-pull-effect aria-hidden="true" className="pointer-events-none absolute top-0 -left-3 z-20 h-[224px]" style={{ width: 'calc(100% + 24px)', opacity: active ? 1 : 0 }} />;
}
