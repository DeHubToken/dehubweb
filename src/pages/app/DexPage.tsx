import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { withWalletHeader } from '@/lib/supabase-wallet-client';
import { DEX_CHAINS, type DexChainId, type IndexedPosition, type VerifiedPosition, verifyPosition } from '@/lib/dex/v4';
import { detectDhbChain, mintSellPosition, quoteSellPosition, withdrawSellPosition, type SellQuote } from '@/lib/dex/sell';

const PAGE_SIZE = 20;

function price(value: number) {
  return `$${value.toLocaleString('en-US', { maximumFractionDigits: 8 })}`;
}

export default function DexPage() {
  const { walletAddress } = useAuth();
  const [searchParams] = useSearchParams();
  const [chainId, setChainId] = useState<DexChainId | null>(null);
  const [balance, setBalance] = useState('');
  const [amount, setAmount] = useState('');
  const [minPrice, setMinPrice] = useState('0.001');
  const [maxPrice, setMaxPrice] = useState('0.0011');
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [positions, setPositions] = useState<VerifiedPosition[]>([]);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [listError, setListError] = useState('');
  const [showCreate, setShowCreate] = useState(searchParams.get('create') === '1');
  const [review, setReview] = useState<SellQuote | null>(null);
  const [withdrawing, setWithdrawing] = useState<string | null>(null);

  useEffect(() => {
    if (!walletAddress) return;
    let live = true;
    setChecking(true);
    detectDhbChain(walletAddress).then((choice) => {
      if (!live) return;
      setChainId(choice.chainId);
      setBalance(choice.balance);
    }).catch(() => {
      if (live) toast.error('Could not read DHB balances');
    }).finally(() => { if (live) setChecking(false); });
    return () => { live = false; };
  }, [walletAddress]);

  const loadPositions = useCallback(async () => {
    setListError('');
    const { data, count, error } = await supabase.from('dex_sell_positions')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (error) {
      setListError('Listings are unavailable right now.');
      return;
    }
    setTotal(count ?? 0);
    const verified = await Promise.all((data as IndexedPosition[]).map(verifyPosition));
    setPositions(verified.filter((item): item is VerifiedPosition => item !== null));
  }, [page]);

  useEffect(() => { void loadPositions(); }, [loadPositions]);

  async function handleCreate() {
    if (!walletAddress || !chainId) {
      toast.error('Connect a wallet holding liquid DHB');
      return;
    }
    const quantity = Number(amount);
    const floor = Number(minPrice);
    const ceiling = Number(maxPrice);
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > Number(balance) ||
        !Number.isFinite(floor) || floor <= 0 || !Number.isFinite(ceiling) || ceiling <= floor) {
      toast.error('Check the DHB amount and price range');
      return;
    }
    setBusy(true);
    try {
      if (!review) {
        const quoted = await quoteSellPosition({ walletAddress, chainId, amount, minPrice, maxPrice });
        setReview(quoted);
        return;
      }
      const minted = await mintSellPosition({ walletAddress, chainId, amount, minPrice, maxPrice });
      const { error } = await withWalletHeader(supabase.from('dex_sell_positions').insert({
        chain_id: chainId,
        token_id: minted.tokenId,
        owner_address: walletAddress,
        mint_tx_hash: minted.txHash,
        dhb_amount: quantity,
        min_usdc_per_dhb: floor,
        max_usdc_per_dhb: ceiling,
      }), walletAddress);
      if (error) throw new Error(`Position minted but its listing could not be indexed: ${error.message}`);
      toast.success('Sell position created');
      setAmount('');
      setReview(null);
      setPage(0);
      await loadPositions();
    } catch (error) {
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
    <main className="mx-auto w-full max-w-5xl px-4 py-8 text-white">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">DeHub DEX</p>
          <h1 className="text-3xl font-semibold tracking-tight">DHB sell positions</h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-400">Offer DHB for USDC through a Uniswap v4 range position. A position sells only when trading moves through its range. You withdraw the USDC after it fills.</p>
        </div>
        <button type="button" onClick={() => setShowCreate((value) => !value)} className="rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-zinc-200">
          {showCreate ? 'Hide form' : 'Create sell position'}
        </button>
      </div>

      {showCreate && <section className="mb-10 rounded-2xl border border-white/10 bg-zinc-900/70 p-5">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">New DHB / USDC position</h2>
          <span className="text-xs text-zinc-400">Uniswap v4 · 0.30% fee · no hook</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="text-sm text-zinc-300">DHB amount
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
          <span>{checking ? 'Checking balances…' : chainId ? `${DEX_CHAINS[chainId].name} · ${Number(balance).toLocaleString()} liquid DHB` : 'No liquid DHB on Base or BNB Chain'}</span>
          {chainId && <span>Estimated return across range: {price(Number(amount || 0) * Number(minPrice || 0))}–{price(Number(amount || 0) * Number(maxPrice || 0))} USDC</span>}
        </div>
        <p className="mt-4 text-xs leading-5 text-zinc-500">The pool price determines whether a DHB-only position can be created. The exact range rounds to valid ticks. Your wallet will ask you to approve DHB and confirm the position; no transaction is sent until you confirm.</p>
        {review && <div className="mt-4 rounded-xl border border-white/15 p-4 text-sm text-zinc-200">Review: list {Number(amount).toLocaleString()} DHB on {DEX_CHAINS[review.chainId].name} for {minPrice}–{maxPrice} USDC per DHB. {review.willCreatePool ? 'This also initializes the pool. ' : ''}Your wallet will request DHB approvals and then create the position.</div>}
        <button type="button" disabled={busy || checking || !chainId} onClick={() => void handleCreate()} className="mt-5 rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-zinc-950 disabled:cursor-not-allowed disabled:opacity-40">
          {busy ? 'Preparing position…' : review ? 'Approve and create' : 'Review position'}
        </button>
      </section>}

      <section>
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <h2 className="text-xl font-semibold">All listings</h2>
          <span className="text-sm text-zinc-400">{total} indexed positions</span>
        </div>
        {listError && <p className="rounded-xl border border-red-400/20 bg-red-400/5 p-4 text-sm text-red-200">{listError}</p>}
        {!listError && positions.length === 0 && <p className="rounded-xl border border-white/10 p-6 text-sm text-zinc-400">No verified positions on this page yet.</p>}
        <div className="space-y-3">
          {positions.map((item) => <article key={`${item.chain_id}:${item.token_id}`} className="grid gap-3 rounded-xl border border-white/10 bg-zinc-900/50 p-4 sm:grid-cols-[1fr_auto]">
            <div>
              <div className="flex flex-wrap items-center gap-2"><strong>DHB / USDC</strong><span className="rounded-full bg-white/10 px-2 py-0.5 text-xs">{DEX_CHAINS[item.chain_id as DexChainId].name}</span><span className="rounded-full bg-white/10 px-2 py-0.5 text-xs">{item.status}</span></div>
              <p className="mt-2 text-sm text-zinc-300">{Number(item.dhb_amount).toLocaleString()} DHB listed · {price(item.minPrice)}–{price(item.maxPrice)} per DHB</p>
              <p className="mt-1 text-xs text-zinc-500">Position #{item.token_id} · {item.owner.slice(0, 6)}…{item.owner.slice(-4)}</p>
            </div>
            <div className="flex items-center gap-4 self-center">
              {walletAddress?.toLowerCase() === item.owner.toLowerCase() && <button type="button" disabled={!!withdrawing} onClick={() => void handleWithdraw(item)} className="rounded-lg border border-white/20 px-3 py-2 text-sm disabled:opacity-40">{withdrawing === `${item.chain_id}:${item.token_id}` ? 'Withdrawing…' : item.status === 'Filled' ? 'Withdraw USDC' : 'Withdraw position'}</button>}
              <a href={`${DEX_CHAINS[item.chain_id as DexChainId].explorer}/tx/${item.mint_tx_hash}`} target="_blank" rel="noopener noreferrer" className="text-sm text-zinc-300 underline underline-offset-4 hover:text-white">View on chain</a>
            </div>
          </article>)}
        </div>
        {total > PAGE_SIZE && <div className="mt-5 flex items-center justify-between text-sm">
          <button type="button" disabled={page === 0} onClick={() => setPage((value) => value - 1)} className="disabled:opacity-30">Previous</button>
          <span>Page {page + 1} of {Math.ceil(total / PAGE_SIZE)}</span>
          <button type="button" disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => setPage((value) => value + 1)} className="disabled:opacity-30">Next</button>
        </div>}
      </section>
    </main>
  );
}
