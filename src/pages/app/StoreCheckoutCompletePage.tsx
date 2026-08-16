/**
 * Store Checkout Complete
 * =======================
 * Where Stripe returns the buyer after a card payment.
 *
 * This page does not settle anything. The order is written by the webhook, and
 * the buyer's browser coming back is not evidence a payment captured — they
 * could have hit back, or the tab could have been restored an hour later. So it
 * polls our own record and reports what the webhook has done.
 *
 * The webhook usually lands before the redirect, but not always, so "still
 * processing" is a normal state rather than an error. It never says "failed"
 * while it is merely waiting: telling someone their payment failed when it is
 * about to succeed is how support tickets and duplicate purchases happen.
 */

import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Loader2, Package, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SEOHead } from '@/components/SEOHead';
import { useCardCheckout } from '@/hooks/use-product-checkout';

const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 30;

type View = 'waiting' | 'paid' | 'oversold' | 'expired' | 'unknown';

export default function StoreCheckoutCompletePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const sessionId = params.get('session_id');
  const { checkStatus } = useCardCheckout(null);

  const [view, setView] = useState<View>('waiting');
  const [amountUsd, setAmountUsd] = useState<number | null>(null);
  const pollsRef = useRef(0);

  useEffect(() => {
    if (!sessionId) { setView('unknown'); return; }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      if (cancelled) return;
      try {
        const res = await checkStatus.mutateAsync(sessionId);
        if (cancelled) return;
        setAmountUsd(res.amountUsd);

        if (res.status === 'settled') {
          setView(res.warning?.includes('oversold') ? 'oversold' : 'paid');
          return;
        }
        if (res.status === 'expired' || res.status === 'failed') {
          setView('expired');
          return;
        }
      } catch {
        // A transient failure is not a verdict. Keep polling; the counter below
        // is what eventually stops this.
      }
      pollsRef.current += 1;
      if (pollsRef.current >= MAX_POLLS) { setView('unknown'); return; }
      timer = setTimeout(poll, POLL_INTERVAL_MS);
    };

    poll();
    return () => { cancelled = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <SEOHead title="Order | DeHub" description="Your DeHub store order." />
      <div className="w-full max-w-sm text-center space-y-4">
        {view === 'waiting' && (
          <>
            <Loader2 className="w-8 h-8 mx-auto animate-spin text-zinc-400" />
            <h1 className="text-white text-lg font-semibold">Confirming your payment…</h1>
            <p className="text-zinc-500 text-sm">
              This usually takes a few seconds. You can leave this page — your order is
              recorded either way.
            </p>
          </>
        )}

        {view === 'paid' && (
          <>
            <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-400" />
            <h1 className="text-white text-lg font-semibold">Order confirmed</h1>
            <p className="text-zinc-400 text-sm">
              {amountUsd != null && `$${amountUsd.toFixed(2)} paid. `}
              The seller has been notified and will ship to the address you gave.
            </p>
            <div className="grid grid-cols-2 gap-2 pt-2">
              <Button variant="glass" className="rounded-xl" onClick={() => navigate('/app/stores')}>
                Keep shopping
              </Button>
              <Button className="rounded-xl" onClick={() => navigate('/app/stores?tab=my-store')}>
                <Package className="w-4 h-4 mr-2" /> My orders
              </Button>
            </div>
          </>
        )}

        {view === 'oversold' && (
          <>
            <AlertTriangle className="w-10 h-10 mx-auto text-amber-400" />
            <h1 className="text-white text-lg font-semibold">Sold out before payment landed</h1>
            <p className="text-zinc-400 text-sm">
              Someone bought the last one while you were paying. A full refund has been
              issued automatically — it takes a few days to appear on your statement.
            </p>
            <Button variant="glass" className="rounded-xl w-full" onClick={() => navigate('/app/stores')}>
              Back to stores
            </Button>
          </>
        )}

        {view === 'expired' && (
          <>
            <AlertTriangle className="w-10 h-10 mx-auto text-zinc-500" />
            <h1 className="text-white text-lg font-semibold">Checkout didn't complete</h1>
            <p className="text-zinc-400 text-sm">
              Nothing has been charged. The item has been put back on sale.
            </p>
            <Button variant="glass" className="rounded-xl w-full" onClick={() => navigate('/app/stores')}>
              Back to stores
            </Button>
          </>
        )}

        {view === 'unknown' && (
          <>
            <AlertTriangle className="w-10 h-10 mx-auto text-zinc-500" />
            <h1 className="text-white text-lg font-semibold">Still processing</h1>
            <p className="text-zinc-400 text-sm">
              We haven't had confirmation from the payment provider yet. If you were
              charged, the order will appear under My orders shortly — you have not been
              charged twice.
            </p>
            <Button variant="glass" className="rounded-xl w-full" onClick={() => navigate('/app/stores?tab=my-store')}>
              My orders
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
