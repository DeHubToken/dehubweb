import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownUp, ExternalLink, ImagePlus, RefreshCw, Zap } from 'lucide-react';
import { Contract, formatUnits, parseUnits } from 'ethers';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useWalletLocked } from '@/hooks/use-wallet-locked';
import { supabase } from '@/integrations/supabase/client';
import { withWalletHeader } from '@/lib/supabase-wallet-client';
import { isSmartWalletSession } from '@/lib/connection-source';
import { getCachedSolanaAddress } from '@/lib/solana/address-cache';
import { getConnectedSolanaAddress } from '@/lib/solana/wallet';
import { dexActionError } from '@/lib/dex/action-error';
import { CANDLE_INTERVALS, type CandleInterval } from '@/lib/dex/live-market';
import { aggregateBook, displayBookLevels, fillFraction, formatBookPrice, formatIncrement, formatPrice, formatSize, levelBook, spreadPercent, type BookLevel } from '@/lib/dex/orderbook';
import { getPool, isPoolChain, POOL_CHAIN_INFO, setPoolImage, uploadPoolImage, type DexPool } from '@/lib/dex/pools';
import { incrementsFor, tokenCandles, tokenMarket } from '@/lib/dex/market-data';
import { NATIVE, quoteSwap, runSwap, type SwapCall } from '@/lib/dex/evm-swap';
import { evmMarket, placeEvmOrder, poolProvider, readEvmOrders, withdrawEvmOrder, type EvmOrder } from '@/lib/dex/pool-v4';
import { activeSolanaOrders, cancelSolanaOrder, MIN_ORDER_USD, placeSolanaOrder, quoteSolanaSwap, runSolanaSwap, SOL_MINT, solanaBalance, solanaTrader, spendableSol, USDC_MINT, type SolanaQuote } from '@/lib/dex/solana-trade';
import type { OrderStage } from '@/lib/dex/read-timeout';
import { MarketChart } from '@/components/app/dex/MarketChart';
import { PoolAvatar, PoolPicker } from '@/components/app/dex/PoolPicker';
import { AddPoolDialog } from '@/components/app/dex/AddPoolDialog';
import { SEOHead } from '@/components/SEOHead';
import '@/components/app/dex/exchange.css';

type Side = 'buy' | 'sell';
type Mode = 'limit' | 'instant';
interface OrderRow { pool_id: string; order_ref: string; owner_address: string; maker: string; side: Side; tx_hash: string; token_amount: number; usd_amount: number; price: number; created_at: string }
interface TradeRow { tx_hash: string; pool_id: string; trader: string; side: Side; token_amount: number; usd_amount: number; price: number; created_at: string }
/** A resting order as the book and the orders table show it, whatever chain it lives on. */
interface LiveOrder { row: OrderRow; side: Side; price: number; minPrice: number; maxPrice: number; tokenLeft: number; usdLeft: number; fill: number; status: 'Open' | 'In range' | 'Filled'; owner: string; evm?: EvmOrder }

