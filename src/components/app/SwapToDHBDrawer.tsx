/**
 * Buy DHB Drawer
 * =============
 * Buys DHB from the dpay gateway at the fixed peg, paying with any accepted
 * in-wallet token on Base. This used to swap against the 1% DHB/WETH pool on
 * Uniswap — the entire market for DHB, and priced well above the peg.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { DhbCoin } from '@/components/app/DhbAmount';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { AppState } from '@/components/app/AppState';
import { Input } from '@/components/ui/input';
import { Loader2, ArrowDown, CheckCircle2, AlertCircle, CreditCard, Wallet, Plus, ChevronDown } from 'lucide-react';
import { CrossChainDepositDrawer } from '@/components/app/command-centre/CrossChainDepositDrawer';
import { sendNativeToken, sendERC20Token } from '@/lib/wallet/send';
import {
  getCryptoPayableAssets,
  getCryptoQuote,
  createCryptoIntent,
  getCryptoIntentStatus,
  getDirectQuote,
  createDirectIntent,
  confirmDirectDeposit,
  type CryptoPayableAsset,
  type CryptoQuote,
} from '@/lib/api/dpay';
import { useAuth } from '@/contexts/AuthContext';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useAllChainsTokens } from '@/hooks/use-wallet-tokens';
import { useQuery } from '@tanstack/react-query';
import { BASE_CHAIN_ID } from '@/lib/contracts/dhb-token';
import { toast } from 'sonner';
import { dhbText } from '@/lib/dhb-toast';
import dehubCoin from '@/assets/dehub-coin.png';
import ethLogo from '@/assets/eth-logo.png';
import bnbLogo from '@/assets/bnb-logo.png';
import usdtLogo from '@/assets/usdt-logo.png';
import usdcLogo from '@/assets/usdc-logo.png';
import btcLogo from '@/assets/btc-logo.png';

const TOKEN_ICONS: Record<string, string> = {
  ETH: ethLogo, BNB: bnbLogo, USDT: usdtLogo, USDC: usdcLogo, BTC: btcLogo, WETH: ethLogo, DHB: dehubCoin,
};

const PRESETS = [
  { label: '1K', value: 1000 },
  { label: '5K', value: 5000 },
  { label: '10K', value: 10000 },
  { label: '50K', value: 50000 },
  { label: '100K', value: 100000 },
  { label: '500K', value: 500000 },
  { label: '1M', value: 1000000 },
  { label: '5M', value: 5000000 },
];

interface PayToken {
  symbol: string;
  address: string; // '0x0' for native
  decimals: number;
  balance: bigint;
  formattedBalance: string;
  logo?: string;
  chainId: number;
}

interface SwapToDHBDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SwapToDHBDrawer({ open, onOpenChange }: SwapToDHBDrawerProps) {
  const { walletAddress } = useAuth();
  const { allTokens } = useAllChainsTokens();

  const [dhbAmount, setDhbAmount] = useState('');
  const [quote, setQuote] = useState<CryptoQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [buying, setBuying] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');
  const [buyTokenOpen, setBuyTokenOpen] = useState(false);
  const [crossChainOpen, setCrossChainOpen] = useState(false);
  const [tokenPickerOpen, setTokenPickerOpen] = useState(false);
  const [selectedTokenAddress, setSelectedTokenAddress] = useState<string>('0x0');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const debouncedAmount = useDebouncedValue(dhbAmount, 500);

  // What the gateway will accept as payment. Everything else in the wallet can
  // be held but not spent here.
  const { data: payableAssets = [] } = useQuery({
    queryKey: ['dpay', 'crypto', 'assets'],
    queryFn: getCryptoPayableAssets,
    staleTime: 10 * 60 * 1000,
  });

  /** Base-chain assets the rail accepts, keyed by their Base contract address. */
  const assetByAddress = useMemo(() => {
    const map = new Map<string, CryptoPayableAsset>();
    for (const asset of payableAssets) {
      if (asset.blockchain !== 'base') continue;
      // Native ETH on Base has no contract address in the listing.
      map.set((asset.contractAddress ?? '0x0').toLowerCase(), asset);
    }
    return map;
  }, [payableAssets]);

  // Available pay tokens: Base chain tokens with balance (exclude DHB) + native ETH
  const payTokens: PayToken[] = useMemo(() => {
    const baseTokens = allTokens.filter(t => t.chainId === BASE_CHAIN_ID && t.symbol !== 'DHB');
    // Dedupe by address
    const seen = new Set<string>();
    const result: PayToken[] = [];
    for (const t of baseTokens) {
      const key = t.address.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({
        symbol: t.symbol,
        address: t.address,
        decimals: t.decimals,
        balance: t.balance,
        formattedBalance: t.formattedBalance,
        logo: TOKEN_ICONS[t.symbol] || t.logo,
        chainId: t.chainId,
      });
    }
    // Sort: tokens with balance first, then alphabetically
    result.sort((a, b) => {
      if (a.balance > BigInt(0) && b.balance === BigInt(0)) return -1;
      if (a.balance === BigInt(0) && b.balance > BigInt(0)) return 1;
      return a.symbol.localeCompare(b.symbol);
    });
    return result;
  }, [allTokens]);

  // Selected pay token
  const selectedToken = useMemo(() => {
    return payTokens.find(t => t.address.toLowerCase() === selectedTokenAddress.toLowerCase())
      || payTokens.find(t => t.address === '0x0')
      || payTokens[0]
      || { symbol: 'ETH', address: '0x0', decimals: 18, balance: BigInt(0), formattedBalance: '0', chainId: BASE_CHAIN_ID };
  }, [payTokens, selectedTokenAddress]);

  /** Native ETH takes the direct rail and needs no intents asset id. */
  const isDirectEth = selectedToken.address === '0x0';
  const originAsset = isDirectEth
    ? 'direct:base:eth'
    : assetByAddress.get(selectedToken.address.toLowerCase())?.assetId ?? null;

  // Reset on open
  useEffect(() => {
    if (!open) return;
    setSuccess(false);
    setError('');
    setProgress('');
  }, [open]);

  useEffect(() => () => {
    if (pollRef.current) clearInterval(pollRef.current);
  }, []);

  // Price the purchase at the gateway's peg whenever the amount or token moves.
  useEffect(() => {
    const amt = parseFloat(debouncedAmount);
    if (!amt || amt <= 0) {
      setQuote(null);
      setError('');
      return;
    }
    if (!originAsset) {
      setQuote(null);
      setError(`${selectedToken.symbol} isn't accepted as payment yet — pick another token.`);
      return;
    }
    let cancelled = false;
    setQuoting(true);
    setError('');
    // ETH already on Base goes straight to the gateway; everything else
    // bridges through the intents rail.
    const priced = isDirectEth
      ? getDirectQuote({ tokensToReceive: Math.floor(amt), address: walletAddress ?? undefined })
      : getCryptoQuote({ originAsset: originAsset!, tokensToReceive: Math.floor(amt), refundTo: walletAddress ?? undefined });
    priced
      .then(q => { if (!cancelled) setQuote(q); })
      .catch(err => {
        if (cancelled) return;
        setQuote(null);
        // The gateway's own message carries the per-route minimum and the
        // supply and gas refusals, all of which the buyer needs to read.
        setError(err?.message || 'Could not price this purchase.');
      })
      .finally(() => { if (!cancelled) setQuoting(false); });
    return () => { cancelled = true; };
  }, [debouncedAmount, originAsset, isDirectEth, selectedToken.symbol, walletAddress]);

  const amountInWei = quote ? BigInt(quote.amountIn) : null;
  const amountInFormatted = quote ? quote.amountInFormatted : null;
  const balanceFormatted = selectedToken.balance > BigInt(0)
    ? (Number(selectedToken.balance) / 10 ** selectedToken.decimals).toFixed(selectedToken.decimals <= 8 ? selectedToken.decimals : 6)
    : '0';
  const insufficientBalance = amountInWei != null && selectedToken.balance < amountInWei;
  /** The gateway's own dollar figure for this purchase, not a local estimate. */
  const dhbUsd = quote ? parseFloat(quote.amountInUsd) : 0;


  /**
   * Buy through the gateway.
   *
   * Once the deposit transaction is broadcast the purchase belongs to dpay —
   * it watches the deposit address and delivers from the treasury. So the
   * send is never reported as a failure on a local error: losing sight of a
   * transaction is not the same as it not happening, which is exactly how the
   * old Uniswap path told people a completed swap had failed.
   */
  const handleBuy = useCallback(async () => {
    if (!walletAddress || !quote || !originAsset) return;
    const amt = Math.floor(parseFloat(dhbAmount));
    if (!amt || amt <= 0) return;

    setBuying(true);
    setError('');
    setProgress('Opening your purchase...');
    try {
      const intent = isDirectEth
        ? await createDirectIntent({
            tokensToReceive: amt,
            receiverAddress: walletAddress,
            termsAndServicesAccepted: true,
          })
        : await createCryptoIntent({
            originAsset,
            tokensToReceive: amt,
            receiverAddress: walletAddress,
            // A swap that fails upstream has to have somewhere to go back to, and
            // the buyer is paying from this wallet on Base.
            refundTo: walletAddress,
            termsAndServicesAccepted: true,
          });

      setProgress(`Sending ${intent.amountInFormatted} ${selectedToken.symbol}...`);
      const sent = isDirectEth
        ? await sendNativeToken(intent.depositAddress, intent.amountInFormatted, selectedToken.decimals, BASE_CHAIN_ID)
        : await sendERC20Token(selectedToken.address, intent.depositAddress, intent.amountInFormatted, selectedToken.decimals, BASE_CHAIN_ID);

      toast.success(dhbText(`Payment sent — delivering ${amt.toLocaleString()} DHB`), {
        description: `TX: ${sent.hash.slice(0, 10)}…`,
      });
      setProgress('Payment sent. Waiting for delivery...');

      if (isDirectEth) {
        // The gateway settles a direct purchase against the chain once it
        // has the hash. It may not be mined on the first ask; the poll below
        // keeps re-submitting until it is, so a slow block is not a failure.
        setProgress('Payment sent. Waiting for confirmation...');
        const tryConfirm = () => confirmDirectDeposit({ id: intent.id, txHash: sent.hash }).catch(() => null);
        await tryConfirm();
        const confirmTimer = setInterval(async () => {
          const status = await tryConfirm();
          if (status && status.settlement !== 'DIRECT_PENDING') clearInterval(confirmTimer);
        }, 4000);
        setTimeout(() => clearInterval(confirmTimer), 10 * 60 * 1000);
      }

      if (pollRef.current) clearInterval(pollRef.current);
      let ticks = 0;
      pollRef.current = setInterval(async () => {
        ticks++;
        // Routes from Base settle in well under a minute, but the gateway
        // queues deliveries behind one another. Give it ten minutes before
        // handing the buyer off to their wallet rather than calling it failed.
        if (ticks > 200) {
          if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
          setBuying(false);
          setProgress('');
          toast.info(dhbText('Payment received. Your DHB is still on its way — check your wallet shortly.'));
          return;
        }
        try {
          const status = await getCryptoIntentStatus(intent.id);
          if (status.tokenSendStatus === 'sent') {
            if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
            setBuying(false);
            setSuccess(true);
            toast.success(dhbText(`${amt.toLocaleString()} DHB delivered to your wallet`));
            return;
          }
          if (status.settlement === 'REFUNDED' || status.settlement === 'FAILED' || status.tokenSendStatus === 'cancelled') {
            if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
            setBuying(false);
            setProgress('');
            setError('The payment could not be settled and has been refunded to your wallet.');
            return;
          }
          setProgress(
            status.settlement === 'PENDING_DEPOSIT'
              ? 'Payment sent. Waiting for confirmation...'
              : 'Payment confirmed. Delivering your DHB...',
          );
        } catch {
          /* keep polling — a failed status read is not a failed purchase */
        }
      }, 3000);
    } catch (err: any) {
      const msg = err?.shortMessage || err?.message || 'Purchase failed';
      setError(msg);
      setProgress('');
      setBuying(false);
      toast.error('Purchase failed', { description: msg });
    }
  }, [walletAddress, quote, originAsset, isDirectEth, dhbAmount, selectedToken]);

  const handleClose = (v: boolean) => {
    if (!v) {
      setDhbAmount('');
      setQuote(null);
      setProgress('');
      setSuccess(false);
      setError('');
    }
    onOpenChange(v);
  };

  const tokenIcon = selectedToken.logo || TOKEN_ICONS[selectedToken.symbol];

  return (
    <>
    <Drawer open={open} onOpenChange={handleClose}>
      <DrawerContent column glass hideHandle={false} data-wallet-page>
        <DrawerHeader>
          <DrawerTitle className="text-white">Buy DHB with {selectedToken.symbol}</DrawerTitle>
        </DrawerHeader>
        <div className="px-4 pb-8 space-y-4">
          {success ? (
            <div className="flex flex-col items-center gap-3 py-6">
              <CheckCircle2 className="w-12 h-12 text-emerald-400" />
              <p className="text-white font-medium">Purchase complete</p>
              <p className="text-sm text-zinc-400">
                {Math.floor(parseFloat(dhbAmount)).toLocaleString()} <DhbCoin /> added to your wallet
              </p>
              <Button variant="glass" className="mt-2 rounded-xl" onClick={() => handleClose(false)}>
                Done
              </Button>
            </div>
          ) : (
            <>
              {/* DHB amount input */}
              <div className="bg-white/[0.04] border border-white/10 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-400">You receive</span>
                  {dhbUsd > 0 && <span className="text-xs text-zinc-500">≈ ${dhbUsd.toFixed(2)}</span>}
                </div>
                <div className="flex items-center gap-3">
                  <img src={dehubCoin} alt="DHB" className="w-8 h-8 rounded-full" />
                  <Input
                    type="number"
                    placeholder="0"
                    value={dhbAmount}
                    onChange={e => setDhbAmount(e.target.value)}
                    className="bg-transparent border-none text-white text-xl font-semibold p-0 h-auto focus-visible:ring-0"
                  />
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {PRESETS.map(p => (
                    <button
                      key={p.value}
                      onClick={() => setDhbAmount(String(p.value))}
                      className={`text-xs py-1.5 rounded-lg border transition-colors ${
                        dhbAmount === String(p.value)
                          ? 'bg-white/20 border-white/30 text-white'
                          : 'bg-white/[0.06] hover:bg-white/[0.12] text-zinc-300 border-white/10'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-center">
                <ArrowDown className="w-5 h-5 text-zinc-500" />
              </div>

              {/* Pay token display */}
              <div className="bg-white/[0.04] border border-white/10 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-400">You pay</span>
                </div>
                <div className="flex items-center gap-3">
                  {/* Token selector button */}
                  <button
                    onClick={() => setTokenPickerOpen(true)}
                    className="flex items-center gap-2 shrink-0 px-2 py-1 rounded-lg bg-white/[0.08] hover:bg-white/[0.14] border border-white/10 transition-colors"
                  >
                    {tokenIcon ? (
                      <img src={tokenIcon} alt={selectedToken.symbol} className="w-6 h-6 rounded-full" />
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-zinc-700 flex items-center justify-center">
                        <span className="text-[9px] font-bold text-zinc-400">{selectedToken.symbol.slice(0, 2)}</span>
                      </div>
                    )}
                    <span className="text-sm font-medium text-white">{selectedToken.symbol}</span>
                    <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
                  </button>
                  <span className="text-white text-xl font-semibold flex-1 text-right">
                    {quoting ? (
                      <Loader2 className="w-5 h-5 animate-spin text-zinc-400 ml-auto" />
                    ) : amountInFormatted ? (
                      amountInFormatted
                    ) : (
                      <span className="text-zinc-600">—</span>
                    )}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <p className={`text-xs ${insufficientBalance ? 'text-red-400' : 'text-zinc-500'}`}>
                    Balance: {balanceFormatted} {selectedToken.symbol}
                    {insufficientBalance && ' (insufficient)'}
                  </p>
                  <button
                    onClick={() => setBuyTokenOpen(true)}
                    className="text-xs text-emerald-400 hover:text-emerald-300 font-medium flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    Buy {selectedToken.symbol}
                  </button>
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 text-red-400 text-xs px-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <Button
                variant="glass"
                onClick={handleBuy}
                disabled={!quote || !!insufficientBalance || buying || quoting || !dhbAmount}
                className="w-full rounded-xl h-12 text-sm font-semibold"
              >
                {buying ? (
                  <><Loader2 className="w-4 h-4 animate-spin mr-2" /> {progress || 'Working…'}</>
                ) : insufficientBalance ? (
                  `Insufficient ${selectedToken.symbol}`
                ) : (
                  'Confirm Purchase'
                )}
              </Button>
            </>
          )}
        </div>
      </DrawerContent>
    </Drawer>

    {/* Token Picker Drawer */}
    <Drawer open={tokenPickerOpen} onOpenChange={setTokenPickerOpen}>
      <DrawerContent column glass hideHandle={false} data-wallet-page>
        <DrawerHeader>
          <DrawerTitle className="text-white">Select Token to Pay With</DrawerTitle>
        </DrawerHeader>
        <div className="px-4 pb-6 space-y-1 max-h-[50vh] overflow-y-auto">
          {payTokens.map(token => {
            const icon = token.logo || TOKEN_ICONS[token.symbol];
            const hasBalance = token.balance > BigInt(0);
            const isSelected = token.address.toLowerCase() === selectedToken.address.toLowerCase();
            return (
              <button
                key={`${token.address}-${token.chainId}`}
                onClick={() => {
                  setSelectedTokenAddress(token.address);
                  setTokenPickerOpen(false);
                  setQuote(null); // reset quote for new token
                }}
                className={`w-full flex items-center gap-3 p-3 rounded-xl transition-colors ${
                  isSelected
                    ? 'bg-white/[0.12] border border-white/20'
                    : 'bg-white/[0.04] hover:bg-white/[0.08] border border-transparent'
                }`}
              >
                {icon ? (
                  <img src={icon} alt={token.symbol} className="w-8 h-8 rounded-full" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center">
                    <span className="text-[10px] font-bold text-zinc-400">{token.symbol.slice(0, 2)}</span>
                  </div>
                )}
                <div className="text-left flex-1 min-w-0">
                  <span className="text-sm font-medium text-white">{token.symbol}</span>
                  {isSelected && <span className="text-[10px] text-emerald-400 ml-2">Selected</span>}
                </div>
                <span className={`text-sm ${hasBalance ? 'text-white' : 'text-zinc-600'}`}>
                  {hasBalance ? parseFloat(token.formattedBalance).toLocaleString('en-US', { maximumFractionDigits: 4 }) : '0'}
                </span>
              </button>
            );
          })}
          {payTokens.length === 0 && (
            <AppState icon="search" title="No tokens found on Base" kind="search-empty" size="drawer" />
          )}
        </div>
      </DrawerContent>
    </Drawer>

    {/* Buy Token sub-drawer */}
    <Drawer open={buyTokenOpen} onOpenChange={setBuyTokenOpen}>
      <DrawerContent column glass hideHandle={false} data-wallet-page>
        <div className="p-5 pb-8 space-y-2">
          <h3 className="text-white font-semibold text-base mb-4">Buy {selectedToken.symbol}</h3>
          <button
            disabled
            className="w-full flex items-center gap-3 p-3.5 rounded-xl bg-white/[0.06] border border-white/10 opacity-50 cursor-not-allowed"
          >
            <CreditCard className="w-5 h-5 text-white/70" />
            <div className="text-left flex-1">
              <span className="text-sm font-medium text-white">Buy with Card</span>
              <p className="text-xs text-white/40">Purchase using Visa, Mastercard, Apple Pay</p>
            </div>
            <span className="text-[10px] text-white/30 font-medium bg-white/[0.06] px-2 py-0.5 rounded">Coming soon</span>
          </button>
          <button
            onClick={() => {
              setBuyTokenOpen(false);
              setTimeout(() => setCrossChainOpen(true), 200);
            }}
            className="w-full flex items-center gap-3 p-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.10] backdrop-blur-sm border border-white/10 transition-colors"
          >
            <Wallet className="w-5 h-5 text-white/70" />
            <div className="text-left">
              <span className="text-sm font-medium text-white">Buy with Crypto</span>
              <p className="text-xs text-white/40">BTC, SOL, ETH, USDC & more from any chain</p>
            </div>
          </button>
        </div>
      </DrawerContent>
    </Drawer>

    {/* Cross-chain deposit */}
    <CrossChainDepositDrawer open={crossChainOpen} onOpenChange={setCrossChainOpen} destinationSymbol={selectedToken.symbol} />
    </>
  );
}
