import { dexActionError } from '@/lib/dex/action-error';
import { minuteCache, parseSharedMarket, CANDLE_INTERVALS, type SharedMarket, type CandleInterval } from '@/lib/dex/live-market';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ArrowDownUp, ExternalLink, RefreshCw } from 'lucide-react';
import { parseUnits } from 'ethers';
import { toast } from 'sonner';
import { useWalletLocked } from '@/hooks/use-wallet-locked';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { withWalletHeader } from '@/lib/supabase-wallet-client';
import { BASE_CHAIN_ID, BNB_CHAIN_ID } from '@/lib/contracts/dhb-token';
import { BOOK_INCREMENTS, DEFAULT_INCREMENT, aggregateBook, balanceFraction, defaultOrderPrice, displayBookLevels, fillFraction, formatBookPrice, formatIncrement, formatPrice, formatSize, spreadPercent, type BookLevel } from '@/lib/dex/orderbook';
import { DEX_CHAINS, type DexChainId, type VerifiedPosition } from '@/lib/dex/v4';
import { detectDhbChain, detectUsdcChain, mintSellPosition, quoteSellPosition, recoverMint, withdrawSellPosition, type SellInput, type SellQuote } from '@/lib/dex/sell';
import { readWithTimeout, type OrderStage } from '@/lib/dex/read-timeout';
import { isSmartWalletSession } from '@/lib/connection-source';
import { createLogger } from '@/lib/logger';
import { MarketChart } from '@/components/app/dex/MarketChart';
import dhbCoinImage from '@/assets/dehub-coin.png';
import '@/components/app/dex/exchange.css';

const logger = createLogger('Dex');
const PAGE_SIZE = 15;
const EXTERNAL_POOLS = [
  {
    pair: 'DHB / ETH',
    venue: 'Base / Uniswap',
    url: 'https://app.uniswap.org/swap?chain=base&inputCurrency=ETH&outputCurrency=0xD20ab1015f6a2De4a6FdDEbAB270113F689c2F7c',
  },
  {
    pair: 'DHB / BNB',
    venue: 'BNB Chain / PancakeSwap',
    url: 'https://pancakeswap.finance/swap?chain=bsc&inputCurrency=BNB&outputCurrency=0x680D3113caf77B61b510f332D5Ef4cf5b41A761D',
  },
] as const;
type CachedPosition = Omit<VerifiedPosition, 'liquidity'> & { liquidity: string };
const readSharedMarket = minuteCache(async () => {
  const { data, error } = await readWithTimeout(Promise.resolve(supabase.rpc('get_dex_market')), 'Shared market');
  if (error) throw error;
  return parseSharedMarket<CachedPosition>(data);
});
/** Sweep the pools for positions opened outside the app now, rather than waiting on the next
 *  scheduled sweep. The endpoint throttles itself, so a burst of these costs nothing, and a
 *  failure is silent: the schedule still runs and the snapshot is what the page actually reads. */
const primeDiscovery = () => { void Promise.resolve(supabase.functions.invoke('dex-position-scan')).catch(() => {}); };
const stageText: Record<OrderStage | 'index', string> = {
  quote: 'Reading pool…', wallet: 'Unlock or connect your wallet…', balance: 'Checking token approvals…',
  tokenApproval: 'Confirm token approval in your wallet…', permitApproval: 'Confirm position approval in your wallet…',
  submit: 'Confirm position in your wallet…', confirm: 'Waiting for confirmation…', index: 'Registering your position…',
};
const smartStageText: Partial<Record<OrderStage | 'index', string>> = {
  tokenApproval: 'Smart wallet approving tokens…', permitApproval: 'Smart wallet approving position access…',
  submit: 'Smart wallet creating your position…',
};
type Pending = { input: SellInput; txHash: string; tokenId?: string };
const storageKey = (wallet: string) => `dex-pending:${wallet.toLowerCase()}`;
const decimalInput = (value: string) => value.replace(',', '.').trim();
const byNewest = (a: VerifiedPosition, b: VerifiedPosition) => Date.parse(b.created_at) - Date.parse(a.created_at);
/** A listing's own price: the ask floor for sells, the bid ceiling for buys. */
const listingPrice = (item: VerifiedPosition) => item.side === 'buy' ? item.maxPrice : item.minPrice;
/** What was deposited, not what the position currently holds after partial conversion. */
const listingSize = (item: VerifiedPosition) => item.side === 'buy'
  ? `${formatSize(Number(item.usdc_amount ?? item.amountUsdc))} USDC`
  : `${formatSize(Number(item.dhb_amount ?? item.amountDhb))} DHB`;
