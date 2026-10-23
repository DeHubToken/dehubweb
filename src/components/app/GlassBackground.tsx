import { useEffect, useRef } from 'react';
import { isBackgroundPaused, subscribeBackgroundPaused } from '@/lib/background-gate';
import { glassLightPixel } from '@/lib/glass-light-field';

export function GlassBackground() {
  const ref = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    let resizeFrame = 0;
    let painted = '';
    const paint = () => {
      const width = canvas.clientWidth, height = canvas.clientHeight;
      if (!width || !height) return;
      context.fillStyle = getComputedStyle(canvas).getPropertyValue('--tint-accent').trim() || '#00d2e6';
      const colour = context.fillStyle;
      const key = `${width}:${height}:${colour}`;
      if (key === painted) return;
      painted = key;
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5, Math.sqrt(1_000_000 / (width * height)));
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      const channels = /^#[\da-f]{6}$/i.test(colour)
        ? [1, 3, 5].map(offset => parseInt(colour.slice(offset, offset + 2), 16))
        : [0, 210, 230];
      const scale = Math.max(width / 1600, height / 1000);
      const offsetX = (width - 1600 * scale) / 2;
      const offsetY = (height - 1000 * scale) / 2;
      const image = context.createImageData(canvas.width, canvas.height);
      for (let py = 0; py < canvas.height; py++) {
        const y = (py / ratio - offsetY) / scale;
        for (let px = 0; px < canvas.width; px++) {
          const x = (px / ratio - offsetX) / scale;
          const colour = glassLightPixel(x, y, channels);
          const index = (py * canvas.width + px) * 4;
          image.data[index] = colour[0]; image.data[index + 1] = colour[1]; image.data[index + 2] = colour[2]; image.data[index + 3] = 255;
        }
      }
      context.putImageData(image, 0, 0);
    };
    // Paint once per size change. Pointer response and the slow light loop
    // move this single smooth field without repainting it on every frame.
    const queuePaint = () => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(paint);
    };
    const observer = new ResizeObserver(queuePaint);
    observer.observe(canvas);
    const colourObserver = new MutationObserver(queuePaint);
    colourObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
    queuePaint();
    return () => { observer.disconnect(); colourObserver.disconnect(); cancelAnimationFrame(resizeFrame); };
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
