/**
 * PPV Top-Up Step
 * ===============
 * What the PPV sheet turns into when the wallet is short of DHB.
 *
 * The old behaviour was a toast — "Insufficient DHB… acquire DHB manually" —
 * fired at someone who had already decided to buy, on a sheet that then just
 * sat there. This keeps them exactly where they are: it works out the cheapest
 * way to buy the missing DHB out of what they already hold on Base, does it in
 * one tap, and hands straight back to the unlock. No wallet page, no buy page,
 * no second decision.
 *
 * Bundle note: this renders inside eager feed cards, so nothing here may
 * statically import the wallet stack. Every contract module is pulled in on
 * mount of the step itself, which only ever mounts once a payment has already
 * been attempted (scripts/check-entry-bundle.mjs fails the build otherwise).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowRight, CreditCard, Loader2, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BASE_CHAIN_ID, getChainConfig, toWei } from '@/lib/contracts/dhb-token';
import dehubCoin from '@/assets/dehub-coin.png';
import type { PPVShortfall } from '@/hooks/use-ppv-payment';
import type { DhbBuyRoute } from '@/lib/contracts/uniswap-swap';

/**
 * Which wallet token to spend first. Gas token ahead of stables so a
 * stablecoin balance is left intact when there is ETH to spend, and the
 * cheapest route (a direct DHB/WETH pool) is tried before any hop.
 */
const SPEND_ORDER = ['ETH', 'USDC', 'USDT', 'BTC'];

interface Candidate {
  symbol: string;
  address: string;
  decimals: number;
  balance: bigint;
}

interface Pick {
  token: Candidate;
  route: DhbBuyRoute;
  /** Slippage-padded ceiling actually spent. */
  maxIn: bigint;
}

type Phase = 'scanning' | 'ready' | 'buying' | 'nofunds' | 'paused' | 'error';

function formatToken(wei: bigint, decimals: number): string {
  const value = Number(wei) / 10 ** decimals;
  if (!Number.isFinite(value) || value === 0) return '0';
  if (value >= 1000) return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  const fixed = value.toFixed(value >= 1 ? 4 : 6);
  return fixed.replace(/0+$/, '').replace(/\.$/, '');
}

interface PPVTopUpStepProps {
  shortfall: PPVShortfall;
  formatCompact: (num: number) => string;
  /** DHB has landed — the parent sends the unlock straight away. */
  onFunded: () => void;
  /** Back to the price view, sheet still open. */
  onCancel: () => void;
  /** Dismiss the sheet entirely, for the routes that navigate away. */
  onClose: () => void;
}

