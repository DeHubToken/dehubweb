/**
 * DmFeeGate Component
 * ====================
 * Paywall overlay shown when recipient requires a minimum tip per message.
 * Offers paying the minimum fee or tipping higher to rank up.
 */

import { useState } from 'react';
import { Lock, Loader2, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Interface } from 'ethers';
import {
  writeContractAA,
  getWalletAddress,
  getERC20Balance,
  switchChain,
  parseTxError,
} from '@/lib/contracts/aa-utils';
import { DHB_TOKEN, toWei, getChainConfig, BASE_CHAIN_ID } from '@/lib/contracts/dhb-token';
import { emitSendMessage } from '@/lib/api/dehub/dm-socket';
import { getAuthToken, DEHUB_API_BASE } from '@/lib/api/dehub/core';
import dehubCoin from '@/assets/dehub-coin.png';

const erc20TransferInterface = new Interface([
  'function transfer(address to, uint256 amount) returns (bool)',
]);

interface DmFeeGateProps {
  fee: number;
  recipientAddress: string;
  recipientName: string;
  conversationId: string;
  onUnlocked: () => void;
}

const RANK_UP_MULTIPLIERS = [2, 5, 10];

export function DmFeeGate({
  fee,
  recipientAddress,
  recipientName,
  conversationId,
  onUnlocked,
}: DmFeeGateProps) {
  const [customAmount, setCustomAmount] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [selectedAmount, setSelectedAmount] = useState<number>(fee);

  const handleSelectAmount = (amount: number) => {
    setSelectedAmount(amount);
    setCustomAmount('');
  };

  const handleCustomChange = (val: string) => {
    setCustomAmount(val);
    const parsed = parseFloat(val);
    if (!Number.isNaN(parsed) && parsed >= fee) {
      setSelectedAmount(parsed);
    }
  };

  const handlePay = async () => {
    const amount = customAmount ? parseFloat(customAmount) : selectedAmount;
    if (Number.isNaN(amount) || amount < fee) {
      toast.error(`Minimum tip is ${fee.toLocaleString()} DHB`);
      return;
    }

    setIsSending(true);
    try {
      const chainId = BASE_CHAIN_ID;
      const chainConfig = getChainConfig(chainId);

      await switchChain(chainId);
      const signerAddress = await getWalletAddress();

      const amountWei = toWei(amount, DHB_TOKEN.decimals);
      const balance = await getERC20Balance(chainConfig.dhbToken, signerAddress);

      if (balance < amountWei) {
        const balanceHuman = Number(balance) / 1e18;
        toast.error(`Insufficient DHB. Need ${amount.toLocaleString()} but have ${balanceHuman.toFixed(2)}`);
        setIsSending(false);
        return;
      }

      toast.loading('Sending tip to unlock DMs...', { id: 'dm-fee-gate' });

      const result = await writeContractAA(
        chainConfig.dhbToken,
        erc20TransferInterface,
        'transfer',
        [recipientAddress, amountWei],
        { context: 'DM fee unlock', chainId }
      );

      await result.wait(1);

      // Send tip message via socket
      emitSendMessage({
        dmId: conversationId,
        content: `Tipped ${amount.toLocaleString()} DHB`,
        type: 'tip',
        tipTxHash: result.hash,
      });

      // Notify API for ranking
      try {
        const token = getAuthToken();
        if (token) {
          await fetch(`${DEHUB_API_BASE}/api/dm/tip-notify`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              txHash: result.hash,
              receiverAddress: recipientAddress.toLowerCase(),
              amount,
              chainId,
            }),
          });
        }
      } catch (notifyErr) {
        console.warn('[DmFeeGate] tip-notify failed:', notifyErr);
      }

      toast.success(`Unlocked! Sent ${amount.toLocaleString()} DHB 🎉`, { id: 'dm-fee-gate' });
      onUnlocked();
    } catch (error: unknown) {
      console.error('[DmFeeGate] Payment failed:', error);
      const message = parseTxError(error as Error);
      toast.error(message || 'Payment failed', { id: 'dm-fee-gate' });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="border-t border-white/10 bg-zinc-900/95 backdrop-blur-sm px-4 py-5">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-amber-500/15 flex items-center justify-center flex-shrink-0">
          <Lock className="w-5 h-5 text-amber-400" />
        </div>
        <div>
          <h3 className="text-white font-semibold text-sm">Message Fee Required</h3>
          <p className="text-zinc-400 text-xs">
            {recipientName} requires a minimum tip of{' '}
            <span className="text-amber-400 font-medium">{fee.toLocaleString()} DHB</span>{' '}
            to receive messages
          </p>
        </div>
      </div>

      {/* Amount options */}
      <div className="space-y-3">
        {/* Minimum fee */}
        <button
          type="button"
          onClick={() => handleSelectAmount(fee)}
          disabled={isSending}
          className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-colors text-left ${
            selectedAmount === fee && !customAmount
              ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
              : 'bg-white/5 border-white/10 text-zinc-300 hover:bg-white/10'
          }`}
        >
          <div className="flex items-center gap-2">
            <img src={dehubCoin} alt="DHB" className="w-4 h-4" />
            <span className="text-sm font-medium">{fee.toLocaleString()} DHB</span>
          </div>
          <span className="text-xs text-zinc-500">Minimum</span>
        </button>

        {/* Rank up options */}
        <div className="flex gap-2">
          {RANK_UP_MULTIPLIERS.map((mult) => {
            const amount = fee * mult;
            const isSelected = selectedAmount === amount && !customAmount;
            return (
              <button
                key={mult}
                type="button"
                onClick={() => handleSelectAmount(amount)}
                disabled={isSending}
                className={`flex-1 flex flex-col items-center gap-1 px-3 py-2.5 rounded-xl border transition-colors ${
                  isSelected
                    ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                    : 'bg-white/5 border-white/10 text-zinc-400 hover:bg-white/10'
                }`}
              >
                <div className="flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" />
                  <span className="text-xs font-medium">{mult}x</span>
                </div>
                <span className="text-[10px]">{amount.toLocaleString()}</span>
              </button>
            );
          })}
        </div>

        {/* Custom amount */}
        <div className="relative">
          <img
            src={dehubCoin}
            alt="DHB"
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 z-10"
          />
          <Input
            type="number"
            min={fee}
            step={1}
            placeholder={`Custom amount (min ${fee.toLocaleString()})`}
            value={customAmount}
            onChange={(e) => handleCustomChange(e.target.value)}
            disabled={isSending}
            className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-white/30 h-10 text-sm"
          />
        </div>

        {/* Rank up hint */}
        <p className="text-[10px] text-zinc-600 text-center">
          💡 Tip higher to rank up in {recipientName}'s inbox
        </p>

        {/* Pay button */}
        <Button
          variant="glass"
          className="w-full bg-amber-500/20 hover:bg-amber-500/30 border-amber-500/30 h-11"
          onClick={handlePay}
          disabled={isSending}
        >
          {isSending ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <img src={dehubCoin} alt="DHB" className="w-4 h-4 mr-2" />
              Tip {(customAmount ? parseFloat(customAmount) || selectedAmount : selectedAmount).toLocaleString()} DHB to Unlock
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
