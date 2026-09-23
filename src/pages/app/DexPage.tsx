import { dexActionError } from '@/lib/dex/action-error';
import { minuteCache, parseSharedMarket, CANDLE_INTERVALS, type SharedMarket, type CandleInterval } from '@/lib/dex/live-market';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowDownUp, ExternalLink, RefreshCw } from 'lucide-react';
import { formatUnits, parseUnits } from 'ethers';
import { toast } from 'sonner';
import { useWalletLocked } from '@/hooks/use-wallet-locked';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { withWalletHeader } from '@/lib/supabase-wallet-client';
import { BASE_CHAIN_ID, BNB_CHAIN_ID } from '@/lib/contracts/dhb-token';
import { BOOK_INCREMENTS, DEFAULT_INCREMENT, aggregateBook, balanceFraction, defaultOrderPrice, displayBookLevels, fillFraction, formatBookPrice, formatIncrement, formatPrice, formatSize, priceDeviation, priceNeedsWarning, seedReference, spreadPercent, type BookLevel } from '@/lib/dex/orderbook';
import { DEX_CHAINS, type DexChainId, type VerifiedPosition } from '@/lib/dex/v4';
import { detectDhbChain, detectUsdcChain, mintSellPosition, quoteSellPosition, recoverMint, withdrawSellPosition, type SellInput, type SellQuote } from '@/lib/dex/sell';
import { readWithTimeout } from '@/lib/dex/read-timeout';
import { FUNDING_CHAIN, defaultFundingAsset, fundAndMint, fundingAssets, quoteFunding, usdcAmountFor, type FundingAsset, type FundingQuote, type FundingStage, type FundingSymbol } from '@/lib/dex/funding';
import { useAllChainsTokens } from '@/hooks/use-wallet-tokens';
import { useTokenPrices } from '@/hooks/use-token-prices';
import { isSmartWalletSession } from '@/lib/connection-source';
import { createLogger } from '@/lib/logger';
import { MarketChart } from '@/components/app/dex/MarketChart';
import { SEOHead } from '@/components/SEOHead';
import { CrossChainDepositDrawer } from '@/components/app/command-centre/CrossChainDepositDrawer';
import { PoolPicker } from '@/components/app/dex/PoolPicker';
import { InstantDhbTrade } from '@/components/app/dex/InstantDhbTrade';
import '@/components/app/dex/exchange.css';

const logger = createLogger('Dex');
const PAGE_SIZE = 15;
/** Base is the only book. The BNB pool takes no new liquidity; positions already in it can
 *  still be withdrawn by their owners from My positions. */
const venue: DexChainId = BASE_CHAIN_ID;
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
/** A submitted order. `txHash` is the mint; a funded order may have swapped but not yet minted. */
type Pending = { input: SellInput; txHash?: string; tokenId?: string; funding?: { symbol: FundingSymbol; swapTxHash?: string } };
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
  const { t } = useTranslation();
  const scroller = useRef<HTMLDivElement>(null);
  // Asks list away from the spread, so the best ask sits at the bottom. Keep it in view
  // until the reader scrolls up to inspect farther levels, and stay there across refreshes.
  const pinned = useRef(true);
  useLayoutEffect(() => {
    const element = scroller.current;
    if (element && !bid && pinned.current) element.scrollTop = element.scrollHeight;
  }, [levels, bid, increment]);
  const total = levels.at(-1)?.cumulativeDhb || 1;
  if (!levels.length) return <div className="dex-book-empty">{t(bid ? 'dex.noBids' : 'dex.noAsks')}</div>;
  return <div className="dex-book-scroll" ref={scroller} onScroll={(event) => {
    if (bid) return;
    const element = event.currentTarget;
    pinned.current = element.scrollHeight - element.scrollTop - element.clientHeight < 4;
  }}>{displayBookLevels(levels, bid).map((level) => <button type="button" disabled={disabled} key={level.price}
    className={`dex-book-row ${bid ? 'dex-buy' : 'dex-sell'}`} style={{ '--depth': `${level.cumulativeDhb / total * 100}%` } as CSSProperties}
    aria-label={t(bid ? 'dex.useBuyPrice' : 'dex.useSellPrice', { price: formatBookPrice(level.price, increment) })} onClick={() => onPrice(level.price)}>
    <span>{formatBookPrice(level.price, increment)}</span><span>{formatSize(level.dhb)}</span><span>{formatSize(level.cumulativeDhb)}</span>
  </button>)}</div>;
}

