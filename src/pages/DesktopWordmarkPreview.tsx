import { useEffect, useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';

type Controller = Awaited<ReturnType<typeof import('../components/app/navigation/desktop-wordmark-fracture.js')['createDesktopWordmark']>>;

export default function DesktopWordmarkPreview() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const controller = useRef<Controller | null>(null);
  const [day, setDay] = useState(3);
  const [status, setStatus] = useState('Loading');
  const [actualSize, setActualSize] = useState(false);
  const hovered = useRef(false), focused = useRef(false);
  useEffect(() => {
    let disposed = false;
    void import('../components/app/navigation/desktop-wordmark-fracture.js').then(async ({ createDesktopWordmark }) => {
      if (disposed || !canvas.current) return;
      const instance = await createDesktopWordmark(canvas.current, '/dehub-header-logo.png', { stage: .6, onError: () => setStatus('Graphics context interrupted') });
      if (disposed) { instance.dispose(); return; }
      controller.current = instance;
      instance.setHovered(hovered.current || focused.current);
      setStatus('Ready');
    }).catch(() => { if (!disposed) setStatus('Unable to load the 3D preview'); });
    return () => { disposed = true; controller.current?.dispose(); controller.current = null; };
  }, []);
  const hold = () => controller.current?.setHovered(hovered.current || focused.current);
  return <main style={{ minHeight: '100dvh', background: '#070a0e', color: '#e8edf4', padding: '40px 20px', fontFamily: 'system-ui' }}>
    <Helmet><title>Desktop wordmark preview</title><meta name="robots" content="noindex,nofollow" /></Helmet>
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <h1 style={{ fontSize: 24, marginBottom: 20 }}>Desktop DEHUB wordmark</h1>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
        {[0,1,2,3,4,5].map(value => <button key={value} type="button" aria-pressed={day === value}
          style={{ padding: '10px 16px', borderRadius: 8, background: day === value ? '#edf2f9' : '#202833', color: day === value ? '#080c12' : '#edf2f9' }}
          onClick={() => { setDay(value); controller.current?.setStage(value/5); controller.current?.replay(); }}>Day {value}</button>)}
        <button type="button" style={{ padding: '10px 16px' }} onClick={() => controller.current?.replay()}>Replay entry</button>
        <button type="button" aria-pressed={actualSize} style={{ padding: '10px 16px' }} onClick={() => setActualSize(value => !value)}>{actualSize ? 'Enlarge' : 'Actual header size'}</button>
      </div>
      <div style={{ minHeight: 280, display: 'grid', placeItems: 'center', background: 'radial-gradient(ellipse at center,#17212c,#020304)', borderRadius: 16 }}>
        <button type="button" aria-label="Reassemble the desktop wordmark" style={{ width: actualSize ? 175 : '100%', padding: 0, border: 0, background: 'transparent' }}
          onPointerEnter={() => { hovered.current = true; hold(); }} onPointerLeave={() => { hovered.current = false; hold(); }}
          onFocus={() => { focused.current = true; hold(); }} onBlur={() => { focused.current = false; hold(); }}>
          <canvas ref={canvas} style={{ display: 'block', width: '100%', aspectRatio: '350 / 177.2' }} />
        </button>
      </div>
      <p aria-live="polite" style={{ marginTop: 16 }}>{status} · Day {day} · Two-second hold, then crumble. Hover or focus to reassemble.</p>
    </div>
  </main>;
}
