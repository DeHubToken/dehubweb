import { useEffect, useRef } from 'react';
import { isBackgroundPaused, subscribeBackgroundPaused } from '@/lib/background-gate';

const crystalRibbons = [
  'M-220 1220C160 520 550 1050 940 460S1420-160 1850-80',
  'M-220 520C300 1100 690 570 1010 240S1480-100 1840 110',
  'M260-180C660 200 560 360 1020 350S1360 650 1770 620',
];

export function GlassBackground() {
  const ref = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const lightCanvas = document.createElement('canvas');
    const lightContext = lightCanvas.getContext('2d');
    if (!lightContext) return;
    const paths = crystalRibbons.map(path => new Path2D(path));
    let resizeFrame = 0;
    const paint = () => {
      const { width, height } = canvas.getBoundingClientRect();
      if (!width || !height) return;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      lightCanvas.width = canvas.width;
      lightCanvas.height = canvas.height;
      context.fillStyle = '#021018';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = getComputedStyle(canvas).getPropertyValue('--tint-accent').trim() || '#00d2e6';
      const colour = context.fillStyle;
      const channels = /^#[\da-f]{6}$/i.test(colour)
        ? [1, 3, 5].map(offset => parseInt(colour.slice(offset, offset + 2), 16))
        : [0, 210, 230];
      const mix = (base: number[], weight: number) => `rgb(${base.map((channel, index) => Math.round(channel * (1 - weight) + channels[index] * weight)).join(',')})`;
      const scale = Math.max(width / 1600, height / 1000);
      context.setTransform(ratio * scale, 0, 0, ratio * scale,
        ratio * (width - 1600 * scale) / 2, ratio * (height - 1000 * scale) / 2);
      lightContext.setTransform(ratio * scale, 0, 0, ratio * scale,
        ratio * (width - 1600 * scale) / 2, ratio * (height - 1000 * scale) / 2);
      const sky = context.createRadialGradient(1600, 0, 0, 1600, 0, 1500);
      sky.addColorStop(0, mix([17, 69, 82], .31));
      sky.addColorStop(1, 'transparent');
      context.fillStyle = sky;
      context.fillRect(-1600, -1000, 4800, 3000);
      const floor = context.createRadialGradient(320, 1000, 0, 320, 1000, 1100);
      floor.addColorStop(0, mix([8, 44, 56], .13));
      floor.addColorStop(1, 'transparent');
      context.fillStyle = floor;
      context.fillRect(-1600, -1000, 4800, 3000);
      const light = lightContext.createLinearGradient(0, 0, 1600, 1000);
      light.addColorStop(0, 'rgba(255,255,255,.7)');
      light.addColorStop(.3, 'rgba(255,255,255,.08)');
      light.addColorStop(.65, 'rgba(234,255,255,.5)');
      light.addColorStop(1, 'rgba(255,255,255,.08)');
      lightContext.strokeStyle = light;
      lightContext.lineCap = 'round';
      paths.forEach((path, index) => {
        for (let layer = 0; layer < 64; layer++) {
          lightContext.lineWidth = 300 * (1 - layer / 64);
          lightContext.globalAlpha = (.003 + layer * .000125) * (index === 2 ? .3 : 1);
          lightContext.stroke(path);
        }
      });
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.drawImage(lightCanvas, 0, 0);
    };
    // Paint once per size change. Pointer response and the slow light loop
    // move this single surface instead of compositing translucent SVG layers.
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(paint);
    });
    observer.observe(canvas);
    const colourObserver = new MutationObserver(paint);
    colourObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
    paint();
    return () => { observer.disconnect(); colourObserver.disconnect(); cancelAnimationFrame(resizeFrame); lightCanvas.width = 0; lightCanvas.height = 0; };
  }, []);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    let x = 0, y = 0;
    const sync = () => { root.dataset.paused = String(document.hidden || isBackgroundPaused() || reduced.matches); };
    const move = (event: PointerEvent) => {
      if (document.hidden || isBackgroundPaused() || reduced.matches) return;
      x = (event.clientX / window.innerWidth - .5) * 2;
      y = (event.clientY / window.innerHeight - .5) * 2;
      if (!frame) frame = requestAnimationFrame(() => {
        root.style.setProperty('--glass-pointer-x', `${x * 28}px`);
        root.style.setProperty('--glass-pointer-y', `${y * 22}px`);
        root.style.setProperty('--glass-pointer-r', `${x * 1.5}deg`);
        frame = 0;
      });
    };
    const reset = () => {
      root.style.setProperty('--glass-pointer-x', '0px'); root.style.setProperty('--glass-pointer-y', '0px'); root.style.setProperty('--glass-pointer-r', '0deg');
    };
    sync();
    const unsubscribe = subscribeBackgroundPaused(sync);
    document.addEventListener('visibilitychange', sync);
    document.addEventListener('pointermove', move, { passive: true });
    document.documentElement.addEventListener('pointerleave', reset);
    reduced.addEventListener('change', sync);
    return () => {
      unsubscribe(); cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', sync); document.removeEventListener('pointermove', move);
      document.documentElement.removeEventListener('pointerleave', reset); reduced.removeEventListener('change', sync);
    };
  }, []);
  return <div ref={ref} data-glass-background data-glass-crystal aria-hidden="true"><div data-glass-parallax>
    <canvas ref={canvasRef} data-glass-crystal-sculpture />
  </div></div>;
}