export function PPVTopUpStep({ shortfall, formatCompact, onFunded, onCancel, onClose }: PPVTopUpStepProps) {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>('scanning');
  const [pick, setPick] = useState<Pick | null>(null);
  const [error, setError] = useState('');
  const addressRef = useRef('');

  const needWei = toWei(shortfall.needDhb, 18);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setPhase('scanning');
      setError('');

      // Off Base there is no DHB pool to buy from, so there is nothing to
      // quote — the step goes straight to the funding routes.
      if (!shortfall.canTopUpInApp) {
        if (!cancelled) setPhase('nofunds');
        return;
      }

      try {
        const [
          { getWalletAddress, checkDHBPaused },
          { quoteDhbPurchase, applySlippage },
          { DEFAULT_TOKENS, getERC20TokenBalance, getNativeBalance },
        ] = await Promise.all([
          import('@/lib/contracts/aa-utils'),
          import('@/lib/contracts/uniswap-swap'),
          import('@/lib/wallet/tokens'),
        ]);

        // A paused token makes both the swap and the unlock revert. Saying so
        // beats letting them sign into a failure.
        if (await checkDHBPaused(BASE_CHAIN_ID)) {
          if (!cancelled) setPhase('paused');
          return;
        }

        const address = await getWalletAddress();
        if (cancelled) return;
        addressRef.current = address;

        const erc20s = (DEFAULT_TOKENS[BASE_CHAIN_ID] ?? []).filter((t) => t.symbol !== 'DHB');
        const balances = await Promise.all<Candidate>([
          getNativeBalance(address, BASE_CHAIN_ID)
            .then((balance) => ({ symbol: 'ETH', address: '0x0', decimals: 18, balance }))
            .catch(() => ({ symbol: 'ETH', address: '0x0', decimals: 18, balance: BigInt(0) })),
          ...erc20s.map((token) =>
            getERC20TokenBalance(token.address, address, BASE_CHAIN_ID)
              .then((balance) => ({
                symbol: token.symbol,
                address: token.address,
                decimals: token.decimals,
                balance,
              }))
              .catch(() => ({
                symbol: token.symbol,
                address: token.address,
                decimals: token.decimals,
                balance: BigInt(0),
              })),
          ),
        ]);
        if (cancelled) return;

        const funded = balances
          .filter((t) => t.balance > BigInt(0))
          .sort((a, b) => {
            const ai = SPEND_ORDER.indexOf(a.symbol);
            const bi = SPEND_ORDER.indexOf(b.symbol);
            return (ai < 0 ? SPEND_ORDER.length : ai) - (bi < 0 ? SPEND_ORDER.length : bi);
          });

        // First token that both has a route and covers the padded quote wins.
        // Quoting the whole wallet up front would be several seconds of RPC to
        // answer a question one token usually settles.
        for (const token of funded) {
          const route = await quoteDhbPurchase(needWei, token.address);
          if (cancelled) return;
          if (!route) continue;
          // A hop crosses two pools, one of them DHB's thin 1% pool, so it
          // gets more headroom than a direct swap. This is a ceiling, not a
          // spend — the router only pulls what the trade actually costs.
          const maxIn = applySlippage(route.amountIn, route.kind === 'path' ? 400 : 200);
          if (token.balance < maxIn) continue;
          setPick({ token, route, maxIn });
          setPhase('ready');
          return;
        }

        setPhase('nofunds');
      } catch (err) {
        console.error('[PPV] Top-up scan failed:', err);
        if (!cancelled) {
          setError('Could not check your wallet just now.');
          setPhase('error');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // needWei is derived from shortfall, which is a fresh object per attempt.
  }, [shortfall, needWei]);

  const handleTopUp = useCallback(async () => {
    if (!pick) return;
    setPhase('buying');
    setError('');
    try {
      const [{ parseTxError, waitForERC20Balance }, { buyDhbViaRoute }] = await Promise.all([
        import('@/lib/contracts/aa-utils'),
        import('@/lib/contracts/uniswap-swap'),
      ]);
      try {
        await buyDhbViaRoute(pick.route, needWei, pick.maxIn, addressRef.current);
      } catch (err) {
        setError(parseTxError(err, 'swap') || 'Top-up failed.');
        setPhase('error');
        return;
      }
      // Let the balance actually show up before handing back. The swap is
      // mined, but the next read goes to whichever public RPC node answers,
      // and one a block behind would make the unlock believe nothing arrived
      // and buy the shortfall a second time.
      await waitForERC20Balance(
        getChainConfig(shortfall.chainId).dhbToken,
        addressRef.current,
        toWei(shortfall.priceDhb, 18),
        shortfall.chainId,
      );
      // Straight back into the unlock — the sheet never closes and the viewer
      // never taps twice.
      onFunded();
    } catch (err) {
      console.error('[PPV] Top-up failed:', err);
      setError('Top-up failed.');
      setPhase('error');
    }
  }, [pick, needWei, shortfall, onFunded]);

  const goTo = (path: string) => {
    onClose();
    navigate(path);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3.5 space-y-2.5">
        <div className="flex items-center justify-between text-sm">
          <span className="text-zinc-400">Unlock price</span>
          <span className="text-zinc-300">{formatCompact(shortfall.priceDhb)} DHB</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-zinc-400">Your balance</span>
          <span className="text-zinc-300">{formatCompact(shortfall.balanceDhb)} DHB</span>
        </div>
        <div className="h-px bg-white/10" />
        <div className="flex items-center justify-between">
          <span className="text-white text-sm">You need</span>
          <span className="flex items-center gap-1.5 text-white text-lg font-bold">
            <img src={dehubCoin} alt="" className="w-4 h-4" />
            {formatCompact(shortfall.needDhb)} DHB
          </span>
        </div>
      </div>

      {phase === 'scanning' && (
        <div className="flex items-center justify-center gap-2 py-3 text-sm text-zinc-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          Finding the quickest way to top you up…
        </div>
      )}

      {(phase === 'ready' || phase === 'buying') && pick && (
        <>
          <p className="text-center text-xs text-zinc-400 px-2">
            Pays about {formatToken(pick.route.amountIn, pick.token.decimals)} {pick.token.symbol}{' '}
            from your wallet, then unlocks straight away.
          </p>
          <div className="flex gap-3">
            <Button variant="glass" className="flex-1" onClick={onCancel} disabled={phase === 'buying'}>
              Cancel
            </Button>
            <Button variant="glass" className="flex-1" onClick={handleTopUp} disabled={phase === 'buying'}>
              {phase === 'buying' ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Topping up…
                </>
              ) : (
                <>
                  Top up &amp; unlock
                  <ArrowRight className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
          </div>
        </>
      )}

      {phase === 'paused' && (
        <>
          <div className="flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-200">
            <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
            <span>DHB transfers are paused on-chain right now, so this unlock can't go through yet. Try again shortly.</span>
          </div>
          <Button variant="glass" className="w-full" onClick={onCancel}>
            Close
          </Button>
        </>
      )}

      {(phase === 'nofunds' || phase === 'error') && (
        <>
          {phase === 'error' ? (
            <div className="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-xs text-red-200">
              <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
              <span>{error}</span>
            </div>
          ) : (
            <p className="text-center text-xs text-zinc-400 px-2">
              {shortfall.canTopUpInApp
                ? "There isn't enough in your wallet on Base to cover it. Add funds and the unlock is waiting for you."
                : 'This post settles on another chain, so it needs DHB in your wallet there.'}
            </p>
          )}

          <div className="space-y-2">
            <button
              onClick={() => goTo('/app/buy')}
              className="w-full flex items-center gap-3 p-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.10] border border-white/10 transition-colors"
            >
              <CreditCard className="w-5 h-5 text-white/70" />
              <div className="text-left flex-1">
                <span className="text-sm font-medium text-white">Buy DHB with card</span>
                <p className="text-xs text-white/40">Visa, Mastercard, Apple Pay</p>
              </div>
            </button>
            <button
              onClick={() => goTo('/app/wallet')}
              className="w-full flex items-center gap-3 p-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.10] border border-white/10 transition-colors"
            >
              <Wallet className="w-5 h-5 text-white/70" />
              <div className="text-left flex-1">
                <span className="text-sm font-medium text-white">Move funds in</span>
                <p className="text-xs text-white/40">Swap or deposit from another chain</p>
              </div>
            </button>
          </div>

          <Button variant="glass" className="w-full" onClick={onCancel}>
            Not now
          </Button>
        </>
      )}
    </div>
  );
}
