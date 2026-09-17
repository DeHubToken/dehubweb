import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, Copy, Loader2, Search } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { chainLabel, refundAddressFor } from '@/lib/near-intents-tokens';
import {
  createCryptoIntent,
  getCryptoIntentStatus,
  getCryptoPayableAssets,
  getCryptoQuote,
  type CryptoIntent,
  type CryptoQuote,
} from '@/lib/api/dpay';

export function NearIntentBuy({ tokensToReceive }: { tokensToReceive: number }) {
  const { walletAddress, user } = useAuth();
  const [search, setSearch] = useState('');
  const [assetId, setAssetId] = useState('');
  const [manualRefund, setManualRefund] = useState('');
  const [quote, setQuote] = useState<CryptoQuote | null>(null);
  const [intent, setIntent] = useState<CryptoIntent | null>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { data: assets = [], isLoading, error: assetsError } = useQuery({
    queryKey: ['dpay', 'crypto', 'assets'],
    queryFn: getCryptoPayableAssets,
    staleTime: 10 * 60_000,
  });
  const selected = assets.find(asset => asset.assetId === assetId);
  const options = useMemo(() => assets.filter(asset =>
    !/deprecated/i.test(asset.symbol) &&
    `${asset.symbol} ${chainLabel(asset.blockchain)} ${asset.assetId}`.toLowerCase().includes(search.toLowerCase()),
  ), [assets, search]);
  const automaticRefund = selected
    ? refundAddressFor(selected.blockchain, walletAddress, user?.solanaAddress ?? null)
    : null;
  const refundTo = automaticRefund || manualRefund.trim();
  const dhbAmount = Math.floor(tokensToReceive);

  useEffect(() => { setQuote(null); setError(''); }, [assetId, dhbAmount, manualRefund]);
  useEffect(() => {
    if (!intent?.id || ['sent', 'completed', 'success', 'REFUNDED', 'FAILED', 'EXPIRED'].includes(status)) return;
    let active = true;
    const check = async () => {
      try {
        const result = await getCryptoIntentStatus(intent.id);
        if (active) setStatus(result.tokenSendStatus === 'sent' ? 'sent' : result.settlement);
      } catch { /* Keep the payment address visible while status is unavailable. */ }
    };
    void check();
    const timer = setInterval(check, 5000);
    return () => { active = false; clearInterval(timer); };
  }, [intent?.id, status]);

  const price = async () => {
    if (!selected || dhbAmount <= 0) return;
    setBusy(true); setError('');
    try {
      setQuote(await getCryptoQuote({ originAsset: selected.assetId, tokensToReceive: dhbAmount, refundTo: refundTo || undefined }));
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not price this purchase.'); }
    finally { setBusy(false); }
  };
  const openIntent = async () => {
    if (!selected || !walletAddress || !quote || !refundTo) return;
    setBusy(true); setError('');
    try {
      const opened = await createCryptoIntent({
        originAsset: selected.assetId, tokensToReceive: dhbAmount,
        receiverAddress: walletAddress, refundTo, termsAndServicesAccepted: true,
      });
      setIntent(opened); setStatus('PENDING_DEPOSIT');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not open this purchase.'); }
    finally { setBusy(false); }
  };
  const copy = async (value: string) => { await navigator.clipboard.writeText(value); };

  return (
    <div data-page-bento className="bg-zinc-900 rounded-2xl p-4 space-y-3">
      <div>
        <h2 className="text-white font-semibold">Pay with crypto</h2>
        <p className="text-xs text-zinc-400 mt-1">Choose any payment token offered by NEAR Intents. DHB arrives on Base.</p>
      </div>
      {!intent ? <>
        <div className="relative">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-3" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search token or chain" className="pl-9 bg-zinc-800 border-zinc-700 text-white" />
        </div>
        <div className="max-h-48 overflow-y-auto space-y-1">
          {options.map(asset => <button key={asset.assetId} onClick={() => { setAssetId(asset.assetId); setManualRefund(''); }} className={`w-full text-left px-3 py-2 rounded-lg text-sm ${asset.assetId === assetId ? 'bg-white/20 text-white' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}>
            <span className="font-semibold">{asset.symbol}</span> <span className="text-zinc-400">on {chainLabel(asset.blockchain)}</span>
          </button>)}
          {isLoading && <p className="text-sm text-zinc-400">Loading payment tokens…</p>}
          {assetsError && <p className="text-sm text-red-400">Payment tokens are temporarily unavailable.</p>}
          {!isLoading && !assetsError && !options.length && <p className="text-sm text-zinc-400">No matching tokens.</p>}
        </div>
        {selected && <>
          {!automaticRefund && <div className="space-y-1">
            <label className="text-xs text-zinc-300">Your {chainLabel(selected.blockchain)} refund address</label>
            <Input value={manualRefund} onChange={e => setManualRefund(e.target.value)} placeholder="Address on the payment chain" className="bg-zinc-800 border-zinc-700 text-white" />
            <p className="text-xs text-zinc-500">If the payment cannot settle, the token returns to this address.</p>
          </div>}
          {quote ? <div className="text-sm text-white rounded-lg border border-white/10 p-3 space-y-1">
            <p>Send {quote.amountInFormatted} {selected.symbol} on {chainLabel(selected.blockchain)}</p>
            <p className="text-zinc-400">Receive {dhbAmount.toLocaleString()} DHB · Estimated {Math.ceil(quote.timeEstimateSeconds / 60)} min</p>
          </div> : null}
          <Button variant="glass" className="w-full" disabled={busy || dhbAmount <= 0 || (!!quote && !refundTo)} onClick={quote ? openIntent : price}>
            {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}{quote ? 'Get payment address' : 'Get crypto quote'}
          </Button>
        </>}
      </> : <div className="space-y-3 text-sm">
        <p className="text-white">Send exactly <strong>{intent.amountInFormatted} {selected?.symbol}</strong> on {chainLabel(selected?.blockchain || '')}.</p>
        <div className="rounded-lg bg-zinc-800 p-3 break-all font-mono text-xs text-white">{intent.depositAddress}</div>
        <Button variant="glass" className="w-full" onClick={() => copy(intent.depositAddress)}><Copy className="w-4 h-4 mr-2" />Copy payment address</Button>
        {intent.depositMemo && <><p className="text-amber-300">Include this memo with your payment:</p><div className="rounded-lg bg-zinc-800 p-3 break-all font-mono text-white">{intent.depositMemo}</div><Button variant="glass" className="w-full" onClick={() => copy(intent.depositMemo!)}><Copy className="w-4 h-4 mr-2" />Copy memo</Button></>}
        <p className="text-zinc-400">{status === 'sent' ? <><Check className="inline w-4 h-4 text-emerald-400" /> DHB delivered</> : status === 'SUCCESS' ? 'Crypto settled. Delivering DHB…' : `Status: ${status.replaceAll('_', ' ').toLowerCase()}`}</p>
        <p className="text-zinc-500 text-xs">Payment address expires {new Date(intent.expiresAt * 1000).toLocaleString()}.</p>
        <Button variant="ghost" className="w-full text-white" onClick={() => { setIntent(null); setStatus(''); setQuote(null); }}>Start another purchase</Button>
      </div>}
      {error && <p role="alert" className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
