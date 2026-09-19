import { sendSolanaPurchase, connectPurchaseSolanaWallet } from '@/lib/wallet/solana-purchase';
import { usePaymentPicker } from '@/hooks/use-payment-picker';
import { loadPaymentBalances } from '@/lib/wallet/payment-balances';
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { isBuyRoute } from '@/lib/buy-route';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cryptoPurchaseApi } from '@/lib/api/crypto-purchase';
import { canSendPayment, estimateMinutes, formatPaymentAmount, paymentChainName, purchasePhase, validDhbAmount } from '@/lib/crypto-purchase';
import { useCryptoPurchase } from '@/hooks/use-crypto-purchase';
import { refreshWalletBalances } from '@/lib/wallet/balance-refresh';
import { sendNativeToken, sendERC20Token } from '@/lib/wallet/send';
import type { Purchase } from '@/lib/crypto-purchase';
import type { ChainId } from '@/components/app/ChainSelector';
import { Interface, formatUnits, parseUnits } from 'ethers';
import { ensureSignerOnChain, getActiveProvider, rpcRequest, writeBatchAA } from '@/lib/contracts/aa-utils';
import { getAccount } from '@wagmi/core';
import { wagmiConfig } from '@/lib/wagmi';
import { ArrowDown } from 'lucide-react';
import dehubCoin from '@/assets/dehub-coin.png';
import ethLogo from '@/assets/eth-logo.png';
import usdcLogo from '@/assets/usdc-logo.png';
import usdtLogo from '@/assets/usdt-logo.png';
import btcLogo from '@/assets/btc-logo.png';
import solLogo from '@/assets/icons/solana-logo.png';
import bnbLogo from '@/assets/bnb-logo.png';

const tokenLogos: Record<string, string> = { ETH: ethLogo, USDC: usdcLogo, USDT: usdtLogo, BTC: btcLogo, SOL: solLogo, BNB: bnbLogo };

