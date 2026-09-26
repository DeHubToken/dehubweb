import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { formatUnits, parseUnits } from 'ethers';
import { toast } from 'sonner';
import { ArrowLeft, CandlestickChart, Check, ChevronRight, Loader2, Sparkles } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useWalletLocked } from '@/hooks/use-wallet-locked';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer';
import { supabase } from '@/integrations/supabase/client';
import { withWalletHeader } from '@/lib/supabase-wallet-client';
import { BASE_CHAIN_ID, CHAIN_CONFIGS } from '@/lib/contracts/dhb-token';
import type { WalletToken } from '@/lib/wallet/tokens';
import { dexActionError } from '@/lib/dex/action-error';
import { formatPrice, formatSize } from '@/lib/dex/orderbook';
import { quoteSwap, runSwap, type SwapCall } from '@/lib/dex/evm-swap';
import { POOL_CHAIN_INFO } from '@/lib/dex/pools';
import { mintSellPosition, quoteSellPosition, type SellInput } from '@/lib/dex/sell';
import type { OrderStage } from '@/lib/dex/read-timeout';

const DHB = CHAIN_CONFIGS[BASE_CHAIN_ID].dhbToken;
const USDC = POOL_CHAIN_INFO.base.usdc;
/** Same key and shape the exchange page resumes from, so a listing that mints but fails to
 *  register is picked up there instead of being lost. */
const pendingKey = (wallet: string) => `dex-pending:${wallet.toLowerCase()}`;

type Step = 'choose' | 'amount' | 'price' | 'review' | 'done';
type Route = 'instant' | 'list';

const decimal = (value: string) => value.replace(',', '.').replace(/[^\d.]/g, '');
const toUnits = (value: string) => {
  const [whole = '0', fraction = ''] = value.split('.');
  try { return parseUnits(`${whole || '0'}.${fraction.slice(0, 18) || '0'}`, 18); } catch { return null; }
};

/** Wallet "Trade": pick Easy trade or the full Exchange. Easy trade sells DHB on Base in three
 *  steps. A market or at/below-market price sells instantly; a price above market is listed as a
 *  single-sided position on the exchange's own book. */
