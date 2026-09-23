import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatUnits } from 'ethers';
import { toast } from 'sonner';
import { ImagePlus, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { useWalletLocked } from '@/hooks/use-wallet-locked';
import { useAllChainsTokens } from '@/hooks/use-wallet-tokens';
import { useTokenPrices } from '@/hooks/use-token-prices';
import { useQueryClient } from '@tanstack/react-query';
import { BASE_CHAIN_ID } from '@/lib/contracts/dhb-token';
import { dexActionError } from '@/lib/dex/action-error';
import { formatSize } from '@/lib/dex/orderbook';
import {
  FEE_ASSETS, POOL_CHAINS, POOL_CHAIN_INFO, POOL_FEE_USD, checkToken, createPool, isTokenAddress, payFee, planFee, uploadPoolImage,
  type DexPool, type FeeAssetSymbol, type PoolChain, type TokenCheck,
} from '@/lib/dex/pools';
import dhbCoinImage from '@/assets/dehub-coin.png';

/** A fee that was paid but whose pool was not saved yet; retried with the same transfer. */
const PAID_KEY = 'dex-pool-fee-paid';
type PaidFee = { chain: PoolChain; tokenAddress: string; txHash: string; imageUrl: string | null; wallet: string };
const readPaid = (wallet: string | null): PaidFee | null => {
  try {
    const saved = JSON.parse(localStorage.getItem(PAID_KEY) || 'null') as PaidFee | null;
    return saved && wallet && saved.wallet === wallet.toLowerCase() ? saved : null;
  } catch { return null; }
};
const writePaid = (value: PaidFee | null) => {
  try { if (value) localStorage.setItem(PAID_KEY, JSON.stringify(value)); else localStorage.removeItem(PAID_KEY); } catch { /* the hash is also on chain */ }
};

export function AddPoolDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; onCreated: (pool: DexPool) => void }) {
  const { t } = useTranslation();
  const { walletAddress, connect, requestWalletUnlock } = useAuth();
  const walletLocked = useWalletLocked();
  const queryClient = useQueryClient();
  const { allTokens } = useAllChainsTokens();
  const { data: prices = {} } = useTokenPrices();
  const [chain, setChain] = useState<PoolChain>('base');
  const [address, setAddress] = useState('');
  const [check, setCheck] = useState<TokenCheck | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [image, setImage] = useState<{ file: File; preview: string } | null>(null);
  const [payWith, setPayWith] = useState<FeeAssetSymbol | null>(null);
  const [busy, setBusy] = useState<'' | 'upload' | 'quote' | 'pay' | 'create'>('');
  const fileInput = useRef<HTMLInputElement>(null);
  const paid = readPaid(walletAddress);

  useEffect(() => {
    if (!open) { setError(''); return; }
    if (paid) { setChain(paid.chain); setAddress(paid.tokenAddress); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Look the token up as soon as the address is well formed.
  useEffect(() => {
    setCheck(null); setError('');
    if (!isTokenAddress(chain, address)) return;
    let live = true;
    setChecking(true);
    checkToken(chain, address).then((result) => { if (live) setCheck(result); })
      .catch((e) => { if (live) setError(dexActionError(e, t('dex.pools.lookupFailed'))); })
      .finally(() => { if (live) setChecking(false); });
    return () => { live = false; };
  }, [chain, address, t]);

  const dhbUsd = check?.dhbUsd ?? (prices.DHB || null);
  const feeDhb = check?.feeDhb ?? (dhbUsd ? Math.ceil(POOL_FEE_USD / dhbUsd) : null);
  const priceOf = (symbol: FeeAssetSymbol) => symbol === 'DHB' ? dhbUsd ?? 0 : symbol === 'USDC' || symbol === 'USDT' ? 1 : Number(prices[symbol] ?? 0);
  const balances = useMemo(() => FEE_ASSETS.map((asset) => {
    const token = allTokens.find((tk) => tk.chainId === BASE_CHAIN_ID && (asset.symbol === 'ETH' ? tk.isNative : tk.address.toLowerCase() === asset.address.toLowerCase()));
    const amount = token ? Number(formatUnits(token.balance, asset.decimals)) : 0;
    return { asset, amount, usd: amount * priceOf(asset.symbol) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [allTokens, prices, dhbUsd]);
  // DHB when it covers the fee; otherwise whatever holds the most dollars.
  const defaultAsset = useMemo(() => {
    const dhb = balances.find((b) => b.asset.symbol === 'DHB');
    if (dhb && feeDhb && dhb.amount >= feeDhb) return 'DHB';
    return [...balances].filter((b) => b.asset.symbol !== 'DHB').sort((a, b) => b.usd - a.usd)[0]?.asset.symbol ?? 'DHB';
  }, [balances, feeDhb]);
  const selected = payWith ?? defaultAsset;
  const selectedBalance = balances.find((b) => b.asset.symbol === selected);
  const covers = selected === 'DHB' ? !!feeDhb && (selectedBalance?.amount ?? 0) >= feeDhb : (selectedBalance?.usd ?? 0) >= POOL_FEE_USD * 1.04;

  const pickImage = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/') || file.size > 5 * 1024 * 1024) { setError(t('dex.pools.imageRules')); return; }
    setImage((old) => { if (old) URL.revokeObjectURL(old.preview); return { file, preview: URL.createObjectURL(file) }; });
  };

  async function submit() {
    if (!walletAddress) { await connect(); return; }
    if (walletLocked) { requestWalletUnlock(); return; }
    if (!check || check.exists) return;
    setError('');
    try {
      let imageUrl = paid?.imageUrl ?? null;
      if (image && !paid) { setBusy('upload'); imageUrl = await uploadPoolImage(image.file); }
      let txHash = paid?.txHash;
      if (!txHash) {
        if (!feeDhb) throw new Error(t('dex.pools.priceUnavailable'));
        setBusy('quote');
        const asset = FEE_ASSETS.find((a) => a.symbol === selected)!;
        const plan = await planFee(asset, feeDhb, priceOf(selected), walletAddress);
        setBusy('pay');
        txHash = await payFee(plan, walletAddress);
        writePaid({ chain, tokenAddress: address.trim(), txHash, imageUrl, wallet: walletAddress.toLowerCase() });
      }
      setBusy('create');
      const pool = await createPool({ chain, tokenAddress: address.trim(), txHash, imageUrl });
      writePaid(null);
      await queryClient.invalidateQueries({ queryKey: ['dex-pools'] });
      toast.success(t('dex.pools.created', { symbol: pool.symbol }));
      onOpenChange(false); setAddress(''); setImage(null); setCheck(null);
      onCreated(pool);
    } catch (e) {
      setError(dexActionError(e, t('dex.pools.createFailed')));
    } finally { setBusy(''); }
  }

  const tokenImage = image?.preview ?? check?.token?.imageUrl ?? null;
  const busyLabel = { '': '', upload: t('dex.pools.uploading'), quote: t('dex.pools.quoting'), pay: t('dex.pools.paying'), create: t('dex.pools.opening') }[busy];

  return <Dialog open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next); }}>
    <DialogContent className="dex-modal max-w-md">
      <DialogTitle>{t('dex.pools.addTitle')}</DialogTitle>
      <DialogDescription className="dex-muted">{t('dex.pools.addDescription')}</DialogDescription>
      <fieldset disabled={!!busy || !!paid} className="dex-modal-body">
        <div className="dex-field">{t('dex.pools.network')}<div className="dex-chain-chips" role="radiogroup" aria-label={t('dex.pools.network')}>
          {POOL_CHAINS.map((value) => <button key={value} type="button" role="radio" aria-checked={chain === value} className={chain === value ? 'active' : ''} onClick={() => setChain(value)}>{POOL_CHAIN_INFO[value].name}</button>)}
        </div></div>
        <label className="dex-field">{t('dex.pools.contract')}<div className="dex-input"><input aria-label={t('dex.pools.contract')} placeholder={chain === 'solana' ? t('dex.pools.mintPlaceholder') : '0x…'} value={address} spellCheck={false} autoComplete="off" onChange={(e) => setAddress(e.target.value.trim())} /></div></label>
      </fieldset>
      {checking && <div className="dex-pool-note" role="status"><Loader2 size={13} className="animate-spin" /> {t('dex.pools.lookingUp')}</div>}
      {check?.exists && check.pool && <div className="dex-review">{t('dex.pools.exists', { symbol: check.pool.symbol })}<br /><button type="button" className="dex-link-button" onClick={() => { onOpenChange(false); onCreated(check.pool!); }}>{t('dex.pools.openExisting')}</button></div>}
      {check?.token && !check.exists && <>
        <div className="dex-token-preview">
          <button type="button" className="dex-token-image" disabled={!!busy || !!paid} onClick={() => fileInput.current?.click()} aria-label={t('dex.pools.setImage')}>
            {tokenImage ? <img src={tokenImage} alt="" /> : <ImagePlus size={20} />}
          </button>
          <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => pickImage(e.target.files?.[0])} />
          <div><b>{check.token.name}</b><small>{check.token.symbol} · {POOL_CHAIN_INFO[chain].name}{check.token.priceUsd ? ` · $${check.token.priceUsd.toPrecision(4)}` : ''}</small><small>{t('dex.pools.imageHint')}</small></div>
        </div>
        <div className="dex-fee">
          <img src={dhbCoinImage} alt="DHB" width={30} height={30} />
          <div><b>${POOL_FEE_USD}</b><small>{feeDhb ? t('dex.pools.feeDhb', { amount: formatSize(feeDhb) }) : t('dex.pools.priceUnavailable')}</small></div>
          {!paid && <label className="dex-fee-pay">{t('dex.payWith')}<select value={selected} onChange={(e) => setPayWith(e.target.value as FeeAssetSymbol)} aria-label={t('dex.payWith')}>
            {balances.map((b) => <option key={b.asset.symbol} value={b.asset.symbol}>{b.asset.symbol} · ${b.usd.toLocaleString('en-US', { maximumFractionDigits: 2 })}</option>)}
          </select></label>}
        </div>
        {!paid && selected !== 'DHB' && <p className="dex-help">{t('dex.pools.swapNote', { symbol: selected })}</p>}
        {paid && <p className="dex-help">{t('dex.pools.alreadyPaid')}</p>}
      </>}
      {error && <div role="alert" className="dex-alert dex-error">{error}</div>}
      <button type="button" className="dex-submit" disabled={!!busy || !check?.token || !!check?.exists || (!!walletAddress && !paid && !covers)} onClick={() => void submit()}>
        {busy ? busyLabel : !walletAddress ? t('dex.connectWallet') : paid ? t('dex.pools.finish') : !covers && check?.token ? t('dex.pools.notEnough') : t('dex.pools.payAndOpen', { amount: POOL_FEE_USD })}
      </button>
      {paid && !busy && <button type="button" className="dex-link-button" onClick={() => { writePaid(null); setAddress(''); onOpenChange(false); }}>{t('dex.pools.discardPaid')}</button>}
    </DialogContent>
  </Dialog>;
}
