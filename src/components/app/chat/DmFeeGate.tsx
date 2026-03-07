/**
 * DmFeeGate Component
 * ====================
 * Paywall shown when recipient requires a minimum tip per message.
 * Pay the minimum to unlock, or tip higher to rank higher in their DM list.
 */

import { useState } from 'react';
import { Lock, Loader2, Gem } from 'lucide-react';
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

export function DmFeeGate({
  fee,
  recipientAddress,
  recipientName,
  conversationId,
  onUnlocked,
}: DmFeeGateProps) {
  const [customAmount, setCustomAmount] = useState('');
  const [isSending, setIsSending] = useState(false);

  const tipAmount = customAmount ? parseFloat(customAmount) : fee;
  const isAboveMinimum = !Number.isNaN(tipAmount) && tipAmount > fee;

  const handlePay = async (amount: number) => {
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

      emitSendMessage({
        dmId: conversationId,
        content: `Tipped ${amount.toLocaleString()} DHB`,
        type: 'tip',
        tipTxHash: result.hash,
      });

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
          <h3 className="text-white font-semibold text-sm">Tip to Message</h3>
          <p className="text-zinc-400 text-xs leading-relaxed">
            {recipientName} requires a minimum tip of{' '}
            <span className="text-amber-400 font-medium">{fee.toLocaleString()} DHB</span>.
            The more you tip, the higher you rank in their inbox — more chance of a reply.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {/* Pay minimum button */}
        <Button
          variant="glass"
          className="w-full bg-amber-500/20 hover:bg-amber-500/30 border-amber-500/30 h-11"
          onClick={() => handlePay(fee)}
          disabled={isSending}
        >
          {isSending && !customAmount ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <img src={dehubCoin} alt="DHB" className="w-4 h-4 mr-2" />
              Pay {fee.toLocaleString()} DHB Minimum
            </>
          )}
        </Button>

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-white/10" />
          <span className="text-[10px] text-zinc-500 uppercase tracking-wider">or tip more to rank higher</span>
          <div className="flex-1 h-px bg-white/10" />
        </div>

        {/* Custom higher tip */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <img
              src={dehubCoin}
              alt="DHB"
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 z-10"
            />
            <Input
              type="number"
              min={fee}
              step={1}
              placeholder={`Enter amount (min ${fee.toLocaleString()})`}
              value={customAmount}
              onChange={(e) => setCustomAmount(e.target.value)}
              disabled={isSending}
              className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-white/30 h-11 text-sm"
            />
          </div>
          <Button
            variant="glass"
            className="bg-amber-500/20 hover:bg-amber-500/30 border-amber-500/30 h-11 px-4"
            onClick={() => handlePay(tipAmount)}
            disabled={isSending || !customAmount || tipAmount < fee}
          >
            {isSending && customAmount ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              'Send'
            )}
          </Button>
        </div>

        {isAboveMinimum && (
          <p className="text-[10px] text-amber-400/70 text-center">
            🔥 Tipping {tipAmount.toLocaleString()} DHB will rank you higher in {recipientName}'s inbox
          </p>
        )}
      </div>
    </div>
  );
}
