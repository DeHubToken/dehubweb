/**
 * AdFundingStep
 * =============
 * What the ads top-up turns into when the advertiser's wallet is short of DHB.
 *
 * The old behaviour was a toast — "Insufficient DHB. Need 43,809 DHB (Base: 0,
 * BNB: 0)" — fired at somebody who had already decided to spend money, on a
 * modal that then just sat there. Nothing on the page sold them DHB, so the
 * only way forward was to leave the ads portal, find /app/buy, work out how
 * much to buy, come back, and start the top-up again from scratch.
 *
 * This keeps them where they are and offers the two routes that actually
 * exist:
 *
 *   crypto — a Uniswap exactOutput buy on Base out of whatever they already
 *            hold (ETH first, then stables, which reach DHB through a WETH
 *            hop). One signature, seconds, no tab switch.
 *   card   — a dpay Stripe session opened in a second tab while this one keeps
 *            polling. The gateway delivers DHB to their wallet and we wait for
 *            it to land.
 *
 * Either way the parent resumes the top-up the moment the DHB is there, so the
 * advertiser taps once and ends up funded.
 *
 * The card option is preflighted, not assumed. The gateway refuses every
 * checkout while its own gas float is below 0.01 native (it has been for
 * weeks) and cannot deliver more DHB than it holds, so offering card blind
 * sends people into a Stripe tab that 406s.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowRight, CreditCard, ExternalLink, Loader2, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BASE_CHAIN_ID, getChainConfig, toWei } from '@/lib/contracts/dhb-token';
import {
  checkDHBPaused,
  getERC20Balance,
  getWalletAddress,
  parseTxError,
  waitForERC20Balance,
} from '@/lib/contracts/aa-utils';
import { applySlippage, quoteDhbPurchase, buyDhbViaRoute } from '@/lib/contracts/uniswap-swap';
import type { DhbBuyRoute } from '@/lib/contracts/uniswap-swap';
import { DEFAULT_TOKENS, getERC20TokenBalance, getNativeBalance } from '@/lib/wallet/tokens';
import {
  checkGatewayCanDeliver,
  createCheckoutSession,
  getBadgeDiscount,
  getDPaySessionStatus,
  type GatewayReadiness,
} from '@/lib/api/dpay';
import { getAuthToken } from '@/lib/api/dehub/core';
import dehubCoin from '@/assets/dehub-coin.png';
import { formatCompact } from '@/lib/ads/povr';

/**
 * Which wallet token to spend first. Gas token ahead of stables so a
 * stablecoin balance survives when there is ETH to spend, and the cheapest
 * route (the direct DHB/WETH pool) is tried before any hop.
 */
const SPEND_ORDER = ['ETH', 'USDC', 'USDT', 'BTC'];

/**
 * The fiat gateway prices DHB at a flat $0.001, which is NOT the market price
 * the ads balance is credited at. Card sizing has to use the gateway's number
 * or the delivered DHB comes up short of the transfer we are about to make.
 */
const GATEWAY_PEG_USD = 0.001;

/** Gateway minimum purchase. */
const MIN_CARD_USD = 5;

/** Buy a little more than the gap so a price tick does not reopen it. */
const CARD_HEADROOM = 1.05;

/** How long to wait for Stripe + on-chain delivery before handing back. */
const CARD_POLL_MS = 2500;
const CARD_POLL_ATTEMPTS = 160; // ~6.5 minutes

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

type Phase = 'scanning' | 'ready' | 'swapping' | 'card' | 'paused' | 'error';

function formatToken(wei: bigint, decimals: number): string {
  const value = Number(wei) / 10 ** decimals;
  if (!Number.isFinite(value) || value === 0) return '0';
  if (value >= 1000) return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  const fixed = value.toFixed(value >= 1 ? 4 : 6);
  return fixed.replace(/0+$/, '').replace(/\.$/, '');
}

interface AdFundingStepProps {
  /** DHB missing from the wallet, already including any top-up headroom. */
  needDhb: number;
  /** DHB the wallet holds on Base right now (shown, not re-read). */
  haveDhb: number;
  /** DHB has landed — the parent sends the top-up straight away. */
  onFunded: () => void;
  /** Back to the amount view, modal still open. */
  onCancel: () => void;
}

