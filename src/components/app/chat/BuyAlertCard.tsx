/**
 * Shared Buy Alert Card
 * Renders a buy bot alert message card used across community chat, public chat, and sidebar.
 */

import { useState } from 'react';
import { Minus } from 'lucide-react';
import { formatTimeAgo } from '@/lib/feed-utils';
import dehubCoin from '@/assets/dehub-coin.png';
import { LiquidGlassBubble } from '@/components/ui/liquid-glass-bubble';

export interface BuyAlertData {
  ethSpent: number;
  ethUsd: number;
  dhbAmount: number;
  dhbUsd: number;
  buyerAddress: string;
  shortBuyer: string;
  txHash: string;
  newBalance: number;
  balanceChangePct: number;
  priceUsd: number;
  marketCapUsd: number | null;
}

export function fmt(n: number, decimals = 2): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  return `$${n.toFixed(decimals)}`;
}

export function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${Math.round(n).toLocaleString('en-US')}`;
  return n.toFixed(2);
}

interface BuyAlertCardProps {
  content: string;
  timestamp: string;
  onHide?: () => void;
}

export function BuyAlertCard({ content, timestamp, onHide }: BuyAlertCardProps) {
  const [confirming, setConfirming] = useState(false);

  let data: BuyAlertData | null = null;
  try { data = JSON.parse(content); } catch { return null; }
  if (!data) return null;

  const basescanUrl = `https://basescan.org/tx/${data.txHash}`;
  const buyerUrl = `https://basescan.org/address/${data.buyerAddress}`;

  return (
    <div className="my-1.5">
      <LiquidGlassBubble shimmer noBorder className="w-full rounded-none [&>div]:!rounded-none [&>div]:!bg-gradient-to-tl [&>div]:!from-white/5 [&>div]:!via-white/10 [&>div]:!to-white/20">
        <div className="text-xs">
          {/* Confirmation overlay */}
          {confirming && (
            <div className="mb-2.5 p-2.5 rounded-lg bg-white/5 border border-white/10">
              <p className="text-zinc-300 text-[11px] leading-relaxed mb-2">
                Are you sure you want to hide all past and future buy bot messages?
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    onHide?.();
                    setConfirming(false);
                  }}
                  className="px-3 py-1 rounded-md bg-white/10 hover:bg-white/20 text-white text-[11px] font-medium transition-colors"
                >
                  Confirm
                </button>
                <button
                  onClick={() => setConfirming(false)}
                  className="px-3 py-1 rounded-md bg-white/5 hover:bg-white/10 text-zinc-400 text-[11px] font-medium transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-1.5">
              <img src={dehubCoin} alt="DHB" className="w-5 h-5" />
              <span className="font-bold text-white text-sm tracking-wide">{fmtTokens(data.dhbAmount)} BUY</span>
            </div>
            {onHide && !confirming && (
              <button
                onClick={() => setConfirming(true)}
                className="p-0.5 rounded hover:bg-white/10 text-zinc-500 hover:text-zinc-300 transition-colors"
                title="Hide buy bot alerts"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <span className="text-sm">💸</span>
              <span className="text-zinc-400">Spent:</span>
              <span className="text-white font-semibold">
                {data.ethSpent > 0
                  ? `${data.ethSpent.toFixed(4)} ETH`
                  : fmt(data.dhbUsd)}
                {data.ethUsd > 0 && data.ethSpent > 0 && (
                  <span className="text-zinc-400 font-normal ml-1">({fmt(data.ethUsd)})</span>
                )}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-sm">🟢</span>
              <span className="text-zinc-400">Buyer:</span>
              <span className="flex items-center gap-1.5">
                <a href={buyerUrl} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 font-mono">
                  {data.shortBuyer}
                </a>
                <span className="text-zinc-600">|</span>
                <a href={basescanUrl} target="_blank" rel="noopener noreferrer" className="text-zinc-400 hover:text-white underline">
                  Txn
                </a>
              </span>
            </div>

            {data.newBalance > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="text-sm">🔼</span>
                <span className="text-zinc-400">Balance:</span>
                <span className="text-white font-semibold">
                  {fmtTokens(data.newBalance)}{' '}
                  {data.balanceChangePct > 0 && (
                    <span className="text-zinc-400 font-normal">
                      (+{data.balanceChangePct.toFixed(2)}%)
                    </span>
                  )}
                </span>
              </div>
            )}

            <div className="flex items-center gap-1.5">
              <span className="text-sm">💲</span>
              <span className="text-zinc-400">Price:</span>
              <span className="text-white font-semibold">
                ${data.priceUsd.toFixed(7)}
              </span>
            </div>

            {data.marketCapUsd != null && (
              <div className="flex items-center gap-1.5">
                <span className="text-sm">📊</span>
                <span className="text-zinc-400">Market cap:</span>
                <span className="text-white font-semibold">
                  {fmt(data.marketCapUsd, 0)}
                </span>
              </div>
            )}
          </div>

          {/* Timestamp bottom-right */}
          <div className="flex justify-end mt-2">
            <span className="text-zinc-500 text-[10px]">{formatTimeAgo(timestamp)}</span>
          </div>
        </div>
      </LiquidGlassBubble>
    </div>
  );
}