export function TradeSheet({ open, onOpenChange, tokens }: { open: boolean; onOpenChange: (open: boolean) => void; tokens: WalletToken[] }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const { walletAddress, connect, requestWalletUnlock } = useAuth();
  const walletLocked = useWalletLocked();

  const [step, setStep] = useState<Step>('choose');
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState<'market' | 'custom'>('market');
  const [price, setPrice] = useState('');
  const [quote, setQuote] = useState<SwapCall | null>(null);
  const [quotedAt, setQuotedAt] = useState(0);
  const [route, setRoute] = useState<Route>('instant');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ route: Route; amount: string; usdc: number; price: number } | null>(null);

  useEffect(() => {
    if (open) return;
    const timer = setTimeout(() => {
      setStep('choose'); setAmount(''); setMode('market'); setPrice(''); setQuote(null);
      setNotice(''); setError(''); setStage(''); setResult(null);
    }, 250);
    return () => clearTimeout(timer);
  }, [open]);

  const dhb = tokens.find((tk) => tk.chainId === BASE_CHAIN_ID && tk.address.toLowerCase() === DHB.toLowerCase());
  const balance = dhb?.balance ?? 0n;
  const amountUnits = amount ? toUnits(amount) : null;
  const amountOk = amountUnits != null && amountUnits > 0n && amountUnits <= balance;
  const marketRate = quote && Number(amount) > 0 ? Number(formatUnits(quote.amountOut, 6)) / Number(amount) : null;
  const myPrice = Number(price);

  async function requireWallet() {
    if (!walletAddress) { await connect(); return false; }
    if (walletLocked) { requestWalletUnlock(); return false; }
    return true;
  }
  async function fetchQuote() {
    const next = await quoteSwap({ chainId: BASE_CHAIN_ID, tokenIn: DHB, tokenOut: USDC, amountIn: amountUnits!, recipient: walletAddress! });
    setQuote(next); setQuotedAt(Date.now());
    return next;
  }

  async function toPrice() {
    if (!amountOk || !(await requireWallet())) return;
    setBusy(true); setError('');
    try { await fetchQuote(); setStep('price'); }
    catch (e) { setError(dexActionError(e, t('easyTrade.quoteFailed'))); }
    finally { setBusy(false); }
  }

  function toReview() {
    setError(''); setNotice('');
    if (mode === 'custom' && !(myPrice > 0)) { setError(t('easyTrade.enterPrice')); return; }
    // Only a price above what the market pays right now needs to wait on the book.
    setRoute(mode === 'custom' && marketRate != null && myPrice > marketRate ? 'list' : 'instant');
    setStep('review');
  }

  async function confirm() {
    if (!(await requireWallet()) || !walletAddress || !amountUnits) return;
    setBusy(true); setError('');
    try {
      if (route === 'list') {
        const input: SellInput = {
          walletAddress, chainId: BASE_CHAIN_ID, side: 'sell', amount: formatUnits(amountUnits, 18),
          minPrice: myPrice.toFixed(8), maxPrice: (myPrice * 1.001).toFixed(8),
        };
        try {
          await quoteSellPosition(input);
        } catch (e) {
          // The book's own pool already trades above this price, so it would fill at once:
          // selling instantly gets at least as much without a position to withdraw later.
          if (!/overlaps the pool price/i.test((e as Error).message ?? '')) throw e;
          setRoute('instant'); setNotice(t('easyTrade.marketMoved'));
          await sellInstantly(); return;
        }
        const minted = await mintSellPosition(input, (s: OrderStage) => setStage(t(`dex.stage.${s}`)), (txHash) => {
          try { localStorage.setItem(pendingKey(walletAddress), JSON.stringify({ input, txHash })); } catch { /* the exchange page can still find it onchain */ }
        });
        setStage(t('dex.stage.index'));
        const { error: saveError } = await withWalletHeader(supabase.from('dex_sell_positions').upsert({
          chain_id: BASE_CHAIN_ID, token_id: minted.tokenId, owner_address: walletAddress, mint_tx_hash: minted.txHash,
          side: 'sell', dhb_amount: Number(input.amount), usdc_amount: null,
          min_usdc_per_dhb: Number(input.minPrice), max_usdc_per_dhb: Number(input.maxPrice),
        }, { onConflict: 'chain_id,token_id', ignoreDuplicates: true }), walletAddress);
        if (saveError) throw new Error(t('dex.registrationFailed'));
        try { localStorage.removeItem(pendingKey(walletAddress)); } catch { /* nothing left to resume */ }
        finish('list', Number(input.amount) * myPrice);
        return;
      }
      await sellInstantly();
    } catch (e) {
      setError(dexActionError(e, t('dex.prepareFailed')));
    } finally { setBusy(false); setStage(''); }
  }

  async function sellInstantly() {
    // A quote older than half a minute is re-read so the minimum out reflects the market now.
    const live = quote && Date.now() - quotedAt < 30_000 ? quote : await fetchQuote();
    setStage(t('dex.stage.swap'));
    await runSwap(live, walletAddress!);
    finish('instant', Number(formatUnits(live.amountOut, 6)));
  }

  function finish(done: Route, usdc: number) {
    setResult({ route: done, amount, usdc, price: myPrice });
    setStep('done');
    toast.success(done === 'list'
      ? t('easyTrade.doneList', { amount: formatSize(Number(amount)), price: formatPrice(myPrice) })
      : t('easyTrade.doneInstant', { amount: formatSize(Number(amount)) }));
    void queryClient.invalidateQueries({ queryKey: ['wallet-tokens'] });
  }

  function openExchange() { onOpenChange(false); navigate('/dex'); }
  const back = () => { setError(''); setNotice(''); setStep(step === 'review' ? 'price' : step === 'price' ? 'amount' : 'choose'); };

  const title = step === 'choose' ? t('easyTrade.chooseTitle') : step === 'amount' ? t('easyTrade.sellTitle')
    : step === 'price' ? t('easyTrade.priceTitle') : step === 'review' ? t('easyTrade.reviewTitle') : t('easyTrade.doneTitle');
  const stepIndex = { amount: 1, price: 2, review: 3 }[step as 'amount' | 'price' | 'review'];

  const optionRow = 'w-full flex items-center gap-3 p-4 rounded-xl bg-white/[0.06] hover:bg-white/[0.10] backdrop-blur-sm border border-white/10 transition-colors text-left';
  const primary = 'w-full h-12 rounded-xl bg-white text-black font-semibold disabled:opacity-40 flex items-center justify-center gap-2';

  const body: ReactNode = <div className="px-4 pb-6 pt-1 space-y-4">
    <div className="flex items-center gap-2 min-h-8">
      {step !== 'choose' && step !== 'done' && <button type="button" onClick={back} disabled={busy} aria-label={t('easyTrade.back')} className="p-1.5 -ml-1.5 rounded-lg hover:bg-white/10 text-zinc-300"><ArrowLeft className="w-5 h-5" /></button>}
      <span className="text-lg font-semibold text-white flex-1">{title}</span>
      {stepIndex && <span className="text-xs text-zinc-500">{t('easyTrade.stepOf', { step: stepIndex, total: 3 })}</span>}
    </div>

    {step === 'choose' && <div className="space-y-2">
      <button type="button" className={optionRow} onClick={() => setStep('amount')}>
        <Sparkles className="w-6 h-6 text-white shrink-0" />
        <div className="flex-1 min-w-0"><p className="text-sm font-semibold text-white">{t('easyTrade.easyTitle')}</p><p className="text-xs text-zinc-400">{t('easyTrade.easyHint')}</p></div>
        <ChevronRight className="w-4 h-4 text-zinc-500" />
      </button>
      <button type="button" className={optionRow} onClick={openExchange}>
        <CandlestickChart className="w-6 h-6 text-white shrink-0" />
        <div className="flex-1 min-w-0"><p className="text-sm font-semibold text-white">{t('easyTrade.exchangeTitle')}</p><p className="text-xs text-zinc-400">{t('easyTrade.exchangeHint')}</p></div>
        <ChevronRight className="w-4 h-4 text-zinc-500" />
      </button>
    </div>}

    {step === 'amount' && <div className="space-y-3">
      <div className="flex items-center rounded-xl border border-white/10 bg-white/[0.04] focus-within:border-white/30">
        <input autoFocus inputMode="decimal" placeholder="0" aria-label={t('easyTrade.sellTitle')} value={amount}
          onChange={(e) => { setAmount(decimal(e.target.value)); setQuote(null); }}
          className="flex-1 min-w-0 bg-transparent px-4 py-4 text-3xl font-semibold text-white outline-none" />
        <span className="pr-4 text-sm text-zinc-400">DHB</span>
      </div>
      <div className="flex items-center justify-between text-xs text-zinc-400">
        <span>{t('easyTrade.available', { amount: formatSize(Number(formatUnits(balance, 18))) })}</span>
        <div className="flex gap-1.5">
          {[25, 50, 100].map((pct) => <button key={pct} type="button" disabled={balance === 0n}
            onClick={() => { setAmount(formatUnits(balance * BigInt(pct) / 100n, 18)); setQuote(null); }}
            className="px-2.5 py-1 rounded-lg border border-white/10 hover:bg-white/10 text-zinc-200 disabled:opacity-40">{pct === 100 ? t('easyTrade.max') : `${pct}%`}</button>)}
        </div>
      </div>
      {balance === 0n && <p className="text-xs text-zinc-400">{t('easyTrade.noDhb')}</p>}
      {amount && !amountOk && balance > 0n && <p className="text-xs text-red-300">{t('dex.checkAmount', { token: 'DHB' })}</p>}
      <button type="button" className={primary} disabled={!amountOk || busy} onClick={() => void toPrice()}>
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : t('easyTrade.next')}
      </button>
    </div>}

    {step === 'price' && <div className="space-y-2">
      <button type="button" aria-pressed={mode === 'market'} onClick={() => setMode('market')} className={cn(optionRow, mode === 'market' && 'border-white/60 bg-white/[0.12]')}>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">{t('easyTrade.marketRate')}</p>
          <p className="text-xs text-zinc-400">{t('easyTrade.marketRateHint', { price: formatPrice(marketRate), usdc: formatSize(quote ? Number(formatUnits(quote.amountOut, 6)) : 0) })}</p>
        </div>
        {mode === 'market' && <Check className="w-4 h-4 text-white" />}
      </button>
      <div role="button" tabIndex={0} aria-pressed={mode === 'custom'} onClick={() => setMode('custom')} onKeyDown={(e) => { if (e.key === 'Enter') setMode('custom'); }}
        className={cn(optionRow, 'flex-col items-stretch cursor-pointer', mode === 'custom' && 'border-white/60 bg-white/[0.12]')}>
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0"><p className="text-sm font-semibold text-white">{t('easyTrade.myPrice')}</p><p className="text-xs text-zinc-400">{t('easyTrade.myPriceHint')}</p></div>
          {mode === 'custom' && <Check className="w-4 h-4 text-white" />}
        </div>
        {mode === 'custom' && <>
          <div className="flex items-center rounded-lg border border-white/10 bg-black/30 mt-1">
            <span className="pl-3 text-zinc-400">$</span>
            <input autoFocus inputMode="decimal" placeholder={marketRate ? marketRate.toFixed(6) : '0.00'} aria-label={t('easyTrade.myPriceHint')} value={price}
              onClick={(e) => e.stopPropagation()} onChange={(e) => setPrice(decimal(e.target.value))}
              className="flex-1 min-w-0 bg-transparent px-2 py-3 text-lg text-white outline-none" />
          </div>
          {myPrice > 0 && marketRate != null && <p className="text-xs text-zinc-300 leading-relaxed">
            {myPrice > marketRate ? t('easyTrade.routeList', { price: formatPrice(myPrice) }) : t('easyTrade.routeInstant')}
          </p>}
        </>}
      </div>
      <button type="button" className={cn(primary, 'mt-2')} onClick={toReview}>{t('easyTrade.next')}</button>
    </div>}

    {step === 'review' && <div className="space-y-3">
      <dl className="rounded-xl border border-white/10 bg-white/[0.04] p-4 grid grid-cols-[1fr_auto] gap-y-2.5 text-sm">
        <dt className="text-zinc-400">{t('easyTrade.youSell')}</dt><dd className="text-white text-right">{formatSize(Number(amount))} DHB</dd>
        <dt className="text-zinc-400">{t('easyTrade.method')}</dt><dd className="text-white text-right">{route === 'list' ? t('easyTrade.methodList', { price: formatPrice(myPrice) }) : t('easyTrade.methodInstant')}</dd>
        <dt className="text-zinc-400">{route === 'list' ? t('easyTrade.ifFilled') : t('easyTrade.youGet')}</dt>
        <dd className="text-white text-right font-semibold">{formatSize(route === 'list' ? Number(amount) * myPrice : quote ? Number(formatUnits(quote.amountOut, 6)) : 0)} USDC</dd>
      </dl>
      <p className="text-xs text-zinc-400 leading-relaxed">{route === 'list' ? t('easyTrade.listNote') : t('dex.pool.instantNote')}</p>
      {notice && <p className="text-xs text-amber-200">{notice}</p>}
      <button type="button" className={primary} disabled={busy} onClick={() => void confirm()}>
        {busy ? <><Loader2 className="w-4 h-4 animate-spin" />{stage || t('easyTrade.working')}</> : t('easyTrade.confirm')}
      </button>
    </div>}

    {step === 'done' && result && <div className="space-y-4 text-center py-2">
      <div className="mx-auto w-12 h-12 rounded-full bg-white/10 flex items-center justify-center"><Check className="w-6 h-6 text-white" /></div>
      <p className="text-white font-semibold">{result.route === 'list'
        ? t('easyTrade.doneList', { amount: formatSize(Number(result.amount)), price: formatPrice(result.price) })
        : t('easyTrade.doneInstant', { amount: formatSize(Number(result.amount)) })}</p>
      <p className="text-sm text-zinc-400">{result.route === 'list' ? t('easyTrade.doneListHint') : t('easyTrade.doneInstantHint', { usdc: formatSize(result.usdc) })}</p>
      <div className="flex gap-2">
        {result.route === 'list' && <button type="button" onClick={openExchange} className="flex-1 h-12 rounded-xl border border-white/15 text-white">{t('easyTrade.openExchange')}</button>}
        <button type="button" onClick={() => onOpenChange(false)} className={cn(primary, 'flex-1')}>{t('easyTrade.done')}</button>
      </div>
    </div>}

    {error && <div role="alert" className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2.5 text-xs text-red-200">{error}</div>}
  </div>;

  const guard = (next: boolean) => { if (!busy) onOpenChange(next); };
  if (isMobile) return <Drawer open={open} onOpenChange={guard}>
    <DrawerContent column glass data-wallet-page className="max-h-[92vh]">
      <DrawerTitle className="sr-only">{title}</DrawerTitle>
      {body}
    </DrawerContent>
  </Drawer>;
  return <Dialog open={open} onOpenChange={guard}>
    <DialogContent data-wallet-page className="bg-black/60 backdrop-blur-[24px] border border-white/10 shadow-2xl sm:max-w-md p-0 pt-5">
      <DialogTitle className="sr-only">{title}</DialogTitle>
      {body}
    </DialogContent>
  </Dialog>;
}
