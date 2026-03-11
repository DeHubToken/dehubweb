/**
 * Swap Any Token → Target Token Drawer
 * =====================================
 * Generalized drawer that lets users swap any in-wallet Base token
 * to a target token via Uniswap V3.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, ArrowDown, CheckCircle2, AlertCircle, CreditCard, Wallet, Plus, ChevronDown } from 'lucide-react';
import { CrossChainDepositDrawer } from '@/components/app/command-centre/CrossChainDepositDrawer';
import { getSwapQuote, applySlippage, swapTokens, getNativeBalance } from '@/lib/contracts/uniswap-swap';
import { useAuth } from '@/contexts/AuthContext';
import { useTokenPrices } from '@/hooks/use-token-prices';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useAllChainsTokens } from '@/hooks/use-wallet-tokens';
import { BASE_CHAIN_ID } from '@/lib/contracts/dhb-token';
import { toast } from 'sonner';
import ethLogo from '@/assets/eth-logo.png';
import bnbLogo from '@/assets/bnb-logo.png';
import usdtLogo from '@/assets/usdt-logo.png';
import usdcLogo from '@/assets/usdc-logo.png';
import btcLogo from '@/assets/btc-logo.png';
import dehubCoin from '@/assets/dehub-coin.png';

const TOKEN_ICONS: Record<string, string> = {
  ETH: ethLogo, BNB: bnbLogo, USDT: usdtLogo, USDC: usdcLogo, BTC: btcLogo, WETH: ethLogo, DHB: dehubCoin,
};

interface PayToken {
  symbol: string;
  address: string;
  decimals: number;
  balance: bigint;
  formattedBalance: string;
  logo?: string;
  chainId: number;
}

interface SwapToTokenDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Symbol of the target token (for display) */
  targetSymbol: string;
  /** On-chain contract address of the target token on Base */
  targetAddress: string;
  /** Decimals of the target token (default 18) */
  targetDecimals?: number;
  /** Logo URL for the target token */
  targetLogo?: string;
}

