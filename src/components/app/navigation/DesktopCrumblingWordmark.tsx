import { useEffect, useRef, useState } from 'react';

const FIVE_DAYS = 5 * 24 * 60 * 60 * 1000;
const START_KEY = 'dehub:logo-crumble-start:v1';
type Controller = Awaited<ReturnType<typeof import('./desktop-wordmark-fracture.js')['createDesktopWordmark']>>;

/** Only the expanded desktop wordmark owns this renderer. */
export function DesktopCrumblingWordmark({ light = false }: { light?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const controller = useRef<Controller | null>(null);
  const lightRef = useRef(light);
  const [ready, setReady] = useState(false);
  useEffect(() => { lightRef.current = light; controller.current?.setLight(light); }, [light]);
  useEffect(() => {
    const surface = canvas.current;
    if (!surface) return;
    let disposed = false, failed = false;
    let start = Date.now();
    try {
      const raw = localStorage.getItem(START_KEY), saved = Number(raw);
      if (raw && Number.isFinite(saved) && saved > 0 && saved <= start) start = saved;
      else localStorage.setItem(START_KEY, String(start));
    } catch { /* Keep a session clock when storage is unavailable. */ }
    const progress = () => Math.min(1, Math.max(0, (Date.now() - start) / FIVE_DAYS));
    const fail = () => {
      failed = true;
      if (!disposed) setReady(false);
      controller.current?.dispose(); controller.current = null;
    };
    const button = surface.closest('button');
    let hovering = button?.matches(':hover') ?? false;
    let focusing = button === document.activeElement;
    const updateHeld = () => controller.current?.setHovered(hovering || focusing);
    const enter = () => { hovering = true; updateHeld(); };
    const leave = () => { hovering = false; updateHeld(); };
    const focus = () => { focusing = true; updateHeld(); };
    const blur = () => { focusing = false; updateHeld(); };
    button?.addEventListener('pointerenter', enter);
    button?.addEventListener('pointerleave', leave);
    button?.addEventListener('focus', focus);
    button?.addEventListener('blur', blur);
    void import('./desktop-wordmark-fracture.js').then(async ({ createDesktopWordmark }) => {
      if (disposed) return;
      const instance = await createDesktopWordmark(surface, '/dehub-header-logo.png', { stage: progress(), onError: fail });
      if (disposed || failed) { instance.dispose(); return; }
      controller.current = instance;
      instance.setLight(lightRef.current); updateHeld(); setReady(true);
    }).catch(fail);
    const interval = window.setInterval(() => { if (!document.hidden) controller.current?.setStage(progress()); }, 60_000);
    return () => {
      disposed = true; clearInterval(interval);
      button?.removeEventListener('pointerenter', enter); button?.removeEventListener('pointerleave', leave);
      button?.removeEventListener('focus', focus); button?.removeEventListener('blur', blur);
      controller.current?.dispose(); controller.current = null;
    };
  }, []);
  return <span style={{ display: 'inline-block', position: 'relative', width: 135, height: 40.6, top: -3 }}>
    <img src="/dehub-header-logo.png" alt="dehub" width={135} height={40.6} fetchPriority="high"
      style={{ width: 135, height: 40.6, objectFit: 'contain', opacity: ready ? 0 : 1, filter: light ? 'invert(1)' : undefined }} />
    <canvas ref={canvas} aria-hidden="true" data-desktop-wordmark
      style={{ position: 'absolute', width: 175, height: 88.6, left: -20, top: -24, pointerEvents: 'none', opacity: ready ? 1 : 0 }} />
  </span>;
}
