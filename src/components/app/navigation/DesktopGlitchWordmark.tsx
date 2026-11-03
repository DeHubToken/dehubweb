import { useEffect, useRef, useState } from 'react';
import riftnSource from '@/assets/riftn-wordmark-source.png';
import { createDesktopGlitch } from './desktop-wordmark-glitch.js';

type Controller = Awaited<ReturnType<typeof createDesktopGlitch>>;

/**
 * DEHUB pixel-rots and glitches into RIFTN. Desktop sidebar by default; the
 * phone top bar passes its own width, media query and a slower loop.
 */
export function DesktopGlitchWordmark({ light = false, width = 135, media, speed }: { light?: boolean; width?: number; media?: string; speed?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const controller = useRef<Controller | null>(null);
  const lightRef = useRef(light);
  const [ready, setReady] = useState(false);
  useEffect(() => { lightRef.current = light; controller.current?.setLight(light); }, [light]);
  useEffect(() => {
    const surface = canvas.current;
    if (!surface) return;
    let disposed = false;
    void createDesktopGlitch(surface, ['/dehub-header-logo.png', riftnSource], { light: lightRef.current, media, speed })
      .then(instance => {
        if (disposed) { instance.dispose(); return; }
        controller.current = instance;
        instance.setLight(lightRef.current);
        setReady(true);
      }).catch(() => { if (!disposed) setReady(false); });
    return () => { disposed = true; controller.current?.dispose(); controller.current = null; };
  }, []);
  // Every size keeps the desktop proportions (135 x 40.6 logo, 135 x 45 canvas).
  const k = width / 135;
  return <span style={{ display: 'inline-block', position: 'relative', width, height: 40.6 * k, top: -3 * k }}>
    <img src="/dehub-header-logo.png" alt="dehub" width={width} height={40.6 * k} fetchPriority="high"
      style={{ width, height: 40.6 * k, objectFit: 'contain', opacity: ready ? 0 : 1, filter: light ? 'invert(1)' : undefined }} />
    <canvas ref={canvas} width={Math.round(540 * k)} height={Math.round(180 * k)} aria-hidden="true" data-desktop-glitch-wordmark
      style={{ position: 'absolute', width, height: 45 * k, left: 0, top: -2.2 * k, pointerEvents: 'none', opacity: ready ? 1 : 0 }} />
  </span>;
}
