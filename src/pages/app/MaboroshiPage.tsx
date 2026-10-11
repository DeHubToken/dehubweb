import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { SEOHead } from '@/components/SEOHead';
import { getAuthToken } from '@/lib/api/dehub/core';
import { payForJob, forgetPayment } from '@/lib/ai-payment';
import { getWalletAddress } from '@/lib/contracts/aa-utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { completeMaboroshiPayment, getMaboroshiQuote, isMaboroshiPaymentRequest, maboroshiStageLabel, type MaboroshiQuote } from '@/lib/maboroshi-payment';

const ORIGIN = 'https://live.dehub.io';
const STUDIO = `${ORIGIN}/maboroshi/`;

export default function MaboroshiPage() {
  const { t } = useTranslation();
  const { isAuthenticated, walletAddress, openLoginModal } = useAuth();
  const frame = useRef<HTMLIFrameElement>(null);
  const [connected, setConnected] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [quote, setQuote] = useState<MaboroshiQuote | null>(null);
  const [paying, setPaying] = useState(false);
  const pending = useRef<string | null>(null);
  const paymentInFlight = useRef(false);
  const activeWallet = useRef('');
  activeWallet.current = isAuthenticated ? (walletAddress || '').toLowerCase() : '';
  const reply = useCallback((requestId: string, error?: string) => {
    frame.current?.contentWindow?.postMessage({ type: 'maboroshi:payment-result', requestId, error }, ORIGIN);
  }, []);
  const session = useCallback(() => {
    frame.current?.contentWindow?.postMessage({ type: 'maboroshi:session',
      token: isAuthenticated ? getAuthToken() || '' : '', wallet: walletAddress || '',
      paymentBridge: 1, allowPayments: true,
    }, ORIGIN);
  }, [isAuthenticated, walletAddress]);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.origin !== ORIGIN || event.source !== frame.current?.contentWindow) return;
      if (event.data?.type === 'maboroshi:ready') { setConnected(true); session(); return; }
      if (!isMaboroshiPaymentRequest(event.data) || pending.current) return;
      const input = event.data;
      pending.current = input.requestId;
      void getMaboroshiQuote(input, getAuthToken() || '', activeWallet.current).then(value => {
        if (activeWallet.current !== value.wallet) throw new Error('The signed-in account changed.');
        setQuote(value);
      }).catch(error => { reply(input.requestId, error.message); if (pending.current === input.requestId) pending.current = null; });
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [session, reply]);
  useEffect(() => { session(); }, [session]);
  useEffect(() => { setQuote(null); pending.current = null; }, [walletAddress]);
  const confirm = async () => {
    if (!quote || paymentInFlight.current) return;
    paymentInFlight.current = true;
    setPaying(true);
    try {
      await completeMaboroshiPayment(quote, getAuthToken() || '', () => activeWallet.current, async amount => {
        if ((await getWalletAddress()).toLowerCase() !== quote.wallet) throw new Error('Connect the wallet that owns this project.');
        return payForJob(amount);
      }, forgetPayment);
      reply(quote.requestId);
    } catch (error) { reply(quote.requestId, error instanceof Error ? error.message : 'Payment could not be confirmed.'); }
    finally { if (pending.current === quote.requestId) pending.current = null; paymentInFlight.current = false; setQuote(null); setPaying(false); }
  };

  return (
    <main data-glass-page className="relative z-[1] flex min-h-[100dvh] flex-col bg-[#090a0b] text-white">
      <SEOHead title="Maboroshi | DeHub Creator" description={t('creator.toolMaboroshiDesc')} url="https://dehub.io/creator/maboroshi" />
      <header className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <Link to="/creator" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium"><ArrowLeft className="h-4 w-4" />{t('creator.srHeading')}</Link>
        <div className="flex items-center gap-3">
          <button type="button" disabled={!!quote || paying} onClick={() => { setConnected(false); setAttempt(value => value + 1); }} aria-label={t('common.refresh', 'Refresh')} className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-white/10"><RefreshCw className="h-4 w-4" /></button>
          {!isAuthenticated && <button type="button" onClick={() => openLoginModal()} className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black">{t('creator.login', 'Login')}</button>}
        </div>
      </header>
      {!connected && <p role="status" className="px-4 py-3 text-sm text-white/60">{t('common.loading', 'Loading…')} Maboroshi</p>}
      <iframe key={`${walletAddress || 'guest'}:${attempt}`} ref={frame} src={STUDIO} title="Maboroshi"
        className="w-full flex-1 border-0" style={{ minHeight: 'calc(100dvh - 65px)' }}
        allow="fullscreen" sandbox="allow-scripts allow-same-origin allow-forms allow-downloads" referrerPolicy="no-referrer" />
      <Dialog open={!!quote} onOpenChange={open => {
        if (!open && quote && !paying) { reply(quote.requestId, 'Payment cancelled.'); pending.current = null; setQuote(null); }
      }}>
        <DialogContent onInteractOutside={event => { if (paying) event.preventDefault(); }}>
          <DialogHeader><DialogTitle>{t('creator.toolMaboroshi')}</DialogTitle>
            <DialogDescription>{quote && maboroshiStageLabel(quote.stage)} · {quote && (quote.price_micros / 1000).toLocaleString()} DHB · {quote && new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(quote.price_micros / 1e6)}</DialogDescription>
          </DialogHeader>
          <Button disabled={paying} onClick={() => void confirm()}>{paying ? t('common.loading', 'Loading…') : t('common.confirm', 'Confirm')}</Button>
          <Button variant="outline" disabled={paying} onClick={() => { if (quote) reply(quote.requestId, 'Payment cancelled.'); pending.current = null; setQuote(null); }}>{t('common.cancel')}</Button>
        </DialogContent>
      </Dialog>
    </main>
  );
}
