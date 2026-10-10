import { useTranslation as _useCopy } from 'react-i18next';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { SEOHead } from '@/components/SEOHead';
import { getAuthToken } from '@/lib/api/dehub/core';

const ORIGIN = 'https://live.dehub.io';
const STUDIO = `${ORIGIN}/maboroshi/`;

export default function MaboroshiPage() {
  const { t: _copy } = _useCopy();
  const { t } = useTranslation();
  const { isAuthenticated, walletAddress, openLoginModal } = useAuth();
  const frame = useRef<HTMLIFrameElement>(null);
  const [connected, setConnected] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const session = useCallback(() => {
    frame.current?.contentWindow?.postMessage({ type: 'maboroshi:session',
      token: isAuthenticated ? getAuthToken() || '' : '', wallet: walletAddress || '',
    }, ORIGIN);
  }, [isAuthenticated, walletAddress]);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.origin !== ORIGIN || event.source !== frame.current?.contentWindow || event.data?.type !== 'maboroshi:ready') return;
      setConnected(true);
      session();
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [session]);
  useEffect(() => { session(); }, [session]);

  return (
    <main data-glass-page className="relative z-[1] flex min-h-[100dvh] flex-col bg-[#090a0b] text-white">
      <SEOHead title={_copy("copy.ce42a8ab1ca9", { defaultValue: "Maboroshi | DeHub Creator" })} description={t('creator.toolMaboroshiDesc')} url="https://dehub.io/creator/maboroshi" />
      <header className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <Link to="/creator" className="inline-flex items-center gap-2 text-sm font-medium"><ArrowLeft className="h-4 w-4" />{t('creator.srHeading')}</Link>
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => { setConnected(false); setAttempt(value => value + 1); }} aria-label={t('common.refresh', 'Refresh')} className="rounded-lg p-2 hover:bg-white/10"><RefreshCw className="h-4 w-4" /></button>
          {!isAuthenticated && <button type="button" onClick={() => openLoginModal()} className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black">{t('creator.login', 'Login')}</button>}
        </div>
      </header>
      {!connected && <p role="status" className="px-4 py-3 text-sm text-white/60">{t('common.loading', 'Loading…')}{_copy("copy.8f3a26244094", { defaultValue: " Maboroshi" })}</p>}
      <iframe key={`${walletAddress || 'guest'}:${attempt}`} ref={frame} src={STUDIO} title={_copy("copy.c6d99d44a9f8", { defaultValue: "Maboroshi" })}
        className="w-full flex-1 border-0" style={{ minHeight: 'calc(100dvh - 65px)' }}
        allow="fullscreen" sandbox="allow-scripts allow-same-origin allow-forms allow-downloads" referrerPolicy="no-referrer" />
    </main>
  );
}