export default function DexPage() {
  const { t } = useTranslation();
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
  const [stage, setStage] = useState<FundingStage | 'index'>('quote');
  const [fundingSymbol, setFundingSymbol] = useState<FundingSymbol | null>(null);
  const [fundingQuote, setFundingQuote] = useState<FundingQuote | null>(null);
  const queryClient = useQueryClient();
  const { allTokens } = useAllChainsTokens();
  const { data: prices = {} } = useTokenPrices();
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
  const [convertOpen, setConvertOpen] = useState(false);
  const [increment, setIncrement] = useState<number>(DEFAULT_INCREMENT);
  const [mobileView, setMobileView] = useState<'chart' | 'book' | 'trade'>('chart');
  const loadLock = useRef(false);
  const hasSnapshot = useRef(false);
  const [balanceRevision, setBalanceRevision] = useState(0);
  const fundingToken = side === 'buy' ? 'USDC' : 'DHB';
  const venueName = DEX_CHAINS[venue].name;
  // A buy is priced in dollars and can be paid from any Base asset with a USDC route. Sells
  // deposit DHB directly.
  const funded = side === 'buy' && venue === FUNDING_CHAIN;
  // BNB cannot fund a Base order directly, so a holder is offered the conversion to ETH on Base.
  const bnbHeld = useMemo(() => allTokens.some((token) => token.chainId === BNB_CHAIN_ID && token.isNative && token.balance > 0n), [allTokens]);
  const assets = useMemo(() => funded ? fundingAssets(allTokens, prices) : [], [funded, allTokens, prices]);
  const fundingAsset: FundingAsset | null = useMemo(() => {
    if (!funded) return null;
    return assets.find((a) => a.symbol === fundingSymbol) ?? defaultFundingAsset(assets, Number(amount) || 0);
  }, [funded, assets, fundingSymbol, amount]);
  const stageText: Record<FundingStage | 'index', string> = {
    swap: t('dex.stage.swap'), swapConfirm: t('dex.stage.swapConfirm'),
    quote: t('dex.stage.quote'), wallet: t('dex.stage.wallet'), balance: t('dex.stage.balance'),
    tokenApproval: t('dex.stage.tokenApproval'), permitApproval: t('dex.stage.permitApproval'),
    submit: t('dex.stage.submit'), confirm: t('dex.stage.confirm'), index: t('dex.stage.index'),
  };
  const smartStageText: Partial<Record<FundingStage | 'index', string>> = {
    swap: t('dex.automaticStage.swap'),
    tokenApproval: t('dex.automaticStage.tokenApproval'), permitApproval: t('dex.automaticStage.permitApproval'),
    submit: t('dex.automaticStage.submit'),
  };
  const venuePositions = useMemo(() => positions.filter((p) => p.chain_id === venue), [positions]);
  // Old BNB positions stay withdrawable, so their owners still see them under My positions.
  const legacyMine = useMemo(() => positions.filter((p) => p.chain_id === BNB_CHAIN_ID && p.owner.toLowerCase() === walletAddress?.toLowerCase()).sort(byNewest), [positions, walletAddress]);
  const ordered = useMemo(() => [...venuePositions].sort(byNewest), [venuePositions]);
  const transactions = useMemo(() => ordered.slice(0, 8), [ordered]);

  useEffect(() => {
    setReview(null); setChainId(null); setBalance('0'); setBalanceError('');
    if (!walletAddress) { setChecking(false); return; }
    let live = true; setChecking(true);
    if (funded) {
      // Balances come from the wallet's own token reads; only the dollar figure is decided here.
      setChecking(false);
      return;
    }
    (side === 'sell' ? detectDhbChain : detectUsdcChain)(walletAddress).then((choice) => {
      if (!live) return;
      // Only a Base balance is spendable here.
      setChainId(Number(choice.base) > 0 ? venue : null); setBalance(choice.base);
    }).catch(() => { if (live) setBalanceError(t('dex.balanceError')); })
      .finally(() => { if (live) setChecking(false); });
    return () => { live = false; };
  }, [walletAddress, side, funded, balanceRevision, t]);
  useEffect(() => {
    if (!funded) return;
    setChainId(fundingAsset && fundingAsset.balance > 0n ? FUNDING_CHAIN : null);
    setBalance(fundingAsset ? fundingAsset.spendableUsd.toFixed(2) : '0');
  }, [funded, fundingAsset]);
  useEffect(() => {
    if (balanceRevision > 0) void queryClient.invalidateQueries({ queryKey: ['wallet-tokens'] });
  }, [balanceRevision, queryClient]);

  useEffect(() => {
    setPending(null);
    if (!walletAddress) return;
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey(walletAddress)) || 'null') as Pending | null;
      if (saved && saved.input?.walletAddress?.toLowerCase() === walletAddress.toLowerCase() &&
          [BASE_CHAIN_ID, BNB_CHAIN_ID].includes(saved.input.chainId) &&
          (/^0x[0-9a-f]{64}$/i.test(saved.txHash ?? '') || /^0x[0-9a-f]{64}$/i.test(saved.funding?.swapTxHash ?? ''))) {
        setPending(saved);
      }
    } catch { /* A storage failure does not change onchain ownership. */ }
  }, [walletAddress]);

  const savePending = (value: Pending | null) => {
    setPending(value);
    const owner = value?.input.walletAddress || walletAddress;
    if (!owner) return;
    try { if (value) localStorage.setItem(storageKey(owner), JSON.stringify(value)); else localStorage.removeItem(storageKey(owner)); }
    catch { toast.error(t('dex.keepOpen')); }
  };

  const loadPositions = useCallback(async () => {
    if (loadLock.current) return;
    loadLock.current = true;
    try {
      const next = await readSharedMarket();
      if (Date.now() / 1000 - next.observedAt > 180) {
        setListError(hasSnapshot.current ? '' : t('dex.snapshotDelayed'));
      } else setListError('');
      if (next.observedAt !== snapshotTime.current) {
        snapshotTime.current = next.observedAt;
        setSnapshot(next);
        setPositions(next.positions.map((position) => ({ ...position, liquidity: BigInt(position.liquidity) })));
        setUpdated(next.observedAt * 1000);
        hasSnapshot.current = true;
      }
    } catch { if (!hasSnapshot.current) setListError(t('dex.snapshotUnavailable')); }
    finally { setLoading(false); loadLock.current = false; }
  }, [t]);
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
  // The server announces each rebuilt snapshot, so the page follows the write instead of the
  // poll above, which stays as the fallback for a socket that drops.
  useEffect(() => {
    const channel = supabase.channel('dex-market-tick')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dex_market_tick' }, () => {
        readSharedMarket.invalidate();
        void loadPositions();
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [loadPositions]);


  const externalAsks = useMemo(() => snapshot?.externalAsks ?? [], [snapshot]);
  const { bids, asks } = useMemo(() => aggregateBook(venuePositions, increment, externalAsks),
    [venuePositions, increment, externalAsks]);
  const bestAsk = snapshot?.price ?? null;
  // Every DHB pool, weighted by its own dollar liquidity — not just this order book.
  const usdPrice = snapshot?.usdPrice ?? null;
  // Both sides of every pool: the dollar side plus the DHB side valued at the market price.
  const liquidityUsd = snapshot?.liquidityUsd != null
    ? snapshot.liquidityUsd + (snapshot.lpDhb != null && usdPrice != null ? snapshot.lpDhb * usdPrice : 0)
    : null;
  const shown = useMemo(() => mine ? [...ordered.filter((p) => p.owner.toLowerCase() === walletAddress?.toLowerCase()), ...legacyMine] : ordered, [ordered, mine, walletAddress, legacyMine]);
  const visiblePositions = shown.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  useEffect(() => { setPage((value) => Math.min(value, Math.max(0, Math.ceil(shown.length / PAGE_SIZE) - 1))); }, [shown.length]);
  const bidTotal = bids.at(-1)?.cumulativeDhb || 0, askTotal = asks.at(-1)?.cumulativeDhb || 0;
  const totalUsdc = venuePositions.reduce((sum, p) => sum + p.amountUsdc, 0);
  const totalDhb = venuePositions.reduce((sum, p) => sum + p.amountDhb, 0);
  // Pools can disagree: the 0.3% pool's ask floor sometimes sits under the 0% pool's bid ceiling,
  // so the book overlaps and the gap goes negative. That is not a spread, so the row stays blank.
  const gap = bids.length && asks.length ? asks[0].price - bids[0].price : null;
  const spread = gap != null && gap > 0 ? gap : null;
  const spreadShare = spread != null ? spreadPercent(bids[0].price, asks[0].price) : null;
  const decimals = side === 'sell' ? 18 : DEX_CHAINS[venue].usdcDecimals;
  const fundingLabel = fundingAsset && fundingAsset.symbol !== 'USDC' ? `USD · ${fundingAsset.symbol}` : fundingToken;
  const estimate = Number(amount) > 0 && Number(minPrice) > 0 && Number(maxPrice) > Number(minPrice)
    ? side === 'buy' ? Number(amount) / Math.sqrt(Number(minPrice) * Number(maxPrice)) : Number(amount) * Math.sqrt(Number(minPrice) * Number(maxPrice)) : 0;
  // Only the 0% pool counts: that is the one the ticket mints into, so a 0.3% position's spot
  // price must never seed it.
  const poolPrice = useMemo(() => {
    const live = venuePositions.find((p) => p.poolFee === 0 && Number.isFinite(p.marketPrice) && p.marketPrice > 0);
    return live?.marketPrice ?? null;
  }, [venuePositions]);
  // The venue's own pool can drift a long way from where DHB trades everywhere else. Anchor
  // the ticket on whichever of the two is safer for the trader, and never on the pool alone.
  const referencePrice = useCallback((next: 'buy' | 'sell') => seedReference(next, poolPrice, usdPrice) ?? bestAsk, [poolPrice, usdPrice, bestAsk]);
  const seedPrice = useMemo(() => referencePrice(side), [referencePrice, side]);
  useEffect(() => {
    if (priceTouched.current || review || pending || busyRef.current || amount || seedPrice == null) return;
    const value = Number(defaultOrderPrice(side, seedPrice));
    setMinPrice((side === 'buy' ? value * 0.999 : value).toFixed(8));
    setMaxPrice((side === 'buy' ? value : value * 1.001).toFixed(8));
  }, [seedPrice, side, review, pending, amount]);
  const ticketPrice = Number(side === 'buy' ? maxPrice : minPrice);
  const deviation = priceDeviation(ticketPrice, usdPrice);
  const priceWarning = priceNeedsWarning(side, ticketPrice, usdPrice) && deviation != null
    ? t(side === 'sell' ? 'dex.sellBelowMarket' : 'dex.buyAboveMarket', { percent: Math.abs(deviation * 100).toFixed(1), price: formatPrice(usdPrice) })
    : '';

  function choosePrice(value: number, next = side) {
    if (busyRef.current) return;
    setSide(next); setReview(null); setFundingQuote(null); setFormError('');
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
    if (!saved.txHash) throw new Error(t('dex.registrationFailed'));
    const minted = saved.tokenId ? { tokenId: saved.tokenId, txHash: saved.txHash } : await recoverMint(saved.input, saved.txHash);
    const ready = { ...saved, tokenId: minted.tokenId }; savePending(ready);
    const input = saved.input;
    const { error } = await readWithTimeout(Promise.resolve(withWalletHeader(supabase.from('dex_sell_positions').upsert({
      chain_id: input.chainId, token_id: minted.tokenId, owner_address: input.walletAddress, mint_tx_hash: minted.txHash,
      side: input.side, dhb_amount: input.side === 'sell' ? Number(input.amount) : null, usdc_amount: input.side === 'buy' ? Number(input.amount) : null,
      min_usdc_per_dhb: Number(input.minPrice), max_usdc_per_dhb: Number(input.maxPrice),
    }, { onConflict: 'chain_id,token_id', ignoreDuplicates: true }), input.walletAddress)), 'Listing registration');
    if (error) throw new Error(t('dex.registrationFailed'));
    savePending(null); setAmount(''); setReview(null); setFundingQuote(null); setMine(true); setPage(0); setBalanceRevision((n) => n + 1);
    priceTouched.current = false;
    toast.success(t('dex.created')); await loadPositions();
  }
  async function handleCreate() {
    if (busyRef.current || checking || withdrawing) return;
    if (!walletAddress) { await connect(); return; }
    if (!pending && !chainId) { setFormError(t('dex.noFunding', { token: fundingToken, chain: venueName })); return; }
    setFormError(''); busyRef.current = true; setBusy(true); setStage('quote');
    try {
      if (pending) {
        // A funded order that swapped but never minted resumes at the mint; a minted one registers.
        if (pending.funding && !pending.txHash) {
          const asset = assets.find((a) => a.symbol === pending.funding!.symbol);
          if (!asset) throw new Error(t('dex.resumeNeedsBalances'));
          const usdc = usdcAmountFor(pending.input.amount);
          if (!usdc) throw new Error(t('dex.checkAmount', { token: 'USD' }));
          const quote = await quoteFunding(asset, usdc.units);
          if (walletLocked) { requestWalletUnlock(); return; }
          const minted = await fundAndMint({ input: pending.input, quote }, {
            progress: setStage, resume: { swapTxHash: pending.funding.swapTxHash },
            submitted: (txHash) => savePending({ ...pending, txHash }),
          });
          await register({ ...pending, ...minted });
          return;
        }
        await register(pending); return;
      }
      // parseUnits throws its own wording for too many decimals; keep one message for every bad amount.
      const toUnits = (value: string) => { try { return parseUnits(value, decimals); } catch { return null; } };
      const amountUnits = /^d+(.d+)?$/.test(amount) ? toUnits(amount) : null;
      if (amountUnits == null || amountUnits <= 0n || amountUnits > (toUnits(balance) ?? 0n)) throw new Error(t('dex.checkAmount', { token: funded ? 'USD' : fundingToken }));
      const input: SellInput = { walletAddress, chainId: chainId!, side, amount, minPrice, maxPrice };
      if (funded && fundingAsset) {
        // Price the swap first: a route that cannot cover the order is a cheaper failure than a pool read.
        if (!review || !fundingQuote) {
          const quote = await quoteFunding(fundingAsset, amountUnits);
          setFundingQuote(quote);
          setReview(await quoteSellPosition(input));
          return;
        }
        if (walletLocked) { requestWalletUnlock(); return; }
        const funding = { symbol: fundingAsset.symbol };
        const minted = await fundAndMint({ input, quote: fundingQuote }, {
          progress: setStage,
          swapped: (swapTxHash) => savePending({ input, funding: { ...funding, swapTxHash } }),
          submitted: (txHash) => savePending({ input, txHash, funding }),
        });
        await register({ input, funding, ...minted });
        return;
      }
      if (!review) { setReview(await quoteSellPosition(input)); return; }
      if (walletLocked) { requestWalletUnlock(); return; }
      const minted = await mintSellPosition(input, setStage, (txHash) => savePending({ input, txHash }));
      await register({ input, ...minted });
    } catch (error) {
      if ((error as { code?: string }).code === 'DEX_REVERTED') { savePending(null); setReview(null); setFundingQuote(null); }
      const message = dexActionError(error, t('dex.prepareFailed'));
      setFormError(message); void logger.error('Position action failed', { chainId, side, path: '/dex', message });
    } finally { busyRef.current = false; setBusy(false); }
  }
  async function handleWithdraw(item: VerifiedPosition) {
    if (!walletAddress || busyRef.current || withdrawing) return;
    if (walletLocked) { requestWalletUnlock(); return; }
    if (!window.confirm(t('dex.withdrawReview', { dhb: formatSize(item.amountDhb), usdc: formatSize(item.amountUsdc), chain: DEX_CHAINS[item.chain_id as DexChainId].name }))) return;
    setWithdrawing(`${item.chain_id}:${item.token_id}`);
    try { await withdrawSellPosition(item, walletAddress); toast.success(t('dex.withdrawn')); await loadPositions(); setBalanceRevision((n) => n + 1); }
    catch (error) { toast.error(dexActionError(error, t('dex.withdrawFailed'))); }
    finally { setWithdrawing(null); }
  }
  const refresh = () => { primeDiscovery(); void loadPositions(); if (!busy) setBalanceRevision((n) => n + 1); };
  const submitLabel = busy ? (isSmartWalletSession() && smartStageText[stage] || stageText[stage])
    : !walletAddress ? t('dex.connectWallet')
    : pending ? t(pending.txHash ? 'dex.resume' : 'dex.resumeMint')
    : review && walletLocked ? t('dex.unlockWallet')
    : review ? t(side === 'buy' ? 'dex.confirmBuy' : 'dex.confirmSell')
    : t(side === 'buy' ? 'dex.reviewBuy' : 'dex.reviewSell');

  return <div className="dex-terminal">
    <SEOHead title={t('dex.seoTitle')} description={t('dex.seoDescription')} url="https://dehub.io/dex"
      jsonLd={{ '@context': 'https://schema.org', '@type': 'WebApplication', name: 'DeHub DEX', url: 'https://dehub.io/dex',
        applicationCategory: 'FinanceApplication', operatingSystem: 'Web', description: t('dex.seoDescription') }} />
    <header className="dex-top">
      <PoolPicker current={null} />
      <div className="dex-stat"><small>{t('dex.marketPrice')}</small><strong className="dex-reference">{usdPrice != null ? `$${formatPrice(usdPrice)}` : '—'}</strong></div>
      <div className="dex-stat"><small>{t('dex.bookPrice', { chain: venueName })}</small><strong>{poolPrice != null ? `$${formatPrice(poolPrice)}` : '—'}</strong></div>
      <div className="dex-stat"><small>{t('dex.change24')}</small><strong className={(snapshot?.change24h || 0) >= 0 ? 'dex-buy' : 'dex-sell'}>{snapshot?.change24h != null ? `${snapshot.change24h >= 0 ? '+' : ''}${snapshot.change24h.toFixed(2)}%` : '—'}</strong></div>
      <div className="dex-stat"><small>{t('dex.totalLiquidity')}</small><strong>{liquidityUsd != null ? `$${formatSize(liquidityUsd)}` : '—'}</strong></div>
      <div className="dex-stat"><small>{t('dex.listedDhb', { chain: venueName })}</small><strong>{formatSize(totalDhb)}</strong></div>
      <div className="dex-stat"><small>{t('dex.listedUsd', { chain: venueName })}</small><strong>{formatSize(totalUsdc)}</strong></div>
      <button className="dex-refresh" type="button" onClick={refresh} disabled={loading || busy} aria-label={t('dex.refreshMarket')}><RefreshCw size={14} />{loading ? t('dex.updating') : t('dex.refresh')}</button>
    </header>
    {listError && <div role="alert" className="dex-alert">{listError}<button onClick={() => void loadPositions()}>{t('dex.retry')}</button></div>}
    <div className="dex-mobile-tabs" role="tablist" aria-label={t('dex.tradingPanels')}>{(['chart', 'book', 'trade'] as const).map((view) => <button key={view} role="tab" aria-selected={mobileView === view} onClick={() => setMobileView(view)}>{t(`dex.tab.${view}`)}</button>)}</div>
    <div className="dex-workspace">
      <section className={`dex-panel dex-chart-panel dex-pane ${mobileView === 'chart' ? 'dex-pane-active' : ''}`}>
        <div className="dex-panel-head"><div className="dex-tabs" role="tablist" aria-label={t('dex.chartType')}><button role="tab" aria-selected={!depth} onClick={() => setDepth(false)}>{t('dex.price')}</button><button role="tab" aria-selected={depth} onClick={() => setDepth(true)}>{t('dex.depth')}</button></div>{!depth && <div className="dex-tabs" role="tablist" aria-label={t('dex.chartTimeframe')}>{CANDLE_INTERVALS.map((value) => <button role="tab" key={value} aria-selected={period === value} onClick={() => setPeriod(value)}>{value}</button>)}</div>}</div>
        {!depth && loading && !updated ? <div className="dex-chart-empty" role="status">{t('dex.loadingMarket')}</div> : <MarketChart candles={candles} bids={bids} asks={asks} depth={depth} />}
        <div className="dex-transactions"><div className="dex-transactions-head"><span>{t('dex.latestTransactions')}</span><span>{t('dex.time')}</span></div>{transactions.length ? transactions.map((item) => <a key={`${item.chain_id}:${item.token_id}`} className="dex-transaction" href={`${DEX_CHAINS[item.chain_id as DexChainId].explorer}/tx/${item.mint_tx_hash}`} target="_blank" rel="noreferrer"><span className={item.side === 'buy' ? 'dex-buy' : 'dex-sell'}>{t(item.side === 'buy' ? 'dex.buyLabel' : 'dex.sellLabel')} <b>{listingSize(item)}</b><small>${formatPrice(listingPrice(item))} · {DEX_CHAINS[item.chain_id as DexChainId].name}</small></span><time dateTime={item.created_at}>{formatWhen(item.created_at)}</time></a>) : <div className="dex-transactions-empty">{t('dex.noTransactions')}</div>}</div>
      </section>
      <section className={`dex-panel dex-book-panel dex-pane ${mobileView === 'book' ? 'dex-pane-active' : ''}`}>
        <div className="dex-panel-head"><h2>{t('dex.orderBook')}</h2><select aria-label={t('dex.priceGrouping')} className="dex-book-select" value={increment} onChange={(e) => setIncrement(Number(e.target.value))}>{BOOK_INCREMENTS.map((step) => <option key={step} value={step}>{formatIncrement(step)}</option>)}</select></div>
        <div className="dex-book-head"><span>{t('dex.priceUsd')}</span><span>{t('dex.sizeDhb')}</span><span>{t('dex.totalDhb')}</span></div>
        <BookRows levels={asks} bid={false} increment={increment} disabled={busy || !!pending} onPrice={(value) => { priceTouched.current = true; choosePrice(value, 'sell'); setMobileView('trade'); }} />
        <div className="dex-spread"><ArrowDownUp size={13} /><b>{spread == null ? '—' : formatBookPrice(spread, increment)}</b><span>{t('dex.spread')}{spreadShare != null && ` · ${spreadShare.toFixed(2)}%`}</span></div>
        <BookRows levels={bids} bid increment={increment} disabled={busy || !!pending} onPrice={(value) => { priceTouched.current = true; choosePrice(value, 'buy'); setMobileView('trade'); }} />
        <div className="dex-ratio"><i style={{ width: `${bidTotal + askTotal ? bidTotal / (bidTotal + askTotal) * 100 : 50}%` }} /></div>
        <div className="dex-book-total"><span className="dex-buy">{t('dex.buyTotal', { amount: formatSize(bidTotal) })}</span><span className="dex-sell">{t('dex.sellTotal', { amount: formatSize(askTotal) })}</span></div>
      </section>
      <section className={`dex-panel dex-ticket-panel dex-pane ${mobileView === 'trade' ? 'dex-pane-active' : ''}`}>
        <div className="dex-panel-head"><h2>{t('dex.placeOrder')}</h2><span className="dex-muted">{t('dex.lpFee')}</span></div>
        <div className="dex-ticket"><InstantDhbTrade tokens={allTokens} onDone={() => setBalanceRevision((n) => n + 1)} /><fieldset disabled={busy || !!pending || !!withdrawing}>
          <div className="dex-side">{(['buy', 'sell'] as const).map((value) => <button type="button" key={value} className={side === value ? `active-${value}` : ''} onClick={() => changeSide(value)}>{t(value === 'buy' ? 'dex.buy' : 'dex.sell')}</button>)}</div>
          <label className="dex-field">{t(side === 'buy' ? 'dex.maxBuy' : 'dex.minSell')}<div className="dex-input"><input aria-label={t(side === 'buy' ? 'dex.maxBuy' : 'dex.minSell')} inputMode="decimal" value={side === 'buy' ? maxPrice : minPrice} onChange={(e) => { const raw = decimalInput(e.target.value); const value = Number(raw); setReview(null); priceTouched.current = true; if (side === 'buy') { setMaxPrice(raw); if (value > 0) setMinPrice((value * 0.999).toFixed(8)); } else { setMinPrice(raw); if (value > 0) setMaxPrice((value * 1.001).toFixed(8)); } }} /><span>USD</span></div></label>
          {priceWarning && <div role="status" className="dex-alert dex-warning">{priceWarning}<button type="button" onClick={() => { priceTouched.current = false; if (seedPrice != null) choosePrice(Number(defaultOrderPrice(side, seedPrice))); }}>{t('dex.useMarket')}</button></div>}
          {funded && <label className="dex-field">{t('dex.payWith')}<div className="dex-input"><select aria-label={t('dex.payWith')} className="dex-pay-select" value={fundingAsset?.symbol ?? ''} onChange={(e) => { setFundingSymbol(e.target.value as FundingSymbol); setReview(null); setFundingQuote(null); }}>{assets.map((asset) => <option key={asset.symbol} value={asset.symbol}>{asset.symbol} · ${asset.usd.toLocaleString('en-US', { maximumFractionDigits: 2 })}</option>)}{!assets.length && <option value="">{t('dex.noBaseFunds')}</option>}</select></div></label>}
          <label className="dex-field">{t(side === 'buy' ? (funded ? 'dex.spendUsd' : 'dex.spend') : 'dex.sellAmount')}<div className="dex-input"><input aria-label={t('dex.amountToken', { token: funded ? 'USD' : fundingToken })} inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => { setAmount(decimalInput(e.target.value)); setReview(null); setFundingQuote(null); }} /><span>{fundingLabel}</span></div></label>
          <div className="dex-available"><span>{t('dex.available')}</span><span>{checking ? t('dex.checking') : funded ? `${formatSize(Number(balance))}${fundingAsset && fundingAsset.symbol !== 'USDC' ? ` · ${fundingAsset.symbol}` : ''}` : `${formatSize(Number(balance))} ${fundingToken}`}</span></div>
          <div className="dex-fractions">{[25, 50, 75, 100].map((percent) => <button key={percent} type="button" disabled={checking || !chainId} onClick={() => { setAmount(balanceFraction(balance, percent, decimals)); setReview(null); setFundingQuote(null); }}>{percent === 100 ? t('dex.max') : `${percent}%`}</button>)}</div>
          <details className="dex-advanced"><summary>{t('dex.adjustRange')}</summary><p className="dex-help">{t('dex.rangeHint')}</p>{[{ label: t('dex.lowerPrice'), value: minPrice, set: setMinPrice }, { label: t('dex.upperPrice'), value: maxPrice, set: setMaxPrice }].map((field) => <label className="dex-field" key={field.label}>{field.label}<div className="dex-input"><input aria-label={field.label} inputMode="decimal" value={field.value} onChange={(e) => { field.set(decimalInput(e.target.value)); priceTouched.current = true; setReview(null); }} /><span>USD</span></div></label>)}</details>
          <dl><dt>{t('dex.estimated')}</dt><dd>{formatSize(estimate)} {side === 'buy' ? 'DHB' : 'USDC'}</dd><dt>{t('dex.network')}</dt><dd>{venueName}</dd><dt>{t('dex.lpFeeLabel')}</dt><dd>0%</dd></dl>
        </fieldset>
        {side === 'buy' && bnbHeld && !pending && <div role="status" className="dex-alert dex-warning">{t('dex.convertBnbNote')}<button type="button" disabled={busy} onClick={() => setConvertOpen(true)}>{t('dex.convertBnb')}</button></div>}
        {balanceError && <div className="dex-alert">{balanceError}<button onClick={() => setBalanceRevision((n) => n + 1)} disabled={busy}>{t('dex.retry')}</button></div>}
        {review && !pending && <div className="dex-review"><strong>{t(side === 'buy' ? 'dex.reviewYourBuy' : 'dex.reviewYourSell')}</strong><br />{fundingQuote && fundingQuote.asset.symbol !== 'USDC' ? <>{t('dex.reviewSwap', { amountIn: formatSize(Number(formatUnits(fundingQuote.amountIn, fundingQuote.asset.decimals))), symbol: fundingQuote.asset.symbol, usdc: amount })}<br /></> : null}{t('dex.reviewDeposit', { amount, token: fundingToken, chain: DEX_CHAINS[review.chainId].name })}<br />{t('dex.reviewRange', { min: formatPrice(Number(minPrice)), max: formatPrice(Number(maxPrice)) })}{priceWarning && <><br />{priceWarning}</>}{review.willCreatePool && <><br />{t('dex.initializes')}</>}</div>}
        {pending && <div className="dex-review">{pending.txHash ? t('dex.pendingNote') : t('dex.pendingSwapNote', { symbol: pending.funding?.symbol ?? '' })} <a href={`${DEX_CHAINS[pending.input.chainId].explorer}/tx/${pending.txHash ?? pending.funding?.swapTxHash}`} target="_blank" rel="noreferrer">{t('dex.viewTransaction')} ↗</a></div>}
        {formError && <div role="alert" className="dex-alert dex-error">{formError}</div>}
        <button type="button" className={`dex-submit ${side === 'sell' ? 'sell' : ''}`} disabled={busy || checking || !!withdrawing || (!!walletAddress && !chainId && !pending)} onClick={() => void handleCreate()}>{submitLabel}</button>
        <p className="dex-help">{t('dex.reversalNote')}</p>
        </div>
      </section>
    </div>
    <section className="dex-positions"><div className="dex-panel-head"><div role="tablist" aria-label={t('dex.positionOwnership')} className="dex-tabs"><button role="tab" aria-selected={!mine} onClick={() => { setMine(false); setPage(0); }}>{t('dex.allPositions')} <span className="dex-muted">{venuePositions.length}</span></button><button role="tab" aria-selected={mine} onClick={() => { setMine(true); setPage(0); }}>{t('dex.myPositions')}</button></div><span className="dex-muted">{venueName}</span></div>
      {!shown.length ? <div className="dex-empty">{loading ? t('dex.verifying') : mine ? t('dex.noMyPositions') : t('dex.noPositions', { chain: venueName })}</div> : <div className="dex-table-scroll"><table className="dex-table"><thead><tr><th>{t('dex.position')}</th><th>{t('dex.priceRange')}</th><th>{t('dex.currentHoldings')}</th><th>{t('dex.state')}</th><th>{t('dex.networkColumn')}</th><th /></tr></thead><tbody>{visiblePositions.map((item) => { const fill = fillFraction(item) * 100; return <tr key={`${item.chain_id}:${item.token_id}`}><td className={item.side === 'buy' ? 'dex-buy' : 'dex-sell'}>{t(item.side === 'buy' ? 'dex.buy' : 'dex.sell')}<small>#{item.token_id}</small></td><td>{formatPrice(item.minPrice)} – {formatPrice(item.maxPrice)}<small>{t('dex.lpFeeValue', { fee: item.poolFee / 10000 })}</small></td><td>{formatSize(item.amountDhb)} DHB<small>{formatSize(item.amountUsdc)} USDC</small></td><td>{item.status === 'Filled' ? t('dex.ready') : item.status === 'In range' ? <>{t('dex.converting')} <span className="dex-muted">{fill < 1 ? '<1' : Math.round(fill)}%</span><i className="dex-fill" style={{ '--fill': `${fill}%` } as CSSProperties} /></> : t('dex.waiting')}<small>{item.owner.slice(0, 6)}…{item.owner.slice(-4)}</small></td><td>{DEX_CHAINS[item.chain_id as DexChainId].name}</td><td>{walletAddress?.toLowerCase() === item.owner.toLowerCase() ? <button disabled={busy || !!withdrawing} onClick={() => void handleWithdraw(item)}>{withdrawing === `${item.chain_id}:${item.token_id}` ? t('dex.withdrawing') : t('dex.withdraw')}</button> : <a href={`${DEX_CHAINS[item.chain_id as DexChainId].explorer}/tx/${item.mint_tx_hash}`} target="_blank" rel="noreferrer" aria-label={t('dex.viewPosition', { id: item.token_id })}><ExternalLink size={14} /></a>}</td></tr>; })}</tbody></table></div>}
      {shown.length > PAGE_SIZE && <div className="dex-pagination"><button disabled={!page} onClick={() => setPage((n) => n - 1)}>{t('dex.previous')}</button><span>{page + 1} / {Math.ceil(shown.length / PAGE_SIZE)}</span><button disabled={(page + 1) * PAGE_SIZE >= shown.length} onClick={() => setPage((n) => n + 1)}>{t('dex.next')}</button></div>}
    </section>
    <CrossChainDepositDrawer open={convertOpen} onOpenChange={(open) => { setConvertOpen(open); if (!open) setBalanceRevision((n) => n + 1); }}
      destinationSymbol="ETH" initialAsset={{ chain: 'bsc', symbol: 'BNB' }} />
  </div>;
}
