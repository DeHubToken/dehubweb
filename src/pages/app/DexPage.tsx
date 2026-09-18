import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { withWalletHeader } from '@/lib/supabase-wallet-client';
import { BASE_CHAIN_ID, BNB_CHAIN_ID } from '@/lib/contracts/dhb-token';
import { aggregateBook, type BookLevel } from '@/lib/dex/orderbook';
import { DEX_CHAINS, type DexChainId, type IndexedPosition, type VerifiedPosition, verifyPosition } from '@/lib/dex/v4';
import { detectDhbChain, detectUsdcChain, mintSellPosition, quoteSellPosition, withdrawSellPosition, type SellQuote } from '@/lib/dex/sell';
import { type OrderStage } from '@/lib/dex/read-timeout';
import { createLogger } from '@/lib/logger';

const logger = createLogger('Dex');
const stageText: Record<OrderStage, string> = {
  quote: 'Reading pool…', wallet: 'Unlock or connect your wallet…', balance: 'Checking token approvals…',
  tokenApproval: 'Confirm token approval in your wallet…', permitApproval: 'Confirm position approval in your wallet…',
  submit: 'Confirm position in your wallet…', confirm: 'Waiting for confirmation…',
};

const PAGE_SIZE = 20;

function price(value: number) {
  return `$${value.toLocaleString('en-US', { maximumFractionDigits: 8 })}`;
}

function formatAmount(value: number) {
  return value.toLocaleString('en-US', { maximumFractionDigits: 6 });
}

function DepthChart({ bids, asks }: { bids: BookLevel[]; asks: BookLevel[] }) {
  const all = [...bids, ...asks];
  if (!all.length) return <div className="flex h-44 items-center justify-center text-sm text-zinc-500">Depth appears when positions are listed.</div>;
  const min = Math.min(...all.map((level) => level.price));
  const max = Math.max(...all.map((level) => level.price));
  const span = Math.max(max - min, min * 0.02, 0.00000001);
  const maxDepth = Math.max(...all.map((level) => level.cumulativeDhb), 1);
  const points = (levels: BookLevel[]) => [...levels].sort((a, b) => a.price - b.price)
    .map((level) => `${((level.price - min) / span) * 600},${170 - (level.cumulativeDhb / maxDepth) * 150}`).join(' ');
  return <div aria-label="Order book depth in DHB by USDC price" role="img">
    <svg viewBox="0 0 600 180" className="h-48 w-full" preserveAspectRatio="none">
      <path d="M0 170 H600" stroke="#52525b" strokeWidth="1" />
      {bids.length > 0 && <polyline points={points(bids)} fill="none" stroke="#4ade80" strokeWidth="3" />}
      {asks.length > 0 && <polyline points={points(asks)} fill="none" stroke="#f87171" strokeWidth="3" />}
    </svg>
    <div className="flex justify-between text-xs text-zinc-500"><span>{price(min)}</span><span>Price (USDC per DHB)</span><span>{price(max)}</span></div>
  </div>;
}

