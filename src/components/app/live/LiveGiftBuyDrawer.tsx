import { useCallback, useEffect, useState } from 'react';
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from '@stripe/react-stripe-js';
import { CreditCard, Loader2, Wallet } from 'lucide-react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NearIntentBuy } from '@/components/app/NearIntentBuy';
import { createCheckoutSession, getDPaySessionStatus } from '@/lib/api/dpay';
import { getStripe } from '@/lib/stripe';
import { useAuth } from '@/contexts/AuthContext';
import { useQueryClient } from '@tanstack/react-query';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  neededDhb: number;
  onFunded: () => void;
};

export function LiveGiftBuyDrawer({ open, onOpenChange, neededDhb, onFunded }: Props) {
  const { walletAddress } = useAuth();
  const queryClient = useQueryClient();
  const [method, setMethod] = useState<'card' | 'crypto'>('card');
  const [amountUsd, setAmountUsd] = useState(() => String(Math.max(0.5, Math.ceil(neededDhb / 900 * 100) / 100)));
  const [cryptoAmount, setCryptoAmount] = useState(() => String(Math.max(1, Math.ceil(neededDhb))));
  const [clientSecret, setClientSecret] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [paymentComplete, setPaymentComplete] = useState(false);

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
    if (!walletAddress || !Number.isFinite(Number(amountUsd)) || Number(amountUsd) < 0.5) return;
    setBusy(true);
    setError('');
    try {
      const result = await createCheckoutSession({
        amount: Number(amountUsd),
        tokenSymbol: 'DHB',
        walletAddress,
        chainId: 8453,
        tokensToReceive: Math.floor(Number(amountUsd) * 1000),
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
          <p className="text-sm text-zinc-400">Buy DHB here, then return to your gift. Your amount and message will stay ready.</p>
          {!clientSecret && (
            <div className="grid grid-cols-2 gap-2">
              <Button variant="glass" className="w-full" onClick={() => setMethod('card')} aria-pressed={method === 'card'}><CreditCard className="w-4 h-4 mr-2" />Card</Button>
              <Button variant="glass" className="w-full" onClick={() => setMethod('crypto')} aria-pressed={method === 'crypto'}><Wallet className="w-4 h-4 mr-2" />Crypto</Button>
            </div>
          )}
          {method === 'crypto' && !clientSecret ? (
            <div className="space-y-3">
              <label className="text-sm text-zinc-400 block">DHB to buy</label>
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
              <p className="text-xs text-zinc-400 text-center">{paymentComplete ? 'Payment complete. Waiting for DHB to reach your wallet…' : 'Complete payment here. Your gift stays open behind this drawer.'}</p>
            </div>
          ) : (
            <div className="space-y-3">
              <label className="text-sm text-zinc-400 block">Amount (USD)</label>
              <Input type="number" min="0.5" step="0.01" value={amountUsd} onChange={(e) => setAmountUsd(e.target.value)} className="bg-zinc-800 border-zinc-700 text-white" />
              <Button className="w-full" onClick={buyWithCard} disabled={busy || Number(amountUsd) < 0.5}>
                {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Buy DHB with card
              </Button>
            </div>
          )}
          {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
          <Button variant="glass" className="w-full" onClick={() => onOpenChange(false)}>Back to gift</Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
