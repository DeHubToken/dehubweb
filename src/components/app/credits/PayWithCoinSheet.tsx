import { useContext, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronRight, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
// Context, not useAuth: the state gallery shows this sheet with no AuthProvider.
import { AuthContext } from '@/contexts/AuthContext';
import { getSubscriptionCredits } from '@/lib/api/dehub/credits';
import { isSmartWalletSession } from '@/lib/connection-source';
import { formatDhb } from '@/hooks/use-ai-quote';
import { cn } from '@/lib/utils';
import {
  COIN_CHAIN_NAMES,
  coinAmountFor,
  coinKey,
  fetchTopUpCoins,
  formatCoinAmount,
  payableCoins,
  readCoinBalances,
  topUpWithCoin,
  type TopUpCoin,
} from '@/lib/coin-topup';
import AnyCoinPay from '@/components/app/credits/AnyCoinPay';
import type { AnyCoin, AnyCoinIntent } from '@/lib/studio-coin-intent';
import btcLogo from '@/assets/btc-logo.png';
import solLogo from '@/assets/icons/solana-logo.png';
import dhbCoin from '@/assets/dehub-coin.png';
import usdtLogo from '@/assets/usdt-logo.png';
import usdcLogo from '@/assets/usdc-logo.png';
import bnbLogo from '@/assets/bnb-logo.png';
import ethLogo from '@/assets/eth-logo.png';
import usdfcLogo from '@/assets/usdfc-logo.svg';
import baseChain from '@/assets/base-chain.svg';
import filecoinChain from '@/assets/filecoin-chain.svg';

const COIN_LOGOS: Record<string, string> = { USDT: usdtLogo, USDC: usdcLogo, BNB: bnbLogo, ETH: ethLogo, USDFC: usdfcLogo };
const CHAIN_LOGOS: Record<number, string> = { 56: bnbLogo, 8453: baseChain, 314: filecoinChain };

/** Prices are DHB at the peg: one DHB is $0.001. */
const USD_PER_DHB = 0.001;
const PICK_KEY = 'dehub.coin-pay.pick';

/** Whole tokens with separators, the way the Create button writes them ("1,890"). */
const dhbText = (amount: number) => (amount < 100_000 ? Math.round(amount).toLocaleString() : formatDhb(amount));

function CoinIcon({ coin, size = 32 }: { coin: TopUpCoin; size?: number }) {
  return (
    <span className="relative shrink-0" style={{ width: size, height: size }}>
      <img src={COIN_LOGOS[coin.symbol]} alt="" className="h-full w-full rounded-full" />
      <img
        src={CHAIN_LOGOS[coin.chainId]}
        alt=""
        className="absolute -bottom-0.5 -right-0.5 rounded-full ring-2 ring-zinc-950"
        style={{ width: size * 0.42, height: size * 0.42 }}
      />
    </span>
  );
}

function useTopUpCoins(enabled = true) {
  return useQuery({ queryKey: ['coin-topup-options'], queryFn: fetchTopUpCoins, staleTime: 60_000, enabled });
}

function useCoinBalances(coins: TopUpCoin[] | undefined, enabled = true) {
  const walletAddress = useContext(AuthContext)?.walletAddress;
  return useQuery({
    queryKey: ['coin-topup-balances', walletAddress?.toLowerCase(), coins?.map(coinKey).join(',')],
    queryFn: () => readCoinBalances(coins || [], walletAddress!),
    enabled: enabled && !!walletAddress && !!coins?.length,
    staleTime: 30_000,
  });
}

/**
 * "Not enough DHB" — pay the same amount with another coin.
 *
 * Opens when someone presses Create holding less DHB than the job costs. The
 * price stays in DHB; each coin shows what covers it. The coin fills the
 * Studio balance, then `onFunded` runs and the job is paid from that balance.
 */
export default function PayWithCoinSheet({
  open,
  onOpenChange,
  costDhb,
  walletDhb,
  onFunded,
  preview,
}: {
  /** State gallery only: fixed coins and balances, nothing is read or sent. */
  preview?: {
    coins: TopUpCoin[];
    balances: Record<string, number | null>;
    creditsUsd?: number;
    anyCoins?: AnyCoin[];
    anyIntent?: AnyCoinIntent;
    view?: 'list' | 'any';
  };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  costDhb: number;
  walletDhb?: number;
  onFunded: () => void;
}) {
  const { t } = useTranslation();
  const auth = useContext(AuthContext);
  const walletAddress = auth?.walletAddress;
  const queryClient = useQueryClient();
  const { data: liveCredits } = useQuery({
    queryKey: ['subscription-credits'],
    queryFn: () => getSubscriptionCredits(walletAddress),
    enabled: open && !preview && !!auth?.isAuthenticated,
    staleTime: 30_000,
    retry: false,
  });
  const credits = preview ? { usd: preview.creditsUsd || 0 } : liveCredits;
  const coinsQuery = useTopUpCoins(open && !preview);
  const coins = useMemo(
    () => preview?.coins || payableCoins(coinsQuery.data || [], isSmartWalletSession()),
    [coinsQuery.data, preview?.coins],
  );
  const liveBalances = useCoinBalances(coins, open && !preview);
  const balancesQuery = preview ? { data: preview.balances, isLoading: false } : liveBalances;
  const balances = balancesQuery.data || {};
  const [picked, setPicked] = useState<string | null>(null);
  const [stage, setStage] = useState<'idle' | 'signing' | 'arriving'>('idle');
  const [view, setView] = useState<'list' | 'any'>(preview?.view || 'list');

  // What the coin has to cover: the job's dollar price less what the Studio
  // balance already holds, never under a cent.
  const usdNeeded = Math.max(0.01, costDhb * USD_PER_DHB - (credits?.usd || 0));
  const enough = (coin: TopUpCoin) => {
    const held = balances[coinKey(coin)];
    return held != null && held >= Number(coinAmountFor(coin, usdNeeded));
  };

  // Default pick: the last coin used if it still covers this, else the first
  // dollar coin that does, else whatever covers it.
  useEffect(() => {
    if (!open || picked || !coins.length || balancesQuery.isLoading) return;
    let last: string | null = null;
    try { last = localStorage.getItem(PICK_KEY); } catch { /* private mode */ }
    const lastCoin = coins.find((c) => coinKey(c) === last && enough(c));
    const best = lastCoin || coins.find((c) => c.address && enough(c)) || coins.find(enough) || coins[0];
    setPicked(coinKey(best));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, coins, balancesQuery.isLoading]);

  useEffect(() => {
    if (!open) { setPicked(null); setStage('idle'); setView(preview?.view || 'list'); }
  }, [open]);

  const best = coins.find((c) => c.address && enough(c));
  const selected = coins.find((c) => coinKey(c) === picked) || null;
  const busy = stage !== 'idle';

  const pay = async () => {
    if (!selected || !walletAddress || busy || preview) return;
    try { localStorage.setItem(PICK_KEY, coinKey(selected)); } catch { /* private mode */ }
    setStage('signing');
    try {
      const sending = topUpWithCoin(selected, usdNeeded, walletAddress);
      // The wallet prompt resolves into the claim loop; show "arriving" once signed.
      const timer = window.setTimeout(() => setStage('arriving'), 1500);
      await sending;
      window.clearTimeout(timer);
      await queryClient.invalidateQueries({ queryKey: ['subscription-credits'] });
      await queryClient.invalidateQueries({ queryKey: ['spendable-dhb'] });
      onFunded();
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (!/reject|denied|cancel/i.test(message)) {
        toast.error(message || t('coinPay.failed', { defaultValue: 'Payment did not go through.' }));
      }
    } finally {
      setStage('idle');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next); }}>
      {/* Opens from the paywall drawer (z-100), so it has to sit above it. */}
      <DialogContent
        data-glass-menu
        overlayClassName="z-[120]"
        className="z-[120] max-w-md gap-0 border border-white/10 bg-zinc-950/80 p-4 backdrop-blur-[28px] sm:p-5"
      >
        <DialogTitle className="text-[19px] font-extrabold text-white">
          {t('coinPay.title', { defaultValue: 'Not enough DHB' })}
        </DialogTitle>
        <DialogDescription className="mt-1 text-[13px] text-zinc-400">
          {t('coinPay.subtitle', {
            defaultValue: 'This costs {{cost}} DHB and you hold {{held}}. Pay the same amount with another coin.',
            cost: dhbText(costDhb),
            held: dhbText(walletDhb ?? 0),
          })}
        </DialogDescription>

        <div className="mt-3 flex items-center gap-2">
          <img src={dhbCoin} alt="" className="h-7 w-7" />
          <span className="text-[30px] font-extrabold leading-none tracking-tight text-white tabular-nums">{dhbText(costDhb)}</span>
          <span className="text-[13px] text-zinc-400">
            {t('coinPay.tokensUsd', { defaultValue: 'tokens · ≈ ${{usd}}', usd: (costDhb * USD_PER_DHB).toFixed(2) })}
          </span>
        </div>

        {view === 'any' ? (
          <div className="mt-3">
            <AnyCoinPay
              usdNeeded={usdNeeded}
              onBack={() => setView('list')}
              onFunded={async () => {
                await queryClient.invalidateQueries({ queryKey: ['spendable-dhb'] });
                onFunded();
              }}
              preview={preview ? { coins: preview.anyCoins || [], intent: preview.anyIntent } : undefined}
            />
          </div>
        ) : (<>
        <div className="mt-3 flex max-h-[46vh] flex-col gap-1.5 overflow-y-auto [scrollbar-width:none]">
          {(!preview && coinsQuery.isLoading) || (balancesQuery.isLoading && !coins.length) ? (
            <div className="flex items-center justify-center py-8 text-zinc-400">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : coins.length === 0 ? null : (
            coins.map((coin) => {
              const key = coinKey(coin);
              const held = balances[key];
              const ok = enough(coin);
              const isPicked = key === picked;
              return (
                <button
                  key={key}
                  type="button"
                  disabled={busy || (!ok && !balancesQuery.isLoading)}
                  onClick={() => setPicked(key)}
                  className={cn(
                    'flex items-center gap-3 rounded-[18px] border px-3 py-2.5 text-left transition-colors',
                    isPicked ? 'border-white/20 bg-white/[0.14]' : 'border-transparent bg-white/[0.06] hover:bg-white/[0.1]',
                    !ok && !balancesQuery.isLoading && 'opacity-40',
                  )}
                >
                  <CoinIcon coin={coin} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-[15px] font-extrabold text-white">
                      {coin.symbol}
                      <span className="text-[12px] font-semibold text-zinc-400">{COIN_CHAIN_NAMES[coin.chainId]}</span>
                      {best && coinKey(best) === key && (
                        <span className="rounded-md bg-emerald-400 px-1.5 py-px text-[10px] font-extrabold uppercase tracking-wide text-emerald-950">
                          {t('coinPay.best', { defaultValue: 'Best' })}
                        </span>
                      )}
                    </span>
                    <span className="block text-[12px] text-zinc-400">
                      {balancesQuery.isLoading
                        ? '…'
                        : held == null
                          ? t('coinPay.unknownBalance', { defaultValue: 'Balance unavailable' })
                          : ok
                            ? t('coinPay.holding', { defaultValue: 'Holding {{amount}} {{symbol}}', amount: formatCoinAmount(held), symbol: coin.symbol })
                            : t('coinPay.notEnough', { defaultValue: 'Not enough' })}
                    </span>
                  </span>
                  <span className="text-right text-[14px] font-extrabold text-white tabular-nums">
                    {formatCoinAmount(coinAmountFor(coin, usdNeeded))}
                    <span className="block text-[11px] font-semibold text-zinc-400">{coin.symbol}</span>
                  </span>
                  {isPicked && (
                    <span className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full bg-white"><Check className="h-3.5 w-3.5" color="#000" strokeWidth={3.5} /></span>
                  )}
                </button>
              );
            })
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => setView('any')}
            className="flex items-center gap-3 rounded-[18px] border border-dashed border-white/15 bg-white/[0.03] px-3 py-2.5 text-left transition-colors hover:bg-white/[0.08]"
          >
            <span className="relative h-8 w-8 shrink-0">
              <img src={btcLogo} alt="" className="absolute left-0 top-0 h-[22px] w-[22px] rounded-full ring-2 ring-zinc-950" />
              <img src={solLogo} alt="" className="absolute bottom-0 right-0 h-[22px] w-[22px] rounded-full ring-2 ring-zinc-950" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-extrabold text-white">{t('coinPay.anyCoin', { defaultValue: 'Any other coin' })}</span>
              <span className="block text-[12px] text-zinc-400">{t('coinPay.anyCoinHint', { defaultValue: 'BTC, SOL, DOGE, XRP and 200+ more, from any wallet or exchange' })}</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" />
          </button>
        </div>

        {(credits?.usd || 0) > 0 && (
          <p className="mt-2 text-[12px] text-zinc-400">
            {t('coinPay.balanceUsed', { defaultValue: 'Your Studio balance (${{usd}}) covers part of it.', usd: (credits?.usd || 0).toFixed(2) })}
          </p>
        )}

        <button
          type="button"
          onClick={pay}
          disabled={!selected || busy || !enough(selected)}
          className="mt-4 flex h-[52px] items-center justify-center gap-2 rounded-full bg-white text-[16px] font-extrabold text-black transition-opacity disabled:opacity-50"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {stage === 'signing'
            ? t('coinPay.confirmInWallet', { defaultValue: 'Confirm in your wallet…' })
            : stage === 'arriving'
              ? t('coinPay.arriving', { defaultValue: 'Payment on its way…' })
              : selected
                ? t('coinPay.payWith', { defaultValue: 'Pay with {{symbol}} and create', symbol: selected.symbol })
                : t('coinPay.pickCoin', { defaultValue: 'Pick a coin' })}
        </button>
        <p className="mt-2 text-center text-[11px] text-zinc-500">
          {t('coinPay.changeNote', { defaultValue: 'One signature. Anything left over stays in your Studio balance.' })}
        </p>
        </>)}
      </DialogContent>
    </Dialog>
  );
}