type InstantQuote = { evm?: SwapCall; sol?: SolanaQuote; out: number };
const PAGE_SIZE = 15;
const decimalInput = (value: string) => value.replace(',', '.').trim();
const numeric = <T extends object>(row: T, keys: (keyof T)[]) => { for (const k of keys) (row as Record<string, unknown>)[k as string] = Number(row[k]); return row; };
function formatWhen(iso: string) {
  const date = new Date(iso);
  if (date.toDateString() === new Date().toDateString()) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
/** Cut a decimal string to what the token can hold, so parseUnits never throws on precision. */
const clampDecimals = (value: string, decimals: number) => { const [whole, fraction = ''] = value.split('.'); return fraction ? `${whole}.${fraction.slice(0, decimals)}` : whole; };

function BookRows({ levels, bid, increment, onPrice, disabled }: { levels: BookLevel[]; bid: boolean; increment: number; onPrice: (price: number) => void; disabled: boolean }) {
  const { t } = useTranslation();
  const total = levels.at(-1)?.cumulativeDhb || 1;
  if (!levels.length) return <div className="dex-book-empty">{t(bid ? 'dex.noBids' : 'dex.noAsks')}</div>;
  return <div className="dex-book-scroll">{displayBookLevels(levels, bid).map((level) => <button type="button" disabled={disabled} key={level.price}
    className={`dex-book-row ${bid ? 'dex-buy' : 'dex-sell'}`} style={{ '--depth': `${level.cumulativeDhb / total * 100}%` } as CSSProperties}
    aria-label={t(bid ? 'dex.useBuyPrice' : 'dex.useSellPrice', { price: formatBookPrice(level.price, increment) })} onClick={() => onPrice(level.price)}>
    <span>{formatBookPrice(level.price, increment)}</span><span>{formatSize(level.dhb)}</span><span>{formatSize(level.cumulativeDhb)}</span>
  </button>)}</div>;
}

export default function DexPoolPage() {
  const { t } = useTranslation();
  const params = useParams<{ chain: string; address: string }>();
  const chain = isPoolChain(params.chain) ? params.chain : null;
  const { data: pool, isLoading: poolLoading } = useQuery({
    queryKey: ['dex-pool', chain, params.address], enabled: !!chain && !!params.address,
    queryFn: () => getPool(chain!, params.address!),
  });
  const [adding, setAdding] = useState(false);

  if (!chain || (!poolLoading && !pool)) {
    return <div className="dex-terminal">
      <SEOHead title={t('dex.pool.missingTitle')} description={t('dex.seoDescription')} noindex />
      <header className="dex-top"><PoolPicker current={null} /></header>
      <div className="dex-empty dex-panel" style={{ borderRadius: 8 }}>
        <p>{t('dex.pool.missing')}</p>
        <button type="button" className="dex-submit" style={{ maxWidth: 260, margin: '16px auto 0' }} onClick={() => setAdding(true)}>{t('dex.pools.add')}</button>
      </div>
      <AddPoolDialog open={adding} onOpenChange={setAdding} onCreated={(created) => { window.location.assign(`/dex/${created.chain}/${created.token_address}`); }} />
    </div>;
  }
  if (!pool) return <div className="dex-terminal"><div className="dex-chart-empty" role="status">{t('dex.loadingMarket')}</div></div>;
  return <PoolTerminal pool={pool} key={pool.id} />;
}

function PoolTerminal({ pool }: { pool: DexPool }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { walletAddress, connect, requestWalletUnlock } = useAuth();
  const walletLocked = useWalletLocked();
  const info = POOL_CHAIN_INFO[pool.chain];
  const isSolana = pool.chain === 'solana';
  const market = useMemo(() => isSolana ? null : evmMarket(pool), [pool, isSolana]);
  const symbol = pool.symbol;

  const [side, setSide] = useState<Side>('buy');
  const [mode, setMode] = useState<Mode>('limit');
  const [amount, setAmount] = useState('');
  const [price, setPrice] = useState('');
  const priceTouched = useRef(false);
  const [payNative, setPayNative] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<OrderStage | 'index' | 'swap'>('quote');
  const [formError, setFormError] = useState('');
  const [instantQuote, setInstantQuote] = useState<InstantQuote | null>(null);
  const [period, setPeriod] = useState<CandleInterval>('15m');
  const [depth, setDepth] = useState(false);
  const [mobileView, setMobileView] = useState<'chart' | 'book' | 'trade'>('chart');
  const [mine, setMine] = useState(false);
  const [page, setPage] = useState(0);
  const [acting, setActing] = useState<string | null>(null);
  const [balanceRevision, setBalanceRevision] = useState(0);
  const imageInput = useRef<HTMLInputElement>(null);
  const isCreator = walletAddress?.toLowerCase() === pool.creator_address;

  // ── Market data ──
  const { data: stats, refetch: refetchStats, isFetching: statsFetching } = useQuery({
    queryKey: ['dex-pool-market', pool.chain, pool.token_address], queryFn: () => tokenMarket(pool.chain, pool.token_address),
    refetchInterval: 30_000, staleTime: 15_000,
  });
  const { data: candles = [] } = useQuery({
    queryKey: ['dex-pool-candles', pool.chain, stats?.pairAddress, period], enabled: !!stats?.pairAddress,
    queryFn: () => tokenCandles(pool.chain, stats!.pairAddress!, pool.token_address, period), refetchInterval: 60_000, staleTime: 55_000,
  });
  const marketPrice = stats?.priceUsd ?? candles.at(-1)?.close ?? null;
  const increments = useMemo(() => incrementsFor(marketPrice), [marketPrice]);
  const [incrementIndex, setIncrementIndex] = useState(1);
  const increment = increments[Math.min(incrementIndex, increments.length - 1)];

  // ── Orders and trades ──
  const { data: rows = [], refetch: refetchRows } = useQuery({
    queryKey: ['dex-pool-orders', pool.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('dex_pool_orders' as never).select('*').eq('pool_id', pool.id).order('created_at', { ascending: false }).limit(300);
      if (error) throw error;
      return ((data ?? []) as OrderRow[]).map((r) => numeric(r, ['token_amount', 'usd_amount', 'price']));
    },
    staleTime: 10_000,
  });
  const { data: trades = [], refetch: refetchTrades } = useQuery({
    queryKey: ['dex-pool-trades', pool.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('dex_pool_trades' as never).select('*').eq('pool_id', pool.id).order('created_at', { ascending: false }).limit(30);
      if (error) throw error;
      return ((data ?? []) as TradeRow[]).map((r) => numeric(r, ['token_amount', 'usd_amount', 'price']));
    },
    staleTime: 10_000,
  });
  const { data: live = [], isLoading: liveLoading, refetch: refetchLive } = useQuery({
    queryKey: ['dex-pool-live', pool.id, rows.map((r) => r.order_ref).join(',')],
    queryFn: async (): Promise<LiveOrder[]> => {
      if (!rows.length) return [];
      if (market) {
        const orders = await readEvmOrders(market, rows.map((r) => ({ order_ref: r.order_ref, side: r.side })));
        const byId = new Map(orders.map((o) => [o.tokenId, o]));
        return rows.flatMap((row) => {
          const o = byId.get(row.order_ref);
          if (!o) return [];
          return [{ row, side: row.side, price: row.side === 'buy' ? o.maxPrice : o.minPrice, minPrice: o.minPrice, maxPrice: o.maxPrice,
            tokenLeft: o.amountDhb, usdLeft: o.amountUsdc, fill: fillFraction(o), status: o.status, owner: o.owner, evm: o }];
        });
      }
      const active = await activeSolanaOrders(rows.map((r) => r.maker));
      return rows.flatMap((row) => {
        const o = active.get(row.order_ref);
        if (!o) return [];
        const sell = row.side === 'sell';
        const orderPrice = sell ? o.taking / o.making : o.making / o.taking;
        const filled = o.making > 0 ? 1 - o.remainingMaking / o.making : 0;
        return [{ row, side: row.side, price: orderPrice, minPrice: orderPrice, maxPrice: orderPrice,
          tokenLeft: sell ? o.remainingMaking : o.remainingTaking, usdLeft: sell ? o.remainingTaking : o.remainingMaking,
          fill: filled, status: filled > 0 ? 'In range' : 'Open', owner: row.owner_address }];
      });
    },
    refetchInterval: 30_000, staleTime: 10_000,
  });
  useEffect(() => {
    const channel = supabase.channel(`dex-pool-${pool.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'dex_pool_orders', filter: `pool_id=eq.${pool.id}` }, () => { void refetchRows(); })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'dex_pool_trades', filter: `pool_id=eq.${pool.id}` }, () => { void refetchTrades(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [pool.id, refetchRows, refetchTrades]);

  const { bids, asks } = useMemo(() => {
    const resting = live.filter((o) => o.status !== 'Filled');
    if (market) return aggregateBook(resting.map((o) => o.evm!), increment);
    return levelBook(resting.map((o) => ({ side: o.side, price: o.price, size: o.tokenLeft })), increment);
  }, [live, market, increment]);
  const bidTotal = bids.at(-1)?.cumulativeDhb || 0, askTotal = asks.at(-1)?.cumulativeDhb || 0;
  const gap = bids.length && asks.length ? asks[0].price - bids[0].price : null;
  const spread = gap != null && gap > 0 ? gap : null;
  const spreadShare = spread != null ? spreadPercent(bids[0].price, asks[0].price) : null;

  // ── Balances ──
  const [trader, setTrader] = useState<string | null>(null);
  useEffect(() => {
    if (!walletAddress) { setTrader(null); return; }
    if (!isSolana) { setTrader(walletAddress); return; }
    let live = true;
    const known = isSmartWalletSession() ? Promise.resolve(getCachedSolanaAddress()) : getConnectedSolanaAddress();
    void known.then((address) => { if (live) setTrader(address); }).catch(() => {});
    return () => { live = false; };
  }, [walletAddress, isSolana]);
  const { data: balances } = useQuery({
    queryKey: ['dex-pool-balances', pool.id, trader, balanceRevision], enabled: !!trader,
    queryFn: async () => {
      if (isSolana) {
        const [token, usdc, sol] = await Promise.all([solanaBalance(trader!, pool.token_address), solanaBalance(trader!, USDC_MINT), solanaBalance(trader!, SOL_MINT)]);
        return { token, usdc, native: spendableSol(sol) };
      }
      const provider = poolProvider(market!.chain);
      const erc20 = ['function balanceOf(address) view returns (uint256)'];
      const [token, usdc, native] = await Promise.all([
        new Contract(pool.token_address, erc20, provider).balanceOf(trader) as Promise<bigint>,
        new Contract(info.usdc, erc20, provider).balanceOf(trader) as Promise<bigint>,
        provider.getBalance(trader!),
      ]);
      return { token: Number(formatUnits(token, pool.decimals)), usdc: Number(formatUnits(usdc, info.usdcDecimals)), native: Number(formatUnits(native, 18)) };
    },
    refetchInterval: 60_000,
  });
  const nativeSymbol = isSolana ? 'SOL' : 'ETH';
  const spendSymbol = side === 'sell' ? symbol : payNative && mode === 'instant' ? nativeSymbol : 'USDC';
  const available = !balances ? null : side === 'sell' ? balances.token : spendSymbol === 'USDC' ? balances.usdc : balances.native;

  // ── Ticket ──
  useEffect(() => {
    if (priceTouched.current || marketPrice == null) return;
    const step = increment;
    const seeded = side === 'sell' ? Math.ceil(marketPrice * 1.001 / step) * step : Math.floor(marketPrice * 0.999 / step) * step;
    setPrice(String(Number(seeded.toPrecision(8))));
  }, [marketPrice, side, increment]);
  useEffect(() => { setInstantQuote(null); setFormError(''); }, [side, mode, amount, payNative]);

  const priceNumber = Number(price), amountNumber = Number(amount);
  const estimate = amountNumber > 0 && priceNumber > 0 ? side === 'buy' ? amountNumber / priceNumber : amountNumber * priceNumber : 0;
  const stageText: Record<string, string> = {
    swap: t('dex.stage.swap'), quote: t('dex.stage.quote'), wallet: t('dex.stage.wallet'), balance: t('dex.stage.balance'),
    tokenApproval: t('dex.stage.tokenApproval'), permitApproval: t('dex.stage.permitApproval'), submit: t('dex.stage.submit'),
    confirm: t('dex.stage.confirm'), index: t('dex.stage.index'), swapConfirm: t('dex.stage.swapConfirm'),
  };

  const refreshAll = useCallback(() => {
    void refetchStats(); void refetchRows(); void refetchTrades(); void refetchLive(); setBalanceRevision((n) => n + 1);
  }, [refetchStats, refetchRows, refetchTrades, refetchLive]);

  async function ensureReady(): Promise<string | null> {
    if (!walletAddress) { await connect(); return null; }
    if (walletLocked) { requestWalletUnlock(); return null; }
    if (!isSolana) return walletAddress;
    const address = await solanaTrader();
    setTrader(address);
    return address;
  }

  async function placeLimit() {
    const maker = await ensureReady();
    if (!maker || !walletAddress) return;
    if (!(amountNumber > 0) || (available != null && amountNumber > available)) throw new Error(t('dex.checkAmount', { token: spendSymbol }));
    if (!(priceNumber > 0)) throw new Error(t('dex.pool.enterPrice'));
    let orderRef: string, txHash: string;
    if (market) {
      // A one-tick-wide band at the asked price: a limit order, as close as a range position gets.
      const minPrice = side === 'buy' ? priceNumber * 0.999 : priceNumber;
      const maxPrice = side === 'buy' ? priceNumber : priceNumber * 1.001;
      const fmt = (v: number) => clampDecimals(v.toFixed(18).replace(/0+$/, '').replace(/\.$/, ''), 18);
      const placed = await placeEvmOrder(market, { walletAddress, side, amount: clampDecimals(amount, side === 'sell' ? pool.decimals : info.usdcDecimals), minPrice: fmt(minPrice), maxPrice: fmt(maxPrice) }, setStage);
      orderRef = placed.tokenId; txHash = placed.txHash;
    } else {
      setStage('submit');
      const placed = await placeSolanaOrder({ trader: maker, side, tokenMint: pool.token_address, tokenDecimals: pool.decimals, amount: amountNumber, price: priceNumber });
      orderRef = placed.order; txHash = placed.signature;
    }
    const tokenAmount = side === 'sell' ? amountNumber : amountNumber / priceNumber;
    const usdAmount = side === 'sell' ? amountNumber * priceNumber : amountNumber;
    setStage('index');
    const { error } = await withWalletHeader(supabase.from('dex_pool_orders' as never).insert({
      pool_id: pool.id, order_ref: orderRef, owner_address: walletAddress.toLowerCase(), maker: isSolana ? maker : maker.toLowerCase(), side, tx_hash: txHash,
      token_amount: tokenAmount, usd_amount: usdAmount, price: priceNumber,
    } as never), walletAddress);
    if (error) toast.error(t('dex.registrationFailed'));
    toast.success(t('dex.created'));
    setAmount(''); priceTouched.current = false; setMine(true);
  }

  async function quoteInstant(): Promise<InstantQuote | null> {
    const taker = await ensureReady();
    if (!taker) return null;
    if (!(amountNumber > 0) || (available != null && amountNumber > available)) throw new Error(t('dex.checkAmount', { token: spendSymbol }));
    setStage('quote');
    if (isSolana) {
      const inputMint = side === 'sell' ? pool.token_address : payNative ? SOL_MINT : USDC_MINT;
      const outputMint = side === 'sell' ? USDC_MINT : pool.token_address;
      const inDecimals = side === 'sell' ? pool.decimals : payNative ? 9 : 6;
      const sol = await quoteSolanaSwap(inputMint, outputMint, parseUnits(clampDecimals(amount, inDecimals), inDecimals));
      const out = Number(formatUnits(sol.outAmount, side === 'sell' ? 6 : pool.decimals));
      const quote: InstantQuote = { sol, out }; setInstantQuote(quote); return quote;
    }
    const tokenIn = side === 'sell' ? pool.token_address : payNative ? NATIVE : info.usdc;
    const tokenOut = side === 'sell' ? info.usdc : pool.token_address;
    const inDecimals = side === 'sell' ? pool.decimals : payNative ? 18 : info.usdcDecimals;
    const evm = await quoteSwap({ chainId: market!.chainId, tokenIn, tokenOut, amountIn: parseUnits(clampDecimals(amount, inDecimals), inDecimals), recipient: taker });
    const out = Number(formatUnits(evm.amountOut, side === 'sell' ? info.usdcDecimals : pool.decimals));
    const quote: InstantQuote = { evm, out }; setInstantQuote(quote); return quote;
  }

  async function runInstant() {
    const taker = await ensureReady();
    if (!taker || !walletAddress) return;
    const quote = instantQuote ?? await quoteInstant();
    if (!quote) return;
    setStage('swap');
    const hash = quote.sol ? await runSolanaSwap(quote.sol, taker) : (await runSwap(quote.evm!, taker)).hash;
    const tokenAmount = side === 'sell' ? amountNumber : quote.out;
    const usdAmount = side === 'sell' ? quote.out
      : quote.sol?.usdValue ?? quote.evm?.amountInUsd ?? (spendSymbol === 'USDC' ? amountNumber : quote.out * (marketPrice ?? 0));
    setStage('index');
    if (tokenAmount > 0 && usdAmount > 0) {
      await withWalletHeader(supabase.from('dex_pool_trades' as never).insert({
        tx_hash: hash, pool_id: pool.id, owner_address: walletAddress.toLowerCase(), trader: isSolana ? taker : taker.toLowerCase(), side,
        token_amount: tokenAmount, usd_amount: usdAmount, price: usdAmount / tokenAmount,
      } as never), walletAddress);
    }
    toast.success(t(side === 'buy' ? 'dex.pool.bought' : 'dex.pool.sold', { amount: formatSize(tokenAmount), symbol }));
    setAmount(''); setInstantQuote(null);
  }

  async function submit() {
    if (busy) return;
    setFormError(''); setBusy(true);
    try {
      if (mode === 'limit') await placeLimit();
      else if (!instantQuote) await quoteInstant();
      else await runInstant();
      if (mode === 'limit' || instantQuote) refreshAll();
    } catch (error) {
      setFormError(dexActionError(error, t('dex.prepareFailed')));
    } finally { setBusy(false); }
  }

  async function cancel(order: LiveOrder) {
    if (acting || !walletAddress) return;
    if (walletLocked) { requestWalletUnlock(); return; }
    setActing(order.row.order_ref);
    try {
      if (order.evm && market) await withdrawEvmOrder(market, order.evm, walletAddress);
      else await cancelSolanaOrder(await solanaTrader(), order.row.order_ref);
      toast.success(t(market ? 'dex.withdrawn' : 'dex.pool.cancelled'));
      refreshAll();
    } catch (error) { toast.error(dexActionError(error, t('dex.withdrawFailed'))); }
    finally { setActing(null); }
  }

  async function changeImage(file: File | undefined) {
    if (!file || !walletAddress) return;
    try {
      const url = await uploadPoolImage(file);
      await setPoolImage(pool.id, url, walletAddress);
      await Promise.all([queryClient.invalidateQueries({ queryKey: ['dex-pool'] }), queryClient.invalidateQueries({ queryKey: ['dex-pools'] })]);
      toast.success(t('dex.pool.imageUpdated'));
    } catch (error) { toast.error(dexActionError(error, t('dex.pool.imageFailed'))); }
  }

  const choosePrice = (value: number, next: Side) => { if (busy) return; priceTouched.current = true; setMode('limit'); setSide(next); setPrice(String(Number(value.toPrecision(8)))); setMobileView('trade'); };
  const shown = useMemo(() => mine ? live.filter((o) => o.row.owner_address === walletAddress?.toLowerCase()) : live, [live, mine, walletAddress]);
  const visible = shown.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const activity = useMemo(() => [
    ...trades.map((trade) => ({ key: trade.tx_hash, side: trade.side, size: trade.token_amount, price: trade.price, at: trade.created_at, hash: trade.tx_hash, instant: true })),
    ...rows.map((row) => ({ key: row.order_ref, side: row.side, size: row.token_amount, price: row.price, at: row.created_at, hash: row.tx_hash, instant: false })),
  ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 12), [trades, rows]);

  const submitLabel = busy ? stageText[stage] ?? t('dex.stage.quote')
    : !walletAddress ? t('dex.connectWallet')
    : walletLocked ? t('dex.unlockWallet')
    : mode === 'instant' ? instantQuote ? t(side === 'buy' ? 'dex.pool.confirmInstantBuy' : 'dex.pool.confirmInstantSell') : t(side === 'buy' ? 'dex.pool.instantBuy' : 'dex.pool.instantSell')
    : t(side === 'buy' ? 'dex.pool.placeBuy' : 'dex.pool.placeSell', { symbol });

  const title = t('dex.pool.seoTitle', { symbol, name: pool.name, chain: info.name });
  const description = t('dex.pool.seoDescription', { symbol, name: pool.name, chain: info.name });
  const canonical = `https://dehub.io/dex/${pool.chain}/${pool.token_address}`;

  return <div className="dex-terminal">
    <SEOHead title={title} description={description} url={canonical} image={pool.image_url ?? stats?.imageUrl ?? undefined}
      jsonLd={{ '@context': 'https://schema.org', '@type': 'WebApplication', name: title, url: canonical, applicationCategory: 'FinanceApplication', operatingSystem: 'Web', description }} />
    <header className="dex-top">
      <PoolPicker current={pool} />
      {isCreator && <><button type="button" className="dex-image-button" onClick={() => imageInput.current?.click()}><ImagePlus size={14} />{t('dex.pool.changeImage')}</button>
        <input ref={imageInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => void changeImage(e.target.files?.[0])} /></>}
      <div className="dex-stat"><small>{t('dex.marketPrice')}</small><strong className="dex-reference">{marketPrice != null ? `$${formatPrice(marketPrice)}` : '—'}</strong></div>
      <div className="dex-stat"><small>{t('dex.change24')}</small><strong className={(stats?.change24h || 0) >= 0 ? 'dex-buy' : 'dex-sell'}>{stats?.change24h != null ? `${stats.change24h >= 0 ? '+' : ''}${stats.change24h.toFixed(2)}%` : '—'}</strong></div>
      <div className="dex-stat"><small>{t('dex.totalLiquidity')}</small><strong>{stats?.liquidityUsd != null ? `$${formatSize(stats.liquidityUsd)}` : '—'}</strong></div>
      <div className="dex-stat"><small>{t('dex.pool.volume24')}</small><strong>{stats?.volume24h != null ? `$${formatSize(stats.volume24h)}` : '—'}</strong></div>
      <div className="dex-stat"><small>{t('dex.network')}</small><strong><a href={info.address(pool.token_address)} target="_blank" rel="noreferrer">{info.name} <ExternalLink size={11} /></a></strong></div>
      <button className="dex-refresh" type="button" onClick={refreshAll} disabled={busy} aria-label={t('dex.refreshMarket')}><RefreshCw size={14} />{statsFetching ? t('dex.updating') : t('dex.refresh')}</button>
    </header>
    <div className="dex-mobile-tabs" role="tablist" aria-label={t('dex.tradingPanels')}>{(['chart', 'book', 'trade'] as const).map((view) => <button key={view} role="tab" aria-selected={mobileView === view} onClick={() => setMobileView(view)}>{t(`dex.tab.${view}`)}</button>)}</div>
    <div className="dex-workspace">
      <section className={`dex-panel dex-chart-panel dex-pane ${mobileView === 'chart' ? 'dex-pane-active' : ''}`}>
        <div className="dex-panel-head"><div className="dex-tabs" role="tablist" aria-label={t('dex.chartType')}><button role="tab" aria-selected={!depth} onClick={() => setDepth(false)}>{t('dex.price')}</button><button role="tab" aria-selected={depth} onClick={() => setDepth(true)}>{t('dex.depth')}</button></div>{!depth && <div className="dex-tabs" role="tablist" aria-label={t('dex.chartTimeframe')}>{CANDLE_INTERVALS.filter((v) => v !== '30m').map((value) => <button role="tab" key={value} aria-selected={period === value} onClick={() => setPeriod(value)}>{value}</button>)}</div>}</div>
        <MarketChart candles={candles} bids={bids} asks={asks} depth={depth} symbol={symbol} />
        <div className="dex-transactions"><div className="dex-transactions-head"><span>{t('dex.latestTransactions')}</span><span>{t('dex.time')}</span></div>
          {activity.length ? activity.map((item) => <a key={item.key} className="dex-transaction" href={info.tx(item.hash)} target="_blank" rel="noreferrer">
            <span className={item.side === 'buy' ? 'dex-buy' : 'dex-sell'}>{item.instant ? <Zap size={11} /> : null}{t(item.side === 'buy' ? 'dex.buyLabel' : 'dex.sellLabel')} <b>{formatSize(item.size)} {symbol}</b><small>${formatPrice(item.price)} · {t(item.instant ? 'dex.pool.instant' : 'dex.pool.limit')}</small></span>
            <time dateTime={item.at}>{formatWhen(item.at)}</time></a>) : <div className="dex-transactions-empty">{t('dex.noTransactions')}</div>}
        </div>
      </section>
      <section className={`dex-panel dex-book-panel dex-pane ${mobileView === 'book' ? 'dex-pane-active' : ''}`}>
        <div className="dex-panel-head"><h2>{t('dex.orderBook')}</h2><select aria-label={t('dex.priceGrouping')} className="dex-book-select" value={incrementIndex} onChange={(e) => setIncrementIndex(Number(e.target.value))}>{increments.map((step, index) => <option key={step} value={index}>{formatIncrement(step)}</option>)}</select></div>
        <div className="dex-book-head"><span>{t('dex.priceUsd')}</span><span>{t('dex.pool.size', { symbol })}</span><span>{t('dex.pool.total', { symbol })}</span></div>
        <BookRows levels={asks} bid={false} increment={increment} disabled={busy} onPrice={(value) => choosePrice(value, 'sell')} />
        <div className="dex-spread"><ArrowDownUp size={13} /><b>{spread == null ? '—' : formatBookPrice(spread, increment)}</b><span>{t('dex.spread')}{spreadShare != null && ` · ${spreadShare.toFixed(2)}%`}</span></div>
        <BookRows levels={bids} bid increment={increment} disabled={busy} onPrice={(value) => choosePrice(value, 'buy')} />
        <div className="dex-ratio"><i style={{ width: `${bidTotal + askTotal ? bidTotal / (bidTotal + askTotal) * 100 : 50}%` }} /></div>
        <div className="dex-book-total"><span className="dex-buy">{t('dex.pool.buyTotal', { amount: formatSize(bidTotal), symbol })}</span><span className="dex-sell">{t('dex.pool.sellTotal', { amount: formatSize(askTotal), symbol })}</span></div>
      </section>
      <section className={`dex-panel dex-ticket-panel dex-pane ${mobileView === 'trade' ? 'dex-pane-active' : ''}`}>
        <div className="dex-panel-head"><h2>{t('dex.placeOrder')}</h2><div className="dex-tabs" role="tablist" aria-label={t('dex.pool.orderType')}>
          <button role="tab" aria-selected={mode === 'limit'} onClick={() => setMode('limit')}>{t('dex.pool.limit')}</button>
          <button role="tab" aria-selected={mode === 'instant'} onClick={() => setMode('instant')}><Zap size={11} /> {t('dex.pool.instant')}</button>
        </div></div>
        <div className="dex-ticket"><fieldset disabled={busy}>
          <div className="dex-instant-row">
            <button type="button" className="dex-instant dex-instant-buy" onClick={() => { setMode('instant'); setSide('buy'); }}><Zap size={13} />{t('dex.pool.instantBuy')}</button>
            <button type="button" className="dex-instant dex-instant-sell" onClick={() => { setMode('instant'); setSide('sell'); }}><Zap size={13} />{t('dex.pool.instantSell')}</button>
          </div>
          <div className="dex-side">{(['buy', 'sell'] as const).map((value) => <button type="button" key={value} className={side === value ? `active-${value}` : ''} onClick={() => { setSide(value); setAmount(''); priceTouched.current = false; }}>{t(value === 'buy' ? 'dex.buy' : 'dex.sell')}</button>)}</div>
          {mode === 'limit' && <label className="dex-field">{t(side === 'buy' ? 'dex.pool.buyAt' : 'dex.pool.sellAt')}<div className="dex-input"><input aria-label={t(side === 'buy' ? 'dex.pool.buyAt' : 'dex.pool.sellAt')} inputMode="decimal" value={price} onChange={(e) => { priceTouched.current = true; setPrice(decimalInput(e.target.value)); }} /><span>USD</span></div></label>}
          {side === 'buy' && mode === 'instant' && <label className="dex-field">{t('dex.payWith')}<div className="dex-input"><select className="dex-pay-select" aria-label={t('dex.payWith')} value={payNative ? 'native' : 'usdc'} onChange={(e) => setPayNative(e.target.value === 'native')}>
            <option value="usdc">USDC · {balances ? formatSize(balances.usdc) : '—'}</option>
            <option value="native">{nativeSymbol} · {balances ? formatSize(balances.native) : '—'}</option>
          </select></div></label>}
          <label className="dex-field">{t(side === 'buy' ? 'dex.spend' : 'dex.sellAmount')}<div className="dex-input"><input aria-label={t('dex.amountToken', { token: spendSymbol })} inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(decimalInput(e.target.value))} /><span>{spendSymbol}</span></div></label>
          <div className="dex-available"><span>{t('dex.available')}</span><span>{available == null ? (trader ? t('dex.checking') : '—') : `${formatSize(available)} ${spendSymbol}`}</span></div>
          <div className="dex-fractions">{[25, 50, 75, 100].map((percent) => <button key={percent} type="button" disabled={!available} onClick={() => setAmount(String(Number((available! * percent / 100).toPrecision(10))))}>{percent === 100 ? t('dex.max') : `${percent}%`}</button>)}</div>
          <dl>
            <dt>{mode === 'instant' ? t('dex.pool.youReceive') : t('dex.estimated')}</dt>
            <dd>{mode === 'instant' ? instantQuote ? `${formatSize(instantQuote.out)} ${side === 'buy' ? symbol : 'USDC'}` : '—' : `${formatSize(estimate)} ${side === 'buy' ? symbol : 'USDC'}`}</dd>
            <dt>{t('dex.network')}</dt><dd>{info.name}</dd>
            {mode === 'instant' && instantQuote?.sol && <><dt>{t('dex.pool.priceImpact')}</dt><dd>{instantQuote.sol.priceImpactPct.toFixed(2)}%</dd></>}
            {mode === 'limit' && isSolana && <><dt>{t('dex.pool.minimum')}</dt><dd>${MIN_ORDER_USD}</dd></>}
          </dl>
        </fieldset>
        {formError && <div role="alert" className="dex-alert dex-error">{formError}</div>}
        <button type="button" className={`dex-submit ${side === 'sell' ? 'sell' : ''}`} disabled={busy || (!!walletAddress && !(amountNumber > 0))} onClick={() => void submit()}>{submitLabel}</button>
        <p className="dex-help">{mode === 'instant' ? t('dex.pool.instantNote') : isSolana ? t('dex.pool.solanaLimitNote') : t('dex.pool.evmLimitNote')}</p>
        </div>
      </section>
    </div>
    <section className="dex-positions"><div className="dex-panel-head"><div role="tablist" aria-label={t('dex.positionOwnership')} className="dex-tabs"><button role="tab" aria-selected={!mine} onClick={() => { setMine(false); setPage(0); }}>{t('dex.pool.openOrders')} <span className="dex-muted">{live.length}</span></button><button role="tab" aria-selected={mine} onClick={() => { setMine(true); setPage(0); }}>{t('dex.pool.myOrders')}</button></div><span className="dex-muted"><PoolAvatar pool={pool} size={14} /> {symbol} · {info.name}</span></div>
      {!shown.length ? <div className="dex-empty">{liveLoading ? t('dex.verifying') : mine ? t('dex.pool.noMyOrders') : t('dex.pool.noOrders', { symbol })}</div> : <div className="dex-table-scroll"><table className="dex-table"><thead><tr><th>{t('dex.position')}</th><th>{t('dex.price')}</th><th>{t('dex.currentHoldings')}</th><th>{t('dex.state')}</th><th /></tr></thead><tbody>
        {visible.map((order) => { const fill = order.fill * 100; return <tr key={order.row.order_ref}>
          <td className={order.side === 'buy' ? 'dex-buy' : 'dex-sell'}>{t(order.side === 'buy' ? 'dex.buy' : 'dex.sell')}<small>{order.row.order_ref.slice(0, 10)}</small></td>
          <td>${formatPrice(order.price)}</td>
          <td>{formatSize(order.tokenLeft)} {symbol}<small>{formatSize(order.usdLeft)} USDC</small></td>
          <td>{order.status === 'Filled' ? t('dex.ready') : order.status === 'In range' ? <>{t('dex.converting')} <span className="dex-muted">{fill < 1 ? '<1' : Math.round(fill)}%</span><i className="dex-fill" style={{ '--fill': `${fill}%` } as CSSProperties} /></> : t('dex.waiting')}<small>{order.row.maker.slice(0, 6)}…{order.row.maker.slice(-4)}</small></td>
          <td>{walletAddress?.toLowerCase() === order.row.owner_address ? <button disabled={!!acting} onClick={() => void cancel(order)}>{acting === order.row.order_ref ? t('dex.withdrawing') : market ? t('dex.withdraw') : t('dex.pool.cancel')}</button>
            : <a href={info.tx(order.row.tx_hash)} target="_blank" rel="noreferrer" aria-label={t('dex.viewPosition', { id: order.row.order_ref.slice(0, 10) })}><ExternalLink size={14} /></a>}</td>
        </tr>; })}
      </tbody></table></div>}
      {shown.length > PAGE_SIZE && <div className="dex-pagination"><button disabled={!page} onClick={() => setPage((n) => n - 1)}>{t('dex.previous')}</button><span>{page + 1} / {Math.ceil(shown.length / PAGE_SIZE)}</span><button disabled={(page + 1) * PAGE_SIZE >= shown.length} onClick={() => setPage((n) => n + 1)}>{t('dex.next')}</button></div>}
    </section>
  </div>;
}
