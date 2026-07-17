/**
 * DmFeeInfoBanner
 * ================
 * Inline info banner shown in the messages area when recipient requires a tip per message.
 * Shows fee info, ranking explanation, and custom tip amount control.
 */

import { useState } from 'react';
import dehubCoin from '@/assets/dehub-coin.png';
import padlockImg from '@/assets/padlock.png';
import { Input } from '@/components/ui/input';

interface DmFeeInfoBannerProps {
  fee: number;
  recipientName: string;
  customTipAmount: string;
  onCustomTipChange: (amount: string) => void;
  balanceBase: number | null;
  balanceBnb: number | null;
  balanceLoading: boolean;
}

export function DmFeeInfoBanner({
  fee,
  recipientName,
  customTipAmount,
  onCustomTipChange,
  balanceBase,
  balanceBnb,
  balanceLoading,
}: DmFeeInfoBannerProps) {
  const totalBalance = (balanceBase ?? 0) + (balanceBnb ?? 0);
  const totalAvailable = balanceBase !== null || balanceBnb !== null ? totalBalance : null;
  const tipAmount = customTipAmount ? parseFloat(customTipAmount) : fee;
  const isAboveMinimum = !Number.isNaN(tipAmount) && tipAmount > fee;
  const hasSufficientBalance = totalAvailable !== null && totalAvailable >= fee;
  const hasCustomSufficient = !Number.isNaN(tipAmount) && totalAvailable !== null && totalAvailable >= tipAmount;

  return (
    <div className="px-4 py-4 space-y-4">
      {/* Main info card */}
      <div className="bg-zinc-800/60 border border-white/10 rounded-2xl p-4">
        <div className="flex items-start gap-3 mb-3">
          <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0">
            <img src={padlockImg} alt="Lock" className="w-8 h-8 object-contain" />
          </div>
          <div className="flex-1">
            <h3 className="text-white font-semibold text-sm mb-1">Tip to Message</h3>
            <p className="text-zinc-400 text-xs leading-relaxed">
              {recipientName} requires a minimum tip of{' '}
              <span className="text-white font-semibold">{fee.toLocaleString()} DHB</span>{' '}
              per message. Each message you send will deduct this amount.
            </p>
          </div>
        </div>

        {/* Balance info */}
        <div className="px-3 py-2 rounded-xl bg-zinc-900/60 border border-white/5">
          {balanceLoading ? (
            <div className="flex items-center gap-2">
              <img src={dehubCoin} alt="DHB" className="w-4 h-4" />
              <span className="text-xs text-zinc-500">Loading balance...</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <img src={dehubCoin} alt="DHB" className="w-4 h-4" />
              <span className="text-xs text-zinc-400">Your balance:</span>
              {totalBalance !== null ? (
                <span className={`text-xs font-medium ${hasSufficientBalance ? 'text-green-400' : 'text-red-400'}`}>
                  {totalBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })} DHB
                </span>
              ) : (
                <span className="text-xs text-zinc-500">Unavailable</span>
              )}
              {!hasSufficientBalance && totalBalance !== null && (
                <span className="text-xs text-red-400 ml-auto">Insufficient</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Custom tip section */}
      <div className="bg-zinc-800/40 border border-white/5 rounded-2xl p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex-1 h-px bg-white/10" />
          <span className="text-[10px] text-zinc-500 uppercase tracking-wider whitespace-nowrap">
            Tip more to rank higher in their inbox
          </span>
          <div className="flex-1 h-px bg-white/10" />
        </div>

        <div className="relative">
          <img src={dehubCoin} alt="DHB" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 z-10" />
          <Input
            type="number"
            min={fee}
            step={1}
            placeholder={`Custom tip (min ${fee.toLocaleString()} DHB)`}
            value={customTipAmount}
            onChange={(e) => onCustomTipChange(e.target.value)}
            className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-white/30 h-10 text-sm rounded-xl"
          />
        </div>

        {isAboveMinimum && hasCustomSufficient && (
          <p className="text-[10px] text-amber-400/70 text-center mt-2">
            🔥 Tipping {tipAmount.toLocaleString()} DHB per message will rank you higher in {recipientName}'s inbox
          </p>
        )}
        {isAboveMinimum && !hasCustomSufficient && (
          <p className="text-[10px] text-red-400/70 text-center mt-2">
            Insufficient balance for {tipAmount.toLocaleString()} DHB tip
          </p>
        )}
      </div>
    </div>
  );
}