function formatWhen(iso: string) {
  const date = new Date(iso);
  if (date.toDateString() === new Date().toDateString()) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function BookRows({ levels, bid, increment, onPrice, disabled }: { levels: BookLevel[]; bid: boolean; increment: number; onPrice: (price: number) => void; disabled: boolean }) {
  const scroller = useRef<HTMLDivElement>(null);
  // Asks list away from the spread, so the best ask sits at the bottom. Keep it in view
  // until the reader scrolls up to inspect farther levels, and stay there across refreshes.
  const pinned = useRef(true);
  useLayoutEffect(() => {
    const element = scroller.current;
    if (element && !bid && pinned.current) element.scrollTop = element.scrollHeight;
  }, [levels, bid, increment]);
  const total = levels.at(-1)?.cumulativeDhb || 1;
  if (!levels.length) return <div className="dex-book-empty">{bid ? 'No Bids' : 'No ask liquidity yet'}</div>;
  return <div className="dex-book-scroll" ref={scroller} onScroll={(event) => {
    if (bid) return;
    const element = event.currentTarget;
    pinned.current = element.scrollHeight - element.scrollTop - element.clientHeight < 4;
  }}>{displayBookLevels(levels, bid).map((level) => <button type="button" disabled={disabled} key={level.price}
    className={`dex-book-row ${bid ? 'dex-buy' : 'dex-sell'}`} style={{ '--depth': `${level.cumulativeDhb / total * 100}%` } as CSSProperties}
    aria-label={`Use ${formatBookPrice(level.price, increment)} as ${bid ? 'buy' : 'sell'} price`} onClick={() => onPrice(level.price)}>
    <span>{formatBookPrice(level.price, increment)}</span><span>{formatSize(level.dhb)}</span><span>{formatSize(level.cumulativeDhb)}</span>
  </button>)}</div>;
}

export default function DexPage() {
  const { walletAddress, connect, requestWalletUnlock } = useAuth();
  const walletLocked = useWalletLocked();
  const [side, setSide] = useState<'buy' | 'sell'>('sell');
  const [chainId, setChainId] = useState<DexChainId | null>(null);
  const [balance, setBalance] = useState('0');
  const [amount, setAmount] = useState('');
  const [minPrice, setMinPrice] = useState('0.001');
  const [maxPrice, setMaxPrice] = useState('0.001001');
  const priceTouched = useRef(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [stage, setStage] = useState<OrderStage | 'index'>('quote');
  const [checking, setChecking] = useState(false);
  const [balanceError, setBalanceError] = useState('');
  const [positions, setPositions] = useState<VerifiedPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [updated, setUpdated] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const [mine, setMine] = useState(false);
  const [review, setReview] = useState<SellQuote | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [formError, setFormError] = useState('');
  const [withdrawing, setWithdrawing] = useState<string | null>(null);
  const [period, setPeriod] = useState<CandleInterval>('1m');
  const [snapshot, setSnapshot] = useState<SharedMarket<CachedPosition> | null>(null);
  const snapshotTime = useRef(0);
  const candles = snapshot?.candles[period] || [];
  const [depth, setDepth] = useState(false);
  const [increment, setIncrement] = useState<number>(DEFAULT_INCREMENT);
  const [mobileView, setMobileView] = useState<'chart' | 'book' | 'trade'>('chart');
  const loadLock = useRef(false);
  const hasSnapshot = useRef(false);
  const [balanceRevision, setBalanceRevision] = useState(0);
  const [poolMenuOpen, setPoolMenuOpen] = useState(false);
  const poolMenuRef = useRef<HTMLDivElement>(null);
  const fundingToken = side === 'buy' ? 'USDC' : 'DHB';
  const ordered = useMemo(() => [...positions].sort(byNewest), [positions]);
  const transactions = useMemo(() => ordered.slice(0, 8), [ordered]);

  useEffect(() => {
    if (!poolMenuOpen) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!poolMenuRef.current?.contains(event.target as Node)) setPoolMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPoolMenuOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [poolMenuOpen]);

  useEffect(() => {
    setReview(null); setChainId(null); setBalance('0'); setBalanceError('');
    if (!walletAddress) { setChecking(false); return; }
    let live = true; setChecking(true);
    (side === 'sell' ? detectDhbChain : detectUsdcChain)(walletAddress).then((choice) => {
      if (live) { setChainId(choice.chainId); setBalance(choice.balance); }
    }).catch(() => { if (live) setBalanceError('Balance check failed. Retry before placing an order.'); })
      .finally(() => { if (live) setChecking(false); });
    return () => { live = false; };
  }, [walletAddress, side, balanceRevision]);

  useEffect(() => {
    setPending(null);
    if (!walletAddress) return;
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey(walletAddress)) || 'null') as Pending | null;
      if (saved && saved.input?.walletAddress?.toLowerCase() === walletAddress.toLowerCase() &&
          [BASE_CHAIN_ID, BNB_CHAIN_ID].includes(saved.input.chainId) && /^0x[0-9a-f]{64}$/i.test(saved.txHash)) setPending(saved);
    } catch { /* A storage failure does not change onchain ownership. */ }
  }, [walletAddress]);

  const savePending = (value: Pending | null) => {
    setPending(value);
    const owner = value?.input.walletAddress || walletAddress;
    if (!owner) return;
    try { value ? localStorage.setItem(storageKey(owner), JSON.stringify(value)) : localStorage.removeItem(storageKey(owner)); }
    catch { toast.error('Keep this page open until your listing is registered. Browser storage is unavailable.'); }
  };

  const loadPositions = useCallback(async () => {
    if (loadLock.current) return;
    loadLock.current = true;
    try {
      const next = await readSharedMarket();
      if (Date.now() / 1000 - next.observedAt > 180) {
        setListError(hasSnapshot.current ? '' : 'Shared market data is delayed. Showing the last verified snapshot.');
      } else setListError('');
      if (next.observedAt !== snapshotTime.current) {
        snapshotTime.current = next.observedAt;
        setSnapshot(next);
        setPositions(next.positions.map((position) => ({ ...position, liquidity: BigInt(position.liquidity) })));
        setUpdated(next.observedAt * 1000);
        hasSnapshot.current = true;
      }
    } catch { if (!hasSnapshot.current) setListError('Shared market data is unavailable. Retry to load positions.'); }
    finally { setLoading(false); loadLock.current = false; }
  }, []);
  useEffect(() => {
    void loadPositions();
    primeDiscovery();
    // The snapshot is rebuilt once a minute and readSharedMarket caches per clock minute, so
    // polling on a shorter beat picks up each new snapshot sooner without a second fetch for it.
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void loadPositions();
    }, 15000);
    const resume = () => { if (document.visibilityState === 'visible') void loadPositions(); };
    document.addEventListener('visibilitychange', resume);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', resume); };
  }, [loadPositions]);


  const { bids, asks } = useMemo(() => aggregateBook(positions, increment), [positions, increment]);
  const bestAsk = snapshot?.price ?? null;
  const shown = useMemo(() => mine ? ordered.filter((p) => p.owner.toLowerCase() === walletAddress?.toLowerCase()) : ordered, [ordered, mine, walletAddress]);
  const visiblePositions = shown.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  useEffect(() => { setPage((value) => Math.min(value, Math.max(0, Math.ceil(shown.length / PAGE_SIZE) - 1))); }, [shown.length]);
  const bidTotal = bids.at(-1)?.cumulativeDhb || 0, askTotal = asks.at(-1)?.cumulativeDhb || 0;
  const totalUsdc = positions.reduce((sum, p) => sum + p.amountUsdc, 0);
  const totalDhb = positions.reduce((sum, p) => sum + p.amountDhb, 0);
  const spread = bids.length && asks.length ? asks[0].price - bids[0].price : null;
  const spreadShare = bids.length && asks.length ? spreadPercent(bids[0].price, asks[0].price) : null;
  const decimals = side === 'sell' ? 18 : chainId ? DEX_CHAINS[chainId].usdcDecimals : 6;
  const estimate = Number(amount) > 0 && Number(minPrice) > 0 && Number(maxPrice) > Number(minPrice)
    ? side === 'buy' ? Number(amount) / Math.sqrt(Number(minPrice) * Number(maxPrice)) : Number(amount) * Math.sqrt(Number(minPrice) * Number(maxPrice)) : 0;
  // Each network has its own pool price. A sell must clear the highest, a buy the lowest, on the
  // funding network once it is known; before that, whichever bound is safe on every network.
  // Only the 0% pool counts: that is the one the ticket mints into, so a 0.3% position's spot
  // price must never seed it.
  const poolPrices = useMemo(() => {
    const byChain = new Map<number, number>();
    for (const p of positions) if (p.poolFee === 0 && Number.isFinite(p.marketPrice) && p.marketPrice > 0) byChain.set(p.chain_id, p.marketPrice);
    return byChain;
  }, [positions]);
  const referencePrice = useCallback((next: 'buy' | 'sell') => {
    const prices = chainId && poolPrices.has(chainId) ? [poolPrices.get(chainId)!] : [...poolPrices.values()];
    if (!prices.length) return bestAsk;
    return next === 'sell' ? Math.max(...prices) : Math.min(...prices);
  }, [poolPrices, chainId, bestAsk]);
  const seedPrice = useMemo(() => referencePrice(side), [referencePrice, side]);
  useEffect(() => {
    if (priceTouched.current || review || pending || busyRef.current || amount || seedPrice == null) return;
    const value = Number(defaultOrderPrice(side, seedPrice));
    setMinPrice((side === 'buy' ? value * 0.999 : value).toFixed(8));
    setMaxPrice((side === 'buy' ? value : value * 1.001).toFixed(8));
  }, [seedPrice, side, review, pending, amount]);

  function choosePrice(value: number, next = side) {
    if (busyRef.current) return;
    setSide(next); setReview(null); setFormError('');
    setMinPrice((next === 'buy' ? value * 0.999 : value).toFixed(8));
    setMaxPrice((next === 'buy' ? value : value * 1.001).toFixed(8));
  }
  function changeSide(next: 'buy' | 'sell') {
    if (busyRef.current || pending) return;
    setAmount(''); priceTouched.current = false;
    choosePrice(Number(defaultOrderPrice(next, referencePrice(next))), next);
  }
  async function register(saved: Pending) {
    setStage('index');
    const minted = saved.tokenId ? { tokenId: saved.tokenId, txHash: saved.txHash } : await recoverMint(saved.input, saved.txHash);
    const ready = { ...saved, tokenId: minted.tokenId }; savePending(ready);
    const input = saved.input;
    const { error } = await readWithTimeout(Promise.resolve(withWalletHeader(supabase.from('dex_sell_positions').upsert({
      chain_id: input.chainId, token_id: minted.tokenId, owner_address: input.walletAddress, mint_tx_hash: minted.txHash,
      side: input.side, dhb_amount: input.side === 'sell' ? Number(input.amount) : null, usdc_amount: input.side === 'buy' ? Number(input.amount) : null,
      min_usdc_per_dhb: Number(input.minPrice), max_usdc_per_dhb: Number(input.maxPrice),
    }, { onConflict: 'chain_id,token_id', ignoreDuplicates: true }), input.walletAddress)), 'Listing registration');
    if (error) throw new Error('Your position is onchain. Retry registration below; this will not deposit again.');
    savePending(null); setAmount(''); setReview(null); setMine(true); setPage(0); setBalanceRevision((n) => n + 1);
    priceTouched.current = false;
    toast.success('Position created'); await loadPositions();
  }
  async function handleCreate() {
    if (busyRef.current || checking || withdrawing) return;
    if (!walletAddress) { await connect(); return; }
    if (!pending && !chainId) { setFormError(`No ${fundingToken} available to deposit.`); return; }
    setFormError(''); busyRef.current = true; setBusy(true); setStage('quote');
    try {
      if (pending) { await register(pending); return; }
      // parseUnits throws its own wording for too many decimals; keep one message for every bad amount.
      const toUnits = (value: string) => { try { return parseUnits(value, decimals); } catch { return null; } };
      const amountUnits = /^\d+(\.\d+)?$/.test(amount) ? toUnits(amount) : null;
      if (amountUnits == null || amountUnits <= 0n || amountUnits > (toUnits(balance) ?? 0n)) throw new Error(`Enter an amount within your available ${fundingToken} balance.`);
      const input: SellInput = { walletAddress, chainId: chainId!, side, amount, minPrice, maxPrice };
      if (!review) { setReview(await quoteSellPosition(input)); return; }
      if (walletLocked) { requestWalletUnlock(); return; }
      const minted = await mintSellPosition(input, setStage, (txHash) => savePending({ input, txHash }));
      await register({ input, ...minted });
    } catch (error) {
      if ((error as { code?: string }).code === 'DEX_REVERTED') { savePending(null); setReview(null); }
      const message = dexActionError(error, 'Could not prepare the position');
      setFormError(message); void logger.error('Position action failed', { chainId, side, path: '/dex', message });
    } finally { busyRef.current = false; setBusy(false); }
  }
  async function handleWithdraw(item: VerifiedPosition) {
    if (!walletAddress || busyRef.current || withdrawing) return;
    if (walletLocked) { requestWalletUnlock(); return; }
    if (!window.confirm(`Withdraw ${formatSize(item.amountDhb)} DHB and ${formatSize(item.amountUsdc)} USDC on ${DEX_CHAINS[item.chain_id as DexChainId].name}? Amounts refresh before signing; price tolerance is 0.5%.`)) return;
    setWithdrawing(`${item.chain_id}:${item.token_id}`);
    try { await withdrawSellPosition(item, walletAddress); toast.success('Position withdrawn'); await loadPositions(); setBalanceRevision((n) => n + 1); }
    catch (error) { toast.error(dexActionError(error, 'Withdrawal failed')); }
    finally { setWithdrawing(null); }
  }
  const refresh = () => { primeDiscovery(); void loadPositions(); if (!busy) setBalanceRevision((n) => n + 1); };

  return <div className="dex-terminal">
    <header className="dex-top">
      <div className="dex-pair" ref={poolMenuRef}>
        <img src={dhbCoinImage} alt="DHB" />
        <div className="dex-pair-picker">
          <button type="button" className="dex-pair-trigger" aria-expanded={poolMenuOpen} aria-haspopup="menu" onClick={() => setPoolMenuOpen((open) => !open)}>
            <span>DHB <span className="dex-muted">/</span> USDC</span><span className="dex-pair-chevron" aria-hidden="true">⌄</span>
          </button>
          <p>Combined market · Base + BNB</p>
          {poolMenuOpen && <div className="dex-pool-menu" role="menu" aria-label="DHB pools">
            <button type="button" role="menuitem" className="dex-pool-option dex-pool-active" onClick={() => setPoolMenuOpen(false)}>
              <span><strong>DHB / USDC</strong><small>DeHub DEX / Base + BNB</small></span><span>Current</span>
            </button>
            {EXTERNAL_POOLS.map((pool) => <a key={pool.pair} role="menuitem" className="dex-pool-option" href={pool.url} target="_blank" rel="noreferrer" onClick={() => setPoolMenuOpen(false)}>
              <span><strong>{pool.pair}</strong><small>{pool.venue}</small></span><ExternalLink size={14} aria-hidden="true" />
            </a>)}
          </div>}
        </div>
      </div>
      <div className="dex-stat"><small>Lowest sell · USDC</small><strong className="dex-reference">{bestAsk != null ? `${formatPrice(bestAsk)} USDC` : '—'}</strong></div>
      <div className="dex-stat"><small>24h change</small><strong className={(snapshot?.change24h || 0) >= 0 ? 'dex-buy' : 'dex-sell'}>{snapshot?.change24h != null ? `${snapshot.change24h >= 0 ? '+' : ''}${snapshot.change24h.toFixed(2)}%` : '—'}</strong></div>
      <div className="dex-stat"><small>Listed DHB</small><strong>{formatSize(totalDhb)}</strong></div>
      <div className="dex-stat"><small>Listed USDC</small><strong>{formatSize(totalUsdc)}</strong></div>
      <button className="dex-refresh" type="button" onClick={refresh} disabled={loading || busy} aria-label="Refresh market"><RefreshCw size={14} />{loading ? 'Updating' : 'Refresh'}</button>
    </header>
    {listError && <div role="alert" className="dex-alert">{listError}<button onClick={() => void loadPositions()}>Retry</button></div>}
    <div className="dex-mobile-tabs" role="tablist" aria-label="Trading panels">{(['chart', 'book', 'trade'] as const).map((view) => <button key={view} role="tab" aria-selected={mobileView === view} onClick={() => setMobileView(view)}>{view === 'chart' ? 'Chart' : view === 'book' ? 'Order book' : 'Buy / Sell'}</button>)}</div>
    <div className="dex-workspace">
      <section className={`dex-panel dex-chart-panel dex-pane ${mobileView === 'chart' ? 'dex-pane-active' : ''}`}>
        <div className="dex-panel-head"><div className="dex-tabs" role="tablist" aria-label="Chart type"><button role="tab" aria-selected={!depth} onClick={() => setDepth(false)}>Price</button><button role="tab" aria-selected={depth} onClick={() => setDepth(true)}>Depth</button></div>{!depth && <div className="dex-tabs" role="tablist" aria-label="Chart timeframe">{CANDLE_INTERVALS.map((value) => <button role="tab" key={value} aria-selected={period === value} onClick={() => setPeriod(value)}>{value}</button>)}</div>}</div>
        {!depth && loading && !updated ? <div className="dex-chart-empty" role="status">Loading sell positions…</div> : <MarketChart candles={candles} bids={bids} asks={asks} depth={depth} />}
        <div className="dex-transactions"><div className="dex-transactions-head"><span>Latest transactions</span><span>Time</span></div>{transactions.length ? transactions.map((item) => <a key={`${item.chain_id}:${item.token_id}`} className="dex-transaction" href={`${DEX_CHAINS[item.chain_id as DexChainId].explorer}/tx/${item.mint_tx_hash}`} target="_blank" rel="noreferrer"><span className={item.side === 'buy' ? 'dex-buy' : 'dex-sell'}>{item.side === 'buy' ? 'Buy' : 'Sell'} <b>{listingSize(item)}</b><small>{formatPrice(listingPrice(item))} USDC · {DEX_CHAINS[item.chain_id as DexChainId].name}</small></span><time dateTime={item.created_at}>{formatWhen(item.created_at)}</time></a>) : <div className="dex-transactions-empty">No transactions yet.</div>}</div>
      </section>
      <section className={`dex-panel dex-book-panel dex-pane ${mobileView === 'book' ? 'dex-pane-active' : ''}`}>
        <div className="dex-panel-head"><h2>Order book</h2><select aria-label="Price grouping" className="dex-book-select" value={increment} onChange={(e) => setIncrement(Number(e.target.value))}>{BOOK_INCREMENTS.map((step) => <option key={step} value={step}>{formatIncrement(step)}</option>)}</select></div>
        <div className="dex-book-head"><span>Price (USDC)</span><span>Size (DHB)</span><span>Total (DHB)</span></div>
        <BookRows levels={asks} bid={false} increment={increment} disabled={busy || !!pending} onPrice={(value) => { priceTouched.current = true; choosePrice(value, 'sell'); setMobileView('trade'); }} />
        <div className="dex-spread"><ArrowDownUp size={13} /><b>{spread == null ? '—' : formatBookPrice(Math.abs(spread), increment)}</b><span>{spread != null && spread < 0 ? 'Pool price overlap' : 'Spread · USDC'}{spreadShare != null && ` · ${spreadShare.toFixed(2)}%`}</span></div>
        <BookRows levels={bids} bid increment={increment} disabled={busy || !!pending} onPrice={(value) => { priceTouched.current = true; choosePrice(value, 'buy'); setMobileView('trade'); }} />
        <div className="dex-ratio"><i style={{ width: `${bidTotal + askTotal ? bidTotal / (bidTotal + askTotal) * 100 : 50}%` }} /></div>
        <div className="dex-book-total"><span className="dex-buy">Buy {formatSize(bidTotal)} DHB</span><span className="dex-sell">Sell {formatSize(askTotal)} DHB</span></div>
      </section>
      <section className={`dex-panel dex-ticket-panel dex-pane ${mobileView === 'trade' ? 'dex-pane-active' : ''}`}>
        <div className="dex-panel-head"><h2>Place an order</h2><span className="dex-muted">0% LP fee</span></div>
        <div className="dex-ticket"><fieldset disabled={busy || !!pending || !!withdrawing}>
          <div className="dex-side">{(['buy', 'sell'] as const).map((value) => <button type="button" key={value} className={side === value ? `active-${value}` : ''} onClick={() => changeSide(value)}>{value === 'buy' ? 'Buy DHB' : 'Sell DHB'}</button>)}</div>
          <label className="dex-field">{side === 'buy' ? 'Maximum buy price' : 'Minimum sell price'}<div className="dex-input"><input aria-label={side === 'buy' ? 'Maximum buy price' : 'Minimum sell price'} inputMode="decimal" value={side === 'buy' ? maxPrice : minPrice} onChange={(e) => { const raw = decimalInput(e.target.value); const value = Number(raw); setReview(null); priceTouched.current = true; if (side === 'buy') { setMaxPrice(raw); if (value > 0) setMinPrice((value * 0.999).toFixed(8)); } else { setMinPrice(raw); if (value > 0) setMaxPrice((value * 1.001).toFixed(8)); } }} /><span>USDC</span></div></label>
          <label className="dex-field">{side === 'buy' ? 'Spend' : 'Sell amount'}<div className="dex-input"><input aria-label={`${fundingToken} amount`} inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => { setAmount(decimalInput(e.target.value)); setReview(null); }} /><span>{fundingToken}</span></div></label>
          <div className="dex-available"><span>Available</span><span>{checking ? 'Checking…' : `${formatSize(Number(balance))} ${fundingToken}`}</span></div>
          <div className="dex-fractions">{[25, 50, 75, 100].map((percent) => <button key={percent} type="button" disabled={checking || !chainId} onClick={() => { setAmount(balanceFraction(balance, percent, decimals)); setReview(null); }}>{percent === 100 ? 'MAX' : `${percent}%`}</button>)}</div>
          <details className="dex-advanced"><summary>Adjust fill range</summary><p className="dex-help">A narrow range keeps the fill close to your chosen price.</p>{[{ label: 'Lower price', value: minPrice, set: setMinPrice }, { label: 'Upper price', value: maxPrice, set: setMaxPrice }].map((field) => <label className="dex-field" key={field.label}>{field.label}<div className="dex-input"><input aria-label={field.label} inputMode="decimal" value={field.value} onChange={(e) => { field.set(decimalInput(e.target.value)); priceTouched.current = true; setReview(null); }} /><span>USDC</span></div></label>)}</details>
          <dl><dt>Estimated full conversion</dt><dd>{formatSize(estimate)} {side === 'buy' ? 'DHB' : 'USDC'}</dd><dt>Funding network</dt><dd>{chainId ? DEX_CHAINS[chainId].name : 'Automatic'}</dd><dt>LP fee</dt><dd>0%</dd></dl>
        </fieldset>
        {balanceError && <div className="dex-alert">{balanceError}<button onClick={() => setBalanceRevision((n) => n + 1)} disabled={busy}>Retry</button></div>}
        {review && !pending && <div className="dex-review"><strong>Review your {side}</strong><br />Deposit {amount} {fundingToken} on {DEX_CHAINS[review.chainId].name}.<br />Range: {formatPrice(Number(minPrice))} – {formatPrice(Number(maxPrice))} USDC per DHB.{review.willCreatePool && <><br />This creates and initializes the 0% pool.</>}</div>}
        {pending && <div className="dex-review">Your transaction has been submitted. Resume confirmation or listing registration without another deposit. <a href={`${DEX_CHAINS[pending.input.chainId].explorer}/tx/${pending.txHash}`} target="_blank" rel="noreferrer">View transaction ↗</a></div>}
        {formError && <div role="alert" className="dex-alert dex-error">{formError}</div>}
        <button type="button" className={`dex-submit ${side === 'sell' ? 'sell' : ''}`} disabled={busy || checking || !!withdrawing || (!!walletAddress && !chainId && !pending)} onClick={() => void handleCreate()}>{busy ? (isSmartWalletSession() && smartStageText[stage] || stageText[stage]) : !walletAddress ? 'Connect wallet' : pending ? 'Resume listing' : review && walletLocked ? 'Unlock wallet' : review ? `Confirm ${side}` : `Review ${side}`}</button>
        <p className="dex-help">Network gas applies. Range orders convert as swaps cross your price range. Converted tokens can change back if price reverses; withdraw to complete your trade.</p>
        </div>
      </section>
    </div>
    <section className="dex-positions"><div className="dex-panel-head"><div role="tablist" aria-label="Position ownership" className="dex-tabs"><button role="tab" aria-selected={!mine} onClick={() => { setMine(false); setPage(0); }}>All positions <span className="dex-muted">{positions.length}</span></button><button role="tab" aria-selected={mine} onClick={() => { setMine(true); setPage(0); }}>My positions</button></div><span className="dex-muted">Base + BNB</span></div>
      {!shown.length ? <div className="dex-empty">{loading ? 'Verifying onchain positions…' : mine ? 'Your positions will appear here after your first order.' : 'No verified positions yet. Be the first to add liquidity.'}</div> : <div className="dex-table-scroll"><table className="dex-table"><thead><tr><th>Position</th><th>Price range · USDC</th><th>Current holdings</th><th>State</th><th>Network</th><th /></tr></thead><tbody>{visiblePositions.map((item) => { const fill = fillFraction(item) * 100; return <tr key={`${item.chain_id}:${item.token_id}`}><td className={item.side === 'buy' ? 'dex-buy' : 'dex-sell'}>{item.side === 'buy' ? 'Buy' : 'Sell'} DHB<small>#{item.token_id}</small></td><td>{formatPrice(item.minPrice)} – {formatPrice(item.maxPrice)}<small>{item.poolFee / 10000}% LP fee</small></td><td>{formatSize(item.amountDhb)} DHB<small>{formatSize(item.amountUsdc)} USDC</small></td><td>{item.status === 'Filled' ? 'Ready to withdraw' : item.status === 'In range' ? <>Converting <span className="dex-muted">{fill < 1 ? '<1' : Math.round(fill)}%</span><i className="dex-fill" style={{ '--fill': `${fill}%` } as CSSProperties} /></> : 'Waiting'}<small>{item.owner.slice(0, 6)}…{item.owner.slice(-4)}</small></td><td>{DEX_CHAINS[item.chain_id as DexChainId].name}</td><td>{walletAddress?.toLowerCase() === item.owner.toLowerCase() ? <button disabled={busy || !!withdrawing} onClick={() => void handleWithdraw(item)}>{withdrawing === `${item.chain_id}:${item.token_id}` ? 'Withdrawing…' : 'Withdraw'}</button> : <a href={`${DEX_CHAINS[item.chain_id as DexChainId].explorer}/tx/${item.mint_tx_hash}`} target="_blank" rel="noreferrer" aria-label={`View position ${item.token_id} transaction`}><ExternalLink size={14} /></a>}</td></tr>; })}</tbody></table></div>}
      {shown.length > PAGE_SIZE && <div className="dex-pagination"><button disabled={!page} onClick={() => setPage((n) => n - 1)}>Previous</button><span>{page + 1} / {Math.ceil(shown.length / PAGE_SIZE)}</span><button disabled={(page + 1) * PAGE_SIZE >= shown.length} onClick={() => setPage((n) => n + 1)}>Next</button></div>}
    </section>
  </div>;
}