function PaymentPair({ payAmount, paySymbol, payChain, receiveAmount }: { payAmount?: string; paySymbol?: string; payChain?: string; receiveAmount: number }) {
  const { t } = useTranslation();
  const payLogo = paySymbol ? tokenLogos[paySymbol] : undefined;
  return <div className="relative space-y-2" aria-label={t('nearBuy.title')}>
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3.5">
      <div className="flex items-center justify-between text-xs text-zinc-400"><span>{t('buyCoins.youPay')}</span><span>{payChain ? paymentChainName(payChain) : ''}</span></div>
      <div className="mt-2 flex items-center gap-3">
        {payLogo ? <img src={payLogo} alt="" className="h-9 w-9 shrink-0 rounded-full object-contain" /> : <div className="h-9 w-9 shrink-0 rounded-full bg-white/10" />}
        <span className="min-w-0 flex-1 truncate text-xl font-semibold tabular-nums text-white">{payAmount ? `≈${formatPaymentAmount(payAmount)}` : '—'}</span>
        <span className="text-sm font-semibold text-white">{paySymbol || '—'}</span>
      </div>
    </div>
    <div className="relative z-10 -my-4 flex justify-center"><span className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/15 bg-zinc-900 text-white"><ArrowDown className="h-4 w-4" /></span></div>
    <div className="rounded-2xl border border-white/15 bg-white/[0.07] px-4 py-3.5">
      <div className="flex items-center justify-between text-xs text-zinc-400"><span>{t('buyCoins.youReceive')}</span><span>Base</span></div>
      <div className="mt-2 flex items-center gap-3"><img src={dehubCoin} alt="" className="h-9 w-9 shrink-0 rounded-full object-contain" /><span className="min-w-0 flex-1 truncate text-xl font-semibold tabular-nums text-white">{receiveAmount > 0 ? receiveAmount.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—'}</span><span className="text-sm font-semibold text-white">DHB</span></div>
    </div>
  </div>;
}

export function NearIntentBuy({ tokensToReceive, active, onDelivered }: { tokensToReceive: number; active?: boolean; onDelivered?: () => void }) {
  const { t } = useTranslation();
  const { walletAddress, user, refreshUser } = useAuth();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [visible, setVisible] = useState(document.visibilityState === 'visible');
  const [search, setSearch] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [connectingSolana, setConnectingSolana] = useState(false);
  const amount = Math.floor(tokensToReceive);
  const isActive = visible && (active || isBuyRoute(location.pathname));
  const flow = useCryptoPurchase(cryptoPurchaseApi, walletAddress || '', amount, isActive, user?.solanaAddress || undefined);
  const { purchase, quote, selected, busy } = flow;
  const deliveredRef = useRef<string | null>(null);
  const picker = usePaymentPicker(flow.assets, walletAddress || '', user?.solanaAddress || undefined, isActive, loadPaymentBalances, flow.selectAsset);
  const sendPayment = async (receipt: Purchase) => {
    if (receipt.paymentChainId === 101) return sendSolanaPurchase(receipt);
    const chain = receipt.paymentChainId as ChainId;
    if (!chain || receipt.paymentDecimals == null) throw new Error(t('nearBuy.statusError'));
    await ensureSignerOnChain(chain);
    const { provider } = await getActiveProvider(chain);
    const sender = provider ? (await provider.request({ method: 'eth_accounts' }))?.[0] : getAccount(wagmiConfig).address;
    if (sender?.toLowerCase() !== receipt.refundTo?.toLowerCase()) throw new Error(t('nearBuy.wrongWallet'));
    if (receipt.expiresAt * 1000 <= Date.now()) throw new Error(t('nearBuy.phase_expired'));
    if (!receipt.paymentTokenAddress || receipt.wrapNativePayment) {
      const required = parseUnits(receipt.amountInFormatted, receipt.paymentDecimals);
      const balance = BigInt(await rpcRequest<string>('eth_getBalance', [sender, 'latest'], chain));
      if (balance < required) {
        const symbol = receipt.originSymbol || 'native token';
        throw new Error(`Insufficient ${symbol} on ${paymentChainName(receipt.originBlockchain || '')}. Your wallet has ${formatPaymentAmount(formatUnits(balance, receipt.paymentDecimals))} ${symbol}; this payment needs ${formatPaymentAmount(receipt.amountInFormatted)} ${symbol}. Choose another currency or a smaller amount.`);
      }
    }
    if (receipt.wrapNativePayment && receipt.paymentTokenAddress) {
      if (!provider?.smartAccount) return (await sendNativeToken(receipt.depositAddress, receipt.amountInFormatted, receipt.paymentDecimals, chain)).hash;
      const token = new Interface(['function deposit() payable', 'function transfer(address to,uint256 amount) returns (bool)']);
      const value = parseUnits(receipt.amountInFormatted, receipt.paymentDecimals);
      return (await writeBatchAA([
        { to: receipt.paymentTokenAddress, data: token.encodeFunctionData('deposit') as `0x${string}`, value },
        { to: receipt.paymentTokenAddress, data: token.encodeFunctionData('transfer', [receipt.depositAddress, value]) as `0x${string}` },
      ], { chainId: chain, context: 'crypto purchase', sponsored: false })).hash;
    }
    const sent = receipt.paymentTokenAddress
      ? await sendERC20Token(receipt.paymentTokenAddress, receipt.depositAddress, receipt.amountInFormatted, receipt.paymentDecimals, chain)
      : await sendNativeToken(receipt.depositAddress, receipt.amountInFormatted, receipt.paymentDecimals, chain);
    return sent.hash;
  };
  const connectSolana = async () => {
    setConnectingSolana(true);
    try { await connectPurchaseSolanaWallet(walletAddress || ''); await refreshUser(); }
    catch (error) { toast.error(error instanceof Error ? error.message : t('nearBuy.statusError')); }
    finally { setConnectingSolana(false); }
  };
  const begin = async () => {
    picker.lockSelection();
    if (!quote) return flow.price();
    const saved = await flow.create();
    if (saved?.route === 'direct' && saved.amountInFormatted === quote.amountInFormatted) await flow.pay(saved, sendPayment);
  };
  useEffect(() => { if (selected?.blockchain === 'sol' && user?.solanaAddress) flow.setRefund(user.solanaAddress); }, [selected?.assetId, user?.solanaAddress]);
  const needsSolana = selected?.route === 'direct' && selected?.blockchain === 'sol' && (!user?.solanaAddress || !user?.solanaAddressVerifiedAt);
  const phase = purchase ? purchasePhase(purchase, flow.now) : null;
  const minutes = estimateMinutes(purchase?.timeEstimateSeconds ?? quote?.timeEstimateSeconds);
  const rows = picker.rows.filter(asset => `${asset.symbol} ${paymentChainName(asset.blockchain)} ${asset.contractAddress || ''} ${asset.assetId}`.toLowerCase().includes((picker.other ? search : '').trim().toLowerCase()));

  useEffect(() => {
    const visibility = () => setVisible(document.visibilityState === 'visible');
    const online = () => flow.refresh();
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('online', online);
    return () => { document.removeEventListener('visibilitychange', visibility); window.removeEventListener('online', online); };
  }, [flow.refresh]);
  useEffect(() => {
    if (purchase?.tokenSendStatus === 'sent' && purchase.id !== deliveredRef.current) {
      deliveredRef.current = purchase.id;
      refreshWalletBalances(queryClient);
      onDelivered?.();
    }
  }, [purchase?.id, purchase?.tokenSendStatus, queryClient, onDelivered]);
  const copy = async (value: string) => {
    try { await navigator.clipboard.writeText(value); toast.success(t('nearBuy.copied')); }
    catch { toast.error(t('nearBuy.copyFailed')); }
  };
  const direct = purchase ? purchase.route === 'direct' : selected?.route === 'direct';
  const estimate = <p className="text-xs text-zinc-400">{direct ? t('nearBuy.directTiming') : <>{minutes ? t('nearBuy.swapEstimate', { minutes }) : t('nearBuy.estimateUnknown')} {t('nearBuy.confirmationTime')}</>}</p>;
  const field = 'bg-zinc-800 border-zinc-700 text-white';

  return <section data-page-bento className="bg-zinc-900 rounded-2xl p-4 space-y-4" aria-label={t('nearBuy.title')}>
    <div><h2 className="text-white font-semibold">{t('nearBuy.title')}</h2><p className="text-xs text-zinc-400 mt-1">{t('nearBuy.description')}</p></div>
    {flow.historyFailed && <p role="alert" className="text-amber-300 text-sm">{t('nearBuy.historyError')} <button onClick={flow.refresh} className="underline">{t('nearBuy.retry')}</button></p>}
    {purchase ? <div className="space-y-3">
      <div aria-live="polite" className="space-y-1"><h3 className="text-white font-semibold">{t(`nearBuy.phase_${phase}`)}</h3><p className="text-zinc-400 text-sm">{t(direct && phase === 'awaiting' ? 'nearBuy.reviewPay' : `nearBuy.detail_${phase}`)}</p></div>
      <PaymentPair payAmount={purchase.amountInFormatted} paySymbol={purchase.originSymbol} payChain={purchase.originBlockchain} receiveAmount={Number(purchase.tokenReceived || purchase.estimatedTokensToReceive || 0)} />
      {flow.statusFailed && <p role="alert" className="text-amber-300 text-sm">{t('nearBuy.statusError')}</p>}
      {phase === 'awaiting' && !canSendPayment(purchase, flow.now) && <p role="alert" className="text-amber-300 text-sm">{t('nearBuy.statusError')}</p>}
      <Button variant="glass" onClick={flow.refresh}>{t('nearBuy.checkStatus')}</Button>
      {flow.lastChecked && <p className="text-xs text-zinc-500">{t('nearBuy.lastChecked', { time: new Date(flow.lastChecked).toLocaleTimeString() })}</p>}
      {!direct && canSendPayment(purchase, flow.now) && <p className="text-xs text-amber-200">{t('nearBuy.sendExact', { amount: purchase.amountInFormatted || '', symbol: purchase.originSymbol || '', chain: paymentChainName(purchase.originBlockchain || '') })}</p>}
      <div className="space-y-1 text-xs text-zinc-500">{estimate}<p>{t('nearBuy.gasReserve', { amount: (purchase.gasReserveUsd || 0).toFixed(4) })}</p><p>{t('nearBuy.saved')}</p></div>
      <p className="text-xs text-zinc-400">{t('nearBuy.deadline', { date: new Date(purchase.expiresAt * 1000).toLocaleString() })}</p>
      {direct && canSendPayment(purchase, flow.now) && <Button variant="glass" className="w-full" disabled={!!busy} onClick={() => flow.pay(purchase, sendPayment)}>{busy ? t('nearBuy.loading') : t('nearBuy.pay')}</Button>}
      {!direct && <div className="rounded-lg bg-zinc-800 p-3 break-all font-mono text-xs text-white select-all">{purchase.depositAddress}</div>}
      {!direct && canSendPayment(purchase, flow.now) && <Button variant="glass" className="w-full" onClick={() => copy(purchase.depositAddress)}>{t('nearBuy.copyPayment')}</Button>}
      {purchase.depositMemo != null && <div className="rounded-xl border border-amber-400/40 p-3 space-y-2"><p className="text-amber-300 text-sm">{t('nearBuy.memoNotice')}</p><p className="text-white font-mono break-all select-all">{purchase.depositMemo}</p>{canSendPayment(purchase, flow.now) && <Button variant="glass" onClick={() => copy(purchase.depositMemo!)}>{t('nearBuy.copyMemo')}</Button>}</div>}
      {!direct && <p className="text-xs text-zinc-400 break-all">{t('nearBuy.refundReceipt', { address: purchase.refundTo || '' })}</p>}
      <p className="text-xs text-zinc-400 break-all">{t('nearBuy.destination', { address: purchase.receiverAddress || walletAddress })}</p>
      {purchase.tokenSendTxnHash && /^0x[0-9a-fA-F]{64}$/.test(purchase.tokenSendTxnHash) && <a className="text-white underline text-sm" href={`https://basescan.org/tx/${purchase.tokenSendTxnHash}`} target="_blank" rel="noreferrer">{t('nearBuy.viewDelivery')}</a>}
      <button className="block text-xs text-zinc-400 underline break-all" onClick={() => copy(purchase.id)}>{t('nearBuy.purchaseId', { id: purchase.id })}</button>
      <Button variant="ghost" className="w-full text-white" onClick={() => { flow.setPurchase(null); setAgreed(false); }}>{t('nearBuy.startAnother')}</Button>
    </div> : <>
      <div className="flex flex-wrap gap-2" role="group" aria-label={t('nearBuy.currency')}>
        {picker.currencies.map(symbol => <button key={symbol} disabled={!!busy} aria-pressed={!picker.other && picker.currency === symbol} onClick={() => { picker.chooseCurrency(symbol); setAgreed(false); }} className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm ${!picker.other && picker.currency === symbol ? 'border-white/40 bg-white/15 text-white' : 'border-white/10 bg-zinc-800 text-zinc-300'}`}>{tokenLogos[symbol] && <img src={tokenLogos[symbol]} alt="" className="h-6 w-6 rounded-full object-contain" />}{symbol}</button>)}
      </div>
      <p className="text-xs text-zinc-400">{t(picker.loading ? 'nearBuy.checkingBalances' : picker.hasFunds ? 'nearBuy.walletBalances' : 'nearBuy.noWalletFunds')}</p>
      <button className="text-sm text-white underline" onClick={() => { picker.showOther(); setSearch(''); }}>{t('nearBuy.otherCurrencies')}</button>
      {picker.other && <Input value={search} onChange={e => setSearch(e.target.value)} disabled={busy === 'create'} placeholder={t('nearBuy.search')} aria-label={t('nearBuy.search')} className={field} />}
      <div className="max-h-52 overflow-y-auto space-y-1" role="group" aria-label={t('nearBuy.search')}>
        {rows.map(asset => <button key={asset.assetId} disabled={busy === 'create'} aria-pressed={asset.assetId === flow.assetId} onClick={() => { picker.choose(asset); setAgreed(false); }} className={`w-full text-left px-3 py-2 rounded-lg text-sm ${asset.assetId === flow.assetId ? 'bg-white/20 text-white' : 'bg-zinc-800 text-zinc-300'}`}><span className="flex items-center gap-2">{tokenLogos[asset.symbol] && <img src={tokenLogos[asset.symbol]} alt="" className="h-5 w-5 rounded-full object-contain" />}<strong>{asset.symbol}</strong> · {paymentChainName(asset.blockchain)}</span><span className="block text-xs text-zinc-400">{t(picker.balances[asset.assetId] == null ? 'nearBuy.balanceUnknown' : 'nearBuy.balanceAmount', { amount: picker.balances[asset.assetId], symbol: asset.symbol })}</span>{picker.other && asset.contractAddress && <span className="block text-[10px] text-zinc-500 break-all">{asset.contractAddress}</span>}</button>)}
        {flow.loading && <p className="text-zinc-400 text-sm">{t('nearBuy.loading')}</p>}
        {flow.assetsFailed && <p className="text-amber-300 text-sm">{t('nearBuy.tokensError')} <button className="underline" onClick={flow.refresh}>{t('nearBuy.retry')}</button></p>}
        {!flow.loading && !flow.assetsFailed && rows.length === 0 && <p className="text-zinc-400 text-sm">{t('nearBuy.noMatches')}</p>}
      </div>
      {selected && (picker.other || selected.symbol === picker.currency) && <>
        {!direct && <><label className="block text-sm text-zinc-300">{t('nearBuy.refundAddress', { chain: paymentChainName(selected.blockchain) })}<Input value={flow.refund} onChange={e => flow.setRefund(e.target.value)} disabled={!!busy} placeholder={t('nearBuy.refundPlaceholder')} className={`mt-1 ${field}`} /></label>
        <p className="text-xs text-zinc-400">{t('nearBuy.refundHint')}</p></>}
        <PaymentPair payAmount={quote?.amountInFormatted} paySymbol={selected.symbol} payChain={selected.blockchain} receiveAmount={quote?.estimatedTokensToReceive || amount} />
        {quote && <div className="space-y-1 text-xs text-zinc-500"><p>{t('nearBuy.gasReserve', { amount: (quote.gasReserveUsd || 0).toFixed(4) })}</p>{estimate}</div>}
        {quote && <label className="flex gap-2 text-xs text-zinc-300"><input type="checkbox" checked={agreed} disabled={busy === 'create'} onChange={e => setAgreed(e.target.checked)} /><span>{t('nearBuy.acceptTerms')} <a href="https://docs.dhb.gg/docs/terms-of-service" target="_blank" rel="noreferrer" className="underline">{t('nearBuy.terms')}</a></span></label>}
        {needsSolana && <Button variant="glass" className="w-full" disabled={connectingSolana} onClick={connectSolana}>{t(connectingSolana ? 'nearBuy.loading' : 'nearBuy.connectSolana')}</Button>}
        {!needsSolana && <Button variant="glass" className="w-full" disabled={flow.loading || flow.historyFailed || !!busy || !validDhbAmount(amount) || (!!quote && (!flow.refund.trim() || !agreed))} onClick={begin}>{busy ? t('nearBuy.loading') : quote ? t(direct ? 'nearBuy.pay' : 'nearBuy.paymentAction') : t('nearBuy.getQuote')}</Button>}
      </>}
    </>}
    {flow.error && <p role="alert" className="text-sm text-red-400">{flow.error}</p>}
    {flow.history.length > 0 && <div className="border-t border-white/10 pt-3 space-y-2"><h3 className="text-sm text-white">{t('nearBuy.history')}</h3><div className="max-h-48 overflow-y-auto space-y-1">{flow.history.map(row => <button key={row.id} onClick={() => { flow.setPurchase(row); flow.refresh(); }} className="w-full p-2 rounded-lg bg-zinc-800 text-left text-xs text-zinc-300"><span>{row.originSymbol} · {paymentChainName(row.originBlockchain || '')} · {t(`nearBuy.phase_${purchasePhase(row, flow.now)}`)}</span><span className="block text-zinc-500">{row.createdAt ? new Date(row.createdAt).toLocaleString() : row.id}</span></button>)}</div></div>}
  </section>;
}
