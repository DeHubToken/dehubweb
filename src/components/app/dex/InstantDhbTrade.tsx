import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatUnits, parseUnits } from 'ethers';
import { toast } from 'sonner';
import { Zap } from 'lucide-react';
import { DhbAmount } from '@/components/app/DhbAmount';
import { useAuth } from '@/contexts/AuthContext';
import { useWalletLocked } from '@/hooks/use-wallet-locked';
import { BASE_CHAIN_ID, CHAIN_CONFIGS } from '@/lib/contracts/dhb-token';
import type { WalletToken } from '@/lib/wallet/tokens';
import { dexActionError } from '@/lib/dex/action-error';
import { formatSize } from '@/lib/dex/orderbook';
import { NATIVE, quoteSwap, runSwap, type SwapCall } from '@/lib/dex/evm-swap';
import { POOL_CHAIN_INFO } from '@/lib/dex/pools';

const DHB = CHAIN_CONFIGS[BASE_CHAIN_ID].dhbToken;
const USDC = POOL_CHAIN_INFO.base.usdc;
type Pay = 'USDC' | 'ETH';

/** Market buy / sell of DHB on Base at the best aggregated price, beside the range-order ticket. */
export function InstantDhbTrade({ tokens, onDone }: { tokens: WalletToken[]; onDone: () => void }) {
  const { t } = useTranslation();
  const { walletAddress, connect, requestWalletUnlock } = useAuth();
  const walletLocked = useWalletLocked();
  const [side, setSide] = useState<'buy' | 'sell' | null>(null);
  const [pay, setPay] = useState<Pay>('USDC');
  const [amount, setAmount] = useState('');
  const [quote, setQuote] = useState<SwapCall | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { setQuote(null); setError(''); }, [side, pay, amount]);

  const held = (address: string | 'native') => tokens.find((tk) => tk.chainId === BASE_CHAIN_ID && (address === 'native' ? tk.isNative : tk.address.toLowerCase() === address.toLowerCase()));
  const spend = side === 'sell' ? { symbol: 'DHB', address: DHB, decimals: 18 }
    : pay === 'ETH' ? { symbol: 'ETH', address: NATIVE, decimals: 18 } : { symbol: 'USDC', address: USDC, decimals: 6 };
  const balanceToken = held(spend.symbol === 'ETH' ? 'native' : spend.address);
  const balance = balanceToken ? Number(formatUnits(balanceToken.balance, spend.decimals)) : 0;

  async function submit() {
    if (!walletAddress) { await connect(); return; }
    if (walletLocked) { requestWalletUnlock(); return; }
    if (!side) return;
    setBusy(true); setError('');
    try {
      const value = Number(amount);
      if (!(value > 0) || value > balance) throw new Error(t('dex.checkAmount', { token: spend.symbol }));
      if (!quote) {
        const [whole, fraction = ''] = amount.split('.');
        const units = parseUnits(fraction ? `${whole}.${fraction.slice(0, spend.decimals)}` : whole, spend.decimals);
        setQuote(await quoteSwap({ chainId: BASE_CHAIN_ID, tokenIn: spend.address, tokenOut: side === 'buy' ? DHB : USDC, amountIn: units, recipient: walletAddress }));
        return;
      }
      await runSwap(quote, walletAddress);
      toast.success(t(side === 'buy' ? 'dex.pool.bought' : 'dex.pool.sold', { amount: formatSize(side === 'buy' ? Number(formatUnits(quote.amountOut, 18)) : value), symbol: 'DHB' }));
      setAmount(''); setQuote(null); onDone();
    } catch (e) { setError(dexActionError(e, t('dex.prepareFailed'))); }
    finally { setBusy(false); }
  }

  const out = quote ? Number(formatUnits(quote.amountOut, side === 'buy' ? 18 : 6)) : null;
  return <div className="dex-instant-box">
    <div className="dex-instant-row">
      <button type="button" className={`dex-instant dex-instant-buy ${side === 'buy' ? 'active' : ''}`} aria-pressed={side === 'buy'} onClick={() => setSide(side === 'buy' ? null : 'buy')}><Zap size={13} />{t('dex.pool.instantBuy')}</button>
      <button type="button" className={`dex-instant dex-instant-sell ${side === 'sell' ? 'active' : ''}`} aria-pressed={side === 'sell'} onClick={() => setSide(side === 'sell' ? null : 'sell')}><Zap size={13} />{t('dex.pool.instantSell')}</button>
    </div>
    {side && <fieldset disabled={busy}>
      {side === 'buy' && <label className="dex-field">{t('dex.payWith')}<div className="dex-input"><select className="dex-pay-select" aria-label={t('dex.payWith')} value={pay} onChange={(e) => setPay(e.target.value as Pay)}>
        <option value="USDC">USDC · {formatSize(Number(formatUnits(held(USDC)?.balance ?? 0n, 6)))}</option>
        <option value="ETH">ETH · {formatSize(Number(formatUnits(held('native')?.balance ?? 0n, 18)))}</option>
      </select></div></label>}
      <label className="dex-field">{t(side === 'buy' ? 'dex.spend' : 'dex.sellAmount')}<div className="dex-input"><input inputMode="decimal" placeholder="0.00" aria-label={t('dex.amountToken', { token: spend.symbol })} value={amount} onChange={(e) => setAmount(e.target.value.replace(',', '.').trim())} /><span>{spend.symbol}</span></div></label>
      <div className="dex-available"><span>{t('dex.available')}</span><span>{formatSize(balance)} {spend.symbol}</span></div>
      <dl><dt>{t('dex.pool.youReceive')}</dt><dd>{out != null ? <DhbAmount amount={formatSize(out)} currency={side === 'buy' ? 'DHB' : 'USDC'} /> : '—'}</dd></dl>
      {error && <div role="alert" className="dex-alert dex-error">{error}</div>}
      <button type="button" className={`dex-submit ${side === 'sell' ? 'sell' : ''}`} disabled={busy || !(Number(amount) > 0)} onClick={() => void submit()}>
        {busy ? quote ? t('dex.stage.swap') : t('dex.stage.quote') : quote ? t(side === 'buy' ? 'dex.pool.confirmInstantBuy' : 'dex.pool.confirmInstantSell') : t(side === 'buy' ? 'dex.pool.instantBuy' : 'dex.pool.instantSell')}
      </button>
      <p className="dex-help">{t('dex.pool.instantNote')}</p>
    </fieldset>}
  </div>;
}