export function AdFundingStep({ needDhb, haveDhb, onFunded, onCancel }: AdFundingStepProps) {
  const [phase, setPhase] = useState<Phase>('scanning');
  const [pick, setPick] = useState<Pick | null>(null);
  const [card, setCard] = useState<GatewayReadiness | null>(null);
  const [cardUsd, setCardUsd] = useState(0);
  const [cardTokens, setCardTokens] = useState(0);
  const [cardStatus, setCardStatus] = useState('');
  const [error, setError] = useState('');
  const addressRef = useRef('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const needWei = toWei(needDhb, 18);
  const dhbToken = getChainConfig(BASE_CHAIN_ID).dhbToken;

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  // ---- scan: what can this wallet pay with, and is card even open? --------
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setPhase('scanning');
      setError('');

      try {
        // A paused token makes both the swap and the treasury transfer revert.
        // Saying so beats letting them sign into a failure.
        if (await checkDHBPaused(BASE_CHAIN_ID)) {
          if (!cancelled) setPhase('paused');
          return;
        }

        const address = await getWalletAddress();
        if (cancelled) return;
        addressRef.current = address;

        // Card leg is priced at the gateway's peg, less whatever badge
        // discount the buyer's tier earns — the same arithmetic /app/buy does,
        // so the quote here and the delivery match.
        const discount = await getBadgeDiscount().catch(() => ({ rate: 0 }));
        const unitPrice = GATEWAY_PEG_USD * (1 - (discount?.rate ?? 0));
        const usd = Math.max(MIN_CARD_USD, Math.ceil(needDhb * unitPrice * CARD_HEADROOM));
        const tokens = Math.floor(usd / unitPrice);
        if (cancelled) return;
        setCardUsd(usd);
        setCardTokens(tokens);

        const [readiness, balances] = await Promise.all([
          getAuthToken()
            ? checkGatewayCanDeliver(BASE_CHAIN_ID, tokens)
            : Promise.resolve<GatewayReadiness>({ ok: false, reason: 'low_gas', supply: 0, gas: 0 }),
          scanBalances(address),
        ]);
        if (cancelled) return;
        setCard(readiness);

        // First token that both has a route and covers the padded quote wins.
        // Quoting the whole wallet up front would be several seconds of RPC to
        // answer a question one token usually settles.
        for (const token of balances) {
          const route = await quoteDhbPurchase(needWei, token.address);
          if (cancelled) return;
          if (!route) continue;
          // A hop crosses two pools, one of them DHB's thin 1% pool, so it
          // gets more headroom than a direct swap. This is a ceiling, not a
          // spend — the router only pulls what the trade actually costs.
          const maxIn = applySlippage(route.amountIn, route.kind === 'path' ? 400 : 200);
          if (token.balance < maxIn) continue;
          setPick({ token, route, maxIn });
          break;
        }

        setPhase('ready');
      } catch (err) {
        console.error('[Ads] Funding scan failed:', err);
        if (!cancelled) {
          setError('Could not check your wallet just now.');
          setPhase('error');
        }
      }
    })();

    return () => { cancelled = true; };
  }, [needDhb, needWei]);

  // ---- crypto ------------------------------------------------------------
  const handleSwap = useCallback(async () => {
    if (!pick) return;
    setPhase('swapping');
    setError('');
    try {
      // Measured, not derived from the displayed price: comparing against a
      // float turned back into wei can set a target the balance never quite
      // reaches. Any increase at all means the swap has been seen.
      const before = await getERC20Balance(dhbToken, addressRef.current, BASE_CHAIN_ID).catch(() => BigInt(0));

      try {
        await buyDhbViaRoute(pick.route, needWei, pick.maxIn, addressRef.current);
      } catch (err) {
        setError(parseTxError(err, 'swap') || 'Could not buy DHB.');
        setPhase('error');
        return;
      }

      // Let the balance actually show up before handing back. The swap is
      // mined, but the next read goes to whichever public RPC node answers,
      // and one a block behind would make the top-up believe nothing arrived.
      await waitForERC20Balance(dhbToken, addressRef.current, before + BigInt(1), BASE_CHAIN_ID);
      onFunded();
    } catch (err) {
      console.error('[Ads] Funding swap failed:', err);
      setError('Could not buy DHB.');
      setPhase('error');
    }
  }, [pick, needWei, dhbToken, onFunded]);

  // ---- card --------------------------------------------------------------
  const handleCard = useCallback(async () => {
    setPhase('card');
    setError('');
    setCardStatus('Opening secure checkout…');
    try {
      const address = addressRef.current || (await getWalletAddress());
      const before = await getERC20Balance(dhbToken, address, BASE_CHAIN_ID).catch(() => BigInt(0));

      const session = await createCheckoutSession({
        amount: cardUsd,
        tokenSymbol: 'DHB',
        walletAddress: address,
        chainId: BASE_CHAIN_ID,
        tokensToReceive: cardTokens,
        redirect: `${window.location.origin}/app/ads?payment=success&session_id=__SESSION_ID__`,
      });

      if (!session.checkoutUrl) throw new Error('Checkout unavailable, try again shortly.');
      window.open(session.checkoutUrl, '_blank', 'noopener,noreferrer');
      setCardStatus('Complete payment in the checkout tab — this stays open.');

      let attempts = 0;
      let paid = false;
      stopPolling();
      pollRef.current = setInterval(async () => {
        attempts++;
        if (attempts > CARD_POLL_ATTEMPTS) {
          stopPolling();
          setError('Still waiting on the payment. Your DHB will land in your wallet — reopen the top-up once it does.');
          setPhase('error');
          return;
        }

        // The wallet is the only thing that matters, so check it every tick
        // regardless of what the session says — a delivery can beat the
        // session record, and the top-up only needs the tokens to be there.
        const balance = await getERC20Balance(dhbToken, address, BASE_CHAIN_ID).catch(() => before);
        if (balance >= before + needWei) {
          stopPolling();
          onFunded();
          return;
        }

        try {
          const status = await getDPaySessionStatus(session.sessionId);
          const send = String(status.tokenSendStatus || '').toLowerCase();
          const stripe = String(status.status_stripe || '').toLowerCase();

          if (send === 'failed' || stripe === 'failed' || stripe === 'canceled' || stripe === 'expired') {
            stopPolling();
            setError('The payment did not go through. Nothing was charged — try again or pay with crypto.');
            setPhase('error');
            return;
          }
          if (!paid && (stripe === 'succeeded' || stripe === 'complete' || stripe === 'paid')) {
            paid = true;
            setCardStatus('Payment received — delivering DHB to your wallet…');
          }
        } catch {
          /* session lookups are flaky mid-checkout; the balance check above is authoritative */
        }
      }, CARD_POLL_MS);
    } catch (err) {
      console.error('[Ads] Card funding failed:', err);
      setError(err instanceof Error ? err.message : 'Could not start checkout.');
      setPhase('error');
    }
  }, [cardUsd, cardTokens, dhbToken, needWei, onFunded, stopPolling]);

  const cardBlockedReason =
    !getAuthToken()
      ? 'Card checkout needs you signed in to DeHub.'
      : card?.reason === 'low_gas'
        ? 'Card checkout is offline right now — the payment gateway is out of gas for delivery.'
        : card?.reason === 'no_supply'
          ? `Card checkout can only deliver ${formatCompact(card.supply)} DHB right now, less than this top-up needs.`
          : null;

  return (
    <div className="flex flex-col gap-4">
      {/* What is missing */}
      <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3.5 space-y-2.5">
        <div className="flex items-center justify-between text-sm">
          <span className="text-zinc-400">Your DHB on Base</span>
          <span className="text-zinc-300">{formatCompact(haveDhb)} DHB</span>
        </div>
        <div className="h-px bg-white/10" />
        <div className="flex items-center justify-between">
          <span className="text-white text-sm">Still needed</span>
          <span className="flex items-center gap-1.5 text-white text-lg font-bold">
            <img src={dehubCoin} alt="" className="w-4 h-4" />
            {formatCompact(needDhb)} DHB
          </span>
        </div>
      </div>

      {phase === 'scanning' && (
        <div className="flex items-center justify-center gap-2 py-3 text-sm text-zinc-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          Finding the quickest way to fund this…
        </div>
      )}

      {phase === 'paused' && (
        <>
          <div className="flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-200">
            <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
            <span>DHB transfers are paused on-chain right now, so this top-up can't go through yet. Try again shortly.</span>
          </div>
          <Button variant="glass" className="w-full" onClick={onCancel}>Close</Button>
        </>
      )}

      {phase === 'card' && (
        <>
          <div className="flex items-center justify-center gap-2 py-3 text-sm text-zinc-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            {cardStatus}
          </div>
          <p className="text-center text-[11px] text-zinc-500 px-2">
            Leave this open — the moment your DHB lands, the top-up finishes on its own.
          </p>
          <Button variant="glass" className="w-full" onClick={() => { stopPolling(); setPhase('ready'); }}>
            Stop waiting
          </Button>
        </>
      )}

      {(phase === 'ready' || phase === 'swapping' || phase === 'error') && (
        <>
          {phase === 'error' && (
            <div className="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-xs text-red-200">
              <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-2">
            {/* Crypto */}
            {pick ? (
              <button
                type="button"
                onClick={handleSwap}
                disabled={phase === 'swapping'}
                className="w-full flex items-center gap-3 p-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.10] border border-white/10 transition-colors disabled:opacity-60"
              >
                {phase === 'swapping'
                  ? <Loader2 className="w-5 h-5 text-white/70 animate-spin" />
                  : <Wallet className="w-5 h-5 text-white/70" />}
                <div className="text-left flex-1">
                  <span className="text-sm font-medium text-white">
                    {phase === 'swapping' ? 'Buying DHB…' : `Pay with ${pick.token.symbol} you already hold`}
                  </span>
                  <p className="text-xs text-white/40">
                    About {formatToken(pick.route.amountIn, pick.token.decimals)} {pick.token.symbol} · instant
                  </p>
                </div>
                {phase !== 'swapping' && <ArrowRight className="w-4 h-4 text-white/40" />}
              </button>
            ) : (
              <div className="w-full flex items-center gap-3 p-3.5 rounded-xl bg-white/[0.03] border border-white/10">
                <Wallet className="w-5 h-5 text-white/30" />
                <div className="text-left flex-1">
                  <span className="text-sm font-medium text-white/50">Pay from your wallet</span>
                  <p className="text-xs text-white/30">Nothing on Base big enough to cover it</p>
                </div>
              </div>
            )}

            {/* Card */}
            {card?.ok ? (
              <button
                type="button"
                onClick={handleCard}
                disabled={phase === 'swapping'}
                className="w-full flex items-center gap-3 p-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.10] border border-white/10 transition-colors disabled:opacity-60"
              >
                <CreditCard className="w-5 h-5 text-white/70" />
                <div className="text-left flex-1">
                  <span className="text-sm font-medium text-white">Pay ${cardUsd} by card</span>
                  <p className="text-xs text-white/40">Visa, Mastercard, Apple Pay · opens in a new tab</p>
                </div>
                <ExternalLink className="w-4 h-4 text-white/40" />
              </button>
            ) : (
              <div className="w-full flex items-center gap-3 p-3.5 rounded-xl bg-white/[0.03] border border-white/10">
                <CreditCard className="w-5 h-5 text-white/30" />
                <div className="text-left flex-1">
                  <span className="text-sm font-medium text-white/50">Pay by card</span>
                  <p className="text-xs text-white/30">{cardBlockedReason ?? 'Checking availability…'}</p>
                </div>
              </div>
            )}
          </div>

          <Button variant="glass" className="w-full" onClick={onCancel} disabled={phase === 'swapping'}>
            Not now
          </Button>
        </>
      )}
    </div>
  );
}

/** Base balances worth quoting, richest-priority first. */
async function scanBalances(address: string): Promise<Candidate[]> {
  const erc20s = (DEFAULT_TOKENS[BASE_CHAIN_ID] ?? []).filter((t) => t.symbol !== 'DHB');
  const balances = await Promise.all<Candidate>([
    getNativeBalance(address, BASE_CHAIN_ID)
      .then((balance) => ({ symbol: 'ETH', address: '0x0', decimals: 18, balance }))
      .catch(() => ({ symbol: 'ETH', address: '0x0', decimals: 18, balance: BigInt(0) })),
    ...erc20s.map((token) =>
      getERC20TokenBalance(token.address, address, BASE_CHAIN_ID)
        .then((balance) => ({ symbol: token.symbol, address: token.address, decimals: token.decimals, balance }))
        .catch(() => ({ symbol: token.symbol, address: token.address, decimals: token.decimals, balance: BigInt(0) })),
    ),
  ]);

  return balances
    .filter((t) => t.balance > BigInt(0))
    .sort((a, b) => {
      const ai = SPEND_ORDER.indexOf(a.symbol);
      const bi = SPEND_ORDER.indexOf(b.symbol);
      return (ai < 0 ? SPEND_ORDER.length : ai) - (bi < 0 ? SPEND_ORDER.length : bi);
    });
}
