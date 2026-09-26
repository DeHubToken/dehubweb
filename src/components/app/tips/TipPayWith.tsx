/**
 * "Pay with" for anything paid in DHB: tips, gifts, pay-per-view, subscriptions.
 *
 * DHB stays the default and behaves exactly as before. When the wallet does
 * not hold enough DHB, the richest other EVM balance is picked instead — USDC
 * on Arc, ETH on Ethereum, anything on Base — and the tip is funded from it
 * on send — DeHub Pay first, Uniswap as the fallback (see lib/tip-funding).
 *
 * Loaded lazily: it reads wallet balances, which reach the wallet stack, and
 * the surfaces that use it are imported by eager feed cards.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Loader2 } from 'lucide-react';
import { formatUnits } from 'ethers';
import { useAuth } from '@/contexts/AuthContext';
import { useAllChainsTokens } from '@/hooks/use-wallet-tokens';
import { useTokenPrices } from '@/hooks/use-token-prices';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { BASE_CHAIN_ID, BNB_CHAIN_ID, CHAIN_CONFIGS, ETH_CHAIN_ID } from '@/lib/contracts/dhb-token';
import { ROBINHOOD_CHAIN_ID } from '@/lib/chains/robinhood';
import { ARC_CHAIN_ID } from '@/lib/chains/arc';
import {
  TIP_FUNDING_CHAINS,
  formatPayAmount,
  planTipFunding,
  planUsesDpay,
  type TipFundingPlan,
  type TipFundingSource,
} from '@/lib/tip-funding';
import dehubCoin from '@/assets/dehub-coin.png';
import ethLogo from '@/assets/eth-logo.png';
import bnbLogo from '@/assets/bnb-logo.png';
import usdcLogo from '@/assets/usdc-logo.png';
import usdtLogo from '@/assets/usdt-logo.png';
import btcLogo from '@/assets/btc-logo.png';
import baseLogo from '@/assets/icons/base-logo.png';
import arcLogo from '@/assets/icons/arc-logo.png';
import robinhoodLogo from '@/assets/icons/robinhood-chain-logo.svg';

export const TIP_CHAIN_NAMES: Record<number, string> = {
  [BASE_CHAIN_ID]: 'Base',
  [ARC_CHAIN_ID]: 'Arc',
  [ETH_CHAIN_ID]: 'Ethereum',
  [BNB_CHAIN_ID]: 'BNB Chain',
  [ROBINHOOD_CHAIN_ID]: 'Robinhood Chain',
};
const CHAIN_LOGOS: Record<number, string> = {
  [BASE_CHAIN_ID]: baseLogo, [ARC_CHAIN_ID]: arcLogo, [ETH_CHAIN_ID]: ethLogo, [BNB_CHAIN_ID]: bnbLogo, [ROBINHOOD_CHAIN_ID]: robinhoodLogo,
};
const TOKEN_LOGOS: Record<string, string> = { ETH: ethLogo, WETH: ethLogo, BNB: bnbLogo, USDC: usdcLogo, USDT: usdtLogo, BTC: btcLogo };
/** Balances worth less than this are not offered. */
const MIN_SOURCE_USD = 0.5;

interface Row extends TipFundingSource {
  usd: number;
  logo?: string;
}

const sameSource = (a: TipFundingSource | null, b: TipFundingSource | null) =>
  !!a && !!b && a.chainId === b.chainId && a.address.toLowerCase() === b.address.toLowerCase();

