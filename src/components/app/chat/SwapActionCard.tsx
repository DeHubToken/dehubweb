/**
 * SwapActionCard
 * ==============
 * Inline chat card that lets users confirm and execute a token swap
 * detected by the AI assistant. Uses the existing Uniswap V3 swap engine.
 */

import { useState, useCallback } from 'react';
import { ArrowRightLeft, Check, Loader2, AlertTriangle, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { getSwapQuote, swapTokens, applySlippage, isAutoSwapSupported } from '@/lib/contracts/uniswap-swap';
import { BASE_CHAIN_ID } from '@/lib/contracts/dhb-token';
import { parseUnits, formatUnits } from 'ethers';

export interface SwapAction {
  tokenIn: string;
  tokenOut: string;
  tokenInSymbol: string;
  tokenOutSymbol: string;
  amount: string;
  amountType: 'input' | 'output';
}

type SwapStatus = 'idle' | 'quoting' | 'quoted' | 'swapping' | 'success' | 'error';

interface SwapActionCardProps {
  action: SwapAction;
}

// Well-known token decimals
const TOKEN_DECIMALS: Record<string, number> = {
  '0x0': 18, // ETH
  '0x4200000000000000000000000000000000000006': 18, // WETH
  '0xD20ab1015f6a2De4a6FdDEbAB270113F689c2F7c': 18, // DHB
  '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913': 6, // USDC
};

function getDecimals(address: string): number {
  return TOKEN_DECIMALS[address] ?? 18;
}

export function SwapActionCard({ action }: SwapActionCardProps) {
  const { walletAddress } = useAuth();
  const [status, setStatus] = useState<SwapStatus>('idle');
  const [quote, setQuote] = useState<{ amountIn: bigint; feeTier: number } | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGetQuote = useCallback(async () => {
    if (!isAutoSwapSupported(BASE_CHAIN_ID)) {
      setError('Swaps are only supported on Base chain');
      setStatus('error');
      return;
    }

    setStatus('quoting');
    setError(null);

    try {
      const outDecimals = getDecimals(action.tokenOut);
      const amountOutWei = parseUnits(action.amount, outDecimals);

      const result = await getSwapQuote(amountOutWei, action.tokenIn, action.tokenOut);
      if (!result) {
        setError('No liquidity found for this pair');
        setStatus('error');
        return;
      }

      setQuote(result);
      setStatus('quoted');
    } catch (err: any) {
      console.error('[SwapCard] Quote error:', err);
      setError(err?.message || 'Failed to get quote');
      setStatus('error');
    }
  }, [action]);

  const handleConfirmSwap = useCallback(async () => {
    if (!quote || !walletAddress) return;

    setStatus('swapping');
    setError(null);

    try {
      const outDecimals = getDecimals(action.tokenOut);
      const amountOutWei = parseUnits(action.amount, outDecimals);
      const maxIn = applySlippage(quote.amountIn);

      const result = await swapTokens(
        amountOutWei,
        maxIn,
        walletAddress,
        action.tokenIn,
        quote.feeTier,
        action.tokenOut
      );

      setTxHash(result.hash);
      setStatus('success');
    } catch (err: any) {
      console.error('[SwapCard] Swap error:', err);
      setError(err?.message || 'Swap failed');
      setStatus('error');
    }
  }, [quote, walletAddress, action]);

  const inDecimals = getDecimals(action.tokenIn);

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm p-4 space-y-3 mt-2">
      {/* Header */}
      <div className="flex items-center gap-2 text-sm font-medium text-white/80">
        <ArrowRightLeft className="w-4 h-4" />
        <span>Token Swap</span>
      </div>

      {/* Swap details */}
      <div className="flex items-center gap-3 text-white">
        <div className="flex-1 text-center p-2 rounded-lg bg-white/5">
          <div className="text-xs text-white/50">From</div>
          <div className="font-semibold">{action.tokenInSymbol}</div>
        </div>
        <ArrowRightLeft className="w-4 h-4 text-white/40 shrink-0" />
        <div className="flex-1 text-center p-2 rounded-lg bg-white/5">
          <div className="text-xs text-white/50">To</div>
          <div className="font-semibold">{action.tokenOutSymbol}</div>
        </div>
      </div>

      <div className="text-center text-sm text-white/70">
        {action.amountType === 'output'
          ? `Buy ${action.amount} ${action.tokenOutSymbol}`
          : `Swap ${action.amount} ${action.tokenInSymbol}`}
      </div>

      {/* Quote result */}
      {quote && status !== 'error' && (
        <div className="text-xs text-white/60 bg-white/5 rounded-lg p-2 space-y-1">
          <div className="flex justify-between">
            <span>Estimated cost</span>
            <span>{parseFloat(formatUnits(quote.amountIn, inDecimals)).toFixed(6)} {action.tokenInSymbol}</span>
          </div>
          <div className="flex justify-between">
            <span>Max (2% slippage)</span>
            <span>{parseFloat(formatUnits(applySlippage(quote.amountIn), inDecimals)).toFixed(6)} {action.tokenInSymbol}</span>
          </div>
          <div className="flex justify-between">
            <span>Fee tier</span>
            <span>{(quote.feeTier / 10000).toFixed(2)}%</span>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 rounded-lg p-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Success */}
      {status === 'success' && txHash && (
        <div className="flex items-center gap-2 text-xs text-green-400 bg-green-500/10 rounded-lg p-2">
          <Check className="w-3.5 h-3.5 shrink-0" />
          <span>Swap successful!</span>
          <a
            href={`https://basescan.org/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto flex items-center gap-1 text-green-300 hover:text-green-200"
          >
            View <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2">
        {status === 'idle' && (
          <Button
            onClick={handleGetQuote}
            className="w-full rounded-full text-sm"
            size="sm"
          >
            Get Quote
          </Button>
        )}

        {status === 'quoting' && (
          <Button disabled className="w-full rounded-full text-sm" size="sm">
            <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" />
            Getting quote...
          </Button>
        )}

        {status === 'quoted' && (
          <>
            <Button
              variant="outline"
              onClick={handleGetQuote}
              className="flex-1 rounded-full text-sm border-white/20"
              size="sm"
            >
              Refresh
            </Button>
            <Button
              onClick={handleConfirmSwap}
              className="flex-1 rounded-full text-sm"
              size="sm"
            >
              Confirm Swap
            </Button>
          </>
        )}

        {status === 'swapping' && (
          <Button disabled className="w-full rounded-full text-sm" size="sm">
            <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" />
            Swapping...
          </Button>
        )}

        {(status === 'error') && (
          <Button
            onClick={handleGetQuote}
            variant="outline"
            className="w-full rounded-full text-sm border-white/20"
            size="sm"
          >
            Try Again
          </Button>
        )}
      </div>
    </div>
  );
}
