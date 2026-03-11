/**
 * Quick Buy Button — shown on cashtag/ticker cards in search.
 * Opens a Uniswap swap drawer for any Base token, or the DHB-specific
 * buy flow for DHB.
 */

import { useState } from 'react';
import { ShoppingCart, CreditCard, Wallet, ArrowRightLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
} from '@/components/ui/drawer';
import { CrossChainDepositDrawer } from '@/components/app/command-centre/CrossChainDepositDrawer';
import { SwapToDHBDrawer } from '@/components/app/SwapToDHBDrawer';
import { SwapToTokenDrawer } from '@/components/app/SwapToTokenDrawer';

interface QuickBuyButtonProps {
  symbol: string;
  tokenType: 'stock' | 'crypto';
  /** On-chain contract address (Base) — required for crypto tokens to enable instant swap */
  tokenAddress?: string;
  /** Decimals of the token (default 18) */
  tokenDecimals?: number;
  /** Logo URL for the token */
  tokenLogo?: string;
  /** Chain ID where the token lives */
  chainId?: string;
}

export function QuickBuyButton({ symbol, tokenType, tokenAddress, tokenDecimals, tokenLogo, chainId }: QuickBuyButtonProps) {
  const [open, setOpen] = useState(false);
  const [crossChainOpen, setCrossChainOpen] = useState(false);
  const [swapDHBOpen, setSwapDHBOpen] = useState(false);
  const [swapTokenOpen, setSwapTokenOpen] = useState(false);
  const navigate = useNavigate();

  const isDHB = symbol.toUpperCase() === 'DHB';
  const isBaseChain = !chainId || chainId === 'base';
  const hasSwapSupport = isBaseChain && !!tokenAddress && !isDHB;

  // Tokens that can be received cross-chain
  const crossChainSymbols = ['ETH', 'USDC', 'USDT', 'BTC', 'BNB'];
  const hasCrossChain = crossChainSymbols.includes(symbol.toUpperCase()) || isDHB;

  return (
    <>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        className={cn(
          "p-1.5 rounded-xl transition-all",
          "bg-gradient-to-br from-white/20 via-white/10 to-white/5",
          "backdrop-blur-xl border border-white/30",
          "shadow-[0_8px_32px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.4),inset_0_-1px_0_rgba(255,255,255,0.1)]",
          "hover:from-white/30 hover:via-white/15 hover:to-white/10",
          "hover:shadow-[0_8px_32px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.5),inset_0_-1px_0_rgba(255,255,255,0.15)]",
          "text-white"
        )}
        title={`Buy ${symbol}`}
      >
        <ShoppingCart className="w-4 h-4" />
      </button>

      {/* Buy Method Drawer */}
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent glass>
          <DrawerTitle className="sr-only">Buy {symbol}</DrawerTitle>
          <div className="p-5 pb-8 space-y-2">
            <h3 className="text-white font-semibold text-base mb-4">Buy ${symbol}</h3>

            {isDHB ? (
              <>
                {/* DHB: Card purchase + Swap from ETH */}
                <button
                  onClick={() => {
                    setOpen(false);
                    navigate('/app/buy');
                  }}
                  className="w-full flex items-center gap-3 p-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.10] backdrop-blur-sm border border-white/10 transition-colors"
                >
                  <CreditCard className="w-5 h-5 text-white/70" />
                  <div className="text-left">
                    <span className="text-sm font-medium text-white">Buy with Card</span>
                    <p className="text-xs text-white/40">Visa, Mastercard, Apple Pay, Google Pay</p>
                  </div>
                </button>
                <button
                  onClick={() => {
                    setOpen(false);
                    setTimeout(() => setSwapDHBOpen(true), 200);
                  }}
                  className="w-full flex items-center gap-3 p-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.10] backdrop-blur-sm border border-white/10 transition-colors"
                >
                  <ArrowRightLeft className="w-5 h-5 text-white/70" />
                  <div className="text-left">
                    <span className="text-sm font-medium text-white">Buy with Crypto</span>
                    <p className="text-xs text-white/40">Convert your ETH to DHB</p>
                  </div>
                </button>
              </>
            ) : (
              <>
                {/* Instant Swap via Uniswap (Base tokens only) */}
                {hasSwapSupport && (
                  <button
                    onClick={() => {
                      setOpen(false);
                      setTimeout(() => setSwapTokenOpen(true), 200);
                    }}
                    className="w-full flex items-center gap-3 p-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.10] backdrop-blur-sm border border-white/10 transition-colors"
                  >
                    <ArrowRightLeft className="w-5 h-5 text-white/70" />
                    <div className="text-left">
                      <span className="text-sm font-medium text-white">Instant Swap</span>
                      <p className="text-xs text-white/40">Swap ETH or any Base token via Uniswap</p>
                    </div>
                  </button>
                )}

                {/* Buy with Card (coming soon for non-DHB) */}
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

                {/* Cross-chain deposit */}
                {hasCrossChain && (
                  <button
                    onClick={() => {
                      setOpen(false);
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
                )}
              </>
            )}
          </div>
        </DrawerContent>
      </Drawer>

      {/* Cross-chain deposit for non-DHB tokens */}
      <CrossChainDepositDrawer
        open={crossChainOpen}
        onOpenChange={setCrossChainOpen}
        destinationSymbol={symbol.toUpperCase()}
      />

      {/* Swap ETH→DHB drawer */}
      <SwapToDHBDrawer open={swapDHBOpen} onOpenChange={setSwapDHBOpen} />

      {/* Generic swap drawer for any Base token */}
      {hasSwapSupport && (
        <SwapToTokenDrawer
          open={swapTokenOpen}
          onOpenChange={setSwapTokenOpen}
          targetSymbol={symbol.toUpperCase()}
          targetAddress={tokenAddress!}
          targetDecimals={tokenDecimals}
          targetLogo={tokenLogo}
        />
      )}
    </>
  );
}
