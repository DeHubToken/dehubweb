import { useEffect, useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useTranslation } from 'react-i18next';

type Controller = Awaited<ReturnType<typeof import('../components/app/navigation/desktop-wordmark-fracture.js')['createDesktopWordmark']>>;
type Status = 'loading' | 'ready' | 'interrupted' | 'unavailable';

export default function DesktopWordmarkPreview() {
  const { t } = useTranslation();
  const canvas = useRef<HTMLCanvasElement>(null);
  const controller = useRef<Controller | null>(null);
  const [day, setDay] = useState(3);
  const [status, setStatus] = useState<Status>('loading');
  const [actualSize, setActualSize] = useState(false);
  const hovered = useRef(false), focused = useRef(false);
  useEffect(() => {
    let disposed = false;
    void import('../components/app/navigation/desktop-wordmark-fracture.js').then(async ({ createDesktopWordmark }) => {
      if (disposed || !canvas.current) return;
      const instance = await createDesktopWordmark(canvas.current, '/dehub-header-logo.png', { stage: .6, onError: () => setStatus('interrupted') });
      if (disposed) { instance.dispose(); return; }
      controller.current = instance;
      instance.setHovered(hovered.current || focused.current);
      setStatus('ready');
    }).catch(() => { if (!disposed) setStatus('unavailable'); });
    return () => { disposed = true; controller.current?.dispose(); controller.current = null; };
  }, []);
  const hold = () => controller.current?.setHovered(hovered.current || focused.current);
  const statusText = {
    loading: t('desktopWordmark.loading'),
    ready: t('desktopWordmark.ready'),
    interrupted: t('desktopWordmark.interrupted'),
    unavailable: t('desktopWordmark.unavailable'),
  }[status];
  return <main style={{ minHeight: '100dvh', background: '#070a0e', color: '#e8edf4', padding: '40px 20px', fontFamily: 'system-ui' }}>
    <Helmet><title>{t('desktopWordmark.pageTitle')}</title><meta name="robots" content="noindex,nofollow" /></Helmet>
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <h1 style={{ fontSize: 24, marginBottom: 20 }}>{t('desktopWordmark.heading')}</h1>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
        {[0,1,2,3,4,5].map(value => <button key={value} type="button" aria-pressed={day === value}
          style={{ padding: '10px 16px', borderRadius: 8, background: day === value ? '#edf2f9' : '#202833', color: day === value ? '#080c12' : '#edf2f9' }}
          onClick={() => { setDay(value); controller.current?.setStage(value/5); controller.current?.replay(); }}>{t('desktopWordmark.day', { day: value })}</button>)}
        <button type="button" style={{ padding: '10px 16px' }} onClick={() => controller.current?.replay()}>{t('desktopWordmark.replay')}</button>
        <button type="button" aria-pressed={actualSize} style={{ padding: '10px 16px' }} onClick={() => setActualSize(value => !value)}>{actualSize ? t('desktopWordmark.enlarge') : t('desktopWordmark.actualSize')}</button>
      </div>
      <div style={{ minHeight: 280, display: 'grid', placeItems: 'center', background: 'radial-gradient(ellipse at center,#17212c,#020304)', borderRadius: 16 }}>
        <button type="button" aria-label={t('desktopWordmark.reassemble')} style={{ width: actualSize ? 175 : '100%', padding: 0, border: 0, background: 'transparent' }}
          onPointerEnter={() => { hovered.current = true; hold(); }} onPointerLeave={() => { hovered.current = false; hold(); }}
          onFocus={() => { focused.current = true; hold(); }} onBlur={() => { focused.current = false; hold(); }}>
          <canvas ref={canvas} style={{ display: 'block', width: '100%', aspectRatio: '350 / 177.2' }} />
        </button>
      </div>
      <p aria-live="polite" style={{ marginTop: 16 }}>{statusText} · {t('desktopWordmark.day', { day })} · {t('desktopWordmark.hint')}</p>
    </div>
  </main>;
}
