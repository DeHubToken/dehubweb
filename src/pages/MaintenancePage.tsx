import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Helmet } from 'react-helmet-async';
import { Button } from '@/components/ui/button';
import { useMaintenanceStatus } from '@/hooks/use-maintenance-status';
import { ThemePreviewProvider } from '@/contexts/ThemeContext';
import './maintenance.css';

type Props = { checking?: boolean; failed?: boolean; onRetry?: () => void };

export function MaintenanceScreen({ checking = false, failed = false, onRetry }: Props) {
  const { t } = useTranslation();
  const backdrop = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let cancelled = false;
    let detach = () => {};
    const motionModule = '/brand-kit/maintenance-motion.js';
    void import(/* @vite-ignore */ motionModule).then(module => {
      if (!cancelled) detach = module.attachMaintenanceMotion(backdrop.current);
    }).catch(() => { /* The static background remains available if the module cannot load. */ });
    return () => { cancelled = true; detach(); };
  }, []);
  return <ThemePreviewProvider initialTheme="system"><div className="maintenance-page" data-maintenance-screen>
    <Helmet><title>{t('maintenance.title')} | DeHub</title><meta name="robots" content="noindex, nofollow" /><link rel="stylesheet" href="/brand-kit/maintenance-motion.css" /></Helmet>
    <div ref={backdrop} className="maintenance-waves" aria-hidden="true"><div className="maintenance-wave-track"><div className="maintenance-wave-surface" /></div></div>
    <div className="maintenance-frame">
      <header className="maintenance-header">
        <img src="/brand-kit/brand/mark-white.png" alt="DeHub" width="40" height="40" />
        <span>{t('maintenance.mode')}</span>
      </header>
      <main className="maintenance-main">
        <div className="maintenance-copy">
          <p className="maintenance-eyebrow">{t('maintenance.intermission')}</p>
          <h1>{t('maintenance.title')}</h1>
          <p className="maintenance-description">{t('maintenance.description')}</p>
          <div className="maintenance-actions">
            <Button size="lg" loading={checking} onClick={onRetry}>{t('maintenance.retry')}</Button>
          </div>
          <p className="maintenance-feedback" role="status">{failed ? t('maintenance.checkFailed') : ''}</p>
        </div>
        <img className="maintenance-clock" src="/brand-kit/icons/clock.png" alt="" aria-hidden="true" width="480" height="504" />
      </main>
      <footer className="maintenance-bottomline"><span>{t('maintenance.ownership')}</span><span>dehub.io</span></footer>
    </div>
  </div></ThemePreviewProvider>;
}

/** Public preview uses the same screen and retry path without enabling an outage. */
export default function MaintenancePage() {
  const { checking, failed, check } = useMaintenanceStatus();
  return <MaintenanceScreen checking={checking} failed={failed} onRetry={() => {
    void check().then(status => { if (status && !status.enabled) window.location.assign('/'); });
  }} />;
}