function TokenBadge({ symbol, logo, chainId }: { symbol: string; logo?: string; chainId?: number }) {
  const src = logo || TOKEN_LOGOS[symbol];
  return (
    <span className="relative inline-flex shrink-0">
      {src
        ? <img src={src} alt="" className="h-6 w-6 rounded-full object-contain" />
        : <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-[9px] font-bold text-white/70">{symbol.slice(0, 3)}</span>}
      {chainId != null && CHAIN_LOGOS[chainId] && (
        <img src={CHAIN_LOGOS[chainId]} alt="" className="absolute -bottom-0.5 -right-1 h-3 w-3 rounded-full ring-1 ring-black" />
      )}
    </span>
  );
}

interface TipPayWithProps {
  amountDhb: number;
  value: TipFundingSource | null;
  onChange: (source: TipFundingSource | null) => void;
  /** Only other tokens: for a surface that already knows the DHB is short. */
  requireSource?: boolean;
}

export default function TipPayWith({ amountDhb, value, onChange, requireSource = false }: TipPayWithProps) {
  const { t } = useTranslation();
  const { walletAddress } = useAuth();
  const { allTokens } = useAllChainsTokens();
  const { data: prices = {} } = useTokenPrices();
  const [open, setOpen] = useState(false);
  const userPicked = useRef(false);

  const dhbAddresses = useMemo(
    () => new Set(Object.values(CHAIN_CONFIGS).map(c => c.dhbToken.toLowerCase()).filter(Boolean)),
    [],
  );
  const dhbOnBase = useMemo(
    () => allTokens.find(tk => tk.chainId === BASE_CHAIN_ID && tk.address.toLowerCase() === CHAIN_CONFIGS[BASE_CHAIN_ID].dhbToken.toLowerCase())?.balance ?? 0n,
    [allTokens],
  );
  const dhbHeld = useMemo(() => Math.max(0, ...allTokens
    .filter(tk => (tk.chainId === BASE_CHAIN_ID || tk.chainId === BNB_CHAIN_ID) && dhbAddresses.has(tk.address.toLowerCase()))
    .map(tk => Number(formatUnits(tk.balance, tk.decimals)))), [allTokens, dhbAddresses]);

  const rows = useMemo<Row[]>(() => allTokens
    .filter(tk => TIP_FUNDING_CHAINS.includes(Number(tk.chainId)) && tk.balance > 0n && !dhbAddresses.has(tk.address.toLowerCase()))
    .map(tk => {
      const price = /^(USDC|USDT|USDC\.E|USDT0)$/i.test(tk.symbol) ? 1 : Number(prices[tk.symbol.toUpperCase()] ?? 0);
      return {
        chainId: Number(tk.chainId), address: tk.address, symbol: tk.symbol, decimals: tk.decimals,
        balance: tk.balance, isNative: tk.isNative, logo: tk.logo,
        usd: Number(formatUnits(tk.balance, tk.decimals)) * price,
      };
    })
    .filter(r => r.usd >= MIN_SOURCE_USD)
    .sort((a, b) => b.usd - a.usd), [allTokens, prices, dhbAddresses]);

  // Short of DHB → switch to the richest balance, once, unless the tipper chose.
  // Back to DHB when the amount drops within what they hold.
  const short = requireSource || (amountDhb > 0 && amountDhb > dhbHeld);
  useEffect(() => {
    if (userPicked.current) return;
    if (short && !value && rows.length) onChange(rows[0]);
    if (!short && value) onChange(null);
  }, [short, rows, value, onChange]);

  const debouncedAmount = useDebouncedValue(amountDhb, 600);
  const [plan, setPlan] = useState<TipFundingPlan | null>(null);
  const [planError, setPlanError] = useState('');
  const [quoting, setQuoting] = useState(false);
  useEffect(() => {
    setPlan(null);
    setPlanError('');
    if (!value || !walletAddress || !(debouncedAmount > 0)) return;
    let cancelled = false;
    setQuoting(true);
    planTipFunding({ source: value, amountDhb: debouncedAmount, dhbOnBase, walletAddress })
      .then(p => { if (!cancelled) setPlan(p); })
      .catch(e => { if (!cancelled) setPlanError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (!cancelled) setQuoting(false); });
    return () => { cancelled = true; };
  }, [value?.chainId, value?.address, debouncedAmount, walletAddress, dhbOnBase]);

  if (!rows.length && !value) return null;

  const pick = (source: TipFundingSource | null) => {
    userPicked.current = true;
    onChange(source);
    setOpen(false);
  };
  const selectedRow = value ? rows.find(r => sameSource(r, value)) ?? (value as Row) : null;
  const payAmount = plan ? formatPayAmount(plan) : null;

  return (
    <div className="rounded-xl border border-white/10 bg-white/5">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
        aria-expanded={open}
      >
        <span className="text-xs text-white/60">{t('tip.payWith', 'Pay with')}</span>
        <span className="ml-auto flex min-w-0 items-center gap-2">
          {selectedRow
            ? <TokenBadge symbol={selectedRow.symbol} logo={selectedRow.logo} chainId={selectedRow.chainId} />
            : <img src={dehubCoin} alt="" className="h-6 w-6" />}
          <span className="truncate text-sm font-medium text-white">
            {selectedRow ? `${selectedRow.symbol} · ${TIP_CHAIN_NAMES[selectedRow.chainId] ?? ''}` : 'DHB'}
          </span>
          <ChevronDown className={`h-4 w-4 shrink-0 text-white/50 transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {value && (
        <div className="border-t border-white/10 px-3 py-2 text-[11px] leading-relaxed">
          {quoting ? (
            <span className="inline-flex items-center gap-1.5 text-white/50">
              <Loader2 className="h-3 w-3 animate-spin" />
              {t('tip.payQuoting', 'Getting the best price…')}
            </span>
          ) : planError ? (
            <span className="text-amber-300/90">{planError}</span>
          ) : payAmount && plan && plan.kind !== 'none' ? (
            <span className="text-white/70">
              {t('tip.payQuote', '≈ {{amount}} {{symbol}} on {{chain}}', {
                amount: payAmount, symbol: plan.source.symbol, chain: TIP_CHAIN_NAMES[plan.source.chainId] ?? '',
              })}
              {' · '}
              <span className="text-white/45">
                {planUsesDpay(plan)
                  ? plan.kind === 'bridge'
                    ? t('tip.payViaBridgeDpay', 'Moved to Base and paid to DeHub Pay, DHB arrives in about a minute')
                    : t('tip.payViaDpay', 'Paid to DeHub Pay, DHB arrives in about 30s')
                  : plan.kind === 'bridge'
                    ? t('tip.payViaBridge', 'Swapped to DHB on Uniswap, arrives in ~{{seconds}}s', { seconds: Math.max(2, plan.fillSeconds) })
                    : t('tip.payViaSwap', 'Swapped to DHB on Uniswap')}
              </span>
            </span>
          ) : null}
        </div>
      )}

      {open && (
        <div className="max-h-56 overflow-y-auto overscroll-contain border-t border-white/10 py-1" data-vaul-no-drag>
          {!requireSource && <button
            type="button"
            onClick={() => pick(null)}
            className={`flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-white/5 ${!value ? 'bg-white/[0.07]' : ''}`}
          >
            <img src={dehubCoin} alt="" className="h-6 w-6" />
            <span className="flex-1 text-sm text-white">DHB</span>
            <span className="text-xs tabular-nums text-white/50">{dhbHeld.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
          </button>}
          {rows.map(r => (
            <button
              key={`${r.chainId}:${r.address}`}
              type="button"
              onClick={() => pick(r)}
              className={`flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-white/5 ${sameSource(r, value) ? 'bg-white/[0.07]' : ''}`}
            >
              <TokenBadge symbol={r.symbol} logo={r.logo} chainId={r.chainId} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm text-white">{r.symbol}</span>
                <span className="text-[10px] text-white/40">{TIP_CHAIN_NAMES[r.chainId]}</span>
              </span>
              <span className="text-xs tabular-nums text-white/50">${r.usd.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
