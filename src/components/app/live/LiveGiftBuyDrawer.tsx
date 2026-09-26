import { useCallback, useEffect, useState } from 'react';
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from '@stripe/react-stripe-js';
import { CreditCard, Loader2, Wallet } from 'lucide-react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NearIntentBuy } from '@/components/app/NearIntentBuy';
import { createCheckoutSession, getDPayPrice, getDPaySessionStatus } from '@/lib/api/dpay';
import { getStripe } from '@/lib/stripe';
import { useAuth } from '@/contexts/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  neededDhb: number;
  onFunded: () => void;
  returnTo?: string;
};

export function LiveGiftBuyDrawer({ open, onOpenChange, neededDhb, onFunded, returnTo = 'gift' }: Props) {
  const { walletAddress } = useAuth();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const [method, setMethod] = useState<'card' | 'crypto'>('card');
  const [amountUsd, setAmountUsd] = useState('10');
  const [tokenPrice, setTokenPrice] = useState(0);
  const [cryptoAmount, setCryptoAmount] = useState(() => String(Math.max(1, Math.ceil(neededDhb))));
  const [clientSecret, setClientSecret] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [paymentComplete, setPaymentComplete] = useState(false);
  const estimatedDhb = tokenPrice > 0 ? (Number(amountUsd) / tokenPrice) * 0.9 : 0;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getDPayPrice().then(({ price }) => {
      if (!cancelled) setTokenPrice(price);
    }).catch(() => {
      if (!cancelled) setError(t('liveGift.buy.priceFailed'));
    });
    return () => { cancelled = true; };
  }, [open, t]);

  const delivered = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['wallet-tokens'] });
    setClientSecret('');
    setSessionId('');
    onFunded();
  }, [onFunded, queryClient]);

  useEffect(() => {
    if (!open || !sessionId) return;
    let cancelled = false;
    const check = async () => {
      try {
        const status = await getDPaySessionStatus(sessionId);
        if (cancelled) return;
        if (['sent', 'completed', 'success'].includes((status.tokenSendStatus || '').toLowerCase())) {
          delivered();
        } else if (['failed', 'cancelled', 'canceled', 'expired'].includes((status.status_stripe || '').toLowerCase())) {
          setError('Payment did not complete. Try again.');
          setClientSecret('');
          setSessionId('');
        }
      } catch { /* A delayed status response does not mean payment failed. */ }
    };
    void check();
    const timer = setInterval(check, 2500);
    return () => { cancelled = true; clearInterval(timer); };
  }, [open, sessionId, delivered]);

  const buyWithCard = async () => {
    if (!walletAddress || !Number.isFinite(Number(amountUsd)) || Number(amountUsd) < 0.5 || !Number.isFinite(estimatedDhb) || estimatedDhb <= 0) return;
    setBusy(true);
    setError('');
    try {
      const result = await createCheckoutSession({
        amount: Number(amountUsd),
        tokenSymbol: 'DHB',
        walletAddress,
        chainId: 8453,
        tokensToReceive: estimatedDhb,
        embedded: true,
        redirect: `${window.location.origin}${window.location.pathname}?gift_payment=return&session_id={CHECKOUT_SESSION_ID}`,
      });
      if (!result.clientSecret || !result.sessionId) throw new Error('Card checkout is unavailable.');
      setSessionId(result.sessionId);
      setClientSecret(result.clientSecret);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not start checkout.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent column glass className="px-4 pb-8 max-h-[90dvh]">
        <DrawerHeader className="border-b border-white/10 mb-4">
          <DrawerTitle className="text-white">Buy tokens</DrawerTitle>
        </DrawerHeader>
        <div className="overflow-y-auto space-y-4 pb-3">
          <p className="text-sm text-zinc-400">{t('liveGift.buy.intro', { returnTo })}</p>
          {!clientSecret && (
            <div className="grid grid-cols-2 gap-2">
              <Button variant="glass" className="w-full" onClick={() => setMethod('card')} aria-pressed={method === 'card'}><CreditCard className="w-4 h-4 mr-2" />Card</Button>
              <Button variant="glass" className="w-full" onClick={() => setMethod('crypto')} aria-pressed={method === 'crypto'}><Wallet className="w-4 h-4 mr-2" />Crypto</Button>
            </div>
          )}
          {method === 'crypto' && !clientSecret ? (
            <div className="space-y-3">
              <label className="text-sm text-zinc-400 block">{t('liveGift.buy.amountToBuy')}</label>
              <Input type="number" min="1" step="1" value={cryptoAmount} onChange={(e) => setCryptoAmount(e.target.value)} className="bg-zinc-800 border-zinc-700 text-white" />
              <NearIntentBuy tokensToReceive={Math.max(1, Math.floor(Number(cryptoAmount) || 0))} active onDelivered={delivered} />
            </div>
          ) : clientSecret ? (
            <div className="space-y-3">
              <div className="bg-white rounded-xl overflow-hidden min-h-[400px]">
                <EmbeddedCheckoutProvider stripe={getStripe()} options={{ clientSecret, onComplete: () => setPaymentComplete(true) }}>
                  <EmbeddedCheckout />
                </EmbeddedCheckoutProvider>
              </div>
              <p className="text-xs text-zinc-400 text-center">{paymentComplete ? t('liveGift.buy.waitingDelivery') : `Complete payment here. Your ${returnTo} stays open behind this drawer.`}</p>
            </div>
          ) : (
            <div className="space-y-3">
              <label className="text-sm text-zinc-400 block">Amount (USD)</label>
              <Input type="number" min="0.5" step="0.01" value={amountUsd} onChange={(e) => setAmountUsd(e.target.value)} className="bg-zinc-800 border-zinc-700 text-white" />
              {tokenPrice > 0 && <p className="text-xs text-zinc-400">{t('liveGift.buy.estimate', { amount: estimatedDhb.toLocaleString(undefined, { maximumFractionDigits: 2 }) })}</p>}
              <Button className="w-full" onClick={buyWithCard} disabled={busy || Number(amountUsd) < 0.5 || tokenPrice <= 0}>
                {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}{t('ppvTopUp.buyCard')}
              </Button>
            </div>
          )}
          {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
          <Button variant="glass" className="w-full" onClick={() => onOpenChange(false)}>Back to {returnTo}</Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
