/**
 * DmTipDialog Component
 * =====================
 * Modal for sending a DHB tip inside a DM conversation.
 * Executes on-chain DHB transfer, calls tip-notify API, and emits socket tip message.
 */

import { useState } from 'react';
import { DollarSign, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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

const erc20TransferInterface = new Interface([
  'function transfer(address to, uint256 amount) returns (bool)',
]);

const PRESET_AMOUNTS = [100, 500, 1_000, 5_000, 10_000, 50_000];

interface DmTipDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipientAddress: string;
  recipientName: string;
  conversationId: string;
}

export function DmTipDialog({
  open,
  onOpenChange,
  recipientAddress,
  recipientName,
  conversationId,
}: DmTipDialogProps) {
  const [amount, setAmount] = useState('');
  const [isSending, setIsSending] = useState(false);

  const numAmount = Number(amount) || 0;

  const handleTip = async () => {
    if (numAmount < 1) {
      toast.error('Minimum tip is 1 DHB');
      return;
    }

    setIsSending(true);
    try {
      const chainId = BASE_CHAIN_ID;
      const chainConfig = getChainConfig(chainId);

      await switchChain(chainId);
      const signerAddress = await getWalletAddress();

      const amountWei = toWei(numAmount, DHB_TOKEN.decimals);
      const balance = await getERC20Balance(chainConfig.dhbToken, signerAddress);

      if (balance < amountWei) {
        const balanceHuman = Number(balance) / 1e18;
        toast.error(`Insufficient DHB. Need ${numAmount.toLocaleString()} but have ${balanceHuman.toFixed(2)}`);
        setIsSending(false);
        return;
      }

      toast.loading('Sending tip...', { id: 'dm-tip' });

      const result = await writeContractAA(
        chainConfig.dhbToken,
        erc20TransferInterface,
        'transfer',
        [recipientAddress, amountWei],
        { context: 'DM tip', chainId }
      );

      await result.wait(1);

      // Send tip message via socket
      emitSendMessage({
        dmId: conversationId,
        content: `Tipped ${numAmount.toLocaleString()} DHB`,
        type: 'tip',
        tipTxHash: result.hash,
      });

      // Call tip-notify API for ranking
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
              amount: numAmount,
              chainId,
            }),
          });
        }
      } catch (notifyErr) {
        console.warn('[DmTip] tip-notify failed:', notifyErr);
      }

      toast.success(`Sent ${numAmount.toLocaleString()} DHB to ${recipientName}! 🎉`, { id: 'dm-tip' });
      setAmount('');
      onOpenChange(false);
    } catch (error: unknown) {
      console.error('[DmTip] Failed:', error);
      const message = parseTxError(error as Error);
      toast.error(message || 'Tip failed', { id: 'dm-tip' });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-900 border-zinc-700 text-white max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-amber-400" />
            Tip {recipientName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Preset amounts */}
          <div className="grid grid-cols-3 gap-2">
            {PRESET_AMOUNTS.map((preset) => (
              <button
                key={preset}
                onClick={() => setAmount(String(preset))}
                className={`py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                  Number(amount) === preset
                    ? 'bg-amber-500/20 border border-amber-500/50 text-amber-300'
                    : 'bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700'
                }`}
              >
                {preset.toLocaleString()}
              </button>
            ))}
          </div>

          {/* Custom amount input */}
          <div className="relative">
            <Input
              type="number"
              min={1}
              placeholder="Custom amount..."
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="bg-zinc-800 border-zinc-700 text-white pr-14"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500 font-medium">
              DHB
            </span>
          </div>

          {/* Send button */}
          <Button
            onClick={handleTip}
            disabled={numAmount < 1 || isSending}
            className="w-full bg-amber-500 hover:bg-amber-600 text-black font-semibold"
          >
            {isSending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <DollarSign className="w-4 h-4 mr-2" />
                Send {numAmount > 0 ? `${numAmount.toLocaleString()} DHB` : 'Tip'}
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
