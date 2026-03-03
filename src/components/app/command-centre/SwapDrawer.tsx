import { useState, useEffect, useCallback } from 'react';
import { ArrowDownUp, Loader2, ExternalLink, AlertTriangle } from 'lucide-react';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import {
  getSwapQuote,
  swapETHForDHB,
  applySlippage,
  getNativeBalance,
} from '@/lib/contracts/uniswap-swap';
import { formatUnits, parseUnits } from 'ethers';

interface SwapDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type SwapStep = 'input' | 'confirming' | 'success' | 'error';

export function SwapDrawer({ open, onOpenChange }: SwapDrawerProps) {
  const { walletAddress } = useAuth();

  const [dhbAmount, setDhbAmount] = useState('');
  const [ethBalance, setEthBalance] = useState<bigint | null>(null);
  const [quoteEth, setQuoteEth] = useState<bigint | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [step, setStep] = useState<SwapStep>('input');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  // Fetch ETH balance on open
  useEffect(() => {
    if (!open || !walletAddress) return;
    setStep('input');
    setDhbAmount('');
    setQuoteEth(null);
    setTxHash(null);
    setErrorMsg('');

    getNativeBalance(walletAddress).then(setEthBalance).catch(() => setEthBalance(null));
  }, [open, walletAddress]);

  // Debounced quote fetching
  useEffect(() => {
    if (!dhbAmount || parseFloat(dhbAmount) <= 0) {
      setQuoteEth(null);
      return;
    }

    const timeout = setTimeout(async () => {
      setQuoteLoading(true);
      try {
        const amountWei = parseUnits(dhbAmount, 18);
        const quote = await getSwapQuote(amountWei);
        setQuoteEth(quote);
      } catch {
        setQuoteEth(null);
      } finally {
        setQuoteLoading(false);
      }
    }, 600);

    return () => clearTimeout(timeout);
  }, [dhbAmount]);

  const ethBalanceFormatted = ethBalance !== null
    ? parseFloat(formatUnits(ethBalance, 18)).toFixed(5)
    : '—';

  const quoteEthFormatted = quoteEth !== null
    ? parseFloat(formatUnits(quoteEth, 18)).toFixed(6)
    : null;

  const maxEthWithSlippage = quoteEth !== null ? applySlippage(quoteEth) : null;

  const insufficientBalance = ethBalance !== null && maxEthWithSlippage !== null && ethBalance < maxEthWithSlippage;

  const canSwap =
    step === 'input' &&
    quoteEth !== null &&
    !quoteLoading &&
    !insufficientBalance &&
    parseFloat(dhbAmount) > 0;

  const handleSwap = useCallback(async () => {
    if (!walletAddress || !quoteEth || !maxEthWithSlippage) return;

    setStep('confirming');
    try {
      const amountWei = parseUnits(dhbAmount, 18);
      const result = await swapETHForDHB(amountWei, maxEthWithSlippage, walletAddress);
      setTxHash(result.hash);
      setStep('success');
      toast.success('Swap completed!');
    } catch (err: any) {
      const msg = err?.message || 'Swap failed';
      setErrorMsg(msg.length > 120 ? msg.slice(0, 120) + '…' : msg);
      setStep('error');
      toast.error('Swap failed');
    }
  }, [walletAddress, quoteEth, maxEthWithSlippage, dhbAmount]);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent glass hideHandle={false}>
        <div className="p-5 pb-8 space-y-4">
          <h3 className="text-white font-semibold text-base">Buy with Crypto</h3>
          <p className="text-xs text-white/40">Swap ETH → DHB on Base via Uniswap V3</p>

          {step === 'input' && (
            <>
              {/* ETH Balance */}
              <div className="flex items-center justify-between text-xs">
                <span className="text-white/50">Your ETH Balance (Base)</span>
                <span className="text-white/70 font-mono">{ethBalanceFormatted} ETH</span>
              </div>

              {/* DHB Amount Input */}
              <div className="space-y-1.5">
                <label className="text-sm text-white/50">DHB Amount</label>
                <Input
                  type="number"
                  min="0"
                  step="any"
                  placeholder="e.g. 100"
                  value={dhbAmount}
                  onChange={(e) => setDhbAmount(e.target.value)}
                  className="bg-white/[0.06] border-white/10 text-white backdrop-blur-sm text-lg font-mono"
                />
              </div>

              {/* Quote */}
              <div className="rounded-xl bg-white/[0.04] border border-white/10 p-3 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-white/50">Estimated Cost</span>
                  {quoteLoading ? (
                    <Loader2 className="w-3.5 h-3.5 text-white/40 animate-spin" />
                  ) : quoteEthFormatted ? (
                    <span className="text-white font-mono">{quoteEthFormatted} ETH</span>
                  ) : (
                    <span className="text-white/30">—</span>
                  )}
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-white/50">Max (incl. 2% slippage)</span>
                  <span className="text-white/50 font-mono">
                    {maxEthWithSlippage ? parseFloat(formatUnits(maxEthWithSlippage, 18)).toFixed(6) + ' ETH' : '—'}
                  </span>
                </div>
                {quoteEth === null && !quoteLoading && dhbAmount && parseFloat(dhbAmount) > 0 && (
                  <p className="text-xs text-amber-400/80 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> No liquidity or quote unavailable
                  </p>
                )}
                {insufficientBalance && (
                  <p className="text-xs text-red-400/80 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> Insufficient ETH balance
                  </p>
                )}
              </div>

              {/* Swap Button */}
              <Button
                variant="glass"
                className="w-full rounded-xl"
                disabled={!canSwap}
                onClick={handleSwap}
              >
                <ArrowDownUp className="w-4 h-4 mr-2" />
                Swap ETH → DHB
              </Button>
            </>
          )}

          {step === 'confirming' && (
            <div className="flex flex-col items-center gap-3 py-6">
              <Loader2 className="w-8 h-8 text-white/60 animate-spin" />
              <p className="text-sm text-white/60">Confirming swap on Base…</p>
              <p className="text-xs text-white/30">This may take a few seconds</p>
            </div>
          )}

          {step === 'success' && (
            <div className="flex flex-col items-center gap-3 py-6">
              <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <ArrowDownUp className="w-6 h-6 text-emerald-400" />
              </div>
              <p className="text-sm text-white font-medium">Swap Successful!</p>
              <p className="text-xs text-white/40">{dhbAmount} DHB received</p>
              {txHash && (
                <button
                  onClick={() => window.open(`https://basescan.org/tx/${txHash}`, '_blank')}
                  className="text-xs text-blue-400 flex items-center gap-1 hover:underline"
                >
                  View on BaseScan <ExternalLink className="w-3 h-3" />
                </button>
              )}
              <Button variant="glass" className="w-full rounded-xl mt-2" onClick={() => onOpenChange(false)}>
                Done
              </Button>
            </div>
          )}

          {step === 'error' && (
            <div className="flex flex-col items-center gap-3 py-6">
              <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-red-400" />
              </div>
              <p className="text-sm text-white font-medium">Swap Failed</p>
              <p className="text-xs text-white/40 text-center max-w-[260px]">{errorMsg}</p>
              <Button variant="glass" className="w-full rounded-xl mt-2" onClick={() => setStep('input')}>
                Try Again
              </Button>
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
