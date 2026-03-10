/**
 * Swap ETH → DHB Drawer
 * ======================
 * Lets users convert in-wallet ETH to DHB via Uniswap V3 on Base.
 */

import { useState, useEffect, useCallback } from 'react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, ArrowDown, CheckCircle2, AlertCircle } from 'lucide-react';
import { getSwapQuote, applySlippage, swapETHForDHB, getNativeBalance } from '@/lib/contracts/uniswap-swap';
import { useAuth } from '@/contexts/AuthContext';
import { useTokenPrices } from '@/hooks/use-token-prices';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { toast } from 'sonner';
import dehubCoin from '@/assets/dehub-coin.png';
import ethLogo from '@/assets/eth-logo.png';

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

interface SwapToDHBDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SwapToDHBDrawer({ open, onOpenChange }: SwapToDHBDrawerProps) {
  const { walletAddress } = useAuth();
  const { data: prices = {} } = useTokenPrices();

  const [dhbAmount, setDhbAmount] = useState('');
  const [ethBalance, setEthBalance] = useState<bigint | null>(null);
  const [quoteWei, setQuoteWei] = useState<bigint | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [swapping, setSwapping] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const debouncedAmount = useDebouncedValue(dhbAmount, 500);

  // Fetch ETH balance on open
  useEffect(() => {
    if (!open || !walletAddress) return;
    setSuccess(false);
    setError('');
    getNativeBalance(walletAddress).then(setEthBalance).catch(() => setEthBalance(null));
  }, [open, walletAddress]);

  // Fetch quote when amount changes
  useEffect(() => {
    const amt = parseFloat(debouncedAmount);
    if (!amt || amt <= 0) {
      setQuoteWei(null);
      return;
    }
    setQuoting(true);
    setError('');
    const amountWei = BigInt(Math.floor(amt)) * BigInt(10 ** 18);
    getSwapQuote(amountWei)
      .then(q => {
        setQuoteWei(q);
        if (!q) setError('No liquidity available for this amount');
      })
      .catch(() => {
        setQuoteWei(null);
        setError('Failed to get quote');
      })
      .finally(() => setQuoting(false));
  }, [debouncedAmount]);

  const ethNeeded = quoteWei ? applySlippage(quoteWei) : null;
  const ethNeededFormatted = ethNeeded ? (Number(ethNeeded) / 1e18).toFixed(6) : null;
  const ethBalanceFormatted = ethBalance !== null ? (Number(ethBalance) / 1e18).toFixed(6) : null;
  const insufficientBalance = ethNeeded && ethBalance !== null && ethBalance < ethNeeded;

  const ethPrice = prices['ETH'] ?? 0;
  const dhbPrice = prices['DHB'] ?? 0;
  const dhbUsd = dhbPrice && dhbAmount ? (parseFloat(dhbAmount) * dhbPrice) : 0;
  const ethUsd = ethPrice && ethNeededFormatted ? (parseFloat(ethNeededFormatted) * ethPrice) : 0;

  const handleSwap = useCallback(async () => {
    if (!walletAddress || !quoteWei || !ethNeeded) return;
    const amt = parseFloat(dhbAmount);
    if (!amt || amt <= 0) return;

    setSwapping(true);
    setError('');
    try {
      const amountOutWei = BigInt(Math.floor(amt)) * BigInt(10 ** 18);
      const receipt = await swapETHForDHB(amountOutWei, ethNeeded, walletAddress);
      setSuccess(true);
      toast.success(`Swapped for ${Math.floor(amt).toLocaleString()} DHB`, {
        description: `TX: ${receipt.hash.slice(0, 10)}…`,
      });
    } catch (err: any) {
      const msg = err?.shortMessage || err?.message || 'Swap failed';
      setError(msg);
      toast.error('Swap failed', { description: msg });
    } finally {
      setSwapping(false);
    }
  }, [walletAddress, quoteWei, ethNeeded, dhbAmount]);

  const handleClose = (v: boolean) => {
    if (!v) {
      setDhbAmount('');
      setQuoteWei(null);
      setSuccess(false);
      setError('');
    }
    onOpenChange(v);
  };

  return (
    <Drawer open={open} onOpenChange={handleClose}>
      <DrawerContent glass hideHandle={false}>
        <DrawerHeader>
          <DrawerTitle className="text-white">Swap ETH → DHB</DrawerTitle>
        </DrawerHeader>
        <div className="px-4 pb-8 space-y-4">
          {success ? (
            <div className="flex flex-col items-center gap-3 py-6">
              <CheckCircle2 className="w-12 h-12 text-emerald-400" />
              <p className="text-white font-medium">Swap Successful!</p>
              <p className="text-sm text-zinc-400">
                {Math.floor(parseFloat(dhbAmount)).toLocaleString()} DHB added to your wallet
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
                  <span className="text-sm text-zinc-400 font-medium shrink-0">DHB</span>
                </div>
                <div className="flex gap-2">
                  {PRESETS.map(p => (
                    <button
                      key={p.value}
                      onClick={() => setDhbAmount(String(p.value))}
                      className="flex-1 text-xs py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-zinc-300 border border-white/10 transition-colors"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-center">
                <ArrowDown className="w-5 h-5 text-zinc-500" />
              </div>

              {/* ETH cost display */}
              <div className="bg-white/[0.04] border border-white/10 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-400">You pay (incl. 2% slippage)</span>
                  {ethUsd > 0 && <span className="text-xs text-zinc-500">≈ ${ethUsd.toFixed(2)}</span>}
                </div>
                <div className="flex items-center gap-3">
                  <img src={ethLogo} alt="ETH" className="w-8 h-8 rounded-full" />
                  <span className="text-white text-xl font-semibold">
                    {quoting ? (
                      <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
                    ) : ethNeededFormatted ? (
                      ethNeededFormatted
                    ) : (
                      <span className="text-zinc-600">—</span>
                    )}
                  </span>
                  <span className="text-sm text-zinc-400 font-medium shrink-0">ETH</span>
                </div>
                {ethBalanceFormatted && (
                  <p className={`text-xs ${insufficientBalance ? 'text-red-400' : 'text-zinc-500'}`}>
                    Balance: {ethBalanceFormatted} ETH
                    {insufficientBalance && ' (insufficient)'}
                  </p>
                )}
              </div>

              {error && (
                <div className="flex items-center gap-2 text-red-400 text-xs px-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <Button
                onClick={handleSwap}
                disabled={!ethNeeded || !!insufficientBalance || swapping || quoting || !dhbAmount}
                className="w-full rounded-xl h-12 text-sm font-semibold bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white border-0"
              >
                {swapping ? (
                  <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Swapping…</>
                ) : insufficientBalance ? (
                  'Insufficient ETH'
                ) : (
                  'Confirm Swap'
                )}
              </Button>
            </>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
