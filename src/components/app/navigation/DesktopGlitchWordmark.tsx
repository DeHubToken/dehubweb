import { useEffect, useRef, useState } from 'react';
import riftnSource from '@/assets/riftn-wordmark-source.png';
import { createDesktopGlitch } from './desktop-wordmark-glitch.js';

type Controller = Awaited<ReturnType<typeof createDesktopGlitch>>;

/** Mounted only in the expanded desktop wordmark slot. */
export function DesktopGlitchWordmark({ light = false }: { light?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const controller = useRef<Controller | null>(null);
  const lightRef = useRef(light);
  const [ready, setReady] = useState(false);
  useEffect(() => { lightRef.current = light; controller.current?.setLight(light); }, [light]);
  useEffect(() => {
    const surface = canvas.current;
    if (!surface) return;
    let disposed = false;
    void createDesktopGlitch(surface, ['/dehub-header-logo.png', riftnSource], { light: lightRef.current })
      .then(instance => {
        if (disposed) { instance.dispose(); return; }
        controller.current = instance;
        instance.setLight(lightRef.current);
        setReady(true);
      }).catch(() => { if (!disposed) setReady(false); });
    return () => { disposed = true; controller.current?.dispose(); controller.current = null; };
  }, []);
  return <span style={{ display: 'inline-block', position: 'relative', width: 135, height: 40.6, top: -3 }}>
    <img src="/dehub-header-logo.png" alt="dehub" width={135} height={40.6} fetchPriority="high"
      style={{ width: 135, height: 40.6, objectFit: 'contain', opacity: ready ? 0 : 1, filter: light ? 'invert(1)' : undefined }} />
    <canvas ref={canvas} width={540} height={180} aria-hidden="true" data-desktop-glitch-wordmark
      style={{ position: 'absolute', width: 135, height: 45, left: 0, top: -2.2, pointerEvents: 'none', opacity: ready ? 1 : 0 }} />
  </span>;
}