export function SwapToTokenDrawer({
  open,
  onOpenChange,
  targetSymbol,
  targetAddress,
  targetDecimals = 18,
  targetLogo,
}: SwapToTokenDrawerProps) {
  const { walletAddress } = useAuth();
  const { data: prices = {} } = useTokenPrices();
  const { allTokens } = useAllChainsTokens();

  const [amount, setAmount] = useState('');
  const [quoteResult, setQuoteResult] = useState<{ amountIn: bigint; feeTier: number } | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [swapping, setSwapping] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [buyTokenOpen, setBuyTokenOpen] = useState(false);
  const [crossChainOpen, setCrossChainOpen] = useState(false);
  const [tokenPickerOpen, setTokenPickerOpen] = useState(false);
  const [selectedTokenAddress, setSelectedTokenAddress] = useState<string>('0x0');

  const debouncedAmount = useDebouncedValue(amount, 500);

  // Available pay tokens: Base chain tokens with balance, excluding the target token
  const payTokens: PayToken[] = useMemo(() => {
    const baseTokens = allTokens.filter(
      t => t.chainId === BASE_CHAIN_ID && t.symbol.toUpperCase() !== targetSymbol.toUpperCase()
    );
    const seen = new Set<string>();
    const result: PayToken[] = [];
    for (const t of baseTokens) {
      const key = t.address.toLowerCase();
      if (seen.has(key)) continue;
      // Don't allow paying with the same token we're buying
      if (key === targetAddress.toLowerCase()) continue;
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
    result.sort((a, b) => {
      if (a.balance > BigInt(0) && b.balance === BigInt(0)) return -1;
      if (a.balance === BigInt(0) && b.balance > BigInt(0)) return 1;
      return a.symbol.localeCompare(b.symbol);
    });
    return result;
  }, [allTokens, targetSymbol, targetAddress]);

  const selectedToken = useMemo(() => {
    return payTokens.find(t => t.address.toLowerCase() === selectedTokenAddress.toLowerCase())
      || payTokens.find(t => t.address === '0x0')
      || payTokens[0]
      || { symbol: 'ETH', address: '0x0', decimals: 18, balance: BigInt(0), formattedBalance: '0', chainId: BASE_CHAIN_ID };
  }, [payTokens, selectedTokenAddress]);

  useEffect(() => {
    if (!open) return;
    setSuccess(false);
    setError('');
  }, [open]);

  // Fetch quote
  useEffect(() => {
    const amt = parseFloat(debouncedAmount);
    if (!amt || amt <= 0) {
      setQuoteResult(null);
      return;
    }
    setQuoting(true);
    setError('');
    const amountWei = BigInt(Math.floor(amt * 10 ** Math.min(targetDecimals, 8))) * BigInt(10 ** Math.max(targetDecimals - 8, 0));
    getSwapQuote(amountWei, selectedToken.address, targetAddress)
      .then(q => {
        setQuoteResult(q);
        if (!q) setError('No liquidity available for this pair/amount');
      })
      .catch(() => {
        setQuoteResult(null);
        setError('Failed to get quote');
      })
      .finally(() => setQuoting(false));
  }, [debouncedAmount, selectedToken.address, targetAddress, targetDecimals]);

  const amountInWithSlippage = quoteResult ? applySlippage(quoteResult.amountIn) : null;
  const amountInFormatted = amountInWithSlippage
    ? (Number(amountInWithSlippage) / 10 ** selectedToken.decimals).toFixed(selectedToken.decimals <= 8 ? selectedToken.decimals : 6)
    : null;
  const balanceFormatted = selectedToken.balance > BigInt(0)
    ? (Number(selectedToken.balance) / 10 ** selectedToken.decimals).toFixed(selectedToken.decimals <= 8 ? selectedToken.decimals : 6)
    : '0';
  const insufficientBalance = amountInWithSlippage && selectedToken.balance < amountInWithSlippage;

  const tokenPrice = prices[selectedToken.symbol] ?? 0;
  const targetPrice = prices[targetSymbol.toUpperCase()] ?? 0;
  const targetUsd = targetPrice && amount ? (parseFloat(amount) * targetPrice) : 0;
  const payUsd = tokenPrice && amountInFormatted ? (parseFloat(amountInFormatted) * tokenPrice) : 0;

  const handleSwap = useCallback(async () => {
    if (!walletAddress || !quoteResult || !amountInWithSlippage) return;
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return;

    setSwapping(true);
    setError('');
    try {
      const amountOutWei = BigInt(Math.floor(amt * 10 ** Math.min(targetDecimals, 8))) * BigInt(10 ** Math.max(targetDecimals - 8, 0));
      const receipt = await swapTokens(
        amountOutWei,
        amountInWithSlippage,
        walletAddress,
        selectedToken.address,
        quoteResult.feeTier,
        targetAddress,
      );
      setSuccess(true);
      toast.success(`Swapped for ${amt.toLocaleString()} ${targetSymbol}`, {
        description: `TX: ${receipt.hash.slice(0, 10)}…`,
      });
    } catch (err: any) {
      const msg = err?.shortMessage || err?.message || 'Swap failed';
      setError(msg);
      toast.error('Swap failed', { description: msg });
    } finally {
      setSwapping(false);
    }
  }, [walletAddress, quoteResult, amountInWithSlippage, amount, selectedToken, targetAddress, targetSymbol, targetDecimals]);

  const handleClose = (v: boolean) => {
    if (!v) {
      setAmount('');
      setQuoteResult(null);
      setSuccess(false);
      setError('');
    }
    onOpenChange(v);
  };

  const tokenIcon = selectedToken.logo || TOKEN_ICONS[selectedToken.symbol];
  const outIcon = targetLogo || TOKEN_ICONS[targetSymbol.toUpperCase()];

  return (
    <>
    <Drawer open={open} onOpenChange={handleClose}>
      <DrawerContent glass hideHandle={false}>
        <DrawerHeader>
          <DrawerTitle className="text-white">Buy ${targetSymbol}</DrawerTitle>
        </DrawerHeader>
        <div className="px-4 pb-8 space-y-4">
          {success ? (
            <div className="flex flex-col items-center gap-3 py-6">
              <CheckCircle2 className="w-12 h-12 text-emerald-400" />
              <p className="text-white font-medium">Swap Successful!</p>
              <p className="text-sm text-zinc-400">
                {parseFloat(amount).toLocaleString()} {targetSymbol} added to your wallet
              </p>
              <Button variant="glass" className="mt-2 rounded-xl" onClick={() => handleClose(false)}>
                Done
              </Button>
            </div>
          ) : (
            <>
              {/* Target amount input */}
              <div className="bg-white/[0.04] border border-white/10 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-400">You receive</span>
                  {targetUsd > 0 && <span className="text-xs text-zinc-500">≈ ${targetUsd.toFixed(2)}</span>}
                </div>
                <div className="flex items-center gap-3">
                  {outIcon ? (
                    <img src={outIcon} alt={targetSymbol} className="w-8 h-8 rounded-full" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center">
                      <span className="text-[10px] font-bold text-zinc-400">{targetSymbol.slice(0, 2)}</span>
                    </div>
                  )}
                  <Input
                    type="number"
                    placeholder="0"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    className="bg-transparent border-none text-white text-xl font-semibold p-0 h-auto focus-visible:ring-0"
                  />
                  <span className="text-sm text-zinc-400 font-medium shrink-0">{targetSymbol}</span>
                </div>
              </div>

              <div className="flex justify-center">
                <ArrowDown className="w-5 h-5 text-zinc-500" />
              </div>

              {/* Pay token display */}
              <div className="bg-white/[0.04] border border-white/10 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-400">You pay (incl. 2% slippage)</span>
                  {payUsd > 0 && <span className="text-xs text-zinc-500">≈ ${payUsd.toFixed(2)}</span>}
                </div>
                <div className="flex items-center gap-3">
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
                onClick={handleSwap}
                disabled={!amountInWithSlippage || !!insufficientBalance || swapping || quoting || !amount}
                className="w-full rounded-xl h-12 text-sm font-semibold"
              >
                {swapping ? (
                  <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Swapping…</>
                ) : insufficientBalance ? (
                  `Insufficient ${selectedToken.symbol}`
                ) : (
                  `Buy ${targetSymbol}`
                )}
              </Button>

              <p className="text-[10px] text-zinc-600 text-center">
                Powered by Uniswap V3 on Base • Token: {targetAddress.slice(0, 6)}…{targetAddress.slice(-4)}
              </p>
            </>
          )}
        </div>
      </DrawerContent>
    </Drawer>

    {/* Token Picker Drawer */}
    <Drawer open={tokenPickerOpen} onOpenChange={setTokenPickerOpen}>
      <DrawerContent glass hideHandle={false}>
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
                  setQuoteResult(null);
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
            <p className="text-center text-zinc-500 text-sm py-8">No tokens found on Base</p>
          )}
        </div>
      </DrawerContent>
    </Drawer>

    {/* Buy Token sub-drawer */}
    <Drawer open={buyTokenOpen} onOpenChange={setBuyTokenOpen}>
      <DrawerContent glass hideHandle={false}>
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

    <CrossChainDepositDrawer open={crossChainOpen} onOpenChange={setCrossChainOpen} destinationSymbol={selectedToken.symbol} />
    </>
  );
}