export default function DexPage() {
  const { walletAddress } = useAuth();
  const [searchParams] = useSearchParams();
  const [side, setSide] = useState<'buy' | 'sell'>('sell');
  const [marketChain, setMarketChain] = useState<DexChainId>(BASE_CHAIN_ID);
  const [chainId, setChainId] = useState<DexChainId | null>(null);
  const [balance, setBalance] = useState('0');
  const [amount, setAmount] = useState('');
  const [minPrice, setMinPrice] = useState('0.001');
  const [maxPrice, setMaxPrice] = useState('0.0011');
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<OrderStage>('quote');
  const [checking, setChecking] = useState(false);
  const [positions, setPositions] = useState<VerifiedPosition[]>([]);
  const [page, setPage] = useState(0);
  const [listError, setListError] = useState('');
  const [showCreate, setShowCreate] = useState(searchParams.get('create') === '1');
  const [review, setReview] = useState<SellQuote | null>(null);
  const [withdrawing, setWithdrawing] = useState<string | null>(null);

  useEffect(() => {
    if (!walletAddress) { setChainId(null); setBalance('0'); return; }
    let live = true;
    setChainId(null); setBalance('0'); setReview(null);
    setChecking(true);
    (side === 'sell' ? detectDhbChain : detectUsdcChain)(walletAddress).then((choice) => {
      if (!live) return;
      setChainId(choice.chainId);
      setBalance(choice.balance);
    }).catch(() => {
      if (live) toast.error(`Could not read ${side === 'sell' ? 'DHB' : 'USDC'} balances`);
    }).finally(() => { if (live) setChecking(false); });
    return () => { live = false; };
  }, [walletAddress, side]);

  const loadPositions = useCallback(async () => {
    setListError('');
    const rows: IndexedPosition[] = [];
    for (let offset = 0; ; offset += 200) {
      const { data, error } = await supabase.from('dex_sell_positions').select('*')
        .order('created_at', { ascending: false }).range(offset, offset + 199);
      if (error) { setListError('Listings are unavailable right now.'); return; }
      rows.push(...(data as IndexedPosition[]));
      if (!data || data.length < 200) break;
    }
    const verified: VerifiedPosition[] = [];
    for (let offset = 0; offset < rows.length; offset += 20) {
      const batch = await Promise.all(rows.slice(offset, offset + 20).map(verifyPosition));
      verified.push(...batch.filter((item): item is VerifiedPosition => item !== null));
    }
    setPositions(verified);
  }, []);

  useEffect(() => { void loadPositions(); }, [loadPositions]);

  const marketPositions = useMemo(() => positions.filter((item) => item.chain_id === marketChain), [positions, marketChain]);
  const { bids, asks } = useMemo(() => aggregateBook(marketPositions), [marketPositions]);
  const visiblePositions = useMemo(() => marketPositions.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [marketPositions, page]);

  function changeSide(next: 'buy' | 'sell') {
    setSide(next); setReview(null); setAmount(''); setShowCreate(true);
    setMinPrice(next === 'buy' ? '0.0009' : '0.001');
    setMaxPrice(next === 'buy' ? '0.001' : '0.0011');
  }

  async function handleCreate() {
    if (busy || checking) return;
    if (!walletAddress || !chainId) {
      toast.error(`Connect a wallet holding liquid ${side === 'sell' ? 'DHB' : 'USDC'}`);
      return;
    }
    const quantity = Number(amount);
    const floor = Number(minPrice);
    const ceiling = Number(maxPrice);
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > Number(balance) ||
        !Number.isFinite(floor) || floor <= 0 || !Number.isFinite(ceiling) || ceiling <= floor) {
      toast.error('Check the amount and price range');
      return;
    }
    setBusy(true);
    setStage('quote');
    try {
      const input = { walletAddress, chainId, side, amount, minPrice, maxPrice };
      if (!review) {
        const quoted = await quoteSellPosition(input);
        setReview(quoted);
        return;
      }
      const minted = await mintSellPosition(input, setStage);
      const { error } = await withWalletHeader(supabase.from('dex_sell_positions').insert({
        chain_id: chainId,
        token_id: minted.tokenId,
        owner_address: walletAddress,
        mint_tx_hash: minted.txHash,
        side,
        dhb_amount: side === 'sell' ? quantity : null,
        usdc_amount: side === 'buy' ? quantity : null,
        min_usdc_per_dhb: floor,
        max_usdc_per_dhb: ceiling,
      }), walletAddress);
      if (error) throw new Error(`Position minted but its listing could not be indexed: ${error.message}`);
      toast.success(`${side === 'buy' ? 'Buy' : 'Sell'} position created`);
      setAmount('');
      setReview(null);
      setPage(0);
      setMarketChain(chainId);
      await loadPositions();
    } catch (error) {
      void logger.error('Position creation failed', { chainId, side, path: '/dex', message: error instanceof Error ? error.message : String(error) });
      toast.error(error instanceof Error ? error.message : 'Could not create the position');
    } finally {
      setBusy(false);
    }
  }

  async function handleWithdraw(item: VerifiedPosition) {
    if (!walletAddress) return;
    setWithdrawing(`${item.chain_id}:${item.token_id}`);
    try {
      await withdrawSellPosition(item, walletAddress);
      toast.success('Position withdrawn to your wallet');
      await loadPositions();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not withdraw position');
    } finally {
      setWithdrawing(null);
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 text-white">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">DHB / USDC</h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-400">Set your buy or sell price with a Uniswap v4 position. Orders fill as trading moves through their range.</p>
        </div>
        <button type="button" onClick={() => setShowCreate((value) => !value)} className="rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-zinc-200">
          {showCreate ? 'Hide form' : 'Place an order'}
        </button>
      </div>

      <div className="mb-6 flex gap-2">{([BASE_CHAIN_ID, BNB_CHAIN_ID] as DexChainId[]).map((id) =>
        <button key={id} type="button" onClick={() => { setMarketChain(id); setPage(0); }} className={`rounded-lg px-4 py-2 text-sm ${marketChain === id ? 'bg-white text-zinc-950' : 'border border-white/15 text-zinc-300'}`}>{DEX_CHAINS[id].name}</button>)}</div>

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          <section className="rounded-2xl border border-white/10 bg-zinc-900/50 p-5">
            <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-semibold">Market depth</h2><span className="text-xs text-zinc-400">Verified positions · DHB</span></div>
            <DepthChart bids={bids} asks={asks} />
            <div className="mt-3 flex gap-5 text-xs"><span className="text-green-400">● Bids · {formatAmount(bids.at(-1)?.cumulativeDhb ?? 0)} DHB</span><span className="text-red-400">● Asks · {formatAmount(asks.at(-1)?.cumulativeDhb ?? 0)} DHB</span></div>
          </section>
          <section className="rounded-2xl border border-white/10 bg-zinc-900/50 p-5">
            <h2 className="mb-4 text-lg font-semibold">Order book</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {([{ label: 'Bids · Buy', levels: bids, tint: 'text-green-400', fill: 'bg-green-500/10' }, { label: 'Asks · Sell', levels: asks, tint: 'text-red-400', fill: 'bg-red-500/10' }] as const).map((book) =>
                <div key={book.label}><h3 className={`mb-2 text-sm font-semibold ${book.tint}`}>{book.label}</h3>
                  <div className="mb-1 grid grid-cols-3 text-[11px] text-zinc-500"><span>Price</span><span className="text-right">DHB</span><span className="text-right">Total DHB</span></div>
                  {book.levels.length === 0 && <p className="py-5 text-sm text-zinc-500">No orders</p>}
                  {book.levels.map((level) => <div key={level.price} className={`grid grid-cols-3 rounded px-1 py-1.5 text-xs ${book.fill}`}><span className={book.tint}>{price(level.price)}</span><span className="text-right">{formatAmount(level.dhb)}</span><span className="text-right">{formatAmount(level.cumulativeDhb)}</span></div>)}
                </div>)}</div>
          </section>
        </div>

      {showCreate && <fieldset disabled={busy} className="h-fit min-w-0 rounded-2xl border border-white/10 bg-zinc-900/70 p-5">
        <div className="mb-4 flex rounded-xl bg-zinc-950 p-1">
          {(['buy', 'sell'] as const).map((value) => <button key={value} type="button" onClick={() => changeSide(value)} className={`flex-1 rounded-lg py-2 text-sm font-semibold ${side === value ? value === 'buy' ? 'bg-green-500 text-zinc-950' : 'bg-red-500 text-white' : 'text-zinc-400'}`}>{value === 'buy' ? 'Buy DHB' : 'Sell DHB'}</button>)}
        </div>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">{side === 'buy' ? 'Buy' : 'Sell'} DHB</h2>
          <span className="text-xs text-zinc-400">0% LP fee</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="text-sm text-zinc-300">{side === 'buy' ? 'USDC' : 'DHB'} amount
            <input type="number" min="0" step="any" value={amount} onChange={(event) => { setAmount(event.target.value); setReview(null); }} placeholder="0" className="mt-2 w-full rounded-xl border border-white/15 bg-zinc-950 px-3 py-2.5 text-white" />
          </label>
          <label className="text-sm text-zinc-300">Minimum USDC per DHB
            <input type="number" min="0" step="any" value={minPrice} onChange={(event) => { setMinPrice(event.target.value); setReview(null); }} className="mt-2 w-full rounded-xl border border-white/15 bg-zinc-950 px-3 py-2.5 text-white" />
          </label>
          <label className="text-sm text-zinc-300">Maximum USDC per DHB
            <input type="number" min="0" step="any" value={maxPrice} onChange={(event) => { setMaxPrice(event.target.value); setReview(null); }} className="mt-2 w-full rounded-xl border border-white/15 bg-zinc-950 px-3 py-2.5 text-white" />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-zinc-400">
          <span>{checking ? 'Checking balances…' : chainId ? `${DEX_CHAINS[chainId].name} · ${formatAmount(Number(balance))} ${side === 'buy' ? 'USDC' : 'DHB'} available` : `No ${side === 'buy' ? 'USDC' : 'DHB'} on Base or BNB Chain`}</span>
        </div>
        <p className="mt-4 text-xs leading-5 text-zinc-500">{side === 'buy' ? 'Deposit USDC only. Your maximum bid is the upper price; the position fills as DHB trades down through the range.' : 'Deposit DHB only. Your minimum ask is the lower price; the position fills as DHB trades up through the range.'} Network gas applies.</p>
        {review && <div className="mt-4 rounded-xl border border-white/15 p-4 text-sm text-zinc-200">Review: deposit {Number(amount).toLocaleString()} {side === 'buy' ? 'USDC' : 'DHB'} on {DEX_CHAINS[review.chainId].name} for {minPrice}–{maxPrice} USDC per DHB. {review.willCreatePool ? 'This also initializes the pool. ' : ''}Your wallet will request approvals and create the position.</div>}
        <button type="button" disabled={busy || checking || !chainId} onClick={() => void handleCreate()} className="mt-5 rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-zinc-950 disabled:cursor-not-allowed disabled:opacity-40">
          {busy ? stageText[stage] : review ? `Approve and ${side}` : `Review ${side}`}
        </button>
      </fieldset>}
      </div>

      <section>
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <h2 className="text-xl font-semibold">All listings</h2>
          <span className="text-sm text-zinc-400">{marketPositions.length} verified positions</span>
        </div>
        {listError && <p className="rounded-xl border border-red-400/20 bg-red-400/5 p-4 text-sm text-red-200">{listError}</p>}
        {!listError && marketPositions.length === 0 && <p className="rounded-xl border border-white/10 p-6 text-sm text-zinc-400">No verified positions on this chain yet.</p>}
        <div className="space-y-3">
          {visiblePositions.map((item) => <article key={`${item.chain_id}:${item.token_id}`} className="grid gap-3 rounded-xl border border-white/10 bg-zinc-900/50 p-4 sm:grid-cols-[1fr_auto]">
            <div>
              <div className="flex flex-wrap items-center gap-2"><strong className={item.side === 'buy' ? 'text-green-400' : 'text-red-400'}>{item.side === 'buy' ? 'Buy' : 'Sell'} DHB</strong><span className="rounded-full bg-white/10 px-2 py-0.5 text-xs">{DEX_CHAINS[item.chain_id as DexChainId].name}</span><span className="rounded-full bg-white/10 px-2 py-0.5 text-xs">{item.status}</span></div>
              <p className="mt-2 text-sm text-zinc-300">{formatAmount(item.amountDhb)} DHB · {formatAmount(item.amountUsdc)} USDC in position · {price(item.minPrice)}–{price(item.maxPrice)} per DHB</p>
              <p className="mt-1 text-xs text-zinc-500">Position #{item.token_id} · {item.owner.slice(0, 6)}…{item.owner.slice(-4)}</p>
            </div>
            <div className="flex items-center gap-4 self-center">
              {walletAddress?.toLowerCase() === item.owner.toLowerCase() && <button type="button" disabled={!!withdrawing} onClick={() => void handleWithdraw(item)} className="rounded-lg border border-white/20 px-3 py-2 text-sm disabled:opacity-40">{withdrawing === `${item.chain_id}:${item.token_id}` ? 'Withdrawing…' : 'Withdraw position'}</button>}
              <a href={`${DEX_CHAINS[item.chain_id as DexChainId].explorer}/tx/${item.mint_tx_hash}`} target="_blank" rel="noopener noreferrer" className="text-sm text-zinc-300 underline underline-offset-4 hover:text-white">View on chain</a>
            </div>
          </article>)}
        </div>
        {marketPositions.length > PAGE_SIZE && <div className="mt-5 flex items-center justify-between text-sm">
          <button type="button" disabled={page === 0} onClick={() => setPage((value) => value - 1)} className="disabled:opacity-30">Previous</button>
          <span>Page {page + 1} of {Math.ceil(marketPositions.length / PAGE_SIZE)}</span>
          <button type="button" disabled={(page + 1) * PAGE_SIZE >= marketPositions.length} onClick={() => setPage((value) => value + 1)} className="disabled:opacity-30">Next</button>
        </div>}
      </section>
    </main>
  );
}
